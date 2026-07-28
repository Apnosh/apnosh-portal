/**
 * MONTHLY SIGNALS — what the brain knows about THIS business, flattened for the monthly composer.
 *
 * The monthly plan recomposes client-side on every dial tick, so it can never call the brain per
 * recompose. Instead the page fetches the brain ONCE server-side (brain/derive-monthly.ts) and
 * hands the flow this plain, serializable subset. Absent entirely (thin data — the brain's safe
 * route — or any assembly failure) the composer behaves exactly as it did before signals existed;
 * that equivalence is a sim golden, not a hope.
 *
 * ADVISORY BY CONSTRUCTION. signalTilt feeds set-membership sort terms that sit BELOW `wanted`
 * (leverage) in rankedCandidates' chain: signals reorder ties, they never restructure the funnel.
 * The one packing-visible rule is the proven-loser demotion (M1), and even there a dropped
 * service stays ELIGIBLE for coverage — merely last among peers — so history can never produce
 * "more data, less plan".
 *
 * Every rule is keyed by SERVICE id, deliberately: the 1b vocabulary drift (goal-keyed maps vs
 * goalKey call sites, silently zero everywhere) cannot happen in a module with no goal keys in it.
 *
 * null means honestly unknown (the Reading was missing) and fires NOTHING — a null hasList is not
 * false (law 8: verified and claimed never share a field, and missing never reads as a value).
 *
 * Pure, client-safe, imports nothing from brain/.
 */

export interface MonthlySignals {
  /** Proven losers HERE: services this business ran that measurably flopped. */
  droppedServiceIds: string[]
  /** Proven winners HERE. */
  workingServiceIds: string[]
  rating: number | null
  /** 0-100 listing-health score, same unit the brain's signal-fit uses. */
  listingCompleteness: number | null
  hasList: boolean | null
  complaintThemes: string[]
  /** When the brain read these, for any "as of" rendering. */
  assembledAt: string
}

export interface SignalTilt {
  boost: Set<string>
  demote: Set<string>
  dropped: Set<string>
}

const EMPTY: SignalTilt = { boost: new Set(), demote: new Set(), dropped: new Set() }

const REPUTATION = ['review-engine', 'review-responses']
const DISCOVERY = ['local-seo', 'listings-sync', 'gbp-setup']
const SENDS = ['email-found', 'sms-found', 'welcome-seq', 'newsletter', 'sms-program', 'winback']
const PHOTO = ['photo-library', 'menu-photo-refresh']

/**
 * The bounded rules, M1-M6. Budget never enters here — the tilt is one fixed answer per signals
 * object, so ranking cannot vary across the dial (sim-locked: mutating this to read a budget
 * breaks the ranking-constant-across-dial check).
 */
export function signalTilt(s?: MonthlySignals): SignalTilt {
  if (!s) return EMPTY
  const boost = new Set<string>()
  const demote = new Set<string>()

  // M2 — what measurably worked here gets pulled up.
  for (const id of s.workingServiceIds) boost.add(id)

  // M3 — the rating decides how hard reputation work pulls. Same thresholds as the brain's R1/R2.
  if (s.rating != null) {
    if (s.rating < 4.3) for (const id of REPUTATION) boost.add(id)
    else if (s.rating >= 4.6) for (const id of REPUTATION) demote.add(id)
  }

  // M4 — a thin Google listing makes discovery fixes the lever. Same 70 threshold as R3.
  if (s.listingCompleteness != null && s.listingCompleteness <= 70) {
    for (const id of DISCOVERY) boost.add(id)
  }

  // M5 — a list decides build-vs-send. Null fires nothing.
  if (s.hasList === false) {
    boost.add('crm-list')
    for (const id of SENDS) demote.add(id)
  } else if (s.hasList === true) {
    for (const id of SENDS) boost.add(id)
  }

  // M6 — guests complaining about how the food LOOKS makes photo work the repair lane.
  if (s.complaintThemes.some((t) => /photo|menu|pic|look/i.test(t))) {
    for (const id of PHOTO) boost.add(id)
  }

  // A service can't be both: history's demotion (M3 high rating) loses to history's boost (M2
  // it worked here). Measured-here beats inferred-from-rating.
  for (const id of s.workingServiceIds) demote.delete(id)

  return { boost, demote, dropped: new Set(s.droppedServiceIds) }
}

/** Every field null/empty: must behave exactly like no signals at all (sim-pinned). */
export const ALL_NULL_SIGNALS: MonthlySignals = {
  droppedServiceIds: [],
  workingServiceIds: [],
  rating: null,
  listingCompleteness: null,
  hasList: null,
  complaintThemes: [],
  assembledAt: '',
}
