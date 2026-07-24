/**
 * Real-supply bridge (Phase 5c → NEXT-5): the seam between the honest internal
 * pool (creators.ts — "Apnosh video team") and real contractors (the vendors
 * table, migration 146 + craft/stripe columns in 198).
 *
 * Dispatch: at mint (ship + post-ship reconcile), each creator-lane piece asks
 * for the best live vendor of its craft; when one exists the order carries the
 * vendor's UUID in creator_id (and vendor_id), otherwise the internal pool id
 * stays — the team is always the fallback, never a dead end. A vendor must have
 * a login (person_id) to be dispatchable: work assigned to someone who cannot
 * see it is a silent stall by construction.
 *
 * Money: feePercentForCreator resolves a vendor's negotiated take-rate (pool
 * ids get the platform default); sendCreatorPayout moves a payout for real via
 * Stripe Connect — env-gated, idempotent by payout id.
 *
 * Names: creatorNamesByIds resolves any mix of pool ids and vendor UUIDs so a
 * raw UUID never leaks into an owner-facing surface. Server-only (admin client).
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_PLATFORM_FEE } from './work-orders-core'
import { creatorById, type Disc } from './creators'
import { skillIdsForDispatch } from '@/lib/marketplace/creator-skills'
import { createNotification } from '@/lib/notifications'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DISCIPLINES: Disc[] = ['Video', 'Photo', 'Social', 'Design']

/** The platform take-rate (%) for the creator assigned to an order: a real vendor's
 *  negotiated platform_fee_percent, or the platform default for a seeded pool creator
 *  (or any unresolved id). Never throws — degrades to the default. */
export async function feePercentForCreator(creatorId: string): Promise<number> {
  if (!creatorId || !UUID.test(creatorId)) return DEFAULT_PLATFORM_FEE   // a seeded pool id → never a real vendor
  const admin = createAdminClient()
  const { data, error } = await admin.from('vendors').select('platform_fee_percent').eq('id', creatorId).maybeSingle()
  if (error || !data) return DEFAULT_PLATFORM_FEE
  const pct = Number(data.platform_fee_percent)
  return Number.isFinite(pct) ? pct : DEFAULT_PLATFORM_FEE
}

/** How a vendor application's categories map to a dispatch craft. First match in
 *  the applicant's own order wins; categories outside the creative crafts (SEO,
 *  PR, agencies…) resolve to null — those vendors are bookable on the storefront
 *  but not auto-dispatched into campaign production. */
const CATEGORY_TO_CRAFT: Record<string, Disc> = {
  videographer: 'Video',
  photographer: 'Photo',
  social_manager: 'Social',
  food_influencer: 'Social',
  graphic_designer: 'Design',
  web_designer: 'Design',
}
export function craftForCategories(categories: string[] | null | undefined): Disc | null {
  for (const c of categories ?? []) {
    const craft = CATEGORY_TO_CRAFT[c]
    if (craft) return craft
  }
  return null
}

export interface LiveVendor {
  id: string
  name: string
  personId: string | null
}

/** The best dispatchable vendor for a craft: bookable, craft-matched, able to log
 *  in (person_id), not in `excludeIds` (prior decliners). Ranked by track record —
 *  rating first, then volume. Null when the bench is empty (→ internal team). */
export async function bestVendorForDiscipline(d: Disc, excludeIds: string[] = []): Promise<LiveVendor | null> {
  const admin = createAdminClient()
  // Only UUID-shaped exclusions belong in a uuid-column filter; pool ids ('v_maya')
  // can never match a vendors row anyway.
  const ex = [...new Set(excludeIds.filter((id) => UUID.test(id)))]
  // A creator can have MANY skills (migration 228), so match the discipline against their whole
  // skills list — any skill that dispatches to `d` (e.g. 'Design' ← design OR web). The backfill +
  // onboardCreatorCore keep `crafts` populated for every creator, so this covers them all.
  const skillIds = skillIdsForDispatch(d)

  const build = (useCrafts: boolean) => {
    let q = admin.from('vendors').select('id, name, person_id')
    if (useCrafts && skillIds.length) q = q.overlaps('crafts', skillIds)
    else q = q.eq('craft', d) // pre-migration fallback: the scalar primary craft only
    q = q
      .eq('bookable', true)
      .not('person_id', 'is', null)
      .order('avg_rating', { ascending: false, nullsFirst: false })
      .order('total_bookings', { ascending: false })
      .limit(1)
    if (ex.length) q = q.not('id', 'in', `(${ex.join(',')})`)
    return q
  }

  let { data, error } = await build(true).maybeSingle()
  // Before migration 228 the `crafts` column doesn't exist (42703) — fall back to the scalar craft.
  if (error && (error as { code?: string }).code === '42703') {
    ;({ data, error } = await build(false).maybeSingle())
  }
  if (error || !data) return null
  return { id: data.id as string, name: (data.name as string) || 'A vendor', personId: (data.person_id as string | null) ?? null }
}

export type AssignedVendors = Map<Disc, LiveVendor>

/**
 * Swap real vendors into freshly-built work-order rows, one vendor per craft per
 * batch (a campaign's Video pieces all go to the same maker — briefs and shoots
 * batch). Rows whose craft has no live vendor keep their internal-pool creator.
 * The owner's style pick among the pool variants is deliberately superseded: every
 * pool entry is the same internal team, and a real contractor is the upgrade the
 * marketplace promises. Never throws — on any failure the rows return unchanged.
 *
 * `incumbents` (discipline → the creator id already holding this campaign's live
 * orders) keeps a craft with its existing maker: an incumbent VENDOR is reused
 * while still bookable; an incumbent POOL id pins the craft to the internal team
 * (no vendor swap) — batching beats a fresher best-ranked pick either way.
 */
export async function assignVendorsToOrderRows<T extends { discipline: string; creator_id: string }>(
  rows: T[],
  incumbents?: Map<string, string>,
): Promise<{ rows: (T & { vendor_id?: string })[]; assigned: AssignedVendors }> {
  const assigned: AssignedVendors = new Map()
  try {
    const crafts = [...new Set(rows.map((r) => r.discipline))].filter((d): d is Disc => (DISCIPLINES as string[]).includes(d))
    for (const d of crafts) {
      const incumbentId = incumbents?.get(d)
      if (incumbentId && !UUID.test(incumbentId)) continue   // the team holds this craft — keep it there
      if (incumbentId) {
        const admin = createAdminClient()
        const { data: inc } = await admin.from('vendors').select('id, name, person_id, bookable').eq('id', incumbentId).maybeSingle()
        if (inc && inc.bookable !== false) {
          assigned.set(d, { id: inc.id as string, name: (inc.name as string) || 'A vendor', personId: (inc.person_id as string | null) ?? null })
          continue
        }
        // Incumbent gone unbookable → fall through to a fresh pick.
      }
      const v = await bestVendorForDiscipline(d)
      if (v) assigned.set(d, v)
    }
    if (!assigned.size) return { rows, assigned }
    return {
      rows: rows.map((r) => {
        const v = assigned.get(r.discipline as Disc)
        return v ? { ...r, creator_id: v.id, vendor_id: v.id } : r
      }),
      assigned,
    }
  } catch {
    return { rows, assigned: new Map() }
  }
}

/** Tell each newly-assigned vendor there is work waiting. Call AFTER the rows
 *  actually inserted (pass only inserted rows) — a notification for work that
 *  failed to mint is a lie. Best-effort, never throws. */
export async function notifyVendorsOfNewWork(
  insertedRows: Array<{ creator_id?: string | null }>,
  assigned: AssignedVendors,
  campaignName: string,
): Promise<void> {
  try {
    const countByVendor = new Map<string, number>()
    for (const r of insertedRows) {
      const id = r.creator_id ?? ''
      if (id) countByVendor.set(id, (countByVendor.get(id) ?? 0) + 1)
    }
    for (const v of assigned.values()) {
      const count = countByVendor.get(v.id) ?? 0
      if (!count || !v.personId) continue
      await createNotification({
        userId: v.personId,
        kind: 'work_offer',
        title: 'New work from Apnosh',
        body: `${count} piece${count === 1 ? '' : 's'} for "${campaignName}" ${count === 1 ? 'is' : 'are'} waiting for your accept.`,
        link: '/creator/work',
      })
    }
  } catch { /* notification failure never breaks a mint */ }
}

/** One notification to one vendor (reassignments). Best-effort. */
export async function notifyVendorOfWork(personId: string, title: string, body: string): Promise<void> {
  await createNotification({ userId: personId, kind: 'work_offer', title, body, link: '/creator/work' })
}

/**
 * Resolve any mix of internal-pool ids and vendor UUIDs to display names, in one
 * batch. Surfaces that used `creatorById(id)?.name ?? id` would leak a raw UUID
 * for a vendor-assigned piece — pass their ids through here instead.
 */
export async function creatorNamesByIds(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const map = new Map<string, string>()
  const uuids = new Set<string>()
  for (const id of ids) {
    if (!id || map.has(id)) continue
    const pool = creatorById(id)
    if (pool) map.set(id, pool.name)
    else if (UUID.test(id)) uuids.add(id)
  }
  if (uuids.size) {
    try {
      const admin = createAdminClient()
      const { data } = await admin.from('vendors').select('id, name').in('id', [...uuids])
      for (const v of data ?? []) map.set(v.id as string, (v.name as string) || 'A vendor')
    } catch { /* fall through — callers keep their own fallback */ }
  }
  return map
}

/**
 * Money-out for real: move one payout to the vendor's connected Stripe account.
 * Gated on STRIPE_CONNECT_PAYOUTS=1 (no env, no transfer — the ledger stays
 * accrual-only exactly as before), on the vendor having onboarded
 * (stripe_account_id), and on status 'payable' ONLY: a payout becomes payable
 * when the CLIENT's invoice is paid (the invoice bridge's webhook) — money-out
 * strictly follows money-in, so a voided client invoice can never leave Apnosh
 * out of pocket to a vendor.
 *
 * Double-pay protection is layered, because Stripe idempotency keys expire
 * after ~24h and cannot be the only guard:
 *   1. CLAIM: stripe_transfer_id is stamped 'pending:<payout>' conditionally
 *      (only where it is null) BEFORE the transfer — a second send, today or
 *      next month, refuses because the marker is set.
 *   2. The transfer itself carries idempotencyKey payout_<id> (same-day races
 *      replay one transfer).
 *   3. The paid-flip failure is LOUD: the transfer went out, so staff get a
 *      dead-letter with the transfer id and the caller is told not to re-send.
 * Internal-team payouts (pool ids) are refused — the margin is Apnosh's.
 */
export async function sendCreatorPayout(payoutId: string): Promise<{ ok: true; transferId: string } | { ok: false; error: string }> {
  if (process.env.STRIPE_CONNECT_PAYOUTS !== '1') {
    return { ok: false, error: 'Connect payouts are not enabled yet (STRIPE_CONNECT_PAYOUTS).' }
  }
  const admin = createAdminClient()
  const { data: p, error } = await admin.from('creator_payouts').select('*').eq('id', payoutId).maybeSingle()
  if (error || !p) return { ok: false, error: 'Payout not found.' }
  const status = (p.status as string) ?? ''
  if (status === 'paid') return { ok: false, error: 'Already paid.' }
  if (status === 'accrued') return { ok: false, error: "Waiting on the client's invoice — this becomes payable once their invoice is paid." }
  if (status !== 'payable') return { ok: false, error: `This payout is ${status}.` }
  const net = (p.net_cents as number) ?? 0
  if (net <= 0) return { ok: false, error: 'Nothing to transfer.' }
  const creatorId = (p.creator_id as string) ?? ''
  if (!UUID.test(creatorId)) return { ok: false, error: 'This piece was made by the internal team — there is no vendor to pay.' }

  const { data: v } = await admin.from('vendors').select('name, stripe_account_id').eq('id', creatorId).maybeSingle()
  const account = (v?.stripe_account_id as string | null) ?? null
  if (!account) return { ok: false, error: `${(v?.name as string) ?? 'This vendor'} has not connected a Stripe account yet.` }

  // Claim before money moves: exactly one send ever gets past this line.
  const { data: claimed, error: claimErr } = await admin
    .from('creator_payouts')
    .update({ stripe_transfer_id: `pending:${payoutId}` })
    .eq('id', payoutId)
    .eq('status', 'payable')
    .is('stripe_transfer_id', null)
    .select('id')
    .maybeSingle()
  if (claimErr) return { ok: false, error: claimErr.message }
  if (!claimed) return { ok: false, error: 'A transfer for this payout was already started — do not send again. Check the row and Stripe before retrying.' }

  let transferId: string
  try {
    const { stripe } = await import('@/lib/stripe')
    const transfer = await stripe.transfers.create(
      {
        amount: net,
        currency: 'usd',
        destination: account,
        metadata: { payout_id: payoutId, work_order_id: (p.work_order_id as string) ?? '', client_id: (p.client_id as string) ?? '' },
      },
      { idempotencyKey: `payout_${payoutId}` },
    )
    transferId = transfer.id
  } catch (err) {
    // No money moved — release the claim so a later attempt can try again.
    await admin.from('creator_payouts')
      .update({ stripe_transfer_id: null })
      .eq('id', payoutId)
      .eq('stripe_transfer_id', `pending:${payoutId}`)
      .then(() => undefined, () => undefined)
    return { ok: false, error: err instanceof Error ? err.message : 'Transfer failed.' }
  }

  const { data: flipped, error: flipErr } = await admin
    .from('creator_payouts')
    .update({ status: 'paid', stripe_transfer_id: transferId, paid_at: new Date().toISOString() })
    .eq('id', payoutId)
    .eq('stripe_transfer_id', `pending:${payoutId}`)
    .select('id')
    .maybeSingle()
  if (flipErr || !flipped) {
    // Real money left but the ledger did not flip. The pending marker still
    // blocks a re-send; make the mismatch loud instead of silent.
    const clientId = (p.client_id as string) ?? ''
    if (clientId) {
      const { notifyStaffForClient } = await import('@/lib/notifications')
      await notifyStaffForClient(clientId, ['strategist'], {
        kind: 'client_signoff',
        title: 'Payout ledger mismatch — transfer sent, status not flipped',
        body: `Stripe transfer ${transferId} for payout ${payoutId} went out, but the row could not be marked paid. Fix the row by hand; do NOT re-send.`,
      }).catch(() => ({ notified: 0 }))
    }
    return { ok: false, error: `The transfer went out (${transferId}) but the ledger update failed — do NOT send again. Staff were notified to fix the record.` }
  }
  return { ok: true, transferId }
}
