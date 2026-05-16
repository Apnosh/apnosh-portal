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
}

const ALL_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
  'update_hours',
  'update_menu_item',
  'tag_photo',
  'update_page_copy',
  'post_to_gbp',
  'draft_review_response',
  'generate_post_ideas',
]

/* Essential tier: the routine "small stuff" an owner does themselves -
   menu edits, hour changes, copy tweaks, drafted review replies.
   Excludes content generation + GBP posting + photo work + ad creation,
   which are the things that move the needle and justify Growth. */
const TACTICAL_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
  'update_hours',
  'update_menu_item',
  'update_page_copy',
  'draft_review_response',
]

const READ_ONLY_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
]

/*
 * Tier IDs (starter/basic/standard/pro) are internal slugs that
 * existing client rows + Stripe metadata reference; we keep them
 * stable and only change the user-facing label + pricing.
 *
 *  starter  -> "Inactive" — fallback when subscription is cancelled.
 *              Owners see a paywall; only read-only tools work.
 *  basic    -> "Essential" — $39/loc/mo
 *  standard -> "Growth" ⭐ — $79/loc/mo (default recommendation)
 *  pro      -> "Scale" — $149/loc/mo
 *
 * Strategist hours are NO LONGER bundled in any tier. They're sold
 * separately à la carte via /dashboard/services. Keeps platform
 * margins predictable and lets services scale with team capacity.
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
  },
  basic: {
    id: 'basic',
    label: 'Essential',
    priceCents: 3900,                     // $39/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 15,
    monthlyMessageLimit: 150,
    monthlyCostCapCents: 1500,            // $15/mo hard ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: TACTICAL_TOOLS,
    pitch: 'Owner-driven AI for menus, hours, copy, and review responses.',
  },
  standard: {
    id: 'standard',
    label: 'Growth',
    priceCents: 7900,                     // $79/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 50,
    monthlyMessageLimit: 500,
    monthlyCostCapCents: 5000,            // $50/mo hard ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: ALL_TOOLS,
    pitch: 'Full AI: Google posts, content ideas, ads, and photos. Where most owners land.',
  },
  pro: {
    id: 'pro',
    label: 'Scale',
    priceCents: 14900,                    // $149/loc/mo
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: null,
    monthlyMessageLimit: null,
    monthlyCostCapCents: 20000,           // $200/mo soft ceiling (alerts admin)
    humanHoursPerMonth: 0,
    locationsLimit: null,
    enabledTools: ALL_TOOLS,
    pitch: 'Unlimited messages and locations. Multi-location dashboard. Priority queue.',
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
