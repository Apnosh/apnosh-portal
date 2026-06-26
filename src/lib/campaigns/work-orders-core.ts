/**
 * Pure (no server-only) core of the work-order spine: the row-building logic
 * that turns a shipped campaign into one order per creative discipline. Split
 * out of work-orders.ts so the simulator and unit tests can exercise the real
 * mint logic without pulling in the admin DB client.
 */
import type { SavedCampaign } from './view'
import { creativeRolesForCampaign, vibeForCampaign, disciplineForType, type Disc } from './creators'
import { reconcileBeatsToLines, CONTENT_META } from './catalog'
import { deriveSchedule } from './schedule'

export type WorkOrderStatus = 'offered' | 'accepted' | 'in_progress' | 'delivered' | 'approved' | 'revision' | 'declined'

/**
 * The only legal status moves. Approved + declined are terminal. A delivery
 * requires a link (enforced separately). Keeps the order from being hijacked
 * (offered→approved) or a terminal order resurrected.
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  offered: ['accepted', 'declined'],
  accepted: ['in_progress', 'declined'],
  in_progress: ['delivered'],
  revision: ['delivered'],
  delivered: ['approved', 'revision'],
  approved: [],
  declined: [],
}

/** Thrown when a status write violates the machine; surfaced as 409 by the route. */
export class IllegalTransition extends Error {
  constructor(message: string) { super(message); this.name = 'IllegalTransition' }
}

/** Validate a status move + the deliver-needs-a-link + concept-approved rules.
 *  Pure → unit-testable. conceptStatus gates production: a creator cannot begin
 *  (->in_progress) until the owner has approved the idea ('approved'); 'pending'
 *  and 'changes' both hold. */
export function validateTransition(from: WorkOrderStatus, to: WorkOrderStatus, effectiveUrl?: string | null, conceptStatus?: string | null): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: `order is already ${from}` }
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) return { ok: false, reason: `cannot move an order from ${from} to ${to}` }
  if (to === 'delivered' && !effectiveUrl?.trim()) return { ok: false, reason: 'a delivery link is required to deliver' }
  if (to === 'in_progress' && conceptStatus && conceptStatus !== 'approved') return { ok: false, reason: 'the owner needs to approve the concept before you start' }
  return { ok: true }
}

/** Return the url only if it is a safe http/https link, else null. Blocks
 *  javascript:/data:/schemeless payloads from ever becoming a clickable href. */
export function safeHref(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

/** The insert shape for one creator_work_orders row. */
export interface WorkOrderRow {
  campaign_id: string
  client_id: string
  creator_id: string
  discipline: string
  slot: number          // 0-based piece index within its discipline
  title: string
  brief: string
  due_date: string | null
  status: WorkOrderStatus
  concept_status: 'approved' | 'pending'  // 'pending' when the owner wants to OK the idea first
  amount_cents: number  // the owner's price for this piece, locked at ship (feeds charge + payout)
}

/** Who makes a given piece: the owner's in-house team (→ content_drafts, worked
 *  in /work) or a marketplace creator (→ a creator_work_order + brief). */
export type Producer = 'team' | 'creator'

/** Default producer for a creative piece with an available creator and no explicit
 *  owner choice. TEAM by default: real creator supply is still a seeded test pool
 *  (no logins, no dispatch), so an untouched piece must stay with the in-house team
 *  that actually fulfills it. The owner opts a piece INTO a creator per-piece via
 *  producer_choices. Flip to 'creator' only once real creators + dispatch + the
 *  opt-back toggle exist, else real production strands behind a masked regression. */
export const DEFAULT_PRODUCER: Producer = 'team'

/** Stable per-piece key the owner's producer_choices map is addressed by. A
 *  piece is its discipline + its 0-based slot within that discipline (the 2nd
 *  video is 'Video:1'). */
export function pieceKey(discipline: string, slot: number): string {
  return `${discipline}:${slot}`
}

/**
 * One planned piece of a shipped campaign, resolved to its SINGLE producer. Both
 * ship lanes (team materialize + creator mint) read this, so a piece is made by
 * exactly one of them — never both (the double-production bug), never neither.
 */
export interface PlannedPiece {
  index: number               // order within the campaign calendar
  type: string                // beat type: reel | photo | post | story | email | sms
  label: string
  channel: string
  postISO: string | null      // the day it goes out, clamped to >= ship day
  discipline: Disc | null     // null for non-creative beats (email/sms)
  slot: number | null         // 0-based index within the discipline, null if none
  key: string                 // group:slot, stable per piece — "Video:0" | "email:1".
                              // For creative pieces (discipline set) this IS the
                              // producer_choices key; also the reconcile match key for both lanes.
  producer: Producer          // the ONE lane that makes it
  creatorId: string | null    // the assigned creator when producer === 'creator'
  priceCents: number          // the owner's price for this one piece (CONTENT_META)
}

/**
 * Resolve every beat of a campaign to exactly one producer. A creative beat with
 * an available creator follows the owner's per-piece choice (else the marketplace
 * default); a non-creative beat (email/sms), or one with no creator to assign, is
 * always the team's. This is the single source the ship's two lanes consume, so a
 * piece is materialized as a team draft OR minted as a creator order, never both.
 * Pure — same inputs, same plan.
 */
export function planCampaignPieces(campaign: SavedCampaign, shipISO: string): PlannedPiece[] {
  const items = (campaign.draft.items ?? []).filter((it) => it.included)
  const vibe = vibeForCampaign(campaign.draft.goalKey, campaign.draft.occasion)
  const roles = creativeRolesForCampaign(items, campaign.creatorChoices, vibe)
  const creatorByDiscipline = new Map(roles.map((r) => [r.discipline, r.creator]))

  // The same reconciled calendar both lanes date against, so an order's due date
  // agrees with the content_draft's publish date for the same beat.
  const beats = reconcileBeatsToLines(items, campaign.draft.brief?.contentBeats ?? [])
  const sched = deriveSchedule(
    { targetDate: campaign.draft.targetDate, occasion: campaign.draft.occasion, contentBeats: beats },
    shipISO,
  )
  const shipDay = (shipISO || '').slice(0, 10)
  const choices = campaign.producerChoices ?? {}
  const slotByGroup: Record<string, number> = {}
  // Price each piece from the owner's OWN line price (the same source the honest
  // bill sums), so the accrued charge can never diverge from the quoted plan; fall
  // back to the catalog default only if no line is found.
  const priceByType = new Map<string, number>()
  for (const it of items) {
    const m = /^content-(.+)$/.exec(it.serviceId)
    if (m && typeof it.price === 'number') priceByType.set(m[1], it.price)
  }

  return sched.beats.map((b, index) => {
    const discipline = disciplineForType(b.type)
    const creator = discipline ? creatorByDiscipline.get(discipline) : undefined
    // Every piece gets a stable key by its group (discipline for creative, beat type
    // for non-creative) + its slot within that group, so both lanes can match it on
    // a reconcile. For creative pieces key === pieceKey(discipline, slot).
    const group = discipline ?? b.type
    const slotInGroup = (slotByGroup[group] = (slotByGroup[group] ?? -1) + 1)
    const slot = discipline ? slotInGroup : null
    const key = `${group}:${slotInGroup}`
    // Clamp each piece's post date to the ship day so a backward-anchored (event)
    // or too-soon campaign never produces a piece dated before it was ordered.
    const postISO = b.postISO && shipDay && b.postISO < shipDay ? shipDay : (b.postISO ?? null)
    let producer: Producer = 'team'
    let creatorId: string | null = null
    if (discipline && creator) {
      const choice = choices[key]
      producer = choice === 'team' || choice === 'creator' ? choice : DEFAULT_PRODUCER
      creatorId = producer === 'creator' ? creator.id : null
    }
    const priceCents = Math.round((priceByType.get(b.type) ?? CONTENT_META[b.type]?.price ?? 0) * 100)
    return { index, type: b.type, label: b.label ?? '', channel: b.channel ?? '', postISO, discipline: discipline ?? null, slot, key, producer, creatorId, priceCents }
  })
}

/**
 * The work-order rows a ship should mint: ONE PER CREATOR-ASSIGNED PIECE, each
 * with its own due date + slot. Pieces the owner kept in-house (or with no
 * creator) are skipped here — they become content_drafts instead. Returns [] when
 * nothing is creator-run. Pure — the DB write + idempotency live in mintWorkOrders.
 */
export function buildWorkOrderRows(campaign: SavedCampaign, shipISO: string): WorkOrderRow[] {
  return planCampaignPieces(campaign, shipISO)
    .map((p) => workOrderRowForPiece(campaign, p))
    .filter((r): r is WorkOrderRow => r !== null)
}

/** The order row for ONE planned piece, or null if the piece isn't creator-run.
 *  Used by buildWorkOrderRows (initial ship) AND the post-ship reconcile (mint a
 *  newly-added piece), so both produce identical rows. */
export function workOrderRowForPiece(campaign: SavedCampaign, p: PlannedPiece): WorkOrderRow | null {
  if (p.producer !== 'creator' || !p.discipline || !p.creatorId || p.slot == null) return null
  const objective = campaign.draft.brief?.objective ?? ''
  const name = campaign.draft.name
  const conceptStatus: 'approved' | 'pending' = campaign.creativeControl === 'approve_concept' ? 'pending' : 'approved'
  return {
    campaign_id: campaign.draft.id,
    client_id: campaign.clientId,
    creator_id: p.creatorId,
    discipline: p.discipline,
    slot: p.slot,
    title: p.label.trim() ? p.label.trim() : `${p.discipline} for ${name}`,
    brief: `Make this ${p.discipline.toLowerCase()} piece for "${name}".${objective ? ` Goal: ${objective}.` : ''} You approve nothing yet — deliver, then the owner reviews.`,
    due_date: p.postISO,
    status: 'offered',
    concept_status: conceptStatus,
    amount_cents: p.priceCents,
  }
}

/** Which content_drafts service line a piece maps to (social by default; email for
 *  email/sms; local for a Google/GBP/Maps channel). Pure — shared by materialize +
 *  the reconcile so the two never disagree. */
export function serviceLineForPiece(type: string, channel?: string): string {
  const ch = (channel || '').toLowerCase()
  if (ch.includes('google') || ch.includes('gbp') || ch.includes('maps')) return 'local'
  const byType: Record<string, string> = { reel: 'social', photo: 'social', post: 'social', story: 'social', email: 'email', sms: 'email' }
  return byType[type] ?? 'social'
}

/** The content_drafts row for ONE team-run piece (status 'idea'), stamped with its
 *  campaign_piece_key so a later reconcile can match it back to the plan. */
export interface TeamDraftRow {
  client_id: string
  campaign_id: string
  idea: string
  status: 'idea'
  service_line: string
  proposed_via: 'strategist'
  target_publish_date: string | null
  campaign_piece_key: string
}
export function teamDraftRowForPiece(campaign: SavedCampaign, p: PlannedPiece): TeamDraftRow {
  return {
    client_id: campaign.clientId,
    campaign_id: campaign.draft.id,
    idea: (p.label || 'Campaign piece').slice(0, 280),
    status: 'idea',
    service_line: serviceLineForPiece(p.type, p.channel),
    proposed_via: 'strategist',
    target_publish_date: p.postISO,
    campaign_piece_key: p.key,
  }
}

/* ── Post-ship production reconcile (Phase 5b) ─────────────────────────────────
   When a SHIPPED campaign's plan changes, re-sync production to it WITHOUT
   disrupting work in flight. Pure: it computes the actions; the server applies. */

export interface ReconcileExistingOrder { id: string; key: string; status: string; dueISO: string | null }
export interface ReconcileExistingDraft { id: string; key: string; status: string; dateISO: string | null }
export interface ProductionReconcile {
  mintCreator: PlannedPiece[]                          // new creator pieces with no order
  materializeTeam: PlannedPiece[]                      // new team pieces with no draft
  voidOrderIds: string[]                               // creator orders removed from the plan (not started)
  archiveDraftIds: string[]                            // team drafts removed from the plan (not produced)
  redateOrders: { id: string; dueISO: string | null }[]
  redateDrafts: { id: string; dateISO: string | null }[]
}

// A creator order is only cancellable before the creator commits; once in_progress
// (or delivered/approved/revision) it is protected. Re-dating is locked once a piece
// is delivered/approved. A team draft is only mutable while it is still editorial
// (idea/draft/revising) — never once produced/approved/scheduled/published.
const ORDER_VOIDABLE = new Set(['offered', 'accepted'])
const ORDER_REDATE_LOCKED = new Set(['delivered', 'approved', 'declined'])
const DRAFT_MUTABLE = new Set(['idea', 'draft', 'revising'])

export function reconcileProductionPlan(
  plan: PlannedPiece[],
  existingOrders: ReconcileExistingOrder[],
  existingDrafts: ReconcileExistingDraft[],
): ProductionReconcile {
  const planCreator = plan.filter((p) => p.producer === 'creator' && p.creatorId)
  const planTeam = plan.filter((p) => p.producer === 'team')
  const planCreatorByKey = new Map(planCreator.map((p) => [p.key, p]))
  const planTeamByKey = new Map(planTeam.map((p) => [p.key, p]))
  const orderByKey = new Map(existingOrders.map((o) => [o.key, o]))
  const draftByKey = new Map(existingDrafts.map((d) => [d.key, d]))
  const r: ProductionReconcile = { mintCreator: [], materializeTeam: [], voidOrderIds: [], archiveDraftIds: [], redateOrders: [], redateDrafts: [] }

  for (const p of planCreator) if (!orderByKey.has(p.key)) r.mintCreator.push(p)
  for (const o of existingOrders) {
    const p = planCreatorByKey.get(o.key)
    if (!p) { if (ORDER_VOIDABLE.has(o.status)) r.voidOrderIds.push(o.id) }
    else if (!ORDER_REDATE_LOCKED.has(o.status) && (o.dueISO ?? null) !== (p.postISO ?? null)) r.redateOrders.push({ id: o.id, dueISO: p.postISO })
  }

  for (const p of planTeam) if (!draftByKey.has(p.key)) r.materializeTeam.push(p)
  for (const d of existingDrafts) {
    const p = planTeamByKey.get(d.key)
    if (!p) { if (DRAFT_MUTABLE.has(d.status)) r.archiveDraftIds.push(d.id) }
    else if (DRAFT_MUTABLE.has(d.status) && (d.dateISO ?? null) !== (p.postISO ?? null)) r.redateDrafts.push({ id: d.id, dateISO: p.postISO })
  }
  return r
}

/** The campaign_charges insert payload for an accepted creator piece. Pure so the
 *  pricing/shape is unit-testable; the DB insert + idempotency live in
 *  accrueChargeForApprovedOrder. */
export interface ChargeRow {
  client_id: string
  campaign_id: string | null
  work_order_id: string
  source: 'creator'
  amount_cents: number
  status: 'accrued'
}

/** Map an approved creator order to the owner charge it accrues. The amount is the
 *  price locked on the order at ship (never recomputed, so a later catalog price
 *  change can't move what the owner was quoted). */
export function buildChargeRow(o: { id: string; client_id: string; campaign_id: string | null; amount_cents: number }): ChargeRow {
  return {
    client_id: o.client_id,
    campaign_id: o.campaign_id ?? null,
    work_order_id: o.id,
    source: 'creator',
    amount_cents: Math.max(0, Math.round(o.amount_cents || 0)),
    status: 'accrued',
  }
}

/**
 * Pure gap-finder for the accrual reconcile sweep: given the approved creator orders
 * and the sets of order-ids that ALREADY have a charge / payout, return the order-ids
 * still missing each. An unpriced order (amount_cents <= 0) is skipped — there is
 * nothing to accrue. Lets the sweep recover any charge/payout a best-effort accrual
 * dropped, idempotently (the server then re-runs the idempotent accrue for each gap).
 */
export function findUnaccrued(
  approved: Array<{ id: string; amount_cents: number }>,
  chargedWoIds: Set<string>,
  paidWoIds: Set<string>,
): { needCharge: string[]; needPayout: string[] } {
  const needCharge: string[] = []
  const needPayout: string[] = []
  for (const o of approved) {
    if ((o.amount_cents ?? 0) <= 0) continue
    if (!chargedWoIds.has(o.id)) needCharge.push(o.id)
    if (!paidWoIds.has(o.id)) needPayout.push(o.id)
  }
  return { needCharge, needPayout }
}

/** Apnosh's default take-rate (%) for a marketplace creator, used when the creator
 *  has no real vendor record yet (the seeded pool). Real vendors override this from
 *  vendors.platform_fee_percent once supply is real (Phase 5). Matches migration 146. */
export const DEFAULT_PLATFORM_FEE = 20

/** Split a gross piece price into Apnosh's fee + the creator's net for a take-rate
 *  percent. Pure + clamped so a bad fee can never pay out more than gross or go
 *  negative. */
export function computePayout(grossCents: number, feePercent: number): { feeCents: number; netCents: number } {
  const gross = Math.max(0, Math.round(grossCents || 0))
  const pct = Math.min(100, Math.max(0, feePercent || 0))
  const feeCents = Math.round(gross * pct / 100)
  return { feeCents, netCents: Math.max(0, gross - feeCents) }
}

/** The creator_payouts insert payload for an accepted creator piece. */
export interface PayoutRow {
  client_id: string
  campaign_id: string | null
  work_order_id: string
  creator_id: string
  gross_cents: number
  fee_percent: number
  fee_cents: number
  net_cents: number
  status: 'accrued'
}

/** Map an approved creator order + a take-rate to the payout it accrues: gross is
 *  the order's locked amount (what the owner paid), net is what the creator earns
 *  after Apnosh's fee. Pure; the DB insert + idempotency live in
 *  accruePayoutForApprovedOrder. */
export function buildPayoutRow(o: { id: string; client_id: string; campaign_id: string | null; creator_id: string; amount_cents: number }, feePercent: number): PayoutRow {
  const gross = Math.max(0, Math.round(o.amount_cents || 0))
  const pct = Math.min(100, Math.max(0, feePercent || 0))
  const { feeCents, netCents } = computePayout(gross, pct)
  return {
    client_id: o.client_id,
    campaign_id: o.campaign_id ?? null,
    work_order_id: o.id,
    creator_id: o.creator_id,
    gross_cents: gross,
    fee_percent: pct,
    fee_cents: feeCents,
    net_cents: netCents,
    status: 'accrued',
  }
}

/** The fields the publish bridge reads off an approved creator order. */
export interface BridgeOrderRow {
  client_id: string
  campaign_id: string | null
  title?: string | null
  due_date?: string | null
  delivered_url?: string | null
  brief_details?: { creative?: { caption?: unknown; hashtags?: unknown } } | null
}

/** The content_drafts insert payload for a bridged piece. */
export interface BridgeDraftRow {
  client_id: string
  campaign_id: string | null
  idea: string
  caption: string | null
  hashtags: string[]
  media_urls: string[]                                          // always [] — a delivery LINK is not platform media
  media_brief: { from_creator: true; source_delivery_url?: string }
  status: 'draft'                                               // a team finalization to-do, NOT publish-ready
  service_line: 'social'
  proposed_via: 'strategist'
  target_publish_date: string | null
}

const BRIDGE_CAPTION_MAX = 2200   // Instagram's caption ceiling; the team edits before posting

/**
 * Map an approved creator order to the content_draft that carries it into the team
 * publish queue. A creator delivers a LINK, not platform-ready media, so the draft
 * lands as a 'draft' (an editorial to-do the team finalizes + schedules — NOT a
 * publish-ready post): the delivered link is safeHref'd into the media BRIEF (not
 * media_urls, which a publisher would try to post directly), the brief's
 * caption/hashtags carry over (length-capped), and the order's due date becomes the
 * target publish date. Pure so the mapping is unit-testable; the DB insert + link +
 * dedup live in bridgeApprovedOrderToDraft.
 */
export function buildBridgeDraftRow(o: BridgeOrderRow): BridgeDraftRow {
  const creative = o.brief_details?.creative ?? {}
  const caption = typeof creative.caption === 'string' ? creative.caption.slice(0, BRIDGE_CAPTION_MAX) : null
  const hashtags = Array.isArray(creative.hashtags) ? creative.hashtags.filter((h): h is string => typeof h === 'string').slice(0, 30) : []
  const link = safeHref(o.delivered_url)   // drop javascript:/data:/garbage links
  return {
    client_id: o.client_id,
    campaign_id: o.campaign_id ?? null,
    idea: ((o.title ?? '') || 'Creator piece').slice(0, 280),
    caption,
    hashtags,
    media_urls: [],
    media_brief: link ? { from_creator: true, source_delivery_url: link } : { from_creator: true },
    status: 'draft',
    service_line: 'social',
    proposed_via: 'strategist',
    target_publish_date: o.due_date ?? null,
  }
}
