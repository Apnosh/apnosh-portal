/**
 * Creator work orders — the supply-side spine. On ship, each creative discipline
 * with a chosen creator becomes an order that creator receives, accepts, and
 * delivers. Server-only (admin client); the creator portal + owner detail read
 * through here.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyStaffForClient, notifyClientOwners } from '@/lib/notifications'
import { creatorById, rankCreators, type Disc } from './creators'
import { buildWorkOrderRows, buildBridgeDraftRow, buildChargeRow, buildPayoutRow, findUnaccrued, planCampaignPieces, workOrderRowForPiece, teamDraftRowForPiece, reconcileProductionPlan, validateTransition, IllegalTransition, PLAN_REMOVED_NOTE, STOP_NOTE, type WorkOrderStatus, type WorkOrderRow } from './work-orders-core'
import { feePercentForCreator, assignVendorsToOrderRows, notifyVendorsOfNewWork, notifyVendorOfWork, bestVendorForDiscipline, creatorNamesByIds } from './vendor-supply'
import { isCampaignCheckoutPaid } from './campaign-payments-server'
import type { SavedCampaign, CampaignCharges, CreatorEarnings } from './view'

export type { WorkOrderStatus }
export { IllegalTransition } from './work-orders-core'

export { PLAN_REMOVED_NOTE } from './work-orders-core'

export interface WorkOrder {
  id: string
  campaignId: string
  campaignName?: string
  clientId: string
  creatorId: string
  creatorName: string
  discipline: string
  title: string
  brief: string | null
  dueDate: string | null
  status: WorkOrderStatus
  conceptStatus: 'approved' | 'pending' | 'changes'
  deliveredUrl: string | null
  note: string | null
  amountCents: number
  createdAt: string
  updatedAt: string
  /** Who the work is for. Set on a creator's own list so a card can say it without opening. */
  restaurantName?: string
  /** 'HH:MM' start for an on-site booking, when this order came from one. */
  slotTime?: string | null
}

function rowToWO(r: Record<string, unknown>, names?: Map<string, string>): WorkOrder {
  const creatorId = (r.creator_id as string) ?? ''
  return {
    id: r.id as string,
    campaignId: (r.campaign_id as string) ?? '',
    clientId: (r.client_id as string) ?? '',
    creatorId,
    // Pool ids resolve locally; a vendor UUID needs the batch `names` map from
    // creatorNamesByIds — without it the raw id is the last-resort fallback.
    creatorName: names?.get(creatorId) ?? creatorById(creatorId)?.name ?? creatorId,
    discipline: (r.discipline as string) ?? '',
    title: (r.title as string) ?? '',
    brief: (r.brief as string) ?? null,
    dueDate: (r.due_date as string) ?? null,
    status: ((r.status as WorkOrderStatus) ?? 'offered'),
    conceptStatus: ((r.concept_status as WorkOrder['conceptStatus']) ?? 'approved'),
    deliveredUrl: (r.delivered_url as string) ?? null,
    note: (r.note as string) ?? null,
    amountCents: (r.amount_cents as number) ?? 0,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * On ship, mint one work order per creative discipline + its chosen creator.
 * Idempotent: skips if orders already exist for the campaign. Best-effort like
 * materializeCampaignDrafts — degrades to 0 if the table is not present yet.
 */
export async function mintWorkOrders(campaign: SavedCampaign, shipISO: string): Promise<number> {
  const built = buildWorkOrderRows(campaign, shipISO)
  if (!built.length) return 0

  // Real supply: swap in the best live vendor per craft (one maker per craft —
  // briefs and shoots batch); crafts with an empty bench keep the internal team.
  const { rows, assigned } = await assignVendorsToOrderRows(built)

  const admin = createAdminClient()
  const { data: existing, error: existErr } = await admin
    .from('creator_work_orders')
    .select('id')
    .eq('campaign_id', campaign.draft.id)
    .limit(1)
  if (existErr) return 0
  if (existing && existing.length) return 0

  let { error } = await admin.from('creator_work_orders').insert(rows)
  // Pre-183/184 the campaign_piece_key / surcharge_cents columns are absent (42703);
  // retry without them so ship never breaks. The reconcile then matches positionally,
  // and the payout simply can't net a surcharge it can't read (degrades to today).
  if (error && error.code === '42703') {
    const stripped = rows.map((r) => { const c = { ...r } as Record<string, unknown>; delete c.campaign_piece_key; delete c.surcharge_cents; return c })
    ;({ error } = await admin.from('creator_work_orders').insert(stripped))
  }
  if (error) return 0
  // Real vendors get told there is work waiting (the internal team already has
  // the staff rails); only after the insert actually landed.
  await notifyVendorsOfNewWork(rows, assigned, campaign.draft.name).catch(() => undefined)
  return rows.length
}

/**
 * A creator's inbox: every order assigned to them, SOONEST DUE FIRST — the next thing they owe
 * someone belongs at the top, not the thing most recently created. Undated work sorts last.
 *
 * Also carries the two facts a creator scans a list for and could otherwise only get by opening the
 * job: who it is for, and (for an on-site booking) what time they need to be there. Both are looked
 * up in one extra round-trip each and degrade to undefined rather than failing the list.
 */
export async function listWorkOrdersForCreator(creatorId: string): Promise<WorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_work_orders')
    .select('*, campaigns(name)')
    .eq('creator_id', creatorId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false })
  if (error || !data) return []
  const names = await creatorNamesByIds(data.map((r) => (r.creator_id as string) ?? ''))
  const [restaurants, times] = await Promise.all([
    restaurantNamesByIds(admin, data.map((r) => (r.client_id as string) ?? '')),
    bookingStartTimes(admin, data.map((r) => (r.campaign_piece_key as string) ?? '')),
  ])
  return data.map((r) => ({
    ...rowToWO(r, names),
    campaignName: ((r as { campaigns?: { name?: string } }).campaigns?.name) ?? undefined,
    restaurantName: restaurants.get((r.client_id as string) ?? '') ?? undefined,
    slotTime: times.get(bookingIdFromPieceKey((r.campaign_piece_key as string) ?? '') ?? '') ?? null,
  }))
}

/** client_id → restaurant name, for the ids given. Empty map on any error (the list still renders). */
async function restaurantNamesByIds(admin: ReturnType<typeof createAdminClient>, ids: string[]): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean))]
  if (!uniq.length) return new Map()
  try {
    const { data } = await admin.from('clients').select('id, name').in('id', uniq)
    return new Map((data ?? []).map((c) => [c.id as string, (c.name as string) ?? '']))
  } catch { return new Map() }
}

/** The booking uuid inside a marketplace piece key ('booking:<uuid>', '…#2', '…#d1'), else null. */
function bookingIdFromPieceKey(key: string): string | null {
  const m = /^booking:([0-9a-f-]{36})/i.exec(key ?? '')
  return m ? m[1] : null
}

/** booking id → 'HH:MM' start, for the piece keys given. Empty map on any error. */
async function bookingStartTimes(admin: ReturnType<typeof createAdminClient>, keys: string[]): Promise<Map<string, string>> {
  const ids = [...new Set(keys.map(bookingIdFromPieceKey).filter((x): x is string => !!x))]
  if (!ids.length) return new Map()
  try {
    const { data } = await admin.from('bookings').select('id, slot_start').in('id', ids)
    return new Map((data ?? []).flatMap((b) => (b.slot_start ? [[b.id as string, b.slot_start as string]] as [string, string][] : [])))
  } catch { return new Map() }
}

/** Clear the cached creative brief for a campaign's orders so the next open
 *  regenerates it (e.g. after the owner edits the "Get it ready" inputs). */
export async function clearCampaignBriefCache(campaignId: string): Promise<void> {
  const admin = createAdminClient()
  // Only refresh work that hasn't shipped yet, and never wipe an owner-authored
  // brief — so a delivered/approved piece keeps the brief the creator executed.
  await admin.from('creator_work_orders')
    .update({ brief_details: null })
    .eq('campaign_id', campaignId)
    .in('status', ['offered', 'accepted', 'in_progress', 'revision'])
    .not('brief_details->>source', 'eq', 'owner')
}

/**
 * The creator identity this auth user works as, or null. Two sources, in order:
 *   1. creator_logins — the explicit map (test-creator logins, manual links).
 *   2. vendors.person_id — a real vendor's durable identity (171's RLS already
 *      assumes it); their orders carry the vendor UUID as creator_id.
 *
 * There is deliberately NO email-based auto-link: this project's auth runs with
 * mailer_autoconfirm on, so a signup email is UNVERIFIED — matching it against
 * an approved vendor application would let anyone who knows an applicant's
 * (publicly submitted) email sign up as them and permanently claim the vendor's
 * work queue, client briefs, and payout rail. Linking a vendor to a login is an
 * explicit admin act (linkVendorLogin in vendor-applications actions) until a
 * signed invite-token flow ships.
 */
export async function getCreatorIdForUser(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data } = await admin.from('creator_logins').select('creator_id').eq('person_id', userId).maybeSingle()
  if (data?.creator_id) return data.creator_id as string

  const { data: vendor } = await admin.from('vendors').select('id').eq('person_id', userId).limit(1).maybeSingle()
  return vendor?.id ? (vendor.id as string) : null
}

/** One order by id (for authorization scoping at the route). */
export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_work_orders').select('*').eq('id', id).single()
  if (error || !data) return null
  const names = await creatorNamesByIds([(data.creator_id as string) ?? ''])
  return rowToWO(data, names)
}

/** Owner/team view: the orders for one campaign. */
export async function listWorkOrdersForCampaign(campaignId: string): Promise<WorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_work_orders')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('discipline')
  if (error || !data) return []
  const names = await creatorNamesByIds(data.map((r) => (r.creator_id as string) ?? ''))
  return data.map((r) => rowToWO(r, names))
}

/** Move an order along its status machine (accept / deliver / approve / revise).
 *  Enforces the legal-transition set + the deliver-needs-a-link rule at this
 *  single write chokepoint, so the API cannot hijack an order (offered→approved)
 *  or resurrect a terminal one. Throws IllegalTransition on a bad move. */
export async function updateWorkOrder(id: string, patch: { status?: WorkOrderStatus; delivered_url?: string; note?: string; concept_status?: 'approved' | 'pending' | 'changes' }): Promise<void> {
  const admin = createAdminClient()
  // The two sentinel notes are SYSTEM markers (plan removal / campaign stop),
  // written only by direct system updates — never through here. A caller-supplied
  // note matching one verbatim would hide the decline from the owner's tracker
  // and re-arm the reconcile's revive machinery, so it is quoted, not trusted.
  if (patch.note === PLAN_REMOVED_NOTE || patch.note === STOP_NOTE) patch = { ...patch, note: `"${patch.note}"` }
  type CurOrder = { status: string; campaign_id: string | null; client_id: string; title: string | null }
  let cur: CurOrder | null = null
  if (patch.status) {
    const { data, error: readErr } = await admin
      .from('creator_work_orders')
      .select('status, delivered_url, concept_status, campaign_id, client_id, title')
      .eq('id', id)
      .single()
    if (readErr || !data) throw new IllegalTransition('work order not found')
    cur = data as unknown as CurOrder
    const effectiveUrl = patch.delivered_url ?? (data.delivered_url as string | null)
    const v = validateTransition(data.status as WorkOrderStatus, patch.status, effectiveUrl, data.concept_status as string | null)
    if (!v.ok) throw new IllegalTransition(v.reason)
  }
  // Status writes re-assert the status they validated against: a decline racing
  // a campaign stop / plan-removal void (both stamp declined + a sentinel note
  // between our read and this write) loses instead of overwriting the sentinel —
  // which would have hidden the void AND auto-reassigned a stopped piece.
  let q = admin
    .from('creator_work_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (patch.status && cur) q = q.eq('status', cur.status)
  const { data: written, error } = await q.select('id')
  if (error) throw new Error(`update work order: ${error.message}`)
  if (patch.status && (!written || !written.length)) {
    throw new IllegalTransition('the order changed just now — refresh and retry')
  }
  // On owner-approval: drop the finished piece into the team's publish pipeline AND
  // accrue the owner charge. Both best-effort — a failure here must never undo a
  // valid approval, and each is independently idempotent.
  if (patch.status === 'approved') {
    await bridgeApprovedOrderToDraft(id).catch((e) => { console.error('bridge threw', id, e); return null })
    await accrueChargeForApprovedOrder(id).catch((e) => { console.error('accrueCharge threw', id, e); return null })
    await accruePayoutForApprovedOrder(id).catch((e) => { console.error('accruePayout threw', id, e); return null })
  }
  // Delivered work is the OWNER's turn — this transition previously notified nobody,
  // so finished pieces sat invisible until the owner happened to open the campaign
  // (the silent stall). Tell them; the campaign page has Approve / Ask-for-changes.
  if (patch.status === 'delivered' && cur) {
    // Campaign pieces point the owner at the campaign; a marketplace booking (no campaign) points at
    // the bookings list, where the same Approve / Ask-for-changes gate lives.
    const reviewLink = cur.campaign_id ? `/dashboard/campaigns/${cur.campaign_id}` : '/dashboard/bookings'
    await notifyClientOwners(cur.client_id, {
      kind: 'client_signoff',
      title: `${cur.title || 'A piece'} is ready for your review`,
      body: 'The finished work was delivered. Take a look and approve it, or ask for changes.',
      link: reviewLink,
    }).catch(() => ({ notified: 0 }))
  }
  // A creator saying no used to be terminal (the signal WAS the recovery). Now
  // the bench answers first: the next live vendor for the craft, then the
  // internal team. Only when nobody is left does the decline become a human
  // problem, with the original loud notifications.
  if (patch.status === 'declined' && cur) {
    const piece = cur.title || 'a piece'
    const reassigned = await autoReassignDeclinedOrder(id).catch(() => null)
    if (reassigned) {
      // Staff see the bounce (decline reasons matter), the owner is NOT pinged —
      // the piece never left production, so there is nothing for them to do.
      await notifyStaffForClient(cur.client_id, ['strategist'], {
        kind: 'client_signoff',
        title: 'A declined piece was reassigned automatically',
        body: `${piece}${patch.note ? ` (decline note: "${patch.note}")` : ''} moved to ${reassigned.name}.`,
        link: `/work/today?focus=${cur.campaign_id ?? ''}`,
      }).catch(() => ({ notified: 0 }))
    } else {
      await notifyStaffForClient(cur.client_id, ['strategist'], {
        kind: 'client_signoff',
        title: 'A creator declined a piece',
        body: `${piece}${patch.note ? `: "${patch.note}"` : ''}. Assign a new maker or move it to the team.`,
        link: `/work/today?focus=${cur.campaign_id ?? ''}`,
      }).catch(() => ({ notified: 0 }))
      if (cur.campaign_id) {
        await notifyClientOwners(cur.client_id, {
          kind: 'client_signoff',
          title: 'A piece needs a new maker',
          body: `The creator could not take on ${piece}. Your team is finding a new maker.`,
          link: `/dashboard/campaigns/${cur.campaign_id}`,
        }).catch(() => ({ notified: 0 }))
      }
    }
  }
}

const UUID_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Re-offer a just-declined order to the next maker: the best live vendor for the
 * craft who has NOT declined it before, then the internal pool (only when the
 * decliner was a real vendor — a pool decline already came from the team, and
 * re-offering the same humans under a different style id helps nobody).
 *
 * The decline history rides prior_creator_ids so a piece never bounces back to
 * someone who said no, and a 3-bounce cap hands chronic ping-pong to a human.
 * validateTransition treats 'declined' as terminal by design, so the re-offer is
 * a guarded direct update (same posture as the reconcile's revive): only a row
 * still 'declined' flips, and the decline note is preserved in the history, not
 * wiped. Returns the new maker (for the staff note) or null when nobody is left.
 */
async function autoReassignDeclinedOrder(orderId: string): Promise<{ id: string; name: string } | null> {
  const admin = createAdminClient()
  const { data: row, error } = await admin.from('creator_work_orders').select('*').eq('id', orderId).maybeSingle()
  if (error || !row || row.status !== 'declined') return null

  // A directly-booked marketplace order (no campaign) is never auto-reassigned: the restaurant chose
  // THIS creator, so bouncing the job to a different one is wrong. A decline there is terminal;
  // cancelling the booking is the way out.
  if (!row.campaign_id) return null

  // A stopped campaign's work must stay stopped: the decline block only runs on
  // real creator declines, but a stop can land between that write and this read —
  // the campaign status is the truth the note can't spoof.
  const campaignId = (row.campaign_id as string | null) ?? null
  if (campaignId) {
    const { data: camp } = await admin.from('campaigns').select('status').eq('id', campaignId).maybeSingle()
    if (camp && camp.status !== 'shipped') return null
  }

  const discipline = (row.discipline as string) ?? ''
  if (!['Video', 'Photo', 'Social', 'Design'].includes(discipline)) return null
  const d = discipline as Disc

  const decliner = (row.creator_id as string) ?? ''
  const prior = [...new Set([...(((row.prior_creator_ids as string[] | null) ?? [])), decliner].filter(Boolean))]
  if (prior.length >= 3) return null   // the third distinct decline is a pattern; humans decide now

  const vendor = await bestVendorForDiscipline(d, prior).catch(() => null)
  let next: { id: string; name: string; personId: string | null } | null = vendor
  if (!next && UUID_ID.test(decliner)) {
    // Team fallback — only across the vendor→team boundary.
    const pool = rankCreators(d).map((r) => r.creator).find((c) => !prior.includes(c.id))
    if (pool) next = { id: pool.id, name: pool.name, personId: null }
  }
  if (!next) return null

  // A decline clusters near its due date; re-offering "due yesterday" sets the
  // new maker up to fail. Give at least a 3-day runway, keep a later date as-is.
  const minDueISO = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const curDue = (row.due_date as string | null) ?? null
  const declineNote = typeof row.note === 'string' && row.note.trim() ? row.note.trim() : null
  const reoffer = {
    creator_id: next.id,
    vendor_id: UUID_ID.test(next.id) ? next.id : null,
    status: 'offered',
    // The decline reason is real context for the next maker ("client's address
    // is wrong") — carry it on the row, attributed, instead of wiping it.
    note: declineNote ? `Previous maker declined: "${declineNote}"` : null,
    prior_creator_ids: prior,
    due_date: !curDue || curDue < minDueISO ? minDueISO : curDue,
    updated_at: new Date().toISOString(),
  }
  const { data: updated, error: upErr } = await admin
    .from('creator_work_orders')
    .update(reoffer)
    .eq('id', orderId)
    .eq('status', 'declined')
    .select('id')
    .maybeSingle()
  // Pre-198 (no prior_creator_ids column, 42703): do NOT reassign — without the
  // history the exclude list forgets everyone but the last decliner and two
  // vendors can ping-pong the piece forever. The old human path takes over.
  if (upErr || !updated) return null

  if (next.personId) {
    await notifyVendorOfWork(
      next.personId,
      'New work from Apnosh',
      `"${(row.title as string) || 'A piece'}" needs a maker — the previous one couldn't take it on.`,
    ).catch(() => undefined)
  }
  return { id: next.id, name: next.name }
}

/**
 * Money-out: when the owner approves a delivered creator piece, accrue the creator's
 * payout = the order's locked gross minus Apnosh's take-rate. Accrual ONLY — no real
 * transfer here; a later owner-triggered Stripe Connect step pays it out. Idempotent
 * (unique on work_order_id), best-effort, silent no-op pre-migration (180 for the
 * price, 181 for the table). Returns whether a payout now exists for the order.
 */
export async function accruePayoutForApprovedOrder(orderId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: o, error } = await admin.from('creator_work_orders').select('*').eq('id', orderId).single()
  // A real read failure must not look like "not approved" + vanish — log it so the
  // drop is observable (the durable recovery is the Phase 5 reconcile sweep).
  if (error) { console.error('accruePayout: order read failed', orderId, error.message); return false }
  if (!o || o.status !== 'approved') return false
  if (!('amount_cents' in o)) return false   // pre-180: no price to split → silent no-op
  // Resolve the take-rate from the assignee's real vendor record when one exists;
  // a seeded pool creator falls back to the platform default (Phase 5c).
  const creatorId = (o.creator_id as string) ?? ''
  const feePercent = await feePercentForCreator(creatorId)
  const row = buildPayoutRow({
    id: o.id as string,
    client_id: o.client_id as string,
    campaign_id: (o.campaign_id as string | null) ?? null,
    creator_id: creatorId,
    amount_cents: (o.amount_cents as number) ?? 0,
    surcharge_cents: (o.surcharge_cents as number) ?? 0,   // netted out of gross (absent pre-184 → 0)
  }, feePercent)
  // A payout with no creator is unclaimable AND would consume the one-per-piece
  // slot — flag it instead of stranding it.
  if (!row.creator_id.trim()) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no creator to pay',
      body: 'A creator piece was approved with no assigned creator. Assign one and accrue the payout manually.',
      link: `/work/today?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  if (row.gross_cents <= 0) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no price to pay out',
      body: 'A creator piece was approved with no amount. Set its price and accrue the payout manually.',
      link: `/work/today?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  const { error: insErr } = await admin.from('creator_payouts').insert(row)
  if (insErr) {
    if (insErr.code === '23505') return true                          // already accrued (idempotent)
    if (insErr.code === '42P01') return false                         // table absent (pre-181) → silent no-op
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Creator payout failed to record',
      body: `Approving a creator piece didn't record its $${Math.round(row.net_cents / 100)} payout (${insErr.message}). Accrue it manually.`,
      link: `/work/today?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  return true
}

/** Creator-facing rollup: net earned across their pieces (accrued + payable + paid;
 *  void excluded), and how much of that is already paid out. Degrades to zero pre-181. */
export async function getCreatorEarnings(creatorId: string): Promise<CreatorEarnings> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_payouts')
    .select('net_cents, status')
    .eq('creator_id', creatorId)
    .in('status', ['accrued', 'payable', 'paid'])
  if (error || !data) return { netCents: 0, paidCents: 0, count: 0 }
  let netCents = 0, paidCents = 0
  for (const p of data) {
    const n = (p.net_cents as number) ?? 0
    netCents += n
    if (p.status === 'paid') paidCents += n
  }
  return { netCents, paidCents, count: data.length }
}

/**
 * Post-ship production reconcile: when a SHIPPED campaign's plan changes, re-sync the
 * creator orders + team drafts to it WITHOUT disrupting work in flight — mint added
 * pieces, REVIVE a re-added piece whose slot holds a cancelled order, void
 * removed-and-not-started ones, reject removed-and-still-editorial drafts, and re-date
 * moved pieces that aren't locked. In-flight (in_progress/delivered/approved/published)
 * work is never auto-touched: removed-but-in-flight pieces are flagged to staff, as is
 * any failed mutation. Mutations re-assert the safe status in their WHERE so a race
 * can't disrupt work that moved on. Best-effort; pass the POST-edit SavedCampaign.
 */
export async function reconcileCampaignProduction(campaign: SavedCampaign): Promise<{ minted: number; revived: number; materialized: number; voided: number; archived: number; redated: number; conflicts: number }> {
  const admin = createAdminClient()
  const campaignId = campaign.draft.id
  const ZERO = { minted: 0, revived: 0, materialized: 0, voided: 0, archived: 0, redated: 0, conflicts: 0 }
  const nowISO = new Date().toISOString()
  const todayISO = nowISO.slice(0, 10)
  const plan = planCampaignPieces(campaign, nowISO)   // clamps new pieces forward; locked target_date keeps dates stable

  const [ordersRes, { data: drafts }, { data: keyless }] = await Promise.all([
    admin.from('creator_work_orders').select('id, creator_id, discipline, slot, status, due_date, campaign_piece_key').eq('campaign_id', campaignId),
    admin.from('content_drafts').select('id, campaign_piece_key, status, target_publish_date').eq('campaign_id', campaignId).not('campaign_piece_key', 'is', null),
    // Pre-182 team drafts (keyless, NOT bridge) — if any exist we cannot match the team
    // lane, so we skip it (a mint-only pass would duplicate). Bridge drafts (from_creator)
    // are keyless too but are creator-lane artifacts, excluded here.
    admin.from('content_drafts').select('id').eq('campaign_id', campaignId).is('campaign_piece_key', null).or('media_brief->>from_creator.is.null,media_brief->>from_creator.neq.true').limit(1),
  ])
  // Loosely typed: the pre-183 retry below selects a narrower row (no piece key), and
  // the mapping reads every column by cast anyway.
  let orders: Record<string, unknown>[] | null = ordersRes.data
  let oErr = ordersRes.error
  // Pre-183 the campaign_piece_key column is absent (42703); re-read without it so the
  // reconcile still runs for legacy (positionally-keyed) campaigns.
  if (oErr && (oErr as { code?: string }).code === '42703') {
    const retry = await admin.from('creator_work_orders').select('id, creator_id, discipline, slot, status, due_date').eq('campaign_id', campaignId)
    orders = retry.data; oErr = retry.error
  }
  if (oErr) return ZERO   // pre-migration / read failure → no-op
  const teamSafe = !(keyless && keyless.length)
  // Match an order by its stored stable key when it has one (migration 183, Content
  // Menu), else fall back to the legacy positional discipline:slot. Both lanes of a
  // single campaign are consistent: a menu campaign's orders all carry a key, a legacy
  // campaign's never do, so the plan key (line id vs group:slot) always lines up.
  const existingOrders = (orders ?? []).map((o) => ({ id: o.id as string, key: (o.campaign_piece_key as string | null) || `${o.discipline as string}:${o.slot as number}`, status: (o.status as string) ?? '', dueISO: (o.due_date as string | null) ?? null }))
  const existingDrafts = (drafts ?? []).map((d) => ({ id: d.id as string, key: (d.campaign_piece_key as string) ?? '', status: (d.status as string) ?? '', dateISO: (d.target_publish_date as string | null) ?? null }))
  const rec = reconcileProductionPlan(plan, existingOrders, existingDrafts, todayISO)

  let minted = 0, revived = 0, materialized = 0, voided = 0, archived = 0, redated = 0, failures = 0
  const ts = () => new Date().toISOString()

  // Creator lane. New pieces get the same real-vendor assignment as the ship
  // mint, but each craft stays with its INCUMBENT — the maker already holding
  // this campaign's non-terminal orders — so briefs and shoots keep batching
  // with one vendor instead of splitting on a fresh best-ranked pick.
  const LIVE_ORDER = new Set(['offered', 'accepted', 'in_progress', 'revision', 'delivered', 'approved'])
  const incumbents = new Map<string, string>()
  for (const o of orders ?? []) {
    const disc = (o.discipline as string) ?? ''
    const cid = (o.creator_id as string) ?? ''
    if (disc && cid && !incumbents.has(disc) && LIVE_ORDER.has((o.status as string) ?? '')) incumbents.set(disc, cid)
  }
  const builtRows = rec.mintCreator.map((p) => workOrderRowForPiece(campaign, p)).filter((r): r is WorkOrderRow => r !== null)
  const { rows: orderRows, assigned: reconcileAssigned } = builtRows.length
    ? await assignVendorsToOrderRows(builtRows, incumbents)
    : { rows: [] as WorkOrderRow[], assigned: new Map<Disc, { id: string; name: string; personId: string | null }>() }
  if (orderRows.length) {
    let { data: insertedRows, error } = await admin.from('creator_work_orders').upsert(orderRows, { onConflict: 'campaign_id,discipline,slot', ignoreDuplicates: true }).select('creator_id')
    if (error && error.code === '42703') {   // pre-183/184: no campaign_piece_key / surcharge_cents column → mint without them
      const stripped = orderRows.map((r) => { const c = { ...r } as Record<string, unknown>; delete c.campaign_piece_key; delete c.surcharge_cents; return c })
      ;({ data: insertedRows, error } = await admin.from('creator_work_orders').upsert(stripped, { onConflict: 'campaign_id,discipline,slot', ignoreDuplicates: true }).select('creator_id'))
    }
    if (error) failures++
    else {
      // Honest count: ignoreDuplicates silently SKIPS a row whose (discipline,
      // slot) is still occupied — e.g. a removed piece's voided order holding
      // the slot its replacement needs. A skipped mint is a piece nobody will
      // ever make; counting it as a failure routes it into the staff "needs a
      // manual review" notification below instead of vanishing as a success.
      minted = insertedRows?.length ?? 0
      const skipped = orderRows.length - minted
      if (skipped > 0) failures += skipped
      // Only rows that actually inserted generate a vendor ping.
      await notifyVendorsOfNewWork((insertedRows ?? []) as Array<{ creator_id?: string | null }>, reconcileAssigned, campaign.draft.name).catch(() => undefined)
    }
  }
  // Only revive orders WE voided when the owner removed the piece (stamped with
  // PLAN_REMOVED_NOTE). A creator's own decline is terminal here: silently re-offering
  // it to the same creator who said no (wiping their note) helps nobody — a human
  // reassigns instead (flagged below).
  let staleDeclines = 0
  for (const u of rec.reviveOrderIds) {
    const { data, error } = await admin.from('creator_work_orders').update({ status: 'offered', due_date: u.dueISO, note: null, updated_at: ts() }).eq('id', u.id).eq('status', 'declined').eq('note', PLAN_REMOVED_NOTE).select('id')
    if (error) failures++
    else if (data?.length) revived++
    else staleDeclines++
  }
  if (staleDeclines > 0) {
    await notifyStaffForClient(campaign.clientId, ['strategist'], {
      kind: 'client_signoff',
      title: 'A plan edit needs a new maker',
      body: `${campaign.draft.name}: ${staleDeclines} piece${staleDeclines === 1 ? '' : 's'} came back into the plan, but the creator declined it earlier. Assign someone else.`,
      link: `/work/today?focus=${campaignId}`,
    }).catch(() => ({ notified: 0 }))
  }
  if (rec.voidOrderIds.length) {
    const { data, error } = await admin.from('creator_work_orders').update({ status: 'declined', note: PLAN_REMOVED_NOTE, updated_at: ts() }).in('id', rec.voidOrderIds).in('status', ['offered', 'accepted']).select('id')
    if (error) failures++; else voided = data?.length ?? 0
  }
  for (const u of rec.redateOrders) { const { error } = await admin.from('creator_work_orders').update({ due_date: u.dueISO, updated_at: ts() }).eq('id', u.id).in('status', ['offered', 'accepted']); if (error) failures++; else redated++ }

  // Team lane — only when every team draft is matchable (no pre-182 keyless drafts).
  if (teamSafe) {
    const draftRows = rec.materializeTeam.map((p) => teamDraftRowForPiece(campaign, p))
    if (draftRows.length) {
      let { error } = await admin.from('content_drafts').insert(draftRows)
      if (error && error.code === '42703') {
        const stripped = draftRows.map((r) => { const c = { ...r } as Record<string, unknown>; delete c.campaign_piece_key; return c })
        ;({ error } = await admin.from('content_drafts').insert(stripped))
      }
      if (error) failures++; else materialized = draftRows.length
    }
    if (rec.archiveDraftIds.length) {
      // 'rejected' is the content_drafts terminal dead state ('archived' is NOT in its CHECK).
      const { data, error } = await admin.from('content_drafts').update({ status: 'rejected', updated_at: ts() }).in('id', rec.archiveDraftIds).in('status', ['idea', 'draft', 'revising']).select('id')
      if (error) failures++; else archived = data?.length ?? 0
    }
    for (const u of rec.redateDrafts) { const { error } = await admin.from('content_drafts').update({ target_publish_date: u.dateISO, updated_at: ts() }).eq('id', u.id).in('status', ['idea', 'draft', 'revising']); if (error) failures++; else redated++ }
  }

  // Flag a human for anything we deliberately did NOT auto-touch (removed-but-in-flight
  // pieces) or any mutation that failed — money + live work is never silently dropped.
  const conflicts = rec.conflicts.orderIds.length + rec.conflicts.draftIds.length
  if (conflicts > 0 || failures > 0) {
    await notifyStaffForClient(campaign.clientId, ['strategist'], {
      kind: 'client_signoff',
      title: 'Campaign edit needs a manual review',
      body: `${campaign.draft.name}: ${conflicts} in-flight piece${conflicts === 1 ? '' : 's'} were removed from the plan but kept (cancel or reschedule by hand)${failures ? `; ${failures} sync action${failures === 1 ? '' : 's'} failed and need redoing` : ''}.`,
      link: `/work/today?focus=${campaignId}`,
    }).catch(() => ({ notified: 0 }))
  }
  return { minted, revived, materialized, voided, archived, redated, conflicts }
}

/** Whether a campaign has any non-void owner charge or creator payout. Used to block
 *  deleting a campaign that has billed/owed money — a delete would erase the owner
 *  charge (cascade) yet strand the creator payout (set-null), losing its provenance.
 *  Degrades to false (allow delete) pre-180/181 (tables absent → query error). */
export async function campaignHasAccruedMoney(campaignId: string): Promise<boolean> {
  const admin = createAdminClient()
  const [{ data: ch }, { data: po }] = await Promise.all([
    admin.from('campaign_charges').select('id').eq('campaign_id', campaignId).neq('status', 'void').limit(1),
    admin.from('creator_payouts').select('id').eq('campaign_id', campaignId).neq('status', 'void').limit(1),
  ])
  return !!(ch && ch.length) || !!(po && po.length)
}

/**
 * Reconcile sweep: find every approved creator order missing its owner charge or
 * creator payout and accrue the gap. Recovers anything a best-effort accrual dropped
 * (a transient failure at approval time) — the durable backstop the money reviews
 * deferred here. Idempotent (the accrue fns no-op if already present), best-effort,
 * and a no-op pre-180/181. Run by the reconcile cron, or scoped to one campaign.
 */
export async function reconcileAccruals(opts?: { campaignId?: string }): Promise<{ ordersChecked: number; chargesRecovered: number; payoutsRecovered: number; draftsChecked: number; teamChargesRecovered: number; claimsReverted: number; paidSynced: number; voidsSynced: number }> {
  const admin = createAdminClient()
  const ZERO = { ordersChecked: 0, chargesRecovered: 0, payoutsRecovered: 0, draftsChecked: 0, teamChargesRecovered: 0, claimsReverted: 0, paidSynced: 0, voidsSynced: 0 }
  let oq = admin.from('creator_work_orders').select('id, amount_cents').eq('status', 'approved')
  if (opts?.campaignId) oq = oq.eq('campaign_id', opts.campaignId)
  const { data: orders, error } = await oq          // pre-180: amount_cents absent → error → no-op
  let ordersChecked = 0, chargesRecovered = 0, payoutsRecovered = 0
  if (!error && orders && orders.length) {
    const approved = orders.map((o) => ({ id: o.id as string, amount_cents: (o.amount_cents as number) ?? 0 }))
    const ids = approved.map((o) => o.id)
    const [{ data: ch }, { data: po }] = await Promise.all([
      admin.from('campaign_charges').select('work_order_id').in('work_order_id', ids),
      admin.from('creator_payouts').select('work_order_id').in('work_order_id', ids),
    ])
    const charged = new Set((ch ?? []).map((r) => r.work_order_id as string))
    const paid = new Set((po ?? []).map((r) => r.work_order_id as string))
    const { needCharge, needPayout } = findUnaccrued(approved, charged, paid)
    for (const id of needCharge) if (await accrueChargeForApprovedOrder(id).catch(() => false)) chargesRecovered++
    for (const id of needPayout) if (await accruePayoutForApprovedOrder(id).catch(() => false)) payoutsRecovered++
    ordersChecked = approved.length
  }

  // Team/AI lane: published campaign drafts missing their charge. Bridge drafts
  // (from_creator) are excluded — those billed via their work order; charging the
  // draft too would double-bill the piece. Pre-182 (no campaign_piece_key) the
  // select errors → the branch no-ops, same degradation posture as the creator lane.
  let draftsChecked = 0, teamChargesRecovered = 0
  let dq = admin.from('content_drafts')
    .select('id')
    .eq('status', 'published')
    .not('campaign_id', 'is', null)
    .not('campaign_piece_key', 'is', null)
    .or('media_brief->>from_creator.is.null,media_brief->>from_creator.neq.true')
    .limit(500)
  if (opts?.campaignId) dq = dq.eq('campaign_id', opts.campaignId)
  const { data: drafts, error: dErr } = await dq
  if (!dErr && drafts && drafts.length) {
    const draftIds = drafts.map((d) => d.id as string)
    const { data: dch } = await admin.from('campaign_charges').select('content_draft_id').in('content_draft_id', draftIds)
    const chargedDrafts = new Set((dch ?? []).map((r) => r.content_draft_id as string))
    for (const id of draftIds) {
      if (chargedDrafts.has(id)) continue
      if (await accrueChargeForPublishedDraft(id).catch(() => false)) teamChargesRecovered++
    }
    draftsChecked = draftIds.length
  }

  // Invoice-bridge backstop (197). Two recoveries:
  //   (a) release claims stranded by a hard crash — 'invoiced' with no
  //       stripe_invoice_id after an hour means the bridge died before an
  //       invoice existed (its own release also failed); the work must go back
  //       to 'accrued' or it is never billed.
  //   (b) re-sync flips the webhook missed (it returns 200 even on handler
  //       errors, so Stripe never retries): read the local invoices mirror by
  //       invoice id — and when the mirror itself is unsettled, ask Stripe
  //       directly, because the mirror is written by the very webhook whose
  //       failure this backstop covers (it can lie 'open' forever).
  //       paid → charges paid + payouts unlocked (accrued→payable);
  //       void → charges released to accrued; uncollectible (write-off) → void.
  // Every update is scoped to BOTH the charge status and the invoice id, so a
  // charge that moved onto a NEW invoice between our read and the write is
  // untouched. Pre-197 the filter columns are absent → the reads error → no-op.
  // Scoped (per-campaign) reconciles skip this — it is the 6-hourly cron's job.
  let claimsReverted = 0, paidSynced = 0, voidsSynced = 0
  if (!opts?.campaignId) {
    const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const { data: stranded, error: strandedErr } = await admin
      .from('campaign_charges')
      .update({ status: 'accrued', invoiced_at: null })
      .eq('status', 'invoiced')
      .is('stripe_invoice_id', null)
      .lt('invoiced_at', hourAgo)
      .select('id')
    if (!strandedErr) claimsReverted = stranded?.length ?? 0

    const { data: invoiced, error: invErr } = await admin
      .from('campaign_charges')
      .select('id, stripe_invoice_id, work_order_id')
      .eq('status', 'invoiced')
      .not('stripe_invoice_id', 'is', null)
      .limit(500)
    if (!invErr && invoiced && invoiced.length) {
      const byInvoice = new Map<string, string[]>()
      for (const c of invoiced) {
        const key = c.stripe_invoice_id as string
        byInvoice.set(key, [...(byInvoice.get(key) ?? []), c.id as string])
      }
      const invIds = [...byInvoice.keys()]
      const { data: mirror } = await admin.from('invoices').select('stripe_invoice_id, status').in('stripe_invoice_id', invIds)
      const statusByInv = new Map((mirror ?? []).map((m) => [m.stripe_invoice_id as string, (m.status as string) ?? '']))

      // Mirror unsettled (or missing) → Stripe is the source of truth. Capped
      // per run; anything past the cap waits for the next 6-hour sweep.
      const unsettled = invIds.filter((id) => !['paid', 'void', 'uncollectible'].includes(statusByInv.get(id) ?? ''))
      if (unsettled.length) {
        try {
          const { stripe } = await import('@/lib/stripe')
          for (const id of unsettled.slice(0, 20)) {
            const inv = await stripe.invoices.retrieve(id).catch(() => null)
            if (inv?.status) statusByInv.set(id, inv.status)
          }
        } catch { /* no Stripe key in this environment → the mirror is all we have */ }
      }

      for (const [invId, chargeIds] of byInvoice) {
        const st = statusByInv.get(invId) ?? ''
        if (st === 'paid') {
          const { data: flipped } = await admin.from('campaign_charges')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .in('id', chargeIds).eq('status', 'invoiced').eq('stripe_invoice_id', invId)
            .select('work_order_id')
          paidSynced += flipped?.length ?? 0
          const orderIds = (flipped ?? []).map((r) => r.work_order_id as string | null).filter((v): v is string => !!v)
          if (orderIds.length) {
            await admin.from('creator_payouts').update({ status: 'payable' }).in('work_order_id', orderIds).eq('status', 'accrued')
          }
        } else if (st === 'void') {
          const { data: released } = await admin.from('campaign_charges')
            .update({ status: 'accrued', stripe_invoice_id: null, invoiced_at: null })
            .in('id', chargeIds).eq('status', 'invoiced').eq('stripe_invoice_id', invId)
            .select('id')
          voidsSynced += released?.length ?? 0
        } else if (st === 'uncollectible') {
          await admin.from('campaign_charges')
            .update({ status: 'void' })
            .in('id', chargeIds).eq('status', 'invoiced').eq('stripe_invoice_id', invId)
        }
      }
    }
  }

  if (!ordersChecked && !draftsChecked && !claimsReverted && !paidSynced && !voidsSynced) return ZERO
  return { ordersChecked, chargesRecovered, payoutsRecovered, draftsChecked, teamChargesRecovered, claimsReverted, paidSynced, voidsSynced }
}

/**
 * Money-in: when the owner approves a delivered creator piece, accrue the owner
 * charge for it (the price locked on the order at ship). Accrual ONLY — nothing is
 * charged via Stripe here; a later owner-triggered step turns accrued charges into
 * a real invoice. Idempotent (the unique index on work_order_id makes a re-accrual
 * a no-op) + best-effort + degrades to a no-op pre-migration 180. Returns whether a
 * charge now exists for the order.
 */
export async function accrueChargeForApprovedOrder(orderId: string): Promise<boolean> {
  const admin = createAdminClient()
  // select('*') so a missing amount_cents column (pre-180) doesn't error the read.
  const { data: o, error } = await admin.from('creator_work_orders').select('*').eq('id', orderId).single()
  if (error) { console.error('accrueCharge: order read failed', orderId, error.message); return false }
  if (!o || o.status !== 'approved') return false
  // Pre-migration 180 (amount_cents + campaign_charges absent) → silent no-op, never
  // a dead-letter. select('*') omits a missing column, so the key is absent here.
  if (!('amount_cents' in o)) return false
  // G1 double-billing gate: if this campaign was paid IN FULL at checkout, the piece is
  // already covered — record the charge for the ledger but as 'covered_by_checkout', so
  // the invoicing path (which claims only 'accrued' rows) can never bill it a second time.
  const campaignId = (o.campaign_id as string | null) ?? null
  const covered = campaignId ? await isCampaignCheckoutPaid(campaignId) : false
  const row = buildChargeRow({
    id: o.id as string,
    client_id: o.client_id as string,
    campaign_id: campaignId,
    amount_cents: (o.amount_cents as number) ?? 0,
  }, covered ? 'covered_by_checkout' : 'accrued')
  // An approved creator piece with no price is a data-integrity signal (an order
  // minted before pricing existed, or an unpriced content type) — never record a
  // phantom $0 charge; flag it for staff to price + accrue by hand.
  if (row.amount_cents <= 0) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no price to bill',
      body: 'A creator piece was approved with no amount. Set its price and accrue the charge manually.',
      link: `/work/today?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  const { error: insErr } = await admin.from('campaign_charges').insert(row)
  if (insErr) {
    if (insErr.code === '23505') return true   // unique violation → already accrued (idempotent)
    // Pre-migration 217: the covered marker isn't in the status CHECK yet. NEVER fall back to
    // 'accrued' (that re-opens the double-bill) — skip the ledger row entirely. No money is at
    // risk (the checkout charge already collected it); the row is only a record we can backfill.
    if (row.status === 'covered_by_checkout' && insErr.code === '23514') {
      console.warn(`accrueCharge: skipped covered_by_checkout ledger row (apply migration 217) order=${row.work_order_id}`)
      return true
    }
    // A real failure must never silently lose money — dead-letter it so a human
    // can accrue the charge before Phase 3b's invoicing runs.
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Owner charge failed to record',
      body: `Approving a creator piece didn't record its $${Math.round(row.amount_cents / 100)} charge (${insErr.message}). Accrue it manually.`,
      link: `/work/today?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  return true
}

/**
 * Money-in, TEAM/AI lane: when a campaign-minted content_draft actually PUBLISHES,
 * accrue the owner charge for it — the trigger that matches the owner-facing copy
 * ("each piece is charged only when it ships"). The creator lane accrues on delivery
 * approval; team/AI pieces never accrued at all before this (migration 180 built the
 * content_draft_id slot for exactly this — the first writer to use it).
 *
 * Price comes from planCampaignPieces at accrual time (team drafts carry no locked
 * amount_cents, unlike creator orders). Bridge drafts (media_brief.from_creator) are
 * EXCLUDED — those already billed via their work order; charging their draft too
 * would double-bill the piece. Idempotent via the partial unique index on
 * content_draft_id (23505 → already accrued). Degrades to a no-op pre-180.
 */
export async function accrueChargeForPublishedDraft(draftId: string): Promise<boolean> {
  const admin = createAdminClient()
  // select('*') so a missing campaign_piece_key column (pre-182) doesn't error the read.
  const { data: d, error } = await admin.from('content_drafts').select('*').eq('id', draftId).single()
  if (error || !d) return false
  const campaignId = (d.campaign_id as string | null) ?? null
  const pieceKey = 'campaign_piece_key' in d ? ((d.campaign_piece_key as string | null) ?? null) : null
  if (!campaignId || !pieceKey) return false           // not a campaign piece → nothing to bill here
  const brief = (d.media_brief && typeof d.media_brief === 'object' ? d.media_brief : {}) as Record<string, unknown>
  if (brief.from_creator === true || brief.from_creator === 'true') return false  // bills via its work order
  if (d.status !== 'published' && !d.published_at) return false
  // Resolve the piece's price from the plan (dynamic import: server.ts consumes this
  // module's minters, so a static import would be a cycle).
  const { getCampaign } = await import('./server')
  const campaign = await getCampaign(campaignId)
  if (!campaign) return false
  const piece = planCampaignPieces(campaign, new Date().toISOString()).find((p) => p.key === pieceKey)
  if (!piece) return false                             // piece left the plan — reconcile flags that path
  if ((piece.priceCents ?? 0) <= 0) return false       // DIY/free by design → nothing to bill, no dead-letter
  // G1 double-billing gate (team/AI lane): a checkout-paid campaign's pieces are already
  // covered — record the ledger row as 'covered_by_checkout', never invoiceable.
  const covered = await isCampaignCheckoutPaid(campaignId)
  const { error: insErr } = await admin.from('campaign_charges').insert({
    client_id: d.client_id as string,
    campaign_id: campaignId,
    content_draft_id: draftId,
    source: 'team',
    amount_cents: piece.priceCents,
    status: covered ? 'covered_by_checkout' : 'accrued',
  })
  if (insErr) {
    if (insErr.code === '23505') return true           // already accrued (idempotent)
    if (insErr.code === '42P01') return false          // pre-180 → silent no-op
    // Pre-migration 217: covered marker not in the CHECK yet. Never fall back to 'accrued'
    // (re-opens the double-bill) — skip the ledger row; the checkout charge already collected it.
    if (covered && insErr.code === '23514') {
      console.warn(`accrueChargeForPublishedDraft: skipped covered_by_checkout ledger row (apply migration 217) draft=${draftId}`)
      return true
    }
    await notifyStaffForClient(d.client_id as string, ['strategist'], {
      kind: 'client_signoff',
      title: 'Published piece charge failed to record',
      body: `A published campaign piece didn't record its $${Math.round(piece.priceCents / 100)} charge (${insErr.message}). Accrue it manually.`,
      link: `/work/today?focus=${campaignId}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  return true
}

/**
 * Stop a campaign's production, terminally. A dedicated sweep — NOT the
 * empty-plan reconcile trick: that would stamp PLAN_REMOVED_NOTE (whose voids a
 * later reconcile auto-REVIVES) and send the wrong staff copy. Guards mirror the
 * reconcile's exactly:
 *  - creator orders: void only offered/accepted (never started) with STOP_NOTE;
 *    in-flight work (in_progress/revision/delivered/approved) is PROTECTED — it
 *    finishes and bills (charges accrue at approval), counted for the settlement.
 *  - team drafts: reject everything editorial or queued-to-post (idea/draft/
 *    revising/approved/scheduled) — a stopped campaign must never keep posting;
 *    published work is history and stays.
 *  - service orders: cancel everything not yet delivered (the 196 'cancelled'
 *    terminal); delivered work is proof-backed history and stays.
 * Money is untouched by construction: charges/payouts only exist for
 * approved/published work, which this never voids.
 */
export interface StopSweep { voidedOrders: number; rejectedDrafts: number; cancelledServices: number; inFlight: number }
export async function stopCampaign(campaignId: string): Promise<StopSweep> {
  const admin = createAdminClient()
  const ts = new Date().toISOString()
  const [voidedRes, rejectedRes, cancelledRes, inflightRes] = await Promise.all([
    admin.from('creator_work_orders')
      .update({ status: 'declined', note: STOP_NOTE, updated_at: ts })
      .eq('campaign_id', campaignId)
      .in('status', ['offered', 'accepted'])
      .select('id'),
    admin.from('content_drafts')
      .update({ status: 'rejected', updated_at: ts })
      .eq('campaign_id', campaignId)
      .in('status', ['idea', 'draft', 'revising', 'approved', 'scheduled'])
      .select('id'),
    admin.from('service_work_orders')
      .update({ status: 'cancelled', updated_at: ts })
      .eq('campaign_id', campaignId)
      .in('status', ['queued', 'claimed', 'in_progress', 'blocked_client', 'blocked_gate', 'ready_for_client'])
      .select('id'),
    admin.from('creator_work_orders')
      .select('id')
      .eq('campaign_id', campaignId)
      .in('status', ['in_progress', 'revision', 'delivered', 'approved']),
  ])
  return {
    voidedOrders: voidedRes.data?.length ?? 0,
    rejectedDrafts: rejectedRes.data?.length ?? 0,
    cancelledServices: cancelledRes.data?.length ?? 0,   // pre-196 CHECK → error → 0, degrades silently
    inFlight: inflightRes.data?.length ?? 0,
  }
}

/** Owner-facing rollup: what a campaign has accrued to bill (accrued + invoiced +
 *  paid count toward the total; voided does not). Degrades to zero pre-180. */
export async function getCampaignCharges(campaignId: string): Promise<CampaignCharges> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('campaign_charges')
    .select('amount_cents, status')
    .eq('campaign_id', campaignId)
    .in('status', ['accrued', 'invoiced', 'paid'])
  if (error || !data) return { accruedCents: 0, count: 0 }
  return { accruedCents: data.reduce((s, c) => s + ((c.amount_cents as number) ?? 0), 0), count: data.length }
}

/** Batch form of getCampaignCharges for list surfaces (the Orders money view):
 *  one query across all launched campaigns; ids with no charges get no key.
 *  Returns NULL on query failure (not {}) so callers can render "unknown"
 *  instead of asserting a false "$0 billed". */
export async function getCampaignChargesBatch(campaignIds: string[]): Promise<Record<string, CampaignCharges> | null> {
  if (campaignIds.length === 0) return {}
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('campaign_charges')
    .select('campaign_id, amount_cents, status')
    .in('campaign_id', campaignIds)
    .in('status', ['accrued', 'invoiced', 'paid'])
  if (error || !data) return null
  const out: Record<string, CampaignCharges> = {}
  for (const c of data) {
    const id = c.campaign_id as string
    const cur = out[id] ?? (out[id] = { accruedCents: 0, count: 0 })
    cur.accruedCents += (c.amount_cents as number) ?? 0
    cur.count += 1
  }
  return out
}

/**
 * Publish bridge: when the owner approves a creator delivery, materialize the
 * piece as a content_draft (status 'draft' — a team finalization to-do) carrying
 * the delivered link in its media brief + the brief's caption/hashtags, linked back
 * via content_draft_id. This drops the approved creator work into the SAME team
 * drafts queue the team finalizes + schedules from, instead of dead-ending at an
 * approved work order with nowhere to go. Idempotent + best-effort:
 * never blocks the approval, never makes a 2nd draft for an already-linked order,
 * and cleans up its draft if it loses the link race or the FK column is absent
 * (pre-migration 179). Returns the new content_draft id, or null if not bridged.
 */
export async function bridgeApprovedOrderToDraft(orderId: string): Promise<string | null> {
  const admin = createAdminClient()
  // select('*') so a missing content_draft_id column (pre-179) does not error the read.
  const { data: o, error } = await admin.from('creator_work_orders').select('*').eq('id', orderId).single()
  // A marketplace booking (campaign_id null) is NOT a campaign content piece: its deliverable goes to
  // the restaurant, not into the team's social publish queue. Skip the bridge for it.
  if (error || !o || o.status !== 'approved' || o.content_draft_id || !o.campaign_id) return null
  const row = buildBridgeDraftRow({
    client_id: o.client_id as string,
    campaign_id: (o.campaign_id as string | null) ?? null,
    title: o.title as string | null,
    due_date: o.due_date as string | null,
    delivered_url: o.delivered_url as string | null,
    brief_details: o.brief_details as { creative?: { caption?: unknown; hashtags?: unknown } } | null,
  })
  // A failed bridge means paid, approved work never enters the publish queue and no
  // sweep retries it — the dead-letter is the only recovery signal, like the money paths.
  const bridgeDeadLetter = () => notifyStaffForClient(o.client_id as string, ['strategist'], {
    kind: 'client_signoff',
    title: 'An approved delivery did not reach the publish queue',
    body: `${(o.title as string) || 'An approved creator piece'} was approved but its publish draft failed to create. Add it to the drafts queue by hand.`,
    link: `/work/today?focus=${(o.campaign_id as string) ?? ''}`,
  }).catch(() => ({ notified: 0 }))
  const { data: draft, error: insErr } = await admin
    .from('content_drafts')
    .insert(row)
    .select('id').single()
  if (insErr || !draft) {
    await bridgeDeadLetter()
    return null
  }
  // Link only if still unlinked; if the link fails (lost race, or the FK column is
  // absent pre-179), delete the orphan draft so we never double-produce the piece.
  const { data: linked, error: linkErr } = await admin.from('creator_work_orders')
    .update({ content_draft_id: draft.id }).eq('id', orderId).is('content_draft_id', null).select('id').maybeSingle()
  if (linkErr || !linked) {
    await admin.from('content_drafts').delete().eq('id', draft.id as string)
    // A lost race is benign (the other bridge won and the piece has a draft). Only a
    // still-unlinked order after cleanup is a real drop worth a human.
    const { data: after } = await admin.from('creator_work_orders').select('content_draft_id').eq('id', orderId).maybeSingle()
    if (!after?.content_draft_id) await bridgeDeadLetter()
    return null
  }
  return draft.id as string
}
