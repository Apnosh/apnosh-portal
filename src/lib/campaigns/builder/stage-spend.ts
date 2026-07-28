/**
 * stageSpend — where the money in a plan actually sits, stage by stage.
 *
 * The rollup that did not exist: every prior surface totals a plan as one number (summarize) or
 * two buckets (recurring vs one-time). Nothing could answer "how much of this plan is Be found
 * vs Keep them coming" — which is the question the split priors need answered.
 *
 * KEYED BY THE MOVES' STAGES, not the items': a LineItem.stage is the funnel StageId
 * ('aware'/'actions'/…), but the strategic structure of a system plan lives on draft.moves,
 * whose stage keys are the goal's own ('be-found', 'give-reason', 'lock', 'own', …). Items are
 * attributed to a stage through the move that put their service in the plan; items no move
 * claims (content beats, add-ons) land in 'other' rather than being silently dropped.
 *
 * Money rules match summarize() exactly: only included, non-opted-out lines count, at lineTotal
 * (which already zeroes DIY and guide-only lines). If this ever disagrees with the bill, the
 * bill is right and this is the bug.
 *
 * Pure, client-safe.
 */
import { lineTotal, type LineItem, type PlanMove } from '../types'

export interface StageSpendEntry {
  monthly: number
  oneTime: number
}

export const OTHER_STAGE = 'other'

export function stageSpend(items: LineItem[], moves: PlanMove[] | undefined): Record<string, StageSpendEntry> {
  const stageByService = new Map<string, string>()
  for (const m of moves ?? []) {
    // First move wins for a service that appears twice; the plan's own ordering is the tiebreak.
    if (!stageByService.has(m.serviceId)) stageByService.set(m.serviceId, m.stage)
  }

  const out: Record<string, StageSpendEntry> = {}
  for (const it of items) {
    if (!it.included || it.optOut) continue
    const total = lineTotal(it)
    if (total <= 0) continue
    const stage = stageByService.get(it.serviceId) ?? OTHER_STAGE
    const entry = (out[stage] ??= { monthly: 0, oneTime: 0 })
    if (it.cadence.kind === 'recurring' && it.cadence.every === 'monthly' && !it.paused) entry.monthly += total
    else entry.oneTime += total
  }
  return out
}

/** The plan's total monthly across all stages — the denominator for share arithmetic. */
export function totalMonthly(spend: Record<string, StageSpendEntry>): number {
  return Object.values(spend).reduce((n, e) => n + e.monthly, 0)
}
