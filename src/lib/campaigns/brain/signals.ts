/**
 * BrainSignals — the full, honestly-wrapped signal set the best-plan brain reads about a business.
 *
 * This is the TYPE + the pure helpers over it (data-richness routing). The actual gathering from
 * the DB readers (getCampaignProfile, assembleSignals, getPlanningHistory, channel reality) is
 * assembleBrainSignals, wired in a later Phase 1 step because it needs live data. Every field is a
 * Reading, so a missing signal is explicit and can never be read as a real value.
 *
 * Pure, no IO.
 */
import { type Reading, missing } from './readiness'

export interface BrainSignals {
  // identity / profile (cheap, usually present after onboarding)
  priceRange: Reading<string>
  primaryGoal: Reading<string>
  cuisine: Reading<string>
  neighborhood: Reading<string>
  // reputation
  rating: Reading<number>
  ratingCount: Reading<number>
  listingCompleteness: Reading<number>
  complaintThemes: Reading<string[]>
  // reach / demand
  searchTerms: Reading<string[]>
  monthlyVisitors: Reading<number>
  // channels / list
  hasList: Reading<boolean>
  listSize: Reading<number>
  lapsedCount: Reading<number>
  connectedChannels: Reading<string[]>
  slowNights: Reading<string[]>
  // history (what worked / flopped for THIS business)
  droppedServiceIds: Reading<string[]>
  workingServiceIds: Reading<string[]>
  // budget
  monthlyBudget: Reading<number>
}

/** An all-missing signal set — the honest starting point and the safe default when we know nothing. */
export function emptySignals(): BrainSignals {
  return {
    priceRange: missing(), primaryGoal: missing(), cuisine: missing(), neighborhood: missing(),
    rating: missing(), ratingCount: missing(), listingCompleteness: missing(), complaintThemes: missing(),
    searchTerms: missing(), monthlyVisitors: missing(),
    hasList: missing(), listSize: missing(), lapsedCount: missing(), connectedChannels: missing(), slowNights: missing(),
    droppedServiceIds: missing(), workingServiceIds: missing(),
    monthlyBudget: missing(),
  }
}

/* The signals that actually MOVE a plan (identity fields like cuisine/price set tone but do not
 * by themselves justify the expensive tailored path). Data-richness is measured over these. */
const CORE_KEYS: (keyof BrainSignals)[] = [
  'rating', 'listingCompleteness', 'complaintThemes', 'searchTerms', 'monthlyVisitors',
  'hasList', 'connectedChannels', 'droppedServiceIds', 'workingServiceIds',
]

export interface Richness {
  usableCore: number
  totalCore: number
  isRich: boolean
}

/** How much real, plan-moving signal we have. Rich = enough to justify the tailored path. */
export function richness(s: BrainSignals, threshold = 3): Richness {
  // readiness 'usable' already implies a present value (reading() only marks present values usable),
  // so a direct readiness check avoids unifying the mixed Reading<T> union through the generic guard.
  const usableCore = CORE_KEYS.reduce((n, k) => n + (s[k].readiness === 'usable' ? 1 : 0), 0)
  return { usableCore, totalCore: CORE_KEYS.length, isRich: usableCore >= threshold }
}

export type PlanRoute = 'tailored' | 'safe'

/**
 * Data-richness routing (the audit's key safety fix): a thin-data business is hard-routed to the
 * deterministic SAFE plan rather than letting the AI reorder a plan on two or three null signals.
 * Rich businesses get the full TAILORED brain. The route is explicit, not an AI guess.
 */
export function planRoute(s: BrainSignals, threshold = 3): PlanRoute {
  return richness(s, threshold).isRich ? 'tailored' : 'safe'
}
