import 'server-only'
/**
 * getCampaignPieces — the merged, deduped, per-piece production list that powers the transparency
 * tracker. Reads the SAME two tables computeProgress uses (content_drafts + creator_work_orders) plus
 * the outcomes reader for real numbers and creatorNamesByIds for names (pool ids + real-vendor UUIDs).
 * Dedup mirrors computeProgress exactly
 * (a bridged creator piece is represented by its draft, once), so pieces.length === progress.total +
 * progress.dropped (killed pieces stay visible as 'dropped' rows; owner plan-removals are hidden).
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorNamesByIds } from '@/lib/campaigns/vendor-supply'
import { getCampaignOutcomes } from '@/lib/campaigns/outcomes/read'
import { getRatingsForOrders, creatorRatingAggregates } from '@/lib/campaigns/work-ratings'
import { isRealCreatorId, RATABLE_STATUSES } from '@/lib/campaigns/work-ratings-core'
import { safeHref, PLAN_REMOVED_NOTE, STOP_NOTE } from '@/lib/campaigns/work-orders-core'
import { stageForOrder, stageForDraft, stageRank, type Stage } from './stages'
import type { TrackerPiece } from './types'
import type { PieceOutcome } from '@/lib/campaigns/outcomes/verdict'

const DEAD = new Set(['rejected', 'failed', 'archived'])

function pieceLabel(caption: unknown): string | null {
  const c = typeof caption === 'string' ? caption.trim() : ''
  if (!c) return null
  return c.length > 48 ? `${c.slice(0, 47)}…` : c
}
function disciplineFromKey(key: string | null): string {
  return key ? key.split(':')[0] : ''
}
function friendlyType(channel: string): string {
  return channel === 'Video' ? 'reel' : channel === 'Photo' ? 'photo' : channel === 'Social' ? 'post' : channel === 'Design' ? 'graphic' : 'piece'
}
// A readable fallback name for a piece with no caption yet: "Your reel" beats "A piece".
function fallbackLabel(channel: string): string {
  return channel ? `Your ${friendlyType(channel)}` : 'A piece'
}
function draftStamp(d: Record<string, unknown>, stage: Stage): { atISO: string | null; precise: boolean } {
  if (stage === 'posted' || stage === 'gathering') return { atISO: (d.published_at as string) ?? null, precise: true }
  if (stage === 'scheduled') return { atISO: (d.scheduled_for as string) ?? null, precise: true }
  if (stage === 'approved') return { atISO: (d.approved_at as string) ?? null, precise: true }
  return { atISO: (d.created_at as string) ?? null, precise: true }   // making: when it started
}

export async function getCampaignPieces(campaignId: string): Promise<TrackerPiece[]> {
  const admin = createAdminClient()
  const [draftsRes, ordersRes, outcomes] = await Promise.all([
    admin.from('content_drafts').select('*').eq('campaign_id', campaignId),
    admin.from('creator_work_orders').select('*').eq('campaign_id', campaignId),
    getCampaignOutcomes(campaignId).catch(() => null),
  ])
  const drafts = (draftsRes.data ?? []) as Record<string, unknown>[]
  const orders = (ordersRes.data ?? []) as Record<string, unknown>[]

  const aliveDrafts = drafts.filter((d) => !DEAD.has((d.status as string) ?? ''))
  const aliveIds = new Set(aliveDrafts.map((d) => d.id as string))

  const outByDraft = new Map<string, PieceOutcome>()
  const outByKey = new Map<string, PieceOutcome>()
  for (const p of outcomes?.pieces ?? []) { outByDraft.set(p.draftId, p); if (p.pieceKey) outByKey.set(p.pieceKey, p) }
  const orderByDraftId = new Map<string, Record<string, unknown>>()
  for (const o of orders) { const cd = o.content_draft_id as string | null; if (cd) orderByDraftId.set(cd, o) }
  // Pool ids and real-vendor UUIDs resolve to names in one batch — the "who"
  // column must never show a raw UUID.
  const names = await creatorNamesByIds(orders.map((o) => (o.creator_id as string) ?? ''))

  // Ratings layer, real rows only: which orders the owner already rated, and each
  // REAL creator's live aggregate. A real creator = vendor UUID that resolved to a
  // vendors row (`names` has it); pool ids (the internal team) never rate-gate.
  const orderIds = orders.map((o) => o.id as string)
  const vendorIds = [...new Set(orders.map((o) => (o.creator_id as string) ?? '').filter((id) => isRealCreatorId(id) && names.has(id)))]
  const [ratings, aggregates] = await Promise.all([
    getRatingsForOrders(orderIds),
    creatorRatingAggregates(vendorIds),
  ])
  const isRealVendor = (id: string) => isRealCreatorId(id) && names.has(id)
  const ratingBits = (order: Record<string, unknown> | undefined) => {
    if (!order) return { ratable: false, myStars: null, creatorRating: null }
    const oid = order.id as string
    const cid = (order.creator_id as string) ?? ''
    const mine = ratings.get(oid) ?? null
    return {
      ratable: isRealVendor(cid) && RATABLE_STATUSES.has((order.status as string) ?? '') && !mine,
      myStars: mine ? mine.stars : null,
      creatorRating: isRealVendor(cid) ? aggregates.get(cid) ?? null : null,
    }
  }

  const pieces: TrackerPiece[] = []

  // Team lane: one row per alive draft. A bridged draft is enriched with its creator (the creator made
  // it, the draft published it) so it appears once, not twice. A KILLED draft still shows — as a
  // 'dropped' row — unless a backing order re-represents the piece in the creator lane below: the
  // owner paid for the piece, so it never silently vanishes from their list.
  for (const d of drafts) {
    const did = d.id as string
    const order = orderByDraftId.get(did)
    const status = (d.status as string) ?? ''
    if (DEAD.has(status) && order) continue   // the order row below represents the piece
    // 'approved'/'scheduled' with the sign-off gate still open is the OWNER'S turn
    // (ready_for_you): every publish path holds an unsigned draft ('awaiting_signoff').
    let stage = stageForDraft(status, (status === 'approved' || status === 'scheduled') && !d.client_signed_off_at)
    const key = (d.campaign_piece_key as string) ?? null
    const out = (key ? outByKey.get(key) : undefined) ?? outByDraft.get(did) ?? null
    if (stage === 'posted' && (!out || out.state !== 'live')) stage = 'gathering'   // posted but numbers not synced
    const { atISO, precise } = draftStamp(d, stage)
    const creatorName = order ? names.get((order.creator_id as string) ?? '') : undefined
    pieces.push({
      id: did,
      orderId: order ? (order.id as string) : null,
      label: pieceLabel(d.caption) ?? (order ? (order.title as string) : null) ?? fallbackLabel((order?.discipline as string) || disciplineFromKey(key)),
      channel: (order?.discipline as string) || disciplineFromKey(key),
      who: creatorName ?? (order ? (order.creator_id as string) : 'Your team'),
      lane: order ? 'creator' : 'team',
      stage,
      stageAtISO: atISO,
      stageAtPrecise: precise,
      goLiveISO: (d.scheduled_for as string) ?? (d.target_publish_date as string) ?? null,
      conceptStatus: null,
      previewUrl: order ? safeHref(order.delivered_url as string) : null,
      // Real live-post link: the outcome's permalink once metrics attach, else the
      // publish receipt on the draft itself — the owner gets "see it live" either way.
      postLink: out?.link ?? safeHref(d.published_url as string) ?? null,
      canApprove: false,                 // draft-backed piece is past the order-approve gate
      canReviewConcept: false,
      reach: out?.reach ?? null,
      readoutValue: out?.state === 'live' ? (out.readout.value ?? null) : null,
      readoutVerdict: out?.readout.verdict ?? null,
      note: null,
      ...ratingBits(order),
    })
  }

  // Creator lane: one row per order NOT bridged to an alive draft (still in production, or its draft
  // was killed so we keep the piece rather than drop it). A creator's own decline stays VISIBLE as a
  // dropped row (the piece still needs a maker); an owner plan-removal (PLAN_REMOVED_NOTE) is hidden —
  // the owner took it out themselves.
  for (const o of orders) {
    const status = (o.status as string) ?? ''
    // Owner-initiated voids (plan removal or a campaign stop) are hidden — the owner
    // took the piece out themselves; only a creator's own decline stays visible.
    const note = o.note as string | null
    if (status === 'declined' && (note === PLAN_REMOVED_NOTE || note === STOP_NOTE)) continue
    const cd = o.content_draft_id as string | null
    if (cd && aliveIds.has(cd)) continue
    const stage = stageForOrder(status)
    const key = (o.campaign_piece_key as string) ?? null
    const out = key ? outByKey.get(key) ?? null : null
    const concept = ((o.concept_status as 'approved' | 'pending' | 'changes') ?? 'approved')
    pieces.push({
      id: o.id as string,
      orderId: o.id as string,
      label: (o.title as string) || fallbackLabel((o.discipline as string) || disciplineFromKey(key)),
      channel: (o.discipline as string) || disciplineFromKey(key),
      who: names.get((o.creator_id as string) ?? '') ?? (o.creator_id as string),
      lane: 'creator',
      stage,
      stageAtISO: status === 'offered' ? ((o.created_at as string) ?? null) : ((o.updated_at as string) ?? (o.created_at as string) ?? null),
      stageAtPrecise: status === 'offered',   // created_at precise; later stages come from updated_at
      goLiveISO: (o.due_date as string) ?? null,
      conceptStatus: concept,
      previewUrl: safeHref(o.delivered_url as string),
      postLink: out?.link ?? null,
      canApprove: stage === 'ready_for_you',
      // Concept review only matters while the order is waiting on it (the accepted→in_progress
      // gate); a declined/finished order must never offer a concept verdict.
      canReviewConcept: (status === 'offered' || status === 'accepted') && (concept === 'pending' || concept === 'changes'),
      reach: out?.reach ?? null,
      readoutValue: null,
      readoutVerdict: null,
      note: (o.note as string) ?? null,
      ...ratingBits(o),
    })
  }

  // Freshest live work floats; unstarted sinks; stopped last.
  pieces.sort((a, b) => stageRank(a.stage) - stageRank(b.stage) || (b.stageAtISO ?? '').localeCompare(a.stageAtISO ?? ''))
  return pieces
}
