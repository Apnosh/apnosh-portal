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
import { buildWorkOrderRows, buildBridgeDraftRow, buildChargeRow, buildPayoutRow, findUnaccrued, planCampaignPieces, workOrderRowForPiece, teamDraftRowForPiece, reconcileProductionPlan, validateTransition, IllegalTransition, type WorkOrderStatus, type WorkOrderRow } from './work-orders-core'
import { feePercentForCreator } from './vendor-supply'
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
    await bridgeApprovedOrderToDraft(id).catch((e) => { console.error('bridge threw', id, e); return null })
    await accrueChargeForApprovedOrder(id).catch((e) => { console.error('accrueCharge threw', id, e); return null })
    await accruePayoutForApprovedOrder(id).catch((e) => { console.error('accruePayout threw', id, e); return null })
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
  }, feePercent)
  // A payout with no creator is unclaimable AND would consume the one-per-piece
  // slot — flag it instead of stranding it.
  if (!row.creator_id.trim()) {
    await notifyStaffForClient(row.client_id, ['strategist'], {
      kind: 'client_signoff',
      title: 'Approved piece has no creator to pay',
      body: 'A creator piece was approved with no assigned creator. Assign one and accrue the payout manually.',
      link: `/work/campaigns?focus=${row.campaign_id ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return false
  }
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
    if (insErr.code === '42P01') return false                         // table absent (pre-181) → silent no-op
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

  const [{ data: orders, error: oErr }, { data: drafts }, { data: keyless }] = await Promise.all([
    admin.from('creator_work_orders').select('id, discipline, slot, status, due_date').eq('campaign_id', campaignId),
    admin.from('content_drafts').select('id, campaign_piece_key, status, target_publish_date').eq('campaign_id', campaignId).not('campaign_piece_key', 'is', null),
    // Pre-182 team drafts (keyless, NOT bridge) — if any exist we cannot match the team
    // lane, so we skip it (a mint-only pass would duplicate). Bridge drafts (from_creator)
    // are keyless too but are creator-lane artifacts, excluded here.
    admin.from('content_drafts').select('id').eq('campaign_id', campaignId).is('campaign_piece_key', null).or('media_brief->>from_creator.is.null,media_brief->>from_creator.neq.true').limit(1),
  ])
  if (oErr) return ZERO   // pre-migration / read failure → no-op
  const teamSafe = !(keyless && keyless.length)
  const existingOrders = (orders ?? []).map((o) => ({ id: o.id as string, key: `${o.discipline as string}:${o.slot as number}`, status: (o.status as string) ?? '', dueISO: (o.due_date as string | null) ?? null }))
  const existingDrafts = (drafts ?? []).map((d) => ({ id: d.id as string, key: (d.campaign_piece_key as string) ?? '', status: (d.status as string) ?? '', dateISO: (d.target_publish_date as string | null) ?? null }))
  const rec = reconcileProductionPlan(plan, existingOrders, existingDrafts, todayISO)

  let minted = 0, revived = 0, materialized = 0, voided = 0, archived = 0, redated = 0, failures = 0
  const ts = () => new Date().toISOString()

  // Creator lane.
  const orderRows = rec.mintCreator.map((p) => workOrderRowForPiece(campaign, p)).filter((r): r is WorkOrderRow => r !== null)
  if (orderRows.length) {
    const { error } = await admin.from('creator_work_orders').upsert(orderRows, { onConflict: 'campaign_id,discipline,slot', ignoreDuplicates: true })
    if (error) failures++; else minted = orderRows.length
  }
  for (const u of rec.reviveOrderIds) {
    const { error } = await admin.from('creator_work_orders').update({ status: 'offered', due_date: u.dueISO, note: null, updated_at: ts() }).eq('id', u.id).eq('status', 'declined')
    if (error) failures++; else revived++
  }
  if (rec.voidOrderIds.length) {
    const { data, error } = await admin.from('creator_work_orders').update({ status: 'declined', note: 'Removed from the plan', updated_at: ts() }).in('id', rec.voidOrderIds).in('status', ['offered', 'accepted']).select('id')
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
      link: `/work/campaigns?focus=${campaignId}`,
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
export async function reconcileAccruals(opts?: { campaignId?: string }): Promise<{ ordersChecked: number; chargesRecovered: number; payoutsRecovered: number }> {
  const admin = createAdminClient()
  const ZERO = { ordersChecked: 0, chargesRecovered: 0, payoutsRecovered: 0 }
  let oq = admin.from('creator_work_orders').select('id, amount_cents').eq('status', 'approved')
  if (opts?.campaignId) oq = oq.eq('campaign_id', opts.campaignId)
  const { data: orders, error } = await oq          // pre-180: amount_cents absent → error → no-op
  if (error || !orders || !orders.length) return ZERO
  const approved = orders.map((o) => ({ id: o.id as string, amount_cents: (o.amount_cents as number) ?? 0 }))
  const ids = approved.map((o) => o.id)
  const [{ data: ch }, { data: po }] = await Promise.all([
    admin.from('campaign_charges').select('work_order_id').in('work_order_id', ids),
    admin.from('creator_payouts').select('work_order_id').in('work_order_id', ids),
  ])
  const charged = new Set((ch ?? []).map((r) => r.work_order_id as string))
  const paid = new Set((po ?? []).map((r) => r.work_order_id as string))
  const { needCharge, needPayout } = findUnaccrued(approved, charged, paid)
  let chargesRecovered = 0, payoutsRecovered = 0
  for (const id of needCharge) if (await accrueChargeForApprovedOrder(id).catch(() => false)) chargesRecovered++
  for (const id of needPayout) if (await accruePayoutForApprovedOrder(id).catch(() => false)) payoutsRecovered++
  return { ordersChecked: approved.length, chargesRecovered, payoutsRecovered }
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
