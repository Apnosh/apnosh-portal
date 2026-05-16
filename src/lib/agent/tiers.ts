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

const READ_ONLY_TOOLS = [
  'search_business_data',
  'weekly_recap',
  'request_human_help',
]

export const TIERS: Record<TierId, TierSpec> = {
  starter: {
    id: 'starter',
    label: 'Starter',
    priceCents: 0,
    isFreeTrial: true,
    trialDays: 30,
    dailyMessageLimit: 10,
    monthlyMessageLimit: 50,
    monthlyCostCapCents: 1000,           // $10/mo hard ceiling
    humanHoursPerMonth: 0,
    locationsLimit: 1,
    enabledTools: READ_ONLY_TOOLS,        // intentional: read-only during trial
    pitch: 'See what Apnosh AI can do for you. Read-only access for 30 days.',
  },
  basic: {
    id: 'basic',
    label: 'Basic',
    priceCents: 19900,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 30,
    monthlyMessageLimit: 200,
    monthlyCostCapCents: 3000,            // $30/mo hard ceiling
    humanHoursPerMonth: 1,
    locationsLimit: 1,
    enabledTools: ALL_TOOLS,
    pitch: 'Single-location, owner-driven. Everything wired up.',
  },
  standard: {
    id: 'standard',
    label: 'Standard',
    priceCents: 49900,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: 100,
    monthlyMessageLimit: 1000,
    monthlyCostCapCents: 15000,           // $150/mo hard ceiling
    humanHoursPerMonth: 4,
    locationsLimit: 3,
    enabledTools: ALL_TOOLS,
    pitch: 'Up to 3 locations. More strategist hours. Where most clients land.',
  },
  pro: {
    id: 'pro',
    label: 'Pro',
    priceCents: 99900,
    isFreeTrial: false,
    trialDays: 0,
    dailyMessageLimit: null,
    monthlyMessageLimit: null,
    monthlyCostCapCents: 50000,           // $500/mo soft ceiling (alerts admin)
    humanHoursPerMonth: 12,
    locationsLimit: null,
    enabledTools: ALL_TOOLS,
    pitch: 'Unlimited messages. Unlimited locations. Priority strategist queue.',
  },
}

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
