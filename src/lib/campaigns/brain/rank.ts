/**
 * The bridge that lets the objective function drive the LIVE plan without touching the composer.
 *
 * buildSystem (compose-plan) already orders a system goal's plan by spec.aiMix — an ordered list
 * of serviceIds: it groups by stage, then within a stage orders by each id's position in the list.
 * So if we hand it a list ranked by EXPECTED LIFT on the goal's outcome, the live plan orders by
 * expected contribution, proven losers excluded, with no change to the pure composer. That is what
 * these two functions produce. Deterministic and pure.
 */
import { playsForGoalAtoms, type PlanGoal } from '../data/atom-plays'
import type { Tier } from '../data/priced-catalog'
import type { BrainSignals } from './signals'
import type { MeasuredLift } from './learning'
import { resolveOutcome, expectedLift, type Outcome } from './objective'

const TIER_RANK: Record<Tier, number> = { lean: 0, standard: 1, aggressive: 2 }

export interface RankOpts {
  excludeIds?: readonly string[]
  measured?: Record<string, MeasuredLift>
}

/** Best expected-lift score per serviceId for a goal (deduped across plays sharing an id). */
function liftByService(goal: PlanGoal, signals: BrainSignals, measured?: Record<string, MeasuredLift>): Map<string, number> {
  const outcome = resolveOutcome(goal, signals)
  const best = new Map<string, number>()
  for (const p of playsForGoalAtoms(goal)) {
    const s = expectedLift(p, outcome, signals, measured)
    const cur = best.get(p.serviceId)
    if (cur === undefined || s > cur) best.set(p.serviceId, s)
  }
  return best
}

/**
 * The full affordable candidate set for a goal, losers excluded, ranked by expected lift — as
 * ordered serviceIds for spec.aiMix. The deterministic plan the route leads with (and the fallback
 * when the AI is unavailable). Returns the resolved outcome too, for the owner-facing "built to…" line.
 */
export function brainRankedMix(goal: PlanGoal, tier: Tier, signals: BrainSignals, opts?: RankOpts): { mix: string[]; outcome: Outcome } {
  const rank = TIER_RANK[tier]
  const exclude = new Set(opts?.excludeIds ?? [])
  const best = new Map<string, number>()
  for (const p of playsForGoalAtoms(goal)) {
    if (TIER_RANK[p.minTier] > rank || exclude.has(p.serviceId)) continue
    const s = expectedLift(p, resolveOutcome(goal, signals), signals, opts?.measured)
    const cur = best.get(p.serviceId)
    if (cur === undefined || s > cur) best.set(p.serviceId, s)
  }
  // Tie-break by serviceId so the order is fully deterministic and agrees with rankMixByLift.
  const mix = [...best.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([id]) => id)
  return { mix, outcome: resolveOutcome(goal, signals) }
}

/**
 * Re-order an existing serviceId list (e.g. the AI's chosen subset) by expected lift. Unknown ids
 * keep their original relative position at the end. Lets the AI pick WHAT, the objective rank the ORDER.
 */
export function rankMixByLift(mix: string[], goal: PlanGoal, signals: BrainSignals, opts?: RankOpts): string[] {
  const score = liftByService(goal, signals, opts?.measured)
  return [...mix].sort((a, b) => (score.get(b) ?? -Infinity) - (score.get(a) ?? -Infinity) || a.localeCompare(b))
}
