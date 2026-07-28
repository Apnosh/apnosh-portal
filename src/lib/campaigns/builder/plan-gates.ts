/**
 * PLAN GATES — the strategist refusing to compose a doomed plan.
 *
 * The behavior this replaces, verbatim from the code it replaces: today the flow composes the
 * plan and THEN apologizes ("That date is sooner than the team can produce these. Pick a later
 * go live date.") — an amber note under a plan that was never going to happen. A strategist who
 * takes your money for a plan they know cannot land is not a strategist. Law of the plan of
 * record: a gate that fires does NOT compose a doomed plan; it says what fits instead, offers a
 * one-tap fix, and opens the door to a human.
 *
 * TWO GATES, because these are the two with honest data behind them today:
 *  - LEAD TIME, from the same SERVICE_TURNAROUND numbers every timeline already renders
 *    (business days, worst-case, critical path as max-not-sum).
 *  - BUDGET FLOOR, from the same catalog prices the plan itself would bill (the lean tier's
 *    monthly total is the smallest real version of the goal).
 * Reputation and capacity gates are deliberately absent: we do not yet hold data honest enough
 * to refuse on. They arrive when they can cite their source, not before.
 *
 * SEVERITY IS A PROMISE: 'refuse' means the plan screen is not shown; 'advise' rides into the
 * plan as a note. Every refusal carries whatFits (a real alternative), usually a one-tap adjust,
 * and a pre-filled talk-to-us draft for /dashboard/messages?to=strategist.
 *
 * Pure, client-safe. The fire point is builder-entry's handlePlan, BEFORE compose and plan-mix.
 */
import { playsForGoalAtoms, type PlanGoal } from '../data/atom-plays'
import { campaignTimelineSteps } from '../data/campaign-timeline'
import { planCostForGoal, isSystemGoal } from './compose-plan'

export interface PlanGate {
  key: 'lead-time' | 'budget-floor'
  severity: 'refuse' | 'advise'
  /** The plain-words headline: what does not fit. */
  headline: string
  /** The real alternative: what DOES fit. Never empty on a refusal. */
  whatFits: string
  /** A one-tap fix the panel can apply (patch vals and re-run). Null when only talking helps. */
  adjust: { label: string; kind: 'date' | 'budget'; value: string } | null
  /** Pre-fill for /dashboard/messages?to=strategist&draft=… — the door to a human. */
  talkDraft: string
}

export interface PlanGateInput {
  /** The resolved brain goal ('firstvisit' | 'nights' | ... | 'promote-event' | 'launch' | 'run-deal'). */
  goal: string
  /** The owner's wished-for date, ISO (YYYY-MM-DD), or null when they have none. */
  dateISO: string | null
  /** The owner's typed monthly number, or null/0 when they did not give one. */
  budgetMonthly: number | null
  /** Injected so the module stays pure and the sim controls the clock. */
  todayISO: string
}

/* ── time arithmetic, business days, matching aggregate-golive's counting ─────────────────────── */

const DAY = 24 * 60 * 60 * 1000

/** Business days from `fromISO` (exclusive) to `toISO` (inclusive). Negative when `to` is past. */
export function businessDaysUntil(fromISO: string, toISO: string): number {
  const from = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`).getTime()
  const to = new Date(`${toISO.slice(0, 10)}T00:00:00Z`).getTime()
  if (to <= from) return 0
  let n = 0
  for (let t = from + DAY; t <= to; t += DAY) {
    const dow = new Date(t).getUTCDay()
    if (dow !== 0 && dow !== 6) n++
  }
  return n
}

/** today + n business days, ISO. Mirrors aggregate-golive's addBusinessDays (kept local: that
 *  module is heavier and this one must stay import-light for the client bundle). */
export function afterBusinessDays(fromISO: string, n: number): string {
  const d = new Date(`${fromISO.slice(0, 10)}T00:00:00Z`)
  let added = 0
  while (added < n) {
    d.setTime(d.getTime() + DAY)
    const dow = d.getUTCDay()
    if (dow !== 0 && dow !== 6) added++
  }
  return d.toISOString().slice(0, 10)
}

/** The goal's worst-case critical path in business days, from the standard-tier play set run
 *  through the SAME timeline math every product page renders (max, never sum, worst gate). */
export function goalLeadDays(goal: string): number {
  const plays = playsForGoalAtoms(goal as PlanGoal)
  if (!plays.length) return 0
  const ids = [...new Set(plays.map((p) => p.serviceId))]
  const steps = campaignTimelineSteps(null, ids)
  return steps.reduce((m, s) => Math.max(m, s.whenDays ?? 0), 0)
}

const friendly = (iso: string): string =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })

const GOAL_WORD: Record<string, string> = {
  firstvisit: 'bringing in first visits',
  nights: 'filling your slow nights',
  regulars: 'turning guests into regulars',
  reviews: 'building up your reviews',
  'promote-event': 'promoting your event',
  launch: 'launching your special',
  'run-deal': 'running your deal',
}

/** All gates for this input, refusals first. Empty array = compose away. */
export function planGates(input: PlanGateInput): PlanGate[] {
  const gates: PlanGate[] = []
  const goalWord = GOAL_WORD[input.goal] ?? 'this plan'

  /* ── lead time ──────────────────────────────────────────────────────────────────────────────
   * No date → no gate: the estimate path schedules forward from today and nothing can be doomed.
   * TIGHT (inside the worst case but at least half of it) advises; SHORT of half refuses. The
   * half-line is deliberate: turnarounds are worst-case maxima, so a date inside the top half is
   * a push, and a date under half is a promise nobody should make. */
  /* Event goals (promote-event/launch/run-deal) yield lead 0 here: their plays are synthetic
   * beat ids with no catalog turnaround, so this gate stays honestly silent and the schedule
   * layer's own tooSoon handling (deriveSchedule, post-compose) keeps covering them. Giving them
   * a number here would be inventing one. */
  if (input.dateISO) {
    const lead = goalLeadDays(input.goal)
    const have = businessDaysUntil(input.todayISO, input.dateISO)
    if (lead > 0 && have < lead) {
      const earliest = afterBusinessDays(input.todayISO, lead)
      if (have < Math.ceil(lead / 2)) {
        gates.push({
          key: 'lead-time',
          severity: 'refuse',
          headline: `${friendly(input.dateISO)} is too soon for ${goalWord}. The work takes about ${lead} business days.`,
          whatFits: `${friendly(earliest)} is the earliest date we can stand behind. Or we can trim the plan to only the fastest pieces and talk through the rest.`,
          adjust: { label: `Aim for ${friendly(earliest)}`, kind: 'date', value: earliest },
          talkDraft: `I want help ${goalWord} by ${friendly(input.dateISO)}, but the full plan takes about ${lead} business days. What would you do in my shoes?`,
        })
      } else {
        gates.push({
          key: 'lead-time',
          severity: 'advise',
          headline: `${friendly(input.dateISO)} is tight for the full build.`,
          whatFits: `We start right away and front-load the fastest pieces. ${friendly(earliest)} is the comfortable date.`,
          adjust: { label: `Aim for ${friendly(earliest)}`, kind: 'date', value: earliest },
          talkDraft: `My date for ${goalWord} is ${friendly(input.dateISO)} and I hear it is tight. What should I expect?`,
        })
      }
    }
  }

  /* ── budget floor ───────────────────────────────────────────────────────────────────────────
   * Only for system goals (event goals price from composed beats, not the catalog) and only when
   * the owner actually typed a number. Zero/absent budget → the tier suggester handles it.
   * The floor is the LEAN tier's monthly bill: the smallest version of this goal that is real. */
  if (isSystemGoal(input.goal) && typeof input.budgetMonthly === 'number' && input.budgetMonthly > 0) {
    const lean = planCostForGoal(input.goal, 'lean')
    if (lean.monthly > 0 && input.budgetMonthly < lean.monthly) {
      gates.push({
        key: 'budget-floor',
        severity: 'refuse',
        headline: `$${input.budgetMonthly}/mo is under what ${goalWord} really costs.`,
        whatFits: `The smallest real version is about $${lean.monthly}/mo. Below that we would be selling you activity, not results. There are also free moves you can run yourself, and we will show you those either way.`,
        adjust: { label: `Set budget to $${lean.monthly}/mo`, kind: 'budget', value: String(lean.monthly) },
        talkDraft: `My budget is $${input.budgetMonthly}/mo and the smallest plan for ${goalWord} is about $${lean.monthly}/mo. What would you prioritize first?`,
      })
    }
  }

  return gates.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'refuse' ? -1 : 1))
}

/** The deep-link the gate panel opens: the strategist thread with the ask pre-filled. */
export function talkToUsHref(gate: PlanGate): string {
  return `/dashboard/messages?to=strategist&draft=${encodeURIComponent(gate.talkDraft)}`
}
