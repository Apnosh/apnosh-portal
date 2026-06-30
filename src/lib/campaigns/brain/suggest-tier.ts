/**
 * suggestTier — a real, editable budget-tier suggestion.
 *
 * The audit found tierFor returns Standard unconditionally when budget is null, which is the
 * common case (the onboarding wizard never writes a budget). So the whole budget-fit + dial layer
 * runs against a constant the owner never saw. This proposes a starting tier from what we DO know
 * (an explicit budget if present, else price band + goal), to be shown as a pre-filled, editable
 * default with a plain reason. It is a SUGGESTION the owner confirms, never a silent number.
 *
 * Pure, no IO.
 */
import type { Tier } from '../data/priced-catalog'

export interface TierProfile {
  /** Explicit monthly marketing budget in dollars, if we have one. Wins when present. */
  monthlyBudget?: number | null
  /** Price band as dollar signs: '$' | '$$' | '$$$' | '$$$$'. */
  priceRange?: string | null
  /** The owner's primary goal text. */
  primaryGoal?: string | null
  /** Whether they have a usable guest list (a list lets them do more for less). */
  hasList?: boolean | null
}

export interface TierSuggestion {
  tier: Tier
  /** Owner-facing one-liner explaining the suggestion. No em dashes. */
  reason: string
  /** True when derived from a real entered budget (high confidence) vs inferred from the profile. */
  fromBudget: boolean
}

/** Suggest a starting tier. Editable by the owner; never the final word. */
export function suggestTier(p: TierProfile): TierSuggestion {
  // An explicit budget wins and maps on the same thresholds tierFor already uses.
  if (typeof p.monthlyBudget === 'number' && p.monthlyBudget > 0) {
    const b = Math.round(p.monthlyBudget)
    const tier: Tier = b < 250 ? 'lean' : b < 700 ? 'standard' : 'aggressive'
    return { tier, reason: `From the about $${b} a month you set as your budget.`, fromBudget: true }
  }

  // No budget yet: infer a sensible default from price band + goal. Higher check averages have
  // more room to spend; acquisition goals (reaching new people) justify more than retention.
  const price = (p.priceRange || '').trim()
  const dollars = (price.match(/\$/g) || []).length
  const goal = (p.primaryGoal || '').toLowerCase()
  const acquisition = /\bnew\b|acquir|grow|first|traffic|awareness|event|launch|discover/.test(goal)

  let tier: Tier = 'standard'
  if (dollars === 1) tier = 'lean'
  else if (dollars >= 3 && acquisition) tier = 'aggressive'

  const reason = `A starting point from your ${price || 'price'} range${goal ? ' and your goal' : ''}. You can change it any time.`
  return { tier, reason, fromBudget: false }
}
