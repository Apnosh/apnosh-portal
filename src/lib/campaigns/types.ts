/**
 * Flow Builder v2 — domain types for the redesign prototype.
 *
 * Billing model (locked with the owner): PER-ORDER, DELIVERY-GATED.
 * Nobody pays for a subscription or for anything before it's produced.
 *  - A one-off deliverable is charged once, when it ships.
 *  - A recurring deliverable is a standing order that re-charges each cycle
 *    ONLY for the cycles it actually runs — pause it and the charges stop.
 *  - Charges accumulate into a rolling, itemized statement per production
 *    batch (fewer transactions, every line still visible) instead of a card
 *    swipe per item. So the owner only ever pays for what they ACTUALLY got.
 */

import type { StageId } from '@/lib/campaigns/stages'

export type BuildPath = 'ai' | 'strategist' | 'diy'

/** The owner's primary goal — drives which services the engine considers. */
export type GoalKey = 'regulars' | 'new-customers' | 'slow-nights' | 'reviews'

/** Mocked onboarding profile — treated as already-collected input data. */
export interface BusinessProfile {
  id: string
  name: string
  archetype: string
  archetypeIcon: string
  goal: string
  goalKey: GoalKey
  /** Capabilities they already have (so we never sell them these). */
  has: string[]
  /** What peers in this archetype typically spend per month — a dial snap point. */
  peerSpend: number
}

/** What the owner is making — drives how the whole builder behaves. */
export type CampaignIntent = 'full-plan' | 'one-off' | 'ongoing' | 'single-item'

/** An owner-added moment on the calendar (anniversary, live music, a one-off
 * special) — sits alongside the seasonal moments and can be planned for. */
export interface CustomEvent {
  id: string
  label: string
  /** ISO date (YYYY-MM-DD). */
  date: string
  icon?: string
  /** Optional note — the offer or idea behind it. */
  offer?: string
}

/** How a line is billed. Recurring lines re-charge per cycle, never prepaid. */
export type BillingCadence =
  | { kind: 'one-time' }
  | { kind: 'recurring'; every: 'weekly' | 'monthly' }
  | { kind: 'per-occurrence'; unit: string }

/** Why a line is opted out — the heart of "pay only for what you need". */
export type OptOutReason = 'have-it' | 'diy'

/** Where an item sits in the live-campaign lifecycle. */
export type ItemLock = 'editable' | 'in-production' | 'delivered'

/** Who makes a piece, chosen per-piece in the add-piece modal (Content Menu):
 *  'team' (Apnosh makes it) · 'creator' (a marketplace creator) · 'diy' (the owner
 *  makes it — $0, nothing is produced for them) · 'ai' (an AI draft — v2, tier-priced).
 *  Undefined on legacy AI/strategist lines, which resolve via the positional
 *  producer_choices map instead. */
export type PieceProducer = 'team' | 'creator' | 'diy' | 'ai'

/** The brief the maker needs, collected inside the add-piece modal so a piece is
 *  never half-specified. Per-type subsets: shots use `featuring`; sends use `offer`
 *  (+ `subject` for email, `cta` for sms); the rest are optional refinements. */
export interface PieceBrief {
  /** The dish/item the piece is about (required for shots). */
  featuring?: string
  /** The hook / reason to act (required for sends, optional on shots). */
  offer?: string
  /** Email subject line. */
  subject?: string
  /** SMS call-to-action (a link or "reply to book"). */
  cta?: string
  /** Anything that must be included. */
  mustSay?: string
  /** Anything to keep out. */
  avoid?: string
  /** Timing / posting preferences. */
  notes?: string
  /** Which Shoot Day this on-site piece shares (Content Menu batching). 'sd1' = the
   *  campaign's one visit in v1. Absent on remote pieces. */
  shootDayId?: string
  /** For a story only: whether it is filmed on location ('on-site') or a quick
   *  repost ('remote', the default). Drives isOnSitePiece + batching. */
  captureMode?: 'on-site' | 'remote'
}

export interface LineItem {
  id: string
  serviceId: string
  /** Operator/marketing name (Pro layer). */
  name: string
  /** Plain owner name (Simple layer). */
  plain: string
  /** ≤8-word plain-language "what it does". */
  does: string
  stage: StageId | 'foundation'
  /** Charge for one occurrence of this line. */
  price: number
  cadence: BillingCadence
  /** Plain-language time-to-first-delivery, e.g. "~1 week". */
  eta: string
  /** The single number this line exists to move + what to expect. */
  metric?: { label: string; expect: string }
  /** Honest rationale, peer-reviewed where it exists. */
  why?: string
  /** Market comparison, for radical-transparency pricing. */
  market?: { low: number; high: number; label?: string }
  /** Who builds it by default — drives the per-line handler chip. */
  handler?: 'apnosh' | 'ai' | 'hybrid'
  /** Relative timing label from the play blueprint, e.g. "10 days before". */
  when?: string
  /** AI-drafted content for this piece (the "AI builds it" path). */
  draft?: { title?: string; body: string }
  included: boolean
  optOut?: OptOutReason
  /** Recurring lines can be paused — charges stop, line stays. */
  paused?: boolean
  /** For per-occurrence lines (reels/posts/sends): how many. */
  qty?: number
  /** Who makes this piece (Content Menu, per-piece). Undefined on legacy lines. */
  producer?: PieceProducer
  /** For an OWNER-RUN service line (producer 'diy'): which walkthrough mode the owner
   *  chose. Today only the gbp-setup line: 'diy' = plain checklist, 'ai' = Apnosh AI
   *  drafts each fix (Pro-gated). Undefined on team lines and legacy owner-run lines
   *  (which resolve to the checklist). Persists on campaign_line_items.owner_mode. */
  ownerMode?: 'diy' | 'ai'
  /** The add-piece brief for this piece (Content Menu). */
  brief?: PieceBrief
  /** This piece's own post date, ISO (Content Menu). v1 uses the campaign date. */
  postISO?: string
  lock: ItemLock
}

/** A stage of a goal SYSTEM plan — its key + owner-facing label. Each goal defines its own ordered
 *  stages (first-visit, slow-nights and regulars have different shapes), so this is data, not a
 *  fixed union. */
export type PlanStageKey = string
export interface PlanStage {
  stage: string
  title: string
  sub: string
}

/** One move in a staged system plan: a real, priced catalog service with an owner-facing role.
 *  Each move rides as a line item (its price/cadence come from there), so this carries only the
 *  strategy framing — which stage it belongs to and what it does. */
export interface PlanMove {
  serviceId: string
  stage: PlanStageKey
  /** Owner-facing one-liner: what this move does for them. */
  role: string
  /** Optional deeper why (evidence / rationale). */
  because?: string
  /** The quantity the owner tuned in the builder (how many reels / texts / photos), when they
   *  changed it from the catalog default. Absent = the service's standard count. The line price
   *  already reflects this; carried here so the saved plan records the chosen count. */
  qty?: number
}

export interface CampaignDraft {
  id: string
  name: string
  intent: CampaignIntent
  path: BuildPath
  /** Lifecycle phase to create the campaign in (strategist path → 'review'). */
  phase?: 'build' | 'review' | 'ship' | 'monitor' | 'iterate'
  /** The monthly running budget the owner picked (their ceiling). */
  budgetMonthly: number
  items: LineItem[]
  /** True once the plan engine (or a build path) has produced the plan. */
  planned?: boolean
  /** This campaign's goal (may differ from the business's default). */
  goalKey?: GoalKey
  /** The catalog campaign id this was built from (e.g. 'gbp', 'reviewsplan'), so the post-checkout
   *  readiness page can apply the owner's per-campaign "needs from you" config. */
  sourceCatalogId?: string
  /** EVERY catalog id a merged cart draft came from (sourceCatalogId keeps the first, for
   *  compatibility). The availability guards check all of them, so a coming-soon item can never
   *  ride into a charge behind a live first item. */
  sourceCatalogIds?: string[]
  /** Anchored to a moment/date from the calendar, e.g. "July 4". */
  occasion?: string
  /** The date the campaign builds toward (ISO), from the calendar. */
  targetDate?: string
  /** A goal-specific detail the owner gave (e.g. "Mon–Tue" for slow nights). */
  context?: string
  /** For a focused campaign (vs the always-on plan): its strategic brief —
   * the offer, audience, channels and content calendar. */
  brief?: CampaignBrief
  /** The situation-aware pass HELD the paid-ads line (a low rating is the real ceiling); the plan
   *  flow surfaces it with a one-tap "run ads anyway" that restores the normal plan. */
  heldAds?: boolean
  /** The operational move the plan LEADS with (e.g. "Get found on Google"), chosen by the binding
   *  constraint. The plan flow renders it above the content, which is now the support slot. */
  leadMove?: { title: string; because: string; price: number; cadence: BillingCadence }
  /** A staged SYSTEM plan (e.g. win first visits): the ordered service moves the plan is built from.
   *  When present, the plan flow renders the staged system instead of the content-beat Walk; each
   *  move's price/cadence live on its matching line item(s) in `items`. */
  moves?: PlanMove[]
  /** The ordered stage labels for the system plan (goal-defined; the plan flow renders stages in
   *  this order, grouping `moves` by stage). */
  stages?: PlanStage[]
}

/* ── Campaign brief ───────────────────────────────────────────────────
 * What turns a budget-sized service bundle into an actual campaign with a
 * point of view: a hook (offer), who it's for (audience), where it runs
 * (channels), and the concrete pieces that go out (the content calendar). */

/** One concrete deliverable in a campaign's content calendar. */
export interface ContentBeat {
  /** Which week of the campaign it lands in (1-based). */
  week: number
  /** Content type key — 'reel' | 'photo' | 'post' | 'story' | 'email' | 'sms'. */
  type: string
  /** What it is, in the owner's words. */
  label: string
  /** Where it goes out. */
  channel: string
  /** This piece gets a one-time paid boost (ad spend at cost, no monthly retainer). */
  boost?: boolean
  /** The footage comes from the OWNER (the 'edit my footage' promise: they send clips, we cut).
   *  A beat so marked never implies an on-site team shoot — no shoot gate, no shoot slot. */
  footageSource?: 'owner'
  /** A plain owner-facing reason the situation-aware plan pass added/moved this piece. */
  because?: string
  /** The atom play's serviceId (dialed event goals only) — the key the plan UI uses to
   *  look up the AI's per-play reason for THIS owner. Absent on legacy/template beats. */
  serviceId?: string
  /** Stable per-piece id (Content Menu): the producer_choices / reconcile /
   *  content_drafts match key. Absent on legacy AI/strategist beats, which key
   *  positionally by discipline:slot. */
  id?: string
  /** An exact post day (YYYY-MM-DD) the owner picked, overriding the week-derived date. */
  dateISO?: string
  /** The line item this beat was derived from (Content Menu). */
  lineId?: string
  /** Per-piece handler chosen in the add-piece modal (Content Menu). */
  producer?: PieceProducer
  /** Per-piece brief collected at add-time (Content Menu). */
  brief?: PieceBrief
}

export interface CampaignBrief {
  templateId: string
  /** The outcome, stated plainly: "Fill your quiet Tuesday nights". */
  objective: string
  /** The hook — the reason to come now. Optional (some campaigns just show off). */
  offer?: { label: string; note?: string }
  /** Who it targets — ids into the audience option set (maps to Guest segments). */
  audienceIds: string[]
  /** Where it runs — channel ids. */
  channelIds: string[]
  /** What success looks like, for Monitor. */
  kpi: string
  /** Time-boxed length in weeks, or null for ongoing. */
  durationWeeks: number | null
  /** A plain projected outcome, e.g. "~+18 covers per Tuesday". */
  projected?: string
  /** The content calendar — the concrete pieces that ship. */
  contentBeats: ContentBeat[]
  /** Raw spec answers, for editing/traceability. */
  spec: Record<string, string>
}

/* ── Billing rollups ──────────────────────────────────────────────────
 * "Only pay for what you need" computed honestly: opted-out lines never
 * count, recurring lines surface their per-cycle charge, one-offs their
 * single charge. */

export interface BillingSummary {
  /** Charged once, on delivery (sum of included one-time lines). */
  oneTimeOnDelivery: number
  /** Re-charged each month it runs (sum of included, unpaused monthly). */
  perMonth: number
  /** Count of opted-out lines and the money that saved. */
  optedOutCount: number
  optedOutSaved: number
}

/** Snapshot of what the owner approved at ship — the exact content pieces, the plan's services, and
 *  the producer-aware bill — so the order-confirmed receipt renders the same lines + totals it just
 *  showed, with no re-derivation (which could drift to list price instead of the chosen producers). */
export type ReceiptCreative = { key: string; type: string; label: string; producer: PieceProducer; cents: number; creatorName?: string }
export interface CampaignReceipt { creatives: ReceiptCreative[]; services: LineItem[]; bill: BillingSummary }

/** A line's charge at its current quantity (per-occurrence lines multiply). A piece
 *  the owner makes themselves (producer 'diy') is always free — they do the work. */
export function lineTotal(it: LineItem): number {
  if (it.producer === 'diy') return 0
  if (it.cadence.kind === 'per-occurrence') return it.price * Math.max(1, it.qty ?? 1)
  return it.price
}

export function summarize(items: LineItem[]): BillingSummary {
  let oneTimeOnDelivery = 0
  let perMonth = 0
  let optedOutCount = 0
  let optedOutSaved = 0
  for (const it of items) {
    if (!it.included || it.optOut) {
      optedOutCount += it.optOut ? 1 : 0
      optedOutSaved += it.optOut ? lineTotal(it) : 0
      continue
    }
    const t = lineTotal(it)
    if (it.cadence.kind === 'recurring' && it.cadence.every === 'monthly') { if (!it.paused) perMonth += t }
    else oneTimeOnDelivery += t
  }
  return { oneTimeOnDelivery, perMonth, optedOutCount, optedOutSaved }
}
