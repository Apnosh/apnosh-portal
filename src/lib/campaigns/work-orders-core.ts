/**
 * Pure (no server-only) core of the work-order spine: the row-building logic
 * that turns a shipped campaign into one order per creative discipline. Split
 * out of work-orders.ts so the simulator and unit tests can exercise the real
 * mint logic without pulling in the admin DB client.
 */
import type { SavedCampaign } from './view'
import type { PieceBrief } from './types'
import { creativeRolesForCampaign, vibeForCampaign, disciplineForType, type Disc } from './creators'
import { isNoOfferSentinel } from './campaign-composer'
import { reconcileBeatsToLines, beatsFromLines, isOnSitePiece, SOLO_VISIT_SURCHARGE_CENTS, AI_DRAFT_CENTS, CONTENT_META } from './catalog'
import { deriveSchedule } from './schedule'

export type WorkOrderStatus = 'offered' | 'accepted' | 'in_progress' | 'delivered' | 'approved' | 'revision' | 'declined'

/** The note the reconcile stamps on an order it voids when the OWNER removes the piece
 *  from the plan. 'declined' is one DB status for two different events — this exact string
 *  is how every reader (revive, tracker pieces/activity, progress) tells an owner removal
 *  (hide it, safe to revive) from a creator's own decline (keep it visible, needs a human). */
export const PLAN_REMOVED_NOTE = 'Removed from the plan'
/** The owner stopped the whole campaign. DISTINCT from PLAN_REMOVED_NOTE on purpose:
 *  the reconcile's revive path only re-offers PLAN_REMOVED_NOTE voids, so a stop is
 *  terminal — pieces can never quietly come back to life on a later edit. */
export const STOP_NOTE = 'Campaign stopped'

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

/** The owner's per-piece answers, folded into a maker-facing instruction list. Shared by
 *  both lanes so a team draft and a creator order carry the SAME brief (subject + cta
 *  included — sends are always team, so dropping those silently loses the whole point). */
export function briefInstructions(b?: PieceBrief | null): string[] {
  if (!b) return []
  return [
    b.featuring && `Feature: ${b.featuring}.`,
    b.offer && `Offer / hook: ${b.offer}.`,
    b.subject && `Subject line: ${b.subject}.`,
    b.cta && `Call to action: ${b.cta}.`,
    b.mustSay && `Must include: ${b.mustSay}.`,
    b.avoid && `Avoid: ${b.avoid}.`,
    b.notes && `Notes: ${b.notes}.`,
  ].filter((x): x is string => !!x)
}

/** The owner's CAMPAIGN-level madlib answers (draft.brief.spec), folded into the same maker-facing
 *  instruction list. Builder pieces ship with piece.brief = null, so without this every dish, offer
 *  rule, promo code, event detail, and timing the owner typed died in the spec jsonb while the team
 *  built blind. Used ONLY when a piece has no per-piece brief; pricing is untouched (piece.brief
 *  stays null). Keys mirror the madlib slots across all goals. */
export function specInstructions(spec?: Record<string, string> | null): string[] {
  if (!spec) return []
  const v = (k: string) => { const x = spec[k]; return typeof x === 'string' && x.trim() ? x.trim() : null }
  const out: string[] = []
  const feature = v('feature') ?? v('subject')
  if (feature) out.push(`Feature: ${feature}.`)
  const offer = v('offer')
  if (offer && !isNoOfferSentinel(offer)) out.push(`Offer / hook: ${offer}.`)
  const event = v('event'); if (event) out.push(`Event: ${event}.`)
  const price = v('price'); if (price) out.push(`Ticket price: ${price}.`)
  const time = v('time'); if (time) out.push(`Timing: ${time}.`)
  const days = v('days'); if (days) out.push(`Target days: ${days}.`)
  const limits = v('limits'); if (limits) out.push(`Rules / limits: ${limits}.`)
  const code = v('code'); if (code) out.push(`Promo code: ${code}.`)
  const redeem = v('redeem'); if (redeem) out.push(`How guests redeem: ${redeem}.`)
  const details = v('details'); if (details) out.push(`Details: ${details}.`)
  const amounts = v('amounts'); if (amounts) out.push(`Amounts: ${amounts}.`)
  const min = v('min'); if (min) out.push(`Minimum: ${min}.`)
  const message = v('message'); if (message) out.push(`Message: ${message}.`)
  const which = v('which'); if (which) out.push(`Scope: ${which}.`)
  const cadence = v('cadence'); if (cadence) out.push(`Cadence: ${cadence}.`)
  const where = v('where'); if (where) out.push(`Format / where it goes: ${where}.`)
  const purpose = v('purpose'); if (purpose) out.push(`Purpose: ${purpose}.`)
  const audience = v('audienceChoice'); if (audience) out.push(`Audience, in the owner's words: ${audience}.`)
  const notes = v('notes'); if (notes) out.push(`Notes: ${notes}.`)
  return out
}

/** The Walk's per-piece owner answers. The plan flow writes these straight onto each
 *  content beat it persists (campaign_briefs.content_beats) WITHOUT widening the
 *  ContentBeat type, so they come back as loose extras on the beat; only non-empty
 *  strings are kept. Field names mirror the Walk's beat editor exactly. */
export interface WalkAnswers {
  note?: string          // free-text must-haves / vibe
  footage?: string       // 'photo' | 'clip' | 'film'
  subjectKind?: string   // 'dish' | 'deal' | 'news'
  newsLine?: string      // the news itself, when subjectKind is 'news'
  messagePoint?: string  // what an email/sms is about
  buttonTarget?: string  // 'menu' | 'book' | 'order' | 'deal'
}

const WALK_ANSWER_KEYS = ['note', 'footage', 'subjectKind', 'newsLine', 'messagePoint', 'buttonTarget'] as const

/** Pull the Walk answers off a persisted beat, or null when it carries none. */
export function walkAnswersFromBeat(beat: object): WalkAnswers | null {
  const src = beat as Record<string, unknown>
  let found: WalkAnswers | null = null
  for (const k of WALK_ANSWER_KEYS) {
    const v = src[k]
    if (typeof v === 'string' && v.trim()) (found ??= {})[k] = v.trim()
  }
  return found
}

/** Fold the Walk answers into the same maker-facing instruction list. Choice keys are
 *  translated to plain words so the maker reads a sentence, not an enum value. */
export function walkAnswerInstructions(a?: WalkAnswers | null): string[] {
  if (!a) return []
  const subject: Record<string, string> = { dish: 'a dish', deal: 'a deal', news: 'news' }
  const footage: Record<string, string> = { photo: "use the owner's menu photo", clip: 'the owner sends a clip', film: 'we film it on site' }
  const button: Record<string, string> = { menu: 'See menu', book: 'Book a table', order: 'Order now', deal: 'Get the deal' }
  return [
    a.subjectKind && `Post subject: ${subject[a.subjectKind] ?? a.subjectKind}.`,
    a.newsLine && `News to share: ${a.newsLine}.`,
    a.messagePoint && `Message point: ${a.messagePoint}.`,
    a.footage && `Footage: ${footage[a.footage] ?? a.footage}.`,
    a.buttonTarget && `Button goes to: ${button[a.buttonTarget] ?? a.buttonTarget}.`,
    a.note && `Owner note: ${a.note}.`,
  ].filter((x): x is string => !!x)
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
  amount_cents: number  // the owner's price for this piece, locked at ship (feeds the owner charge)
  campaign_piece_key: string  // the plan's stable key for this piece — the reconcile match key (migration 183)
  surcharge_cents: number  // the solo-visit surcharge inside amount_cents — netted OUT of the creator payout (migration 184)
}

/** Who makes a given piece. The two PRODUCED lanes are 'team' (→ content_drafts,
 *  worked in /work) and 'creator' (→ a creator_work_order + brief). 'diy' (the owner
 *  makes it — $0, nothing minted) and 'ai' (an AI draft, v2) are self-serve lanes the
 *  Content Menu adds; both are skipped by the team + creator mint filters. */
export type Producer = 'team' | 'creator' | 'diy' | 'ai'

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
  key: string                 // stable per piece. Menu pieces use the line id; legacy
                              // pieces use group:slot ("Video:0" | "email:1"). For a
                              // creative piece this is also the producer_choices key,
                              // and it is the reconcile + content_drafts match key.
  producer: Producer          // the ONE lane that makes it
  creatorId: string | null    // the assigned creator when producer === 'creator'
  priceCents: number          // the owner's price for this piece, INCLUDING any folded solo-visit surcharge ($0 when 'diy')
  brief: PieceBrief | null    // the add-piece brief (Content Menu), null for legacy pieces
  ownerAnswers?: WalkAnswers | null  // the Walk's per-piece answers on the beat; null/absent when it has none
  shootDayId: string | null   // the visit this on-site piece shares (Content Menu); null for remote/legacy pieces
  soloSurchargeCents: number  // the solo-visit surcharge folded into priceCents (0 unless this is a lone on-site piece)
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

  // The same calendar both lanes date against, so an order's due date agrees with the
  // content_draft's publish date for the same beat. A legacy AI/strategist campaign
  // carries an authored brief (reconcile its beats to the edited lines); a Content-Menu
  // campaign has none, so the calendar is derived straight from the pieces it ordered.
  const briefBeats = campaign.draft.brief?.contentBeats ?? []
  // A Content-Menu campaign has no authored brief — its pieces were added together so the
  // single-Shoot-Day batching model holds. A builder/AI campaign's beats are spread across
  // weeks (a week-1 reel and a week-6 reel are DIFFERENT shoots), so it keeps its prior
  // pricing: no batching, no surcharge. isMenu gates both the beats source AND the batching.
  const isMenu = briefBeats.length === 0
  const beats = isMenu ? beatsFromLines(items) : reconcileBeatsToLines(items, briefBeats)
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
  // Every on-site piece of a campaign shares ONE visit (the owner's "batch into one
  // shoot" model). isMenu is kept only to pick the beats SOURCE above (menu derives from
  // lines; a brief campaign reconciles its authored beats); both batch the same here.
  const ONE_SHOOT = 'sd1'

  // ── Pass 1: resolve each piece's producer + on-site flag + base price ──
  const draft = sched.beats.map((b, index) => {
    const discipline = disciplineForType(b.type)
    const creator = discipline ? creatorByDiscipline.get(discipline) : undefined
    // Slot = the 0-based index within the discipline (the 2nd video is slot 1); it
    // keys the order's onConflict + the legacy positional key. The MATCH key is the
    // beat's own stable id when it has one (Content Menu, == the line id) so a
    // re-order can't shift it, else the legacy group:slot.
    const group = discipline ?? b.type
    const slotInGroup = (slotByGroup[group] = (slotByGroup[group] ?? -1) + 1)
    const slot = discipline ? slotInGroup : null
    const key = b.id ?? `${group}:${slotInGroup}`
    // Clamp each piece's post date to the ship day so a backward-anchored (event)
    // or too-soon campaign never produces a piece dated before it was ordered.
    const postISO = b.postISO && shipDay && b.postISO < shipDay ? shipDay : (b.postISO ?? null)
    // The owner's per-piece choice: the beat's own producer (Content Menu) wins, else the
    // positional producer_choices map (the previous builder's service picker writes that).
    // Now a full four-value choice — team | creator | diy | ai.
    const want = b.producer ?? choices[key]
    let producer: Producer = 'team'
    let creatorId: string | null = null
    if (want === 'diy' || want === 'ai') {
      producer = want                                   // owner / AI lane — neither team nor creator mints it
    } else if (discipline && creator) {
      producer = want === 'team' || want === 'creator' ? want : DEFAULT_PRODUCER
      creatorId = producer === 'creator' ? creator.id : null
    } else if (want === 'team') {
      producer = 'team'
    }
    // On-site = a reel/photo (or a story filmed on location) someone must come shoot. DIY
    // (the owner shoots it) and AI (no shoot at all) never need an Apnosh visit.
    const onSite = isMenu && isOnSitePiece(b.type, b.brief) && producer !== 'diy' && producer !== 'ai'
    const shootDayId = onSite ? (b.brief?.shootDayId ?? ONE_SHOOT) : null
    const baseCents = Math.round((priceByType.get(b.type) ?? CONTENT_META[b.type]?.price ?? 0) * 100)
    return { index, type: b.type, label: b.label ?? '', channel: b.channel ?? '', postISO, discipline: discipline ?? null, slot, key, producer, creatorId, baseCents, brief: b.brief ?? null, ownerAnswers: walkAnswersFromBeat(b), shootDayId }
  })

  // ── Pass 2: a shoot day holding exactly ONE on-site piece carries the solo-visit
  // surcharge (no second piece to split the trip), folded into that one piece's price.
  // An AI piece bills the flat AI-draft fee; a DIY piece is free; everyone else pays the
  // line price plus any surcharge. ──
  const onSiteByDay = new Map<string, number>()
  for (const p of draft) if (p.shootDayId) onSiteByDay.set(p.shootDayId, (onSiteByDay.get(p.shootDayId) ?? 0) + 1)
  return draft.map((p) => {
    const soloSurchargeCents = p.shootDayId && onSiteByDay.get(p.shootDayId) === 1 ? SOLO_VISIT_SURCHARGE_CENTS : 0
    const priceCents = p.producer === 'diy' ? 0 : p.producer === 'ai' ? AI_DRAFT_CENTS : p.baseCents + soloSurchargeCents
    return { index: p.index, type: p.type, label: p.label, channel: p.channel, postISO: p.postISO, discipline: p.discipline, slot: p.slot, key: p.key, producer: p.producer, creatorId: p.creatorId, priceCents, brief: p.brief, ownerAnswers: p.ownerAnswers, shootDayId: p.shootDayId, soloSurchargeCents }
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

/** Every instruction line a maker should see for ONE piece: the per-piece add-time
 *  brief first (Content Menu), then the owner's Walk answers on the beat, then the
 *  campaign-level madlib answers (spec). A piece WITH a brief used to drop the spec
 *  entirely, so the offer rules, promo code, timing and audience the owner typed never
 *  reached the maker. Exact-duplicate lines are skipped (brief + spec both emit e.g.
 *  a "Feature:" line). Shared by both row builders so the two lanes carry the SAME
 *  merged brief. */
export function pieceInstructions(campaign: SavedCampaign, p: PlannedPiece): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of [...briefInstructions(p.brief), ...walkAnswerInstructions(p.ownerAnswers), ...specInstructions(campaign.draft.brief?.spec)]) {
    if (!seen.has(line)) { seen.add(line); out.push(line) }
  }
  return out
}

/** The order row for ONE planned piece, or null if the piece isn't creator-run.
 *  Used by buildWorkOrderRows (initial ship) AND the post-ship reconcile (mint a
 *  newly-added piece), so both produce identical rows. */
export function workOrderRowForPiece(campaign: SavedCampaign, p: PlannedPiece): WorkOrderRow | null {
  if (p.producer !== 'creator' || !p.discipline || !p.creatorId || p.slot == null) return null
  const objective = campaign.draft.brief?.objective ?? ''
  const name = campaign.draft.name
  const conceptStatus: 'approved' | 'pending' = campaign.creativeControl === 'approve_concept' ? 'pending' : 'approved'
  // Fold the owner's per-piece add-time answers (Content Menu) into the brief the
  // creator executes, so a marketplace piece carries the same instructions a team
  // piece would. Legacy pieces (no brief) keep the original generic brief.
  const f = p.brief ?? undefined
  const title = f?.featuring ? `${p.discipline} · ${f.featuring}` : (p.label.trim() ? p.label.trim() : `${p.discipline} for ${name}`)
  const brief = [
    `Make this ${p.discipline.toLowerCase()} piece for "${name}".`,
    // per-piece answers (add-time brief + Walk) merged with the campaign-level madlib answers
    ...pieceInstructions(campaign, p),
    objective && `Goal: ${objective}.`,
    `You approve nothing yet — deliver, then the owner reviews.`,
  ].filter(Boolean).join(' ')
  return {
    campaign_id: campaign.draft.id,
    client_id: campaign.clientId,
    creator_id: p.creatorId,
    discipline: p.discipline,
    slot: p.slot,
    title,
    brief,
    due_date: p.postISO,
    status: 'offered',
    concept_status: conceptStatus,
    amount_cents: p.priceCents,
    campaign_piece_key: p.key,
    surcharge_cents: p.soloSurchargeCents,
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

/** The platforms a piece publishes to, in the publish lib's vocabulary (instagram |
 *  facebook | tiktok | linkedin | gbp — what publishToAllPlatforms and
 *  getPublishConnectionsForClient speak). Derived from the beat's channel string
 *  ('Instagram', 'Instagram · TikTok', 'Google', ...). attemptPublish hard-fails a
 *  draft with EMPTY platforms ('no_platforms'), so a social piece always carries at
 *  least one — instagram, the calendar's default channel. Pure — shared by both
 *  draft builders so the two lanes stamp the same vocabulary. */
export function targetPlatformsForPiece(type: string, channel?: string | null): string[] {
  // Email/SMS sends go out on the email/SMS rail, not attemptPublish — their
  // platforms stay empty on purpose.
  if (type === 'email' || type === 'sms') return []
  const ch = (channel || '').toLowerCase()
  const out: string[] = []
  if (ch.includes('instagram')) out.push('instagram')
  if (ch.includes('facebook')) out.push('facebook')
  // TikTok is deliberately NOT stamped: its publish adapter is an always-fail stub
  // (src/lib/publish/tiktok.ts), so targeting it guarantees a partial/hard failure.
  // Re-add here when the adapter is real.
  if (ch.includes('linkedin')) out.push('linkedin')
  if (ch.includes('google') || ch.includes('gbp') || ch.includes('maps')) out.push('gbp')
  return out.length > 0 ? out : ['instagram']
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
  /** Publish-lib platform names from the beat's channel; [] for email/sms (the
   *  send rail delivers those, not attemptPublish). Without this the draft can
   *  NEVER publish — attemptPublish hard-fails on empty platforms. */
  target_platforms: string[]
  /** The owner's per-piece brief, so the team isn't building blind. Stored in the
   *  existing media_brief jsonb; the column is NOT NULL, so a piece with nothing to
   *  say still carries the object with empty instructions (never null). `producer`
   *  records which lane the owner bought ('ai' pieces get a real generated first
   *  draft from the generate-ai-drafts cron; 'team' pieces are staff-authored) —
   *  a JSON key, not a column, so pre-182 fallbacks and the lifecycle edit's
   *  merge-never-replace behavior are unaffected. */
  media_brief: { from_menu: true; instructions: string[]; producer: 'team' | 'ai' }
  /** In 'handoff' mode the owner's standing consent carries to team/AI pieces —
   *  pre-stamped at mint (the buildBridgeDraftRow precedent) so the publish gate,
   *  computeProgress.awaitingYou, and every inbox/approvals surface agree the
   *  owner is NOT a required tap. NULL (a human stamp comes later) in the other
   *  modes. client_signed_off_by stays unset: NULL marks a system stamp. */
  client_signed_off_at: string | null
}
export function teamDraftRowForPiece(campaign: SavedCampaign, p: PlannedPiece): TeamDraftRow {
  // per-piece answers (add-time brief + Walk) merged with the campaign-level madlib answers
  const instructions = pieceInstructions(campaign, p)
  // Lead the idea with the offer when there is one, so the queue row reads usefully.
  const idea = [p.label || 'Campaign piece', p.brief?.offer ? `— ${p.brief.offer}` : ''].filter(Boolean).join(' ').slice(0, 280)
  return {
    client_id: campaign.clientId,
    campaign_id: campaign.draft.id,
    idea,
    status: 'idea',
    service_line: serviceLineForPiece(p.type, p.channel),
    proposed_via: 'strategist',
    target_publish_date: p.postISO,
    campaign_piece_key: p.key,
    target_platforms: targetPlatformsForPiece(p.type, p.channel),
    media_brief: { from_menu: true, instructions, producer: p.producer === 'ai' ? 'ai' : 'team' },
    client_signed_off_at: campaign.creativeControl === 'handoff' ? new Date().toISOString() : null,
  }
}

/* ── Post-ship production reconcile (Phase 5b) ─────────────────────────────────
   When a SHIPPED campaign's plan changes, re-sync production to it WITHOUT
   disrupting work in flight. Pure: it computes the actions; the server applies. */

export interface ReconcileExistingOrder { id: string; key: string; status: string; dueISO: string | null }
export interface ReconcileExistingDraft { id: string; key: string; status: string; dateISO: string | null }
export interface ProductionReconcile {
  mintCreator: PlannedPiece[]                          // new creator pieces with no order at all
  reviveOrderIds: { id: string; dueISO: string | null }[]  // a re-added piece whose slot holds a cancelled order
  materializeTeam: PlannedPiece[]                      // new team pieces with no draft
  voidOrderIds: string[]                               // creator orders removed from the plan (not started)
  archiveDraftIds: string[]                            // team drafts removed from the plan (not produced)
  redateOrders: { id: string; dueISO: string | null }[]
  redateDrafts: { id: string; dateISO: string | null }[]
  conflicts: { orderIds: string[]; draftIds: string[] }  // removed from the plan but PROTECTED (in flight) — a human must resolve
}

// A creator order is only cancellable before the creator commits (offered/accepted);
// once in_progress/revision/delivered/approved it is protected — and those are ALSO
// locked from re-dating (a creator is working to the date, or it is done). A team
// draft is only mutable while still editorial (idea/draft/revising). Dead states are
// terminal and ignored.
const ORDER_VOIDABLE = new Set(['offered', 'accepted'])
const ORDER_REDATE_LOCKED = new Set(['in_progress', 'revision', 'delivered', 'approved', 'declined'])
const DRAFT_MUTABLE = new Set(['idea', 'draft', 'revising'])
const DRAFT_DEAD = new Set(['rejected', 'failed', 'archived'])

/** A re-date that only re-pins an already-past date to today is clamp churn (the
 *  planner floors past dates to today), not a real reschedule — skip it. */
function clampOnly(oldISO: string | null, newISO: string | null, todayISO: string): boolean {
  return !!oldISO && !!newISO && oldISO < todayISO && newISO === todayISO
}

export function reconcileProductionPlan(
  plan: PlannedPiece[],
  existingOrders: ReconcileExistingOrder[],
  existingDrafts: ReconcileExistingDraft[],
  todayISO: string,
): ProductionReconcile {
  const planCreator = plan.filter((p) => p.producer === 'creator' && p.creatorId)
  // The "team lane" here must match what materializeCampaignDrafts mints: BOTH
  // 'team' and 'ai' pieces land as content_drafts (the team finalizes AI first
  // drafts). Filtering to 'team' only made every paid AI-lane draft look
  // "removed from the plan" on any post-ship edit — archived, and never
  // re-materialized. Owner-paid work silently deleted.
  const planTeam = plan.filter((p) => p.producer === 'team' || p.producer === 'ai')
  const planCreatorByKey = new Map(planCreator.map((p) => [p.key, p]))
  const planTeamByKey = new Map(planTeam.map((p) => [p.key, p]))
  const orderByKey = new Map(existingOrders.map((o) => [o.key, o]))
  const draftByKey = new Map(existingDrafts.map((d) => [d.key, d]))
  const r: ProductionReconcile = { mintCreator: [], reviveOrderIds: [], materializeTeam: [], voidOrderIds: [], archiveDraftIds: [], redateOrders: [], redateDrafts: [], conflicts: { orderIds: [], draftIds: [] } }

  // Creator lane.
  for (const p of planCreator) {
    const o = orderByKey.get(p.key)
    if (!o) r.mintCreator.push(p)                                          // no order at all → mint
    else if (o.status === 'declined') r.reviveOrderIds.push({ id: o.id, dueISO: p.postISO })  // re-added a cancelled slot → revive in place
  }
  for (const o of existingOrders) {
    const p = planCreatorByKey.get(o.key)
    if (!p) {
      if (ORDER_VOIDABLE.has(o.status)) r.voidOrderIds.push(o.id)          // removed + not started → void
      else if (o.status !== 'declined') r.conflicts.orderIds.push(o.id)    // removed but in flight → flag a human (never auto-touch)
    } else if (!ORDER_REDATE_LOCKED.has(o.status) && (o.dueISO ?? null) !== (p.postISO ?? null) && !clampOnly(o.dueISO, p.postISO, todayISO)) {
      r.redateOrders.push({ id: o.id, dueISO: p.postISO })
    }
  }

  // Team lane.
  for (const p of planTeam) if (!draftByKey.has(p.key)) r.materializeTeam.push(p)
  for (const d of existingDrafts) {
    const p = planTeamByKey.get(d.key)
    if (!p) {
      if (DRAFT_MUTABLE.has(d.status)) r.archiveDraftIds.push(d.id)        // removed + editorial → reject
      else if (!DRAFT_DEAD.has(d.status)) r.conflicts.draftIds.push(d.id)  // removed but produced/live → flag
    } else if (DRAFT_MUTABLE.has(d.status) && (d.dateISO ?? null) !== (p.postISO ?? null) && !clampOnly(d.dateISO, p.postISO, todayISO)) {
      r.redateDrafts.push({ id: d.id, dateISO: p.postISO })
    }
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
export function buildPayoutRow(o: { id: string; client_id: string; campaign_id: string | null; creator_id: string; amount_cents: number; surcharge_cents?: number }, feePercent: number): PayoutRow {
  // The owner pays the full amount (charge); the creator is paid on the PIECE only —
  // the solo-visit surcharge is Apnosh's trip-cost recovery, so net it out of gross.
  const gross = Math.max(0, Math.round((o.amount_cents || 0) - (o.surcharge_cents || 0)))
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
  target_platforms: string[]                                    // publish-lib names; empty would hard-fail attemptPublish
  client_signed_off_at: string                                  // the owner's delivery approval IS the sign-off
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
    // A creator piece is social by construction (service_line above); the order
    // carries no channel, so stamp the calendar's default platform via the same
    // helper both lanes share. Empty would hard-fail attemptPublish ('no_platforms').
    target_platforms: targetPlatformsForPiece('post', null),
    // The owner ALREADY approved this delivery (the bridge only runs on an approved
    // order), so that approval moment carries over as the sign-off — otherwise the
    // attemptPublish consent gate would hold approved work for a second sign-off.
    client_signed_off_at: new Date().toISOString(),
  }
}
