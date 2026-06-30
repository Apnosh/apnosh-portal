/**
 * Priced service catalog v2 — every service Apnosh sells to restaurant
 * owners, with honest economics and archetype fit.
 *
 * What changed from v1 (per the deep-dive audit):
 *  - Cost model v2: explicit delivery mix (US lead/QA hours at a fully
 *    loaded, utilization-adjusted rate + managed offshore fulfillment
 *    hours), shoots as flat per-event costs (minimums + travel included),
 *    a +25% overhead loader (revisions, client comms, onboarding
 *    amortization), and ~3% payment processing off the top of price.
 *  - Repriced labor-heavy items toward the market floor (we were under
 *    market on every one of them; competitors charge 2x+ for the same
 *    scope) targeting ≥50% true margin per line (MARGIN_FLOOR).
 *  - ~14 new services from the research: delivery-platform optimization,
 *    catering/B2B engine, photography library, private feedback loop
 *    (compliant — never gates public reviews), pre-opening launch, gift
 *    cards, listings sync, PR, menu engineering, concierge outreach,
 *    AI phone answering, website care, bar events engine, food-truck
 *    location broadcasting.
 *  - Archetype dimension: fit tags (priority / wrong-for + why) across
 *    ten restaurant types, plus compliance flags (TCPA, alcohol ads,
 *    review-gating rules, escheatment, franchise approval).
 *  - Starter bundles per archetype with a 10% bundle discount; the
 *    monthly report is included free in every bundle. Minimum monthly
 *    engagement: $500 (sub-$150 items don't clear their fixed overhead
 *    on their own).
 */

import type { StageId } from '../stages'
import { GENERATED_CATALOG } from './catalog.generated'

export type Handler = 'apnosh' | 'ai' | 'hybrid'
export type CatalogSection = 'foundation' | StageId

export const HANDLERS: Record<Handler, { label: string; icon: string; hex: string }> = {
  apnosh: { label: 'Apnosh',              icon: '◆',  hex: '#2e9a78' },
  ai:     { label: 'AI + human QA',       icon: '✨', hex: '#8b5cf6' },
  hybrid: { label: 'AI draft · Apnosh finish', icon: '✨◆', hex: '#3b82f6' },
}

/* ── Restaurant archetypes ─────────────────────────────────────────── */

export type Archetype =
  | 'qsr' | 'fineDining' | 'cafe' | 'foodTruck' | 'ghost'
  | 'bar' | 'multi' | 'preOpening' | 'neighborhood' | 'seasonal'

export const ARCHETYPES: Record<Archetype, { label: string; icon: string }> = {
  qsr:          { label: 'QSR / fast-casual',   icon: '🍔' },
  fineDining:   { label: 'Fine dining',          icon: '🍷' },
  cafe:         { label: 'Café / bakery',        icon: '☕' },
  foodTruck:    { label: 'Food truck',           icon: '🚚' },
  ghost:        { label: 'Ghost kitchen',        icon: '👻' },
  bar:          { label: 'Bar / nightlife',      icon: '🍸' },
  multi:        { label: 'Multi-location',       icon: '🏬' },
  preOpening:   { label: 'Pre-opening',          icon: '🚀' },
  neighborhood: { label: 'Neighborhood spot',    icon: '🏘️' },
  seasonal:     { label: 'Seasonal / tourist',   icon: '🏖️' },
}

export const ARCHETYPE_ORDER = Object.keys(ARCHETYPES) as Archetype[]

/* ── Cost model v2 ─────────────────────────────────────────────────── */

/**
 * Delivery rates. usLead is fully loaded (salary + benefits at realistic
 * ~72% utilization); offshore is the managed-VA effective rate incl. our
 * management time. Shoots are flat per event — 2-hr minimums and travel
 * are real, so hourly shooter math understates cost ~3x.
 */
export const RATES = { usLead: 70, offshore: 14 } as const
export const SHOOT_COST = { batched: 300, solo: 375 } as const
/** Revisions, client comms, onboarding amortization on delivery labor. */
export const OVERHEAD_MULT = 1.25
/** Card processing off the top of every dollar (ACH halves this). */
export const PROCESSING = 0.03
/** Items below this true margin get flagged in the UI. */
export const MARGIN_FLOOR = 0.5
/** Sub-$150 lines don't clear their fixed per-account overhead alone. */
export const MIN_ENGAGEMENT = 500

export interface CostModel {
  /** US lead/QA/strategy hours. */
  us?: number
  /** Managed offshore fulfillment hours (builds, scheduling, drafts). */
  offshore?: number
  /** On-site shoots, flat-cost per event. */
  batchedShoots?: number
  soloShoots?: number
  /** AI / SaaS seats / print spend in dollars (our cost, not passthrough). */
  tools?: number
}

export interface PricePoint {
  amount: number
  kind: 'one-time' | 'monthly' | 'per-unit'
  unit?: string
  cost: CostModel
  /** Qualifier shown next to the price, e.g. 'ad spend billed at cost'. */
  note?: string
  /** Variable costs billed to the client at cost (industry norm). */
  passthrough?: string
  /** Market rate band for the same scope, from the competitor research. */
  market?: { low: number; high: number; label?: string }
}

export interface ServiceFit {
  /** Archetypes where this item is a priority play. */
  great?: Archetype[]
  /** Archetypes where it's wrong, with the reason. */
  avoid?: Partial<Record<Archetype, string>>
}

/* ── Goal routing: which system goals a service serves ─────────────────
 * The catalog is the single source of truth for campaign selection. A service carries
 * a goalPlays[] saying which goal(s) it belongs to, in which stage, from which budget
 * tier up, and how it ranks within that stage. The plan builder (buildSystem) QUERIES
 * this — via playsForGoal — instead of reading a hardcoded per-goal list, so tagging a
 * new service makes it available to every goal it fits, with no separate wiring. */
export type Tier = 'lean' | 'standard' | 'aggressive'
/** The system goals, keyed by the builder ITEM id (not GoalKey — that is a different
 *  vocabulary: GoalKey 'regulars' overlaps but 'firstvisit' != 'new-customers'). */
export type SystemGoal = 'firstvisit' | 'nights' | 'regulars' | 'reviews'
export interface GoalPlay {
  goal: SystemGoal
  /** The plan stage it lands in (must match one of the goal's PlanStage.stage labels). */
  stage: string
  /** Cheapest budget tier that includes this play (tiers nest lean ⊂ standard ⊂ aggressive). */
  minTier: Tier
  /** Ordering hint within a stage — higher sorts first. Seeded from the original plan order;
   *  the AI selection layer tunes it later. NOT a measured effectiveness figure. */
  weight?: number
  /** Owner-facing reason this service is in the plan (its job for this goal). */
  role: string
  /** Optional plain-language evidence for why it matters. */
  because?: string
}

export interface PricedService {
  id: string
  section: CatalogSection
  name: string
  desc: string
  essential: boolean
  evidence?: string
  handler: Handler
  handlerWhy: string
  prices: PricePoint[]
  fit?: ServiceFit
  /** Regulatory / platform-policy constraint baked into delivery. */
  compliance?: string
  /**
   * The metric this service exists to move + an honest expectation.
   * This is the proving loop's hook: every month, each service gets
   * scored against its own metric — and we recommend dropping what
   * isn't earning its line.
   */
  metric?: { label: string; expect: string }
  /**
   * The concrete pieces this service produces, so a plan can itemize "what you get" with a
   * per-piece price (price ÷ total qty). Omit for single-deliverable services (a setup, a build) —
   * those ARE one piece and show their own line. Counts are per the service's billing period.
   */
  pieces?: { label: string; qty: number }[]
  /** Which system goals this service serves, and how (stage / tier / order). Drives the
   *  catalog-as-source-of-truth plan builder. Absent = never appears in a system plan.
   *  Stored on the catalog_services row (goal_plays) and rebuilt inline by the generated snapshot. */
  goalPlays?: GoalPlay[]
  /** Concrete "what's included" the client is paying for: a plain one-line summary + the deliverable
   *  bullets. Stored on catalog_services (deliverables jsonb); shown on the service card, editable. */
  deliverables?: { summary: string; included: string[] }
}

export function costOf(c: CostModel): number {
  const raw = (c.us ?? 0) * RATES.usLead
    + (c.offshore ?? 0) * RATES.offshore
    + (c.batchedShoots ?? 0) * SHOOT_COST.batched
    + (c.soloShoots ?? 0) * SHOOT_COST.solo
    + (c.tools ?? 0)
  return raw * OVERHEAD_MULT
}

export function marginOf(p: PricePoint): { cost: number; dollars: number; pct: number } {
  const cost = costOf(p.cost)
  const net = p.amount * (1 - PROCESSING) - cost
  return { cost, dollars: net, pct: p.amount > 0 ? net / p.amount : 0 }
}

/** The catalog now comes from the catalog_services DB table via a build-time GENERATED snapshot
 *  (scripts/gen-catalog.ts -> catalog.generated.ts). Each service carries its goalPlays inline.
 *  Edit it in the admin store and Publish to regenerate; this stays the pure/sync array the
 *  composer reads at module load, so composePlanForGoal never touches the DB. */
export const PRICED_CATALOG: PricedService[] = GENERATED_CATALOG

// "Perfect" stays machine-checked: in dev, warn on any line under the margin floor or carrying a
// placeholder price (surfaced, never auto-changed — pricing is an owner decision).
if (process.env.NODE_ENV !== 'production') {
  for (const __s of PRICED_CATALOG) {
    for (const __p of __s.prices) {
      const __m = marginOf(__p)
      if (__m.pct < MARGIN_FLOOR) console.warn(`[catalog] margin floor: ${__s.id} ${__p.kind} $${__p.amount} is ${(__m.pct * 100).toFixed(1)}% (floor ${MARGIN_FLOOR * 100}%)`)
      if (__p.note && /placeholder/i.test(__p.note)) console.warn(`[catalog] placeholder price still live: ${__s.id} ${__p.kind} $${__p.amount}`)
    }
  }
}

/* ── Starter bundles ───────────────────────────────────────────────── */

export const BUNDLE_DISCOUNT = 0.1

export interface Bundle {
  id: string
  name: string
  archetypes: Archetype[]
  desc: string
  serviceIds: string[]
}

export const BUNDLES: Bundle[] = [
  {
    id: 'bundle-neighborhood', name: 'Neighborhood starter',
    archetypes: ['neighborhood', 'cafe'],
    desc: 'Get found, get the list, turn first-timers into regulars.',
    serviceIds: ['gbp-setup', 'review-claim', 'photo-library', 'listings-sync', 'capture-kit', 'welcome-seq', 'second-visit', 'review-engine', 'review-responses', 'video-engine', 'gbp-posts', 'reporting'],
  },
  {
    id: 'bundle-delivery', name: 'Delivery-first',
    archetypes: ['ghost', 'qsr'],
    desc: 'Win the marketplaces, then own the customer.',
    serviceIds: ['photo-library', 'delivery-opt', 'ordering-setup', 'listings-sync', 'social-mgmt', 'review-responses', 'winback', 'reporting'],
  },
  {
    id: 'bundle-fine', name: 'Fine dining & destination',
    archetypes: ['fineDining', 'seasonal'],
    desc: 'Reputation, press and the guests who book ahead.',
    serviceIds: ['photo-library', 'pr-media', 'feedback-loop', 'review-responses', 'reservation-protect', 'concierge', 'giftcards', 'vip-comms', 'reporting'],
  },
  {
    id: 'bundle-launch', name: 'Pre-opening launch',
    archetypes: ['preOpening'],
    desc: 'Open with a line out the door and a list in the CRM.',
    serviceIds: ['brand-kit', 'gbp-setup', 'site-menu', 'photo-library', 'pre-opening', 'landing-page', 'capture-kit', 'video-engine'],
  },
  {
    id: 'bundle-truck', name: 'Food truck engine',
    archetypes: ['foodTruck'],
    desc: 'Be findable daily, book the events that pay.',
    serviceIds: ['truck-location', 'catering-engine', 'sms-found', 'sms-program', 'social-mgmt', 'review-engine', 'reporting'],
  },
]

export function bundleTotals(b: Bundle): { setup: number; monthly: number; setupAfter: number; monthlyAfter: number } {
  let setup = 0
  let monthly = 0
  b.serviceIds.forEach((id) => {
    const s = PRICED_CATALOG.find(x => x.id === id)
    s?.prices.forEach((p) => {
      // Reporting is the free-in-bundle item; per-unit items aren't summable.
      if (s.id === 'reporting') return
      if (p.kind === 'one-time') setup += p.amount
      if (p.kind === 'monthly') monthly += p.amount
    })
  })
  const off = 1 - BUNDLE_DISCOUNT
  return { setup, monthly, setupAfter: Math.round(setup * off / 5) * 5, monthlyAfter: Math.round(monthly * off / 5) * 5 }
}

/* ── Aggregates for the catalog page ───────────────────────────────── */

export interface CatalogTotals {
  services: number
  essentialSetup: number
  essentialMonthly: number
  blendedMarginPct: number
}

export function catalogTotals(items: PricedService[] = PRICED_CATALOG): CatalogTotals {
  let essentialSetup = 0
  let essentialMonthly = 0
  let revenue = 0
  let profit = 0
  items.forEach((s) => {
    s.prices.forEach((p) => {
      const m = marginOf(p)
      // Annualize recurring lines so the blended margin weights a $/mo retainer by its yearly value
      // (x12), not as one equal unit next to a one-time setup — otherwise the headline % is noise.
      const w = p.kind === 'monthly' ? 12 : 1
      revenue += p.amount * w
      profit += m.dollars * w
      if (s.essential && p.kind === 'one-time') essentialSetup += p.amount
      if (s.essential && p.kind === 'monthly') essentialMonthly += p.amount
    })
  })
  return {
    services: items.length,
    essentialSetup,
    essentialMonthly,
    blendedMarginPct: revenue > 0 ? profit / revenue : 0,
  }
}
