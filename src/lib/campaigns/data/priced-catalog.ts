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

export const PRICED_CATALOG: PricedService[] = [
  /* ── Phase 0 · Foundations ─────────────────────────────────────── */
  {
    id: 'gbp-setup', section: 'foundation', name: 'Google Business Profile setup & optimization',
    metric: { label: 'Calls & direction requests from Google', expect: 'More profile actions within 30–60 days of a complete profile' },
    desc: 'Claim/verify, correct categories & attributes, hours, menu link, photo set, services — done to rank.',
    essential: true,
    evidence: 'GBP is the #1 local discovery surface; +1 review star ≈ 5–9% revenue for independents (Luca, HBS).',
    handler: 'apnosh',
    handlerWhy: 'Category and attribute choices move ranking; a wrong edit can suppress the listing. Technical and trust-sensitive.',
    prices: [{ amount: 365, kind: 'one-time', cost: { us: 1.5, offshore: 2 }, market: { low: 300, high: 500, label: 'professional GBP builds' } }],
    fit: {
      avoid: {
        ghost: 'No walk-ins to capture — delivery-platform ranking is the surface that matters.',
        foodTruck: 'Moving trucks run on Google’s service-area rules — needs the truck playbook, not the storefront one.',
      },
    },
  },
  {
    id: 'review-claim', section: 'foundation', name: 'Review platforms claim & audit',
    desc: 'Claim Yelp & TripAdvisor, fix listing data, flag policy-violating reviews, set alerting.',
    essential: true,
    evidence: 'For tourist trade, TripAdvisor is the discovery channel: 77% more likely to book when owners respond (Ipsos, 23K travelers).',
    handler: 'apnosh',
    handlerWhy: 'Ownership disputes and flagging run through human support channels — judgment work.',
    prices: [{ amount: 195, kind: 'one-time', cost: { us: 0.75, offshore: 1.25 } }],
    fit: { great: ['seasonal'] },
  },
  {
    id: 'site-menu', section: 'foundation', name: 'Website & menu tune-up',
    metric: { label: 'Menu views that turn into visits', expect: 'Lower mobile bounce; more one-tap calls & directions' },
    desc: 'Mobile-fast site, HTML menu (not a PDF), hours, location, one-tap call/directions/reserve.',
    essential: true,
    evidence: '77% check the website and 83% the menu before a first visit.',
    handler: 'apnosh',
    handlerWhy: 'The first impression for most guests — built and QA’d by a person on real phones.',
    prices: [{ amount: 575, kind: 'one-time', cost: { us: 2, offshore: 5 }, market: { low: 2000, high: 5000, label: 'agency site builds' } }],
    fit: { avoid: { multi: 'Multi-location needs per-location pages with unique content — a different build, priced per location.' } },
  },
  {
    id: 'website-care', section: 'foundation', name: 'Website care & updates',
    desc: 'Hosting watch, menu/hours/event updates within a day, monthly speed & uptime check.',
    essential: false,
    evidence: 'Platform competitors charge $119–249/mo for site + care; a one-time build leaves the upkeep unowned.',
    handler: 'hybrid',
    handlerWhy: 'Routine updates run offshore; a US lead QAs anything guest-facing.',
    prices: [{ amount: 130, kind: 'monthly', cost: { us: 0.25, offshore: 1, tools: 15 }, market: { low: 119, high: 249, label: 'platform site + care plans' } }],
  },
  {
    id: 'tracking', section: 'foundation', name: 'Tracking & analytics baseline',
    metric: { label: 'The measuring stick itself', expect: 'Every other line on the plan gets a number — so we can prove what works and drop what doesn’t' },
    desc: 'GA4, UTMs, call/direction/order conversion events, plus a baseline snapshot to measure against.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'Mis-wired tracking poisons every later decision. Set up once, correctly.',
    prices: [{ amount: 365, kind: 'one-time', cost: { us: 1.5, offshore: 1.5 } }],
  },
  {
    id: 'crm-list', section: 'foundation', name: 'CRM & guest list setup',
    metric: { label: 'Contacts you own', expect: 'A growing list no algorithm can take away from you' },
    desc: 'Stand up the CRM, import and de-dupe the list, segments (new / regular / lapsed), tagging scheme.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'Data hygiene decisions (merge rules, segment definitions) need a human owner.',
    prices: [{ amount: 395, kind: 'one-time', cost: { us: 1.5, offshore: 3 } }],
  },
  {
    id: 'email-found', section: 'foundation', name: 'Email domain & ESP setup',
    desc: 'Sending domain, SPF/DKIM/DMARC, ESP wiring, deliverability check.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'DNS and deliverability are unforgiving — one wrong record lands everything in spam.',
    prices: [{ amount: 250, kind: 'one-time', cost: { us: 1, offshore: 1.5 }, passthrough: 'ESP per-contact fees billed at cost' }],
  },
  {
    id: 'sms-found', section: 'foundation', name: 'SMS number & compliance setup',
    desc: 'Provider, number + A2P registration, opt-in language, quiet hours, TCPA-compliant flows.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'TCPA violations carry per-message fines. Compliance is liability — never AI-only.',
    compliance: 'TCPA + A2P 10DLC registration handled and documented.',
    prices: [{ amount: 310, kind: 'one-time', cost: { us: 1.25, offshore: 1, tools: 10 }, passthrough: 'Message volume billed at cost (~$30–60/mo per 1,000 subscribers)' }],
  },
  {
    id: 'brand-kit', section: 'foundation', name: 'Brand kit & voice guide',
    desc: 'Logo lockups, colors, fonts, photo style, and the written voice every AI draft is held to.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI explores directions and drafts the voice guide fast; an Apnosh designer makes the final call.',
    prices: [{ amount: 360, kind: 'one-time', cost: { us: 1.5, offshore: 1.5, tools: 5 } }],
    fit: { avoid: { multi: 'Franchisees inherit brand standards — a new kit can violate the franchise agreement.' } },
  },
  {
    id: 'channel-connect', section: 'foundation', name: 'Channel connection',
    desc: 'OAuth + publishing access per channel (Meta, Google, TikTok…), verified end-to-end.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'Account access and permissions — a human walks the owner through it.',
    prices: [{ amount: 95, kind: 'per-unit', unit: 'channel', cost: { us: 0.4, offshore: 0.5 } }],
  },
  {
    id: 'listings-sync', section: 'foundation', name: 'Listings & menu sync',
    metric: { label: 'Listing accuracy everywhere', expect: 'Zero wrong-hours complaints; identical menu on every platform' },
    desc: 'Hours, holidays, menu and photos kept identical across Google, Yelp, Apple Maps and Facebook.',
    essential: true,
    evidence: 'A whole product category (Marqii, $75–150/location/mo) exists because menu drift across platforms loses orders.',
    handler: 'hybrid',
    handlerWhy: 'Sync tooling does the propagation; a human owns the source of truth and catches conflicts.',
    prices: [
      { amount: 195, kind: 'one-time', cost: { us: 0.75, offshore: 1.25 } },
      { amount: 115, kind: 'monthly', cost: { us: 0.25, offshore: 1, tools: 10 }, market: { low: 75, high: 150, label: 'Marqii-class listings sync' } },
    ],
    fit: { great: ['multi'] },
  },
  {
    id: 'photo-library', section: 'foundation', name: 'Food photography library',
    metric: { label: 'Conversion wherever your food is seen', expect: 'Platform-reported: item photos lift delivery sales up to 44%' },
    desc: 'One styled shoot → ~30 edited stills covering the menu — feeds GBP, the site, delivery apps and social.',
    essential: true,
    evidence: 'Bad food photos deter ~36% of diners; item photos lift delivery sales up to 44% (DoorDash, platform-reported).',
    handler: 'apnosh',
    handlerWhy: 'A real shoot with art direction — the asset every other channel reuses. AI can’t photograph your food.',
    prices: [{ amount: 1050, kind: 'one-time', cost: { batchedShoots: 1, us: 1, offshore: 1 }, market: { low: 500, high: 3000, label: 'restaurant menu shoots' } }],
    fit: { great: ['ghost', 'fineDining'] },
  },
  {
    id: 'ordering-setup', section: 'foundation', name: 'First-party ordering / reservations setup',
    metric: { label: 'Commission-free direct orders', expect: 'Direct orders replacing the 15–30% platform take' },
    desc: 'Direct online ordering or reservations on your own site, instead of renting the relationship.',
    essential: false,
    evidence: 'Third-party platforms take 15–30% per order; direct reorder rates run 2x+ third-party.',
    handler: 'apnosh',
    handlerWhy: 'Payments, menus and POS integration — technical execution determines whether it works.',
    prices: [{ amount: 525, kind: 'one-time', cost: { us: 2.5, offshore: 1.5 } }],
    fit: { great: ['ghost', 'qsr'] },
  },

  /* ── Awareness ─────────────────────────────────────────────────── */
  {
    id: 'video-engine', section: 'awareness', name: 'Short-form video engine',
    metric: { label: 'Reach, profile visits & follows', expect: 'Discovery compounds over 60–90 days — not overnight' },
    desc: '8 videos/mo from one batched on-site shoot — shot, edited, captioned, posted to IG + TikTok. Volume pricing (Standard tier): ~$275/video at 4/mo · $175 at 8/mo · $145 at 12/mo.',
    essential: true,
    evidence: 'Short-form video is a top discovery surface for younger diners (TikTok/Reels). Reach now rewards original, share-worthy footage — platforms downrank generic/recycled content, so cadence alone won’t carry it.',
    handler: 'hybrid',
    handlerWhy: 'The shoot needs a person on-site — no AI substitute. Template-driven AI-assisted edits with a human finish; one revision round included.',
    prices: [{ amount: 1395, kind: 'monthly', cost: { batchedShoots: 1, us: 1.5, offshore: 6, tools: 25 }, market: { low: 2000, high: 8000, label: 'retainers for 4–8 videos/mo' } }],
    fit: { great: ['neighborhood', 'cafe'] },
  },
  {
    id: 'video-single', section: 'awareness', name: 'Short-form video (dedicated shoot)',
    desc: 'One reel/TikTok with its own shoot visit. Un-batched, so it carries the full shoot minimum — the engine is the better buy.',
    essential: false,
    handler: 'hybrid',
    handlerWhy: 'Same pipeline as the engine; a solo shoot visit carries the 2-hr minimum + travel that shooters actually bill.',
    prices: [{ amount: 1195, kind: 'per-unit', unit: 'video', cost: { soloShoots: 1, us: 0.5, offshore: 1, tools: 3 }, market: { low: 300, high: 1500, label: 'pro per-video rates' } }],
  },
  {
    id: 'social-mgmt', section: 'awareness', name: 'Social posting & community management',
    metric: { label: 'Engaged local following', expect: 'Consistent presence; comments & DMs answered within a day' },
    desc: '12 feed posts/mo scheduled + comments and DMs answered within a day.',
    essential: true,
    evidence: 'Market band for this exact scope is $500–1,500/mo; restaurant freelancers start ~$900.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts posts and reply suggestions; offshore schedules; a US lead curates and takes the tricky conversations.',
    prices: [{ amount: 475, kind: 'monthly', cost: { us: 1.5, offshore: 4, tools: 10 }, market: { low: 500, high: 1500, label: 'same scope, freelance–agency' } }],
  },
  {
    id: 'gbp-posts', section: 'awareness', name: 'GBP posts & Q&A',
    metric: { label: 'Google profile actions', expect: 'An active profile holds its place in local results' },
    desc: '4 Google Business posts/mo + Q&A answers, generated from your menu and events.',
    essential: true,
    handler: 'ai',
    handlerWhy: 'Formulaic, grounded in your own data — AI output matches human quality here. 15-minute human QA before publish.',
    prices: [{ amount: 85, kind: 'monthly', cost: { us: 0.25, offshore: 0.75, tools: 3 }, market: { low: 125, high: 400, label: 'GBP management retainers' } }],
    fit: { avoid: { ghost: 'No walk-ins — put this effort into delivery-platform listings instead.' } },
  },
  {
    id: 'local-seo', section: 'awareness', name: 'Local SEO & citations',
    desc: 'NAP consistency across directories, schema markup, then monthly rank + citation monitoring.',
    essential: true,
    evidence: 'Basic local-SEO retainers run $300–800/mo; ours is narrow-scope monitoring on top of a clean setup.',
    handler: 'apnosh',
    handlerWhy: 'Cleanup is investigative work across dozens of directories; monitoring needs judgment on what to fix.',
    prices: [
      { amount: 365, kind: 'one-time', cost: { us: 1.5, offshore: 2 } },
      { amount: 150, kind: 'monthly', cost: { us: 0.5, offshore: 1, tools: 5 }, market: { low: 300, high: 800, label: 'basic local-SEO retainers' } },
    ],
    fit: { great: ['multi'], avoid: { ghost: 'Resident-radius SEO targets walk-ins a ghost kitchen doesn’t serve.' } },
  },
  {
    id: 'delivery-opt', section: 'awareness', name: 'Delivery platform optimization',
    metric: { label: 'Delivery orders & menu conversion', expect: 'Platform-reported: photos +44%, descriptions +18% monthly sales' },
    desc: 'DoorDash/UberEats/Grubhub listings done right — item photos, descriptions, menu structure — then monthly promo & sponsored-listing management.',
    essential: false,
    evidence: 'Item photos up to +44% monthly sales, descriptions +18% (DoorDash 15K-merchant study; platform-reported). For delivery-led concepts this is the discovery channel.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts descriptions at volume; Apnosh runs the platform levers (promos, ads, ratings) where mistakes cost real dollars.',
    prices: [
      { amount: 385, kind: 'one-time', cost: { us: 1.5, offshore: 2.5 } },
      { amount: 245, kind: 'monthly', cost: { us: 1, offshore: 1, tools: 5 }, note: 'sponsored-listing spend billed at cost' },
    ],
    fit: { great: ['ghost', 'qsr'] },
  },
  {
    id: 'paid-ads', section: 'awareness', name: 'Paid local ads management',
    metric: { label: 'Cost per new customer', expect: 'Knowable within 2–4 weeks — and we kill what doesn’t pay' },
    desc: 'Geo-targeted Meta + Google campaigns: setup, creative rotation, weekly optimization.',
    essential: false,
    evidence: 'Restaurant CPCs: Google ≈ $2.05, Meta ≈ $0.72. Agencies won’t touch management below $500/mo.',
    handler: 'apnosh',
    handlerWhy: 'Ads punish mistakes in real dollars daily. AI tools assist inside the platform; accountability stays human.',
    compliance: 'Alcohol ads: Meta requires 21+ targeting; Google’s alcohol policy applies; some states restrict drink promos.',
    prices: [{ amount: 545, kind: 'monthly', note: 'ad spend billed at cost, $500/mo minimum', cost: { us: 2.5, offshore: 1, tools: 10 }, market: { low: 500, high: 1500, label: 'small-local PPC management' } }],
  },
  {
    id: 'creator-collab', section: 'awareness', name: 'Local creator collab',
    desc: 'Source, vet and brief a local food creator; coordinate the visit and the post.',
    essential: false,
    handler: 'apnosh',
    handlerWhy: 'Vetting people and negotiating terms is relationship work.',
    prices: [{ amount: 595, kind: 'per-unit', unit: 'activation', note: 'creator fee billed at cost', cost: { us: 3, offshore: 0.5 } }],
    fit: { avoid: { qsr: 'Creator “come visit” content underperforms for QSR — loyalty and delivery channels move the number.' } },
  },
  {
    id: 'pr-media', section: 'awareness', name: 'PR & earned media outreach',
    metric: { label: 'Press placements', expect: 'Earned media compounds — but no placement is ever guaranteed' },
    desc: 'Story mining (founder, recipes, openings), a press kit, and pitches to local food press & critics.',
    essential: false,
    evidence: 'The growth lever for chef-driven rooms; immigrant-founder stories are exactly what local food editors want.',
    handler: 'apnosh',
    handlerWhy: 'Editor relationships and judgment about what’s actually a story — not a generation task.',
    prices: [{ amount: 750, kind: 'per-unit', unit: 'campaign', cost: { us: 4 }, market: { low: 1500, high: 5000, label: 'restaurant PR retainers (per month)' } }],
    fit: { great: ['fineDining', 'neighborhood', 'preOpening'] },
  },
  {
    id: 'truck-location', section: 'awareness', name: 'Location broadcasting & schedule sync',
    metric: { label: '“Where are you today?” answered', expect: 'Fans find you daily without asking' },
    desc: '“Where are we today” published everywhere daily — site calendar, social, SMS list, and truck-locator apps.',
    essential: false,
    evidence: 'The #1 daily marketing job for a truck; locator apps (StreetFoodFinder, Truckster) push to fans when you’re near.',
    handler: 'hybrid',
    handlerWhy: 'AI formats the daily posts from your schedule; offshore publishes; you just keep the calendar true.',
    prices: [{ amount: 135, kind: 'monthly', cost: { us: 0.25, offshore: 1.5, tools: 10 } }],
    fit: { great: ['foodTruck'] },
  },

  /* ── Capture ───────────────────────────────────────────────────── */
  {
    id: 'capture-kit', section: 'capture', name: 'In-store capture kit',
    metric: { label: 'Contacts captured per week', expect: 'Steady signups from tables and the counter' },
    desc: 'QR table tents, counter cards and receipt inserts that trade an incentive for a contact.',
    essential: true,
    evidence: 'The list you own is the only channel without an algorithm or a toll.',
    handler: 'hybrid',
    handlerWhy: 'AI writes the offer copy variants; Apnosh designs, prints and places them.',
    prices: [{ amount: 295, kind: 'one-time', cost: { us: 1, offshore: 1.5, tools: 15 } }],
    fit: {
      avoid: {
        ghost: 'No storefront — bag inserts via delivery optimization do this job instead.',
        foodTruck: 'No counter context — window decal + bag inserts instead.',
        fineDining: 'Table-tent QR codes clash with the service model — capture through the reservation platform.',
      },
    },
  },
  {
    id: 'landing-page', section: 'capture', name: 'Offer landing page & signup form',
    desc: 'A single fast page: the offer, the form, the confirmation — wired into the CRM.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI drafts the copy; Apnosh builds the page, wires the form and tests the whole path.',
    prices: [{ amount: 275, kind: 'one-time', cost: { us: 1, offshore: 2, tools: 3 } }],
  },
  {
    id: 'incentive-design', section: 'capture', name: 'Signup incentive design',
    desc: 'Pick the giveaway (free app, dessert, % off) with the marginal-cost math to keep it profitable.',
    essential: true,
    handler: 'apnosh',
    handlerWhy: 'The offer math against your food cost is judgment, not generation.',
    prices: [{ amount: 240, kind: 'one-time', cost: { us: 1.25 } }],
    fit: { avoid: { fineDining: 'Discount mechanics undercut the price premium the brand is built on.' } },
  },
  {
    id: 'ai-phone', section: 'capture', name: 'AI phone answering & missed-call text-back',
    metric: { label: 'Missed calls recovered', expect: 'Every missed dinner-rush call gets an instant text' },
    desc: 'Every call answered: hours, menu and directions handled by AI; bookings and complaints escalated to a human; missed calls get an instant text.',
    essential: false,
    evidence: 'A fast-growing line at Popmenu/Podium — every missed call at dinner rush is a lost cover.',
    handler: 'ai',
    handlerWhy: 'This product is AI — with a hard human-escalation path for anything sensitive.',
    prices: [
      { amount: 310, kind: 'one-time', cost: { us: 1.5, offshore: 0.5 } },
      { amount: 105, kind: 'monthly', cost: { us: 0.2, offshore: 0.25, tools: 20 }, passthrough: 'call-minute fees billed at cost', market: { low: 99, high: 300, label: 'AI answering add-ons' } },
    ],
  },
  {
    id: 'pre-opening', section: 'capture', name: 'Pre-opening launch package',
    metric: { label: 'Opening-week covers & list size', expect: '300–500 contacts before doors open is the working target' },
    desc: 'The 8-week ladder: coming-soon page + list building, GBP live 90 days pre-open, countdown content, staged soft opening, opening press push.',
    essential: false,
    evidence: 'Google publishes profiles 90 days before opening (documented mechanic); opening-surge guests must be captured before the year-two slump.',
    handler: 'apnosh',
    handlerWhy: 'A sequenced campaign with hard dates — orchestration, not generation.',
    prices: [{ amount: 1295, kind: 'one-time', cost: { us: 6, offshore: 4 } }],
    fit: { great: ['preOpening'] },
  },

  /* ── Nurture ───────────────────────────────────────────────────── */
  {
    id: 'welcome-seq', section: 'nurture', name: 'Welcome sequence',
    metric: { label: 'New signups who come back', expect: 'Every new contact nudged back within two weeks' },
    desc: '3 emails + 1 SMS over the first two weeks: story, menu favorites, a reason to come back.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI drafts all four messages in your voice; Apnosh edits, builds and QA-sends.',
    prices: [{ amount: 395, kind: 'one-time', cost: { us: 1.5, offshore: 2.5, tools: 3 } }],
    fit: { avoid: { preOpening: 'No guests yet — the launch package’s countdown sequence is the pre-open version.' } },
  },
  {
    id: 'second-visit', section: 'nurture', name: 'Second-visit nudge automation',
    metric: { label: 'First-timers who return', expect: 'The hinge metric — the first→second visit is the steepest drop-off to fix' },
    desc: 'A timed, incentivized nudge after the first visit — the single highest-leverage automation.',
    essential: true,
    evidence: 'Restaurant revenue concentrates in repeat guests, and the first→second visit is the steepest drop-off — triggered nudges earn ~16–22× more per send than batch blasts (Klaviyo, Omnisend).',
    handler: 'hybrid',
    handlerWhy: 'AI drafts the message; Apnosh wires the trigger and timing logic.',
    prices: [{ amount: 260, kind: 'one-time', cost: { us: 1, offshore: 1.5, tools: 3 } }],
    fit: { great: ['neighborhood', 'qsr'] },
  },
  {
    id: 'newsletter', section: 'retain', name: 'Monthly newsletter',
    metric: { label: 'Opens & visits per send', expect: 'One good email a month beats four mediocre ones' },
    desc: 'One genuinely good email a month: what’s new, what’s seasonal, one reason to visit.',
    essential: true,
    evidence: 'Restaurant email engagement is low on average — quality over cadence is the whole game.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts from this month’s events and menu; Apnosh edits to earn the open.',
    prices: [{ amount: 190, kind: 'monthly', cost: { us: 0.75, offshore: 1, tools: 2 }, market: { low: 250, high: 500, label: 'managed newsletter programs' } }],
    fit: {
      avoid: {
        qsr: 'The QSR relationship lives in app push and SMS offers, not editorial email.',
        bar: 'Late-night audiences live on IG/TikTok/SMS — email is the wrong primary channel.',
        seasonal: 'Always-on cadence burns a list that’s dark all off-season — needs pause/re-engage design.',
      },
    },
  },
  {
    id: 'sms-program', section: 'retain', name: 'SMS program',
    metric: { label: 'Clicks & redemptions per send', expect: 'Track redemptions, not “opens” — and keep frequency to 1–2/week' },
    desc: '2 segmented sends/mo — slow-night offers, event invites — with strict frequency discipline.',
    essential: true,
    evidence: 'Texts get read fast — but there’s no real “open rate”; track clicks & redemptions. Discipline is the product: 1–2 sends/week max, or over-messaging drives opt-outs.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts; Apnosh owns segmentation, timing and compliance on every send.',
    compliance: 'TCPA quiet hours and opt-out honored on every send.',
    prices: [{ amount: 190, kind: 'monthly', cost: { us: 0.75, offshore: 1, tools: 2 }, passthrough: 'message volume billed at cost (~$30–60/mo per 1,000 subscribers)', market: { low: 75, high: 185, label: 'software-only SMS (no humans)' } }],
    fit: { avoid: { fineDining: 'Promo blasts erode premium positioning — keep SMS transactional (reservations, VIP) only.' } },
  },

  /* ── Convert ───────────────────────────────────────────────────── */
  {
    id: 'offer-eng', section: 'convert', name: 'Offer & promo engineering',
    metric: { label: 'Redemptions & margin per promo', expect: 'Every promo gets a read on whether it actually paid' },
    desc: 'Design one promotion properly: the hook, the margin math, menu psychology, the redemption path.',
    essential: true,
    evidence: 'Menu-psychology effects are real — removing $-signs lifted spend ~8%/check (Cornell field experiment).',
    handler: 'apnosh',
    handlerWhy: 'Pricing strategy against your food cost is consulting, not content.',
    prices: [{ amount: 385, kind: 'per-unit', unit: 'campaign', cost: { us: 2 } }],
  },
  {
    id: 'menu-eng', section: 'convert', name: 'Menu engineering & pricing',
    metric: { label: 'Average check & item mix', expect: 'Cornell-tested formatting ≈ +8%/check; mix shifts visible in ~60 days' },
    desc: 'Contribution-margin analysis of every item, stars/dogs reclassification, layout & price-format psychology.',
    essential: false,
    evidence: 'Honest framing: the famous “10–15% profit” study doesn’t exist. What’s real: Cornell’s ~8% check lift from price formatting, plus item-mix math on your own POS data.',
    handler: 'apnosh',
    handlerWhy: 'Consulting on your real numbers — AI assists the analysis; the calls are human.',
    prices: [{ amount: 625, kind: 'one-time', cost: { us: 3, offshore: 1 } }],
    fit: { great: ['qsr', 'cafe'] },
  },
  {
    id: 'event-pkg', section: 'anticipation', name: 'Event / LTO promo package',
    metric: { label: 'Covers on event nights', expect: 'Tue–Thu traffic is the test' },
    desc: 'Everything one event needs: graphic, email, SMS, GBP post, story — shipped as a set.',
    essential: false,
    handler: 'hybrid',
    handlerWhy: 'AI drafts every asset from one brief; Apnosh designs the graphic and ships the set.',
    prices: [{ amount: 385, kind: 'per-unit', unit: 'event', cost: { us: 1.5, offshore: 2, tools: 5 } }],
  },
  {
    id: 'bar-events', section: 'convert', name: 'Weekly events engine',
    metric: { label: 'Weeknight covers', expect: 'Recurring programming fills the Tue–Thu trough' },
    desc: 'Recurring programming (trivia, music, game-day) promoted properly: monthly calendar + 4 event pushes (graphic, social, SMS, listings).',
    essential: false,
    evidence: 'Weekly programming is the bar industry’s weekday traffic lever; per-event pricing breaks at 4+/mo, so this is the bundle.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts the recurring assets from templates; Apnosh runs the calendar and listings distribution.',
    compliance: 'Drink-promo laws vary by state (MA bans time-limited discounts); alcohol ad policies apply.',
    prices: [{ amount: 525, kind: 'monthly', cost: { us: 2, offshore: 3, tools: 8 } }],
    fit: { great: ['bar'] },
  },
  {
    id: 'catering-engine', section: 'convert', name: 'Catering & private events engine',
    metric: { label: 'Catering inquiries & booked events', expect: 'One recurring corporate account ≈ $30–50K/yr' },
    desc: 'Lead capture page, proposal & quote templates, follow-up automation, plus local B2B outreach (offices, planners).',
    essential: false,
    evidence: 'Avg catering ticket ~$350 vs ~$35 dine-in; ~10–20% of sales where offered (Technomic); one recurring corporate account ≈ $30–50K/yr.',
    handler: 'apnosh',
    handlerWhy: 'B2B sales infrastructure — proposals and outreach need a human owner; AI drafts the documents.',
    prices: [
      { amount: 650, kind: 'one-time', cost: { us: 3, offshore: 2 } },
      { amount: 105, kind: 'monthly', cost: { us: 0.4, offshore: 0.5, tools: 2 } },
    ],
    fit: { great: ['foodTruck', 'fineDining', 'qsr', 'cafe'] },
  },
  {
    id: 'giftcards', section: 'anticipation', name: 'Gift card program & Q4 push',
    metric: { label: 'Cards sold (watch Q4)', expect: 'Nov–Dec ≈ half the year’s card sales; most recipients overspend the card' },
    desc: 'Digital + physical gift cards set up, then a dedicated November–December campaign (the season that is half the year’s card sales).',
    essential: false,
    evidence: 'Q4 ≈ half of annual restaurant gift-card sales (Paytronix/NRN); ~60% of adults want restaurant cards as gifts; most recipients overspend the card.',
    handler: 'hybrid',
    handlerWhy: 'POS/program setup is technical; the campaign assets are AI-drafted, human-shipped.',
    compliance: 'Unredeemed balances are governed by state escheatment law — breakage is not free money everywhere.',
    prices: [
      { amount: 325, kind: 'one-time', cost: { us: 1.5, offshore: 1 } },
      { amount: 385, kind: 'per-unit', unit: 'campaign', cost: { us: 1.5, offshore: 2, tools: 5 } },
    ],
    fit: { great: ['fineDining', 'cafe'] },
  },
  {
    id: 'reservation-protect', section: 'convert', name: 'Reservation & no-show protection',
    metric: { label: 'No-show rate', expect: 'Reminders cut no-shows ~40%; deposits ~50% (platform-reported)' },
    desc: 'Confirmation + day-of reminders with one-tap rebooking, plus deposit / card-hold policy design for peak nights.',
    essential: false,
    evidence: 'Reminders cut no-shows ~30–40% (independent RCTs). Deposits cut them further but suppress bookings & feel unfair (Kim 2024) — use holds only for peak or high-cost covers.',
    handler: 'apnosh',
    handlerWhy: 'Reservation-system integration plus policy design — the policy is the higher-leverage half.',
    prices: [{ amount: 385, kind: 'one-time', cost: { us: 2 } }],
    fit: {
      great: ['fineDining', 'seasonal'],
      avoid: {
        qsr: 'No reservations in this format.',
        cafe: 'Counter service — nothing to no-show.',
        foodTruck: 'No reservations — catering-inquiry SLAs are the equivalent.',
        ghost: 'No tables at all.',
      },
    },
  },

  /* ── Retain ────────────────────────────────────────────────────── */
  {
    id: 'review-engine', section: 'advocate', name: 'Review request engine',
    metric: { label: 'New reviews per month', expect: 'Recency is the game — 85% of diners ignore reviews older than 3 months' },
    desc: 'Post-visit review invites to every guest, unconditionally — recency is what readers trust.',
    essential: true,
    evidence: 'Each star ≈ 5–9% revenue for independents (Luca, HBS; replicated by Fang 2022, Management Science). Recency matters — most diners weight reviews from the last ~3 months, so volume must be continuous.',
    handler: 'apnosh',
    handlerWhy: 'Trigger wiring + staying inside Google/Yelp/FTC rules. Compliance is a human responsibility.',
    compliance: 'No review gating: invites go to every guest regardless of sentiment (Google policy / FTC rule).',
    prices: [{ amount: 325, kind: 'one-time', cost: { us: 1.5, offshore: 1 } }],
    fit: { avoid: { preOpening: 'No guests yet — ships at opening, claimed and monitored from day one.' } },
  },
  {
    id: 'feedback-loop', section: 'retain', name: 'Private guest feedback loop',
    metric: { label: 'Problems intercepted privately', expect: 'Bad nights handled before they reach your rating' },
    desc: 'A post-visit survey that hears problems directly and triggers a same-day recovery playbook — runs alongside (never instead of) public review invites.',
    essential: true,
    evidence: 'Catching a bad night privately protects the rating that moves revenue 5–9% per star. Recovery done fast keeps the guest.',
    handler: 'hybrid',
    handlerWhy: 'AI triages and drafts the recovery outreach; a human makes the save.',
    compliance: 'Compliant by design: never gates or filters who gets asked for a public review.',
    prices: [{ amount: 345, kind: 'one-time', cost: { us: 1.5, offshore: 1, tools: 5 } }],
    fit: { great: ['fineDining'] },
  },
  {
    id: 'review-responses', section: 'retain', name: 'Review response management',
    metric: { label: 'Rating trend & response rate', expect: 'Responding lifts ratings ~+0.12★ and review volume ~+12% over months' },
    desc: 'Every review on every platform answered in your voice — thanks, recovery, and the public save.',
    essential: true,
    evidence: 'Responding causally lifts ratings (+0.12★) and volume (+12%) (Proserpio & Zervas, Marketing Science) — concentrate on negative reviews; reflexively answering positives can backfire (Wang & Chaudhry, JMR).',
    handler: 'hybrid',
    handlerWhy: 'AI drafts every response in your voice instantly; a human approves and posts — especially the angry ones.',
    prices: [{ amount: 165, kind: 'monthly', cost: { us: 0.5, offshore: 1.5, tools: 3 }, market: { low: 300, high: 1000, label: 'human done-for-you responses' } }],
    fit: { great: ['seasonal', 'multi'] },
  },
  {
    id: 'loyalty', section: 'retain', name: 'Loyalty program',
    metric: { label: 'Repeat-visit rate', expect: 'Members visit ~20% more — needs guest volume to pay off' },
    desc: 'Visit-based rewards tuned to your format (stamps for daily habits, points for tickets): design, POS setup, staff one-pager, monthly care.',
    essential: true,
    evidence: 'Loyalty members visit more often (NRA: ~70% of operators with programs report higher traffic), though some of that is self-selection — design it to actually change behavior, not just badge your regulars.',
    handler: 'apnosh',
    handlerWhy: 'Reward economics + POS integration; the design mistakes are expensive to unwind.',
    prices: [
      { amount: 625, kind: 'one-time', cost: { us: 3, offshore: 1 } },
      { amount: 75, kind: 'monthly', cost: { us: 0.25, offshore: 0.75 }, market: { low: 45, high: 149, label: 'loyalty software (self-serve)' } },
    ],
    fit: {
      great: ['qsr', 'cafe'],
      avoid: {
        seasonal: 'One-visit-per-lifetime tourists can’t accumulate — concierge incentives matter more.',
        fineDining: 'Points feel downmarket here — recognition-based VIP treatment instead.',
        preOpening: 'No member base yet — defer to month 2–3.',
      },
    },
  },
  {
    id: 'winback', section: 'winback', name: 'Lapsed-guest win-back',
    metric: { label: 'Lapsed guests recovered', expect: 'Cheaper than acquiring anyone new' },
    desc: 'Detect guests gone quiet 30/60/90 days and reach them with an escalating reason to return.',
    essential: true,
    evidence: 'Winning back a lapsed guest costs a fraction of acquiring a new one.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts the messages; Apnosh defines the lapse logic and wires the triggers.',
    prices: [{ amount: 310, kind: 'one-time', cost: { us: 1.25, offshore: 1.5, tools: 3 } }],
    fit: {
      avoid: {
        seasonal: 'A tourist who visited once in August isn’t “lapsed” — they live 1,000 miles away.',
        preOpening: 'No guest history to detect lapses in.',
      },
    },
  },
  {
    id: 'referral', section: 'advocate', name: 'Referral & advocacy program',
    metric: { label: 'Referred guests & guest UGC', expect: 'Referred guests are ~16–25% more profitable and churn ~18% less (Schmitt et al.)' },
    desc: 'A dual-sided referral mechanic plus a system to turn happy regulars into reviews and shareable UGC — the loop back to discovery.',
    essential: false,
    evidence: 'Referred customers are measurably more valuable and stickier (Schmitt, Skiera & Van den Bulte, J. Marketing). Word-of-mouth is the #1 restaurant discovery channel — advocacy closes the loop.',
    handler: 'hybrid',
    handlerWhy: 'AI drafts the asks and reward copy; Apnosh designs the dual-sided mechanic and the timing of the ask.',
    prices: [
      { amount: 290, kind: 'one-time', cost: { us: 1.5, offshore: 1 } },
      { amount: 95, kind: 'monthly', cost: { us: 0.4, offshore: 0.5, tools: 5 } },
    ],
    fit: { great: ['fineDining', 'neighborhood', 'cafe'] },
  },
  {
    id: 'birthday', section: 'retain', name: 'Birthday & anniversary club',
    metric: { label: 'Birthday redemptions', expect: 'The highest-redemption send there is' },
    desc: 'Collect the date at signup, send the treat automatically — the highest-redemption send there is.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI writes it once; the automation runs forever.',
    prices: [{ amount: 190, kind: 'one-time', cost: { us: 0.75, offshore: 1, tools: 2 } }],
    fit: {
      great: ['bar'],
      avoid: { seasonal: 'Near-zero redemption for one-time visitors — only worth it for the local base.' },
    },
  },

  /* ── Anticipation ──────────────────────────────────────────────── */
  {
    id: 'seasonal-cal', section: 'anticipation', name: 'Seasonal calendar & campaign planning',
    desc: 'A quarter mapped in advance: holidays, local events, menu moments — so nothing is last-minute.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI generates the candidate calendar from local data; Apnosh curates it with you.',
    prices: [{ amount: 220, kind: 'per-unit', unit: 'quarter', cost: { us: 1, offshore: 0.5, tools: 3 } }],
  },
  {
    id: 'concierge', section: 'awareness', name: 'Hotel & concierge outreach',
    metric: { label: 'Referrals from front desks', expect: 'A relationship channel — builds over months, not days' },
    desc: 'Per-hotel incentive cards, a concierge kit, and a monthly visit cadence so the front desk sends you their guests.',
    essential: false,
    evidence: 'For tourist-area rooms the front desk is a discovery channel; the playbook (shift-change visits, comp tastings) is documented relationship work.',
    handler: 'apnosh',
    handlerWhy: 'In-person relationship building — the least automatable item in the catalog.',
    prices: [
      { amount: 275, kind: 'one-time', cost: { us: 1, offshore: 1, tools: 15 } },
      { amount: 265, kind: 'monthly', cost: { us: 1.25, offshore: 0.5, tools: 2 } },
    ],
    fit: { great: ['seasonal', 'fineDining'] },
  },
  {
    id: 'vip-comms', section: 'anticipation', name: 'VIP early-access sends',
    desc: 'Regulars hear it first — new menu, ticketed nights, holiday books — before the public.',
    essential: false,
    handler: 'hybrid',
    handlerWhy: 'AI drafts; Apnosh picks the segment and the moment.',
    prices: [{ amount: 130, kind: 'per-unit', unit: 'send', cost: { us: 0.5, offshore: 0.75, tools: 2 } }],
    fit: { great: ['fineDining'] },
  },
  {
    id: 'reporting', section: 'retain', name: 'Monthly performance report & review call',
    metric: { label: 'The proving loop itself', expect: 'Each month: what worked, what didn’t, and what we recommend you stop paying for' },
    desc: 'The numbers that matter (visits, list growth, reviews, revenue signals) + a 20-minute call on what to change.',
    essential: true,
    handler: 'hybrid',
    handlerWhy: 'AI assembles the numbers; Apnosh reads them and tells you what to do differently.',
    prices: [{ amount: 150, kind: 'monthly', note: 'included free in every bundle', cost: { us: 0.5, offshore: 1.25, tools: 3 } }],
    fit: { avoid: { preOpening: 'Nothing to report yet — launch milestones (list growth, RSVPs, press) instead.' } },
  },
]

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
      revenue += p.amount
      profit += m.dollars
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
