/**
 * DATE FEASIBILITY — the calendar's tints, from the same numbers the plan refuses on.
 *
 * The design plan (docs/QUESTION-DESIGN-PLAN.md, P3): when the walk asks for a date, the
 * quality of each answer is visible before the tap. Gray days are too soon to do the work
 * right; amber is tight; plain is comfortable. The thresholds are NOT authored here — they
 * derive from the picked goal's candidate services and their real turnarounds, the same
 * critical-path rule the timeline renders (max, never a sum), and the same refuse/advise
 * split plan-gates uses (refuse under half the lead, advise under the full lead). The
 * calendar and the gate can never disagree, and the sim pins that.
 *
 * Pure: no React, no Date.now — the caller supplies today.
 */
import { SERVICE_TURNAROUND } from './service-turnaround'
import { candidatesForGoal } from './plan-goals'
import { afterBusinessDays, businessDaysUntil } from '../builder/plan-gates'

/**
 * Business days of work on the critical path for this goal: the slowest setup or creative
 * service among its candidates. Recurring services do not gate a start date. A goal with no
 * turnaround data gets an honest 10-day floor rather than pretending zero.
 */
export function goalWorkDays(goal: string): number {
  let max = 0
  for (const c of candidatesForGoal(goal)) {
    const t = SERVICE_TURNAROUND[c.id]
    if (!t) continue
    if (t.class === 'setup' || t.class === 'creative') max = Math.max(max, t.business.max)
  }
  return max || 10
}

export type DayFit = 'too-soon' | 'tight' | 'ok'

export interface Feasibility {
  /** business days of critical-path work */
  leadDays: number
  /** first day that is merely tight (under this, the gate would refuse) */
  firstTight: string
  /** first comfortable day (under this, the gate would advise) */
  firstComfortable: string
}

export function feasibilityFor(goal: string, todayISO: string): Feasibility {
  const lead = goalWorkDays(goal)
  return {
    leadDays: lead,
    firstTight: afterBusinessDays(todayISO, Math.ceil(lead / 2)),
    firstComfortable: afterBusinessDays(todayISO, lead),
  }
}

/** The same split as planGates: refuse under half the lead, advise under the lead. */
export function classifyDay(dayISO: string, goal: string, todayISO: string): DayFit {
  const lead = goalWorkDays(goal)
  const days = businessDaysUntil(todayISO, dayISO)
  return days < Math.ceil(lead / 2) ? 'too-soon' : days < lead ? 'tight' : 'ok'
}
