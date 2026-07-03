/**
 * Pure verdict logic — the honest heir to the deleted mock perf.ts. Given a REAL
 * outcome reading, returns an owner-facing readout. No DB, no I/O, unit-testable.
 *
 * HARD RULE: when has_data is false this returns the gathering state, NEVER a
 * fabricated number. Thresholds are a product judgment kept in this one pure place
 * and biased to 'watch', so the planner never drops a line on thin evidence.
 */

export type Verdict = 'working' | 'watch' | 'drop'

export interface OutcomeReading {
  hasData: boolean
  attribution: 'per_post' | 'window_lift' | 'none'
  metricLabel?: string | null
  reach?: number | null
  interactions?: number | null
  /** interactions / reach, 0..1 — the per-post quality signal. */
  engagementRate?: number | null
  /** signed normalized channel lift (window_lift), e.g. +0.18 = +18% vs the pre-window. */
  metricDelta?: number | null
}

export interface VerdictReadout {
  gathering: boolean
  verdict: Verdict | null
  /** owner-facing REAL number, e.g. "4.2k reached" — null while gathering. */
  value: string | null
  up: boolean | null
  plain: string
}

/* View types for the owner-facing outcomes surface. Defined here (a pure module) so
 * client components can import them without pulling in the server-only reader. */
export interface PieceOutcome {
  draftId: string
  pieceKey: string | null
  /** a short owner-facing label for the piece, when known. */
  label: string | null
  state: 'live' | 'gathering'
  reach: number | null
  interactions: number | null
  /** the real published post URL (social_posts.permalink), when the platform gives one — null for
   *  GBP posts (no social row) and for any piece whose row has no permalink. Never synthesized. */
  link: string | null
  /** production stage from the piece's real content_drafts.status (never a metric state). */
  lifecycle: 'making' | 'scheduled' | 'posted'
  /** when the piece actually posted (content_drafts.published_at), null until it posts. Real, per-piece. */
  publishedAtISO: string | null
  /** taps on the piece's tracked short link (/r/[code]) — first-party, per-piece,
   *  never modeled. null when the piece has no tracked link. */
  clicks: number | null
  readout: VerdictReadout
}

/** A campaign-scoped before/after proof — the channel metric in the settled window AFTER the campaign
 *  vs a matched window before. Correlation, not causation (client-level daily metrics), so it is only
 *  ever set on the window_lift path and always labeled "since this campaign started". */
export interface WindowProof {
  metricLabel: string
  before: number
  after: number
  days: number
}

export interface CampaignOutcomes {
  pieces: PieceOutcome[]
  /** True once at least one piece has a real reading — drives "results are in" vs "still gathering". */
  anyData: boolean
  rollup: VerdictReadout
  /** Concrete before/after context for the window_lift path only; null otherwise (per_post has no baseline). */
  proof: WindowProof | null
}

// Conservative starting thresholds (tunable in one place). Engagement-rate bands
// reflect typical social benchmarks; bias to 'watch' so a line is never condemned early.
const ENGAGEMENT_WORKING = 0.06
const ENGAGEMENT_DROP = 0.015
const MIN_REACH_SAMPLE = 200   // below this, too few people to judge — hold at 'watch' whatever the ER
const LIFT_WORKING = 0.10

export function fmt(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return String(Math.round(n))
}

export function computeVerdict(r: OutcomeReading): VerdictReadout {
  if (!r.hasData) return { gathering: true, verdict: null, value: null, up: null, plain: 'Still gathering. Results land a few days after it posts.' }

  if (r.attribution === 'per_post') {
    const reach = r.reach ?? 0
    const interactions = r.interactions ?? 0
    const er = r.engagementRate ?? (reach > 0 ? interactions / reach : 0)
    // Sample floor: too few people to judge — 6% ER on 85 reach is a handful of taps,
    // not a signal, so below the floor the verdict holds at 'watch' regardless of ER.
    // Zero-reach behavior is unchanged (it sat at 'watch' before the floor too): a
    // 0-reach reading is often just un-synced metrics, and 'drop' still requires real
    // reach to judge against, honoring the bias-to-watch intent.
    const verdict: Verdict = reach < MIN_REACH_SAMPLE ? 'watch' : er >= ENGAGEMENT_WORKING ? 'working' : er <= ENGAGEMENT_DROP ? 'drop' : 'watch'
    const value = reach > 0 ? `${fmt(reach)} reached` : `${fmt(interactions)} interactions`
    const plain = verdict === 'working' ? 'Landing well. Strong engagement.'
      : verdict === 'drop' ? 'Quiet so far. Low engagement for the reach it got.'
      : 'Early read, holding. Give it another week.'
    return { gathering: false, verdict, value, up: verdict !== 'drop', plain }
  }

  // window_lift: a channel-level CORRELATION, never alone a 'drop' (per the design's
  // honesty rule — a dip near a publish date can be seasonality or an overlapping campaign).
  const d = r.metricDelta ?? 0
  const verdict: Verdict = d >= LIFT_WORKING ? 'working' : 'watch'
  const pct = Math.round(d * 100)
  const value = `${pct >= 0 ? '+' : ''}${pct}% ${r.metricLabel ?? 'activity'}`
  const plain = d >= LIFT_WORKING ? 'Up since this campaign started.' : 'Channel-level read, watching the trend.'
  return { gathering: false, verdict, value, up: d >= 0, plain }
}
