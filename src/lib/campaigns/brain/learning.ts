/**
 * The learning loop — how the catalog turns expert priors into measured lift over time.
 *
 * The audit's compounding insight: outcomes today only DEMOTE (a blocklist); nothing learns what
 * WORKS. And "best" is unfalsifiable without a prediction to check. This module is the math that
 * fixes both, honestly: a play's effectiveness starts as the seeded expert weight (the prior),
 * and as real outcomes accrue for a business (or its cuisine-and-price cohort) the measured
 * win-rate gradually takes over via Bayesian shrinkage. With little data the prior stands; with a
 * lot, the data wins. The cold-start case (n=0) is exactly today's plan, so nothing regresses.
 *
 * Pure, no IO. The DB side (a measured-lift/forecast table + the nightly write-back job + the
 * cohort reader) is deferred: it needs the live database and real accumulated outcomes.
 */

/** A measured-effectiveness estimate for a play, on the SAME 0..100 scale as the seeded weight,
 *  so the two are directly blendable. n = how many real readings back it. */
export interface MeasuredLift {
  score: number
  n: number
}

/** One outcome reading, from campaign_outcomes (this business's, or a cohort's). */
export interface OutcomeReading {
  serviceId: string
  verdict: 'working' | 'watch' | 'drop'
}

/**
 * Build a measured-lift estimate per serviceId from outcome readings. score = win-rate
 * (working / total) scaled to 0..100; n = number of readings. Works for a single business's
 * history or a pooled cohort (cuisine x price band x goal) — the caller decides which rows to pass.
 */
export function measuredLiftFrom(rows: OutcomeReading[]): Record<string, MeasuredLift> {
  const agg: Record<string, { w: number; t: number }> = {}
  for (const r of rows) {
    const a = (agg[r.serviceId] ??= { w: 0, t: 0 })
    a.t += 1
    if (r.verdict === 'working') a.w += 1
  }
  const out: Record<string, MeasuredLift> = {}
  for (const [id, a] of Object.entries(agg)) out[id] = { score: a.t ? (a.w / a.t) * 100 : 0, n: a.t }
  return out
}

/** Evidence weight of the seeded prior, in "readings". Higher = trust the expert weight longer
 *  before measured data takes over. 5 means it takes ~5 real readings to start moving the needle. */
export const PRIOR_STRENGTH = 5

/**
 * Blend the seeded expert prior with measured data by evidence (Bayesian shrinkage toward the
 * prior). No measured data -> the seeded weight stands (cold start = today's plan). As readings
 * accumulate, the measured win-rate takes over smoothly.
 */
export function blendLift(seeded: number, measured?: MeasuredLift, priorStrength = PRIOR_STRENGTH): number {
  if (!measured || measured.n <= 0) return seeded
  return (seeded * priorStrength + measured.score * measured.n) / (priorStrength + measured.n)
}

/** Fold one new realized outcome into a running estimate (incremental, so the nightly job can
 *  update in place). worked = did this play land (a 'working' verdict). */
export function foldOutcome(prev: MeasuredLift | undefined, worked: boolean): MeasuredLift {
  const n = (prev?.n ?? 0) + 1
  const priorWins = prev ? (prev.score / 100) * prev.n : 0
  const wins = priorWins + (worked ? 1 : 0)
  return { score: (wins / n) * 100, n }
}

/** How much to trust a measured estimate — drives honest forecast confidence + UI ("as of") copy.
 *  prior: not enough data, the expert weight rules. learning: data is starting to count.
 *  measured: enough readings to lead. */
export type Basis = 'prior' | 'learning' | 'measured'
export function basisOf(measured?: MeasuredLift): Basis {
  if (!measured || measured.n < 3) return 'prior'
  if (measured.n < 10) return 'learning'
  return 'measured'
}
