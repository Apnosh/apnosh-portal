/**
 * Creator work orders — the supply-side spine. On ship, each creative discipline
 * with a chosen creator becomes an order that creator receives, accepts, and
 * delivers. Server-only (admin client); the creator portal + owner detail read
 * through here.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { notifyStaffForClient } from '@/lib/notifications'
import { creatorById } from './creators'
import { buildWorkOrderRows, buildBridgeDraftRow, buildChargeRow, buildPayoutRow, DEFAULT_PLATFORM_FEE, validateTransition, IllegalTransition, type WorkOrderStatus } from './work-orders-core'
import type { SavedCampaign, CampaignCharges, CreatorEarnings } from './view'

export type { WorkOrderStatus }
export { IllegalTransition } from './work-orders-core'

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
}

function rowToWO(r: Record<string, unknown>): WorkOrder {
  const creatorId = (r.creator_id as string) ?? ''
  return {
    id: r.id as string,
    campaignId: (r.campaign_id as string) ?? '',
    clientId: (r.client_id as string) ?? '',
    creatorId,
    creatorName: creatorById(creatorId)?.name ?? creatorId,
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
  const rows = buildWorkOrderRows(campaign, shipISO)
  if (!rows.length) return 0

  const admin = createAdminClient()
  const { data: existing, error: existErr } = await admin
    .from('creator_work_orders')
    .select('id')
    .eq('campaign_id', campaign.draft.id)
    .limit(1)
  if (existErr) return 0
  if (existing && existing.length) return 0

  const { error } = await admin.from('creator_work_orders').insert(rows)
  if (error) return 0
  return rows.length
}

/** A creator's inbox: every order assigned to them, newest first. */
export async function listWorkOrdersForCreator(creatorId: string): Promise<WorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_work_orders')
    .select('*, campaigns(name)')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({ ...rowToWO(r), campaignName: ((r as { campaigns?: { name?: string } }).campaigns?.name) ?? undefined }))
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

/** The pool creator id this auth user signs in as (test-creator login), or null. */
export async function getCreatorIdForUser(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_logins').select('creator_id').eq('person_id', userId).maybeSingle()
  if (error || !data) return null
  return (data.creator_id as string) ?? null
}

/** One order by id (for authorization scoping at the route). */
export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_work_orders').select('*').eq('id', id).single()
  if (error || !data) return null
  return rowToWO(data)
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
  return data.map(rowToWO)
}

/** Move an order along its status machine (accept / deliver / approve / revise).
 *  Enforces the legal-transition set + the deliver-needs-a-link rule at this
 *  single write chokepoint, so the API cannot hijack an order (offered→approved)
 *  or resurrect a terminal one. Throws IllegalTransition on a bad move. */
export async function updateWorkOrder(id: string, patch: { status?: WorkOrderStatus; delivered_url?: string; note?: string; concept_status?: 'approved' | 'pending' | 'changes' }): Promise<void> {
  const admin = createAdminClient()
  if (patch.status) {
    const { data: cur, error: readErr } = await admin
      .from('creator_work_orders')
      .select('status, delivered_url, concept_status')
      .eq('id', id)
      .single()
    if (readErr || !cur) throw new IllegalTransition('work order not found')
    const effectiveUrl = patch.delivered_url ?? (cur.delivered_url as string | null)
    const v = validateTransition(cur.status as WorkOrderStatus, patch.status, effectiveUrl, cur.concept_status as string | null)
    if (!v.ok) throw new IllegalTransition(v.reason)
  }
  const { error } = await admin
    .from('creator_work_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`update work order: ${error.message}`)
  // On owner-approval: drop the finished piece into the team's publish pipeline AND
  // accrue the owner charge. Both best-effort — a failure here must never undo a
  // valid approval, and each is independently idempotent.
  if (patch.status === 'approved') {
    await bridgeApprovedOrderToDraft(id).catch(() => null)
    await accrueChargeForApprovedOrder(id).catch(() => null)
    await accruePayoutForApprovedOrder(id).catch(() => null)
  }
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
  if (error || !o || o.status !== 'approved') return false
  if (!('amount_cents' in o)) return false   // pre-180: no price to split → silent no-op
  // Seeded pool creators have no vendor record yet → the platform default take-rate.
  // Real vendors override from vendors.platform_fee_percent once supply is real (Phase 5).
  const row = buildPayoutRow({
    id: o.id as string,
    client_id: o.client_id as string,
    campaign_id: (o.campaign_id as string | null) ?? null,
    creator_id: (o.creator_id as string) ?? '',
    amount_cents: (o.amount_cents as number) ?? 0,
  }, DEFAULT_PLATFORM_FEE)
  if (row.gross_cents <= 0) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no price to pay out',
      body: 'A creator piece was approved with no amount. Set its price and accrue the payout manually.',
      link: `/work/campaigns?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  const { error: insErr } = await admin.from('creator_payouts').insert(row)
  if (insErr) {
    if (insErr.code === '23505') return true                          // already accrued (idempotent)
    if (insErr.code === '42P01' || insErr.code === '42703') return false   // pre-181 → silent no-op
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Creator payout failed to record',
      body: `Approving a creator piece didn't record its $${Math.round(row.net_cents / 100)} payout (${insErr.message}). Accrue it manually.`,
      link: `/work/campaigns?focus=${row.campaign_id ?? ''}`,
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
  if (error || !o || o.status !== 'approved') return false
  // Pre-migration 180 (amount_cents + campaign_charges absent) → silent no-op, never
  // a dead-letter. select('*') omits a missing column, so the key is absent here.
  if (!('amount_cents' in o)) return false
  const row = buildChargeRow({
    id: o.id as string,
    client_id: o.client_id as string,
    campaign_id: (o.campaign_id as string | null) ?? null,
    amount_cents: (o.amount_cents as number) ?? 0,
  })
  // An approved creator piece with no price is a data-integrity signal (an order
  // minted before pricing existed, or an unpriced content type) — never record a
  // phantom $0 charge; flag it for staff to price + accrue by hand.
  if (row.amount_cents <= 0) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no price to bill',
      body: 'A creator piece was approved with no amount. Set its price and accrue the charge manually.',
      link: `/work/campaigns?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  const { error: insErr } = await admin.from('campaign_charges').insert(row)
  if (insErr) {
    if (insErr.code === '23505') return true   // unique violation → already accrued (idempotent)
    // A real failure must never silently lose money — dead-letter it so a human
    // can accrue the charge before Phase 3b's invoicing runs.
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Owner charge failed to record',
      body: `Approving a creator piece didn't record its $${Math.round(row.amount_cents / 100)} charge (${insErr.message}). Accrue it manually.`,
      link: `/work/campaigns?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
  return true
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
  if (error || !o || o.status !== 'approved' || o.content_draft_id) return null
  const row = buildBridgeDraftRow({
    client_id: o.client_id as string,
    campaign_id: (o.campaign_id as string | null) ?? null,
    title: o.title as string | null,
    due_date: o.due_date as string | null,
    delivered_url: o.delivered_url as string | null,
    brief_details: o.brief_details as { creative?: { caption?: unknown; hashtags?: unknown } } | null,
  })
  const { data: draft, error: insErr } = await admin
    .from('content_drafts')
    .insert(row)
    .select('id').single()
  if (insErr || !draft) return null
  // Link only if still unlinked; if the link fails (lost race, or the FK column is
  // absent pre-179), delete the orphan draft so we never double-produce the piece.
  const { data: linked, error: linkErr } = await admin.from('creator_work_orders')
    .update({ content_draft_id: draft.id }).eq('id', orderId).is('content_draft_id', null).select('id').maybeSingle()
  if (linkErr || !linked) {
    await admin.from('content_drafts').delete().eq('id', draft.id as string)
    return null
  }
  return draft.id as string
}
