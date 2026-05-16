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

const ALL_TOOLS = [...AI_ASSISTANT_TOOLS, ...WEBSITE_ONLY_TOOLS]

const READ_ONLY_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
]

/*
 * Three AI tiers, each adding capability — not just usage. Website
 * editing tools are NOT bundled in any tier; they're unlocked by
 * subscribing to the separate "Apnosh Website" product (which sets
 * clients.has_apnosh_website = true, enforced at the tool layer).
 *
 *  AI Assistant ($29, internal slug 'basic')
 *    Manual mode. Owner asks, AI does. Hours updates, review drafts,
 *    weekly recap, content ideas. Light context. Cap = abuse guard.
 *
 *  AI Strategist ($69, internal slug 'standard') ⭐ DEFAULT
 *    Continuous data analysis + weekly proactive briefings.
 *    "Your tacos beat burgers 3x on Tuesdays — push them."
 *    Full context loader (sales + reviews + analytics + patterns).
 *    Where most owners land.
 *
 *  AI Strategist+ ($129, internal slug 'pro')
 *    Daily proactive runs. Multi-location dashboard. Custom playbooks.
 *    Unlimited messages. For multi-loc operators and power users.
 *
 *  Enterprise — coming soon (not in TIERS map). Custom integrations,
 *  API access, dedicated AM. Quoted individually.
 *
 *  Internal slugs (starter/basic/standard/pro) kept stable for DB +
 *  Stripe metadata stability.
 *
 *  Strategist hours sold separately à la carte. Apnosh Website sold
 *  separately as its own product line.
 */
export const TIERS: Record<TierId, TierSpec> = {
  starter: {
    id: 'starter',
    label: 'Inactive',
    priceCents: 0,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 5,
    monthlyMessageLimit: 10,
    monthlyCostCapCents: 200,
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: READ_ONLY_TOOLS,
    pitch: 'Subscribe to start using Apnosh AI.',
    proactiveCadence: 'manual',
    richContextLoader: false,
    multiLocationDashboard: false,
    customPlaybooks: false,
  },
  basic: {
    id: 'basic',
    label: 'AI Assistant',
    priceCents: 2900,                     // $29/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 30,                // soft, abuse guard
    monthlyMessageLimit: 200,             // soft — most owners do 8-20/mo
    monthlyCostCapCents: 1000,            // $10/mo AI ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'Quick AI for hours, reviews, posts, and weekly recap. Ask when you need it.',
    proactiveCadence: 'manual',           // no proactive runs at this tier
    richContextLoader: false,             // basic context only
    multiLocationDashboard: false,
    customPlaybooks: false,
  },
  standard: {
    id: 'standard',
    label: 'AI Strategist',
    priceCents: 6900,                     // $69/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 100,
    monthlyMessageLimit: 1000,            // soft
    monthlyCostCapCents: 3000,            // $30/mo AI ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'AI reads your data, plans campaigns, and sends weekly insights. The real value tier.',
    proactiveCadence: 'weekly',           // weekly briefings without owner asking
    richContextLoader: true,              // full context: sales + reviews + analytics + cross-client patterns
    multiLocationDashboard: false,
    customPlaybooks: false,
  },
  pro: {
    id: 'pro',
    label: 'AI Strategist+',
    priceCents: 12900,                    // $129/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: null,              // unlimited
    monthlyMessageLimit: null,            // unlimited
    monthlyCostCapCents: 8000,            // $80/mo AI ceiling (still bounded)
    humanHoursPerMonth: 0,
    locationsLimit: null,                 // unlimited
    enabledTools: AI_ASSISTANT_TOOLS,
    pitch: 'Unlimited messages, daily proactive runs, multi-location dashboard, custom playbooks.',
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
