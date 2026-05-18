/**
 * Agent tier definitions.
 *
 * Single source of truth for what each tier includes, what it costs
 * us, and what limits it enforces. Used by:
 *   - registry.ts to gate which tools a client can call
 *   - actions.ts sendMessage() to enforce daily/monthly caps
 *   - cost dashboard to show projections + actuals
 *   - upgrade UI to render the tier ladder
 *
 * The `tier` column on clients accepts any string (no DB enum), so
 * adding/renaming tiers here doesn't require a migration. New tiers
 * just need a row in service_catalog with the Stripe price ID.
 */

export type TierId = 'starter' | 'basic' | 'standard' | 'pro'

export interface TierSpec {
  id: TierId
  /** Display name shown to owners. */
  label: string
  /** Monthly price in USD cents. 0 = free trial. */
  priceCents: number
  /** Free-trial flag (no charge for first N days). */
  isFreeTrial: boolean
  trialDays: number
  /** Daily message cap (owner-side). Null = unlimited. */
  dailyMessageLimit: number | null
  /** Monthly message cap. Null = unlimited. */
  monthlyMessageLimit: number | null
  /** Hard monthly cost cap in cents. We refuse new agent turns once a
   *  client's last-30-day Anthropic spend exceeds this. Null = unlimited
   *  (Pro tier; ceiling protected by ratelimit + tool caps instead). */
  monthlyCostCapCents: number | null
  /** Human technician hours included per month. */
  humanHoursPerMonth: number
  /** Max locations supported. Null = unlimited. */
  locationsLimit: number | null
  /** Tools the agent can call at this tier. Used as default unless
   *  overridden per-client in client_tool_overrides. */
  enabledTools: string[]
  /** One-line description for the upgrade UI. */
  pitch: string
  /** How often the proactive insights / weekly recap cron runs for
   *  this tier. Assistant = manual only; Strategist = weekly briefings;
   *  Strategist+ = daily check-ins. The cron handler reads this to
   *  decide which clients to run for. */
  proactiveCadence: 'manual' | 'weekly' | 'daily'
  /** Whether this tier loads the rich cross-client patterns + sales
   *  trends + sentiment shifts context into every turn (vs. just the
   *  basics). The "Strategist" experience hinges on this. */
  richContextLoader: boolean
  /** Whether the multi-location rollup dashboard is unlocked. */
  multiLocationDashboard: boolean
  /** Whether custom playbooks (brand-specific tone, scheduling rules,
   *  and tool override defaults) can be authored for this client. */
  customPlaybooks: boolean
}

/*
 * Tools that ONLY work when the owner's website is on Apnosh infra
 * (Apnosh-managed GitHub repo with an apnosh-content.json schema).
 * If the owner is on Squarespace/Wix/WordPress, these tools can't
 * function — the data path doesn't exist. They're gated to the
 * Website + AI tier accordingly.
 */
const WEBSITE_ONLY_TOOLS = [
  'update_page_copy',
  'update_menu_item',
]

/*
 * Tools that work for ANY restaurant — they touch GBP, social,
 * reviews, analytics, or the owner directly via chat. These are
 * the AI Assistant baseline.
 */
const AI_ASSISTANT_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
  'update_hours',              // updates Google Business Profile hours
  'tag_photo',                 // tags photos for GBP / social
  'post_to_gbp',
  'draft_review_response',
  'generate_post_ideas',
]

/* ALL_TOOLS = AI_ASSISTANT_TOOLS + WEBSITE_ONLY_TOOLS. Reserved for the
   admin tool override path (per-client overrides can grant any tool by
   name regardless of tier); also a single source of truth for new tools
   we might add. Currently unused at runtime — tier tool lists explicitly
   reference AI_ASSISTANT_TOOLS so the website-gated tools stay opt-in.
   The registry layer (registry.ts) enforces WEBSITE_GATED_TOOLS based on
   clients.has_apnosh_website, not on tier inclusion. */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const ALL_TOOLS = [...AI_ASSISTANT_TOOLS, ...WEBSITE_ONLY_TOOLS]

const READ_ONLY_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
]

/*
 * Pricing structure: PLG funnel for indie restaurant owners.
 *
 *  Free ($0, internal slug 'starter')
 *    Front door. 5 msgs/mo, read-only. No credit card required.
 *    Cost to deliver: ~$0.50/mo. Treated as acquisition cost.
 *
 *  Starter ($15, internal slug 'basic')
 *    The "obvious yes" entry. 100 msgs/mo, all write tools, 1 location.
 *    Most indie owners land here.
 *
 *  Pro ($35, internal slug 'standard') ⭐ DEFAULT for active operators
 *    Unlimited messages, daily proactive insights, rich context loader,
 *    multi-location dashboard. Per-location pricing — group operators
 *    pay $35 × N locations (Stripe quantity-based; per-loc discounts
 *    can be layered later via tiered pricing).
 *
 *  Apnosh Managed — quote-based, not in TIERS map. Sales-led. AI + our
 *  team posts to socials, monthly strategy memo, photo direction. From
 *  $199-499/loc/mo depending on scope.
 *
 *  Internal slugs (starter/basic/standard/pro) kept stable for DB +
 *  Stripe metadata + webhook compatibility. 'pro' is deprecated as a
 *  buyable tier (everything Pro-tier-related now lives under 'standard'),
 *  but the slug remains so any existing tier='pro' client rows keep
 *  working without a migration.
 *
 *  Apnosh Website sold separately as its own product line.
 */
export const TIERS: Record<TierId, TierSpec> = {
  starter: {
    id: 'starter',
    label: 'Free',
    priceCents: 0,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 2,                 // 5/mo, capped to ~2/day burst
    monthlyMessageLimit: 5,
    monthlyCostCapCents: 50,              // ~$0.50/mo hard ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: READ_ONLY_TOOLS,
    pitch: 'Try Apnosh free. Read your data, see what AI can do. No credit card needed.',
    proactiveCadence: 'manual',
    richContextLoader: false,
    multiLocationDashboard: false,
    customPlaybooks: false,
  },
  basic: {
    id: 'basic',
    label: 'Starter',
    priceCents: 1500,                     // $15/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 20,
    monthlyMessageLimit: 100,             // most owners do 8-20/mo, 100 = comfortable headroom
    monthlyCostCapCents: 800,             // $8/mo AI ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'AI handles your Google posts, hours, review drafts, and content ideas. $15/mo, single location.',
    proactiveCadence: 'manual',           // owner-driven; no auto runs
    richContextLoader: false,
    multiLocationDashboard: false,
    customPlaybooks: false,
  },
  standard: {
    id: 'standard',
    label: 'Pro',
    priceCents: 3500,                     // $35/mo per location
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: null,              // unlimited
    monthlyMessageLimit: null,            // unlimited
    monthlyCostCapCents: 4000,            // $40/mo AI ceiling (abuse guard)
    humanHoursPerMonth: 0,
    locationsLimit: null,                 // unlimited (per-loc billing via quantity)
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'Unlimited AI. Daily proactive insights. Multi-location dashboard. $35/location/mo.',
    proactiveCadence: 'daily',            // proactive daily briefings
    richContextLoader: true,              // full context: sales + reviews + analytics + patterns
    multiLocationDashboard: true,
    customPlaybooks: true,
  },
  /* Deprecated — kept in map so any existing tier='pro' client rows
     resolve to the Pro feature set without a DB migration. */
  pro: {
    id: 'pro',
    label: 'Pro',
    priceCents: 3500,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: null,
    monthlyMessageLimit: null,
    monthlyCostCapCents: 4000,
    humanHoursPerMonth: 0,
    locationsLimit: null,
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'Unlimited AI. Daily proactive insights. Multi-location dashboard. $35/location/mo.',
    proactiveCadence: 'daily',
    richContextLoader: true,
    multiLocationDashboard: true,
    customPlaybooks: true,
  },
}

/* Per-message overage rate when an owner exceeds their monthly cap
   AND chooses pay-as-you-go instead of upgrading. */
export const OVERAGE_PRICE_PER_MESSAGE_CENTS = 9   // $0.09/msg
export const OVERAGE_BUNDLE_SIZE = 100             // sold in packs of 100
export const OVERAGE_BUNDLE_PRICE_CENTS = 900      // $9 for 100 extra messages

/* Multi-location discount: applied as % off the per-location price for
   each additional location beyond the first. Computed in the checkout
   endpoint via Stripe graduated/tiered pricing. */
export const MULTI_LOCATION_DISCOUNTS = [
  { fromLocation: 1, percentOff: 0 },    // first location: full price
  { fromLocation: 2, percentOff: 20 },   // 2nd: 20% off
  { fromLocation: 3, percentOff: 30 },   // 3rd-5th: 30% off
  { fromLocation: 6, percentOff: 40 },   // 6+: 40% off
]

export const DEFAULT_TIER: TierId = 'basic'

/**
 * Resolve a client_tier string to a TierSpec. Treats unknown values
 * as 'basic' rather than throwing -- a misconfigured client should
 * still work, not break.
 */
export function resolveTier(raw: string | null | undefined): TierSpec {
  if (!raw) return TIERS[DEFAULT_TIER]
  const lower = raw.toLowerCase()
  if (lower in TIERS) return TIERS[lower as TierId]
  /* Allow common casings the PRODUCT-SPEC uses ('Basic', 'Standard', 'Pro'). */
  return TIERS[DEFAULT_TIER]
}

/** Cost per 1M tokens for Anthropic models. Centralized so we can update once. */
export const ANTHROPIC_RATES = {
  /* Sonnet 4.5 -- the main agent. */
  'claude-sonnet-4-5-20250929': { inputPerM: 3, outputPerM: 15 },
  /* Haiku 3.5 -- for background work. */
  'claude-haiku-3-5-20250930': { inputPerM: 0.8, outputPerM: 4 },
  /* Opus 4 -- the bespoke pipeline. */
  'claude-opus-4': { inputPerM: 15, outputPerM: 75 },
} as const

/** Best-effort token-cost computation. Returns cents. */
export function computeCostCents(
  model: string,
  inputTokens: number,
  outputTokens: number,
): number {
  const rates = (ANTHROPIC_RATES as Record<string, { inputPerM: number; outputPerM: number }>)[model]
    ?? { inputPerM: 3, outputPerM: 15 }
  const dollars = (inputTokens / 1_000_000) * rates.inputPerM
    + (outputTokens / 1_000_000) * rates.outputPerM
  return Math.ceil(dollars * 100)
}
