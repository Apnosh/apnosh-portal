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
  lock: ItemLock
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
  /** Anchored to a moment/date from the calendar, e.g. "July 4". */
  occasion?: string
  /** The date the campaign builds toward (ISO), from the calendar. */
  targetDate?: string
  /** A goal-specific detail the owner gave (e.g. "Mon–Tue" for slow nights). */
  context?: string
  /** For a focused campaign (vs the always-on plan): its strategic brief —
   * the offer, audience, channels and content calendar. */
  brief?: CampaignBrief
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

/** A line's charge at its current quantity (per-occurrence lines multiply). */
export function lineTotal(it: LineItem): number {
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
