/**
 * plan-gates — the gate refuses doomed plans, and only doomed plans.
 *
 * What this locks: the lead-time critical path per goal (frozen from the same SERVICE_TURNAROUND
 * numbers every timeline renders), the refuse/advise split, the silence rules (no date, generous
 * date, event goals, absent budget), and that every refusal carries a real alternative + a
 * pre-filled human escalation. The clock is injected, so these run identically forever.
 *
 * Run: npx tsx scripts/sim/plan-gates.ts
 */
import { Suite } from './lib'
import { planGates, goalLeadDays, businessDaysUntil, afterBusinessDays, talkToUsHref } from '../../src/lib/campaigns/builder/plan-gates'
import { planCostForGoal } from '../../src/lib/campaigns/builder/compose-plan'

const s = new Suite()
const TODAY = '2026-07-28' // a Tuesday; injected clock, never the real one

s.group('The critical path per goal is frozen (from real turnaround data)')
{
  const FROZEN: Record<string, number> = { firstvisit: 21, nights: 24, regulars: 21, reviews: 19 }
  for (const [goal, days] of Object.entries(FROZEN)) {
    s.check(`${goal}: ${days} business days`, goalLeadDays(goal) === days)
  }
  s.check('event goals yield 0 (no catalog turnaround for synthetic beats — deliberately silent)', goalLeadDays('promote-event') === 0)
}

s.group('Business-day arithmetic')
{
  s.check('Tue + 5 business days = next Tue', afterBusinessDays(TODAY, 5) === '2026-08-04')
  s.check('Tue → next Tue = 5 business days', businessDaysUntil(TODAY, '2026-08-04') === 5)
  s.check('a past date counts 0, never negative', businessDaysUntil(TODAY, '2026-07-20') === 0)
  s.check('weekends never count', businessDaysUntil('2026-07-31', '2026-08-03') === 1) // Fri → Mon
}

s.group('Lead time: refuse, advise, silence')
{
  // firstvisit needs 21 business days.
  const short = planGates({ goal: 'firstvisit', dateISO: '2026-08-04', budgetMonthly: null, todayISO: TODAY }) // 5 days
  s.check('5 of 21 days → REFUSE', short.length === 1 && short[0].severity === 'refuse')
  s.check('the refusal names the real earliest date', short[0]?.adjust?.value === afterBusinessDays(TODAY, 21))
  s.check('and pre-fills the strategist thread', talkToUsHref(short[0]).startsWith('/dashboard/messages?to=strategist&draft='))

  const tight = planGates({ goal: 'firstvisit', dateISO: '2026-08-18', budgetMonthly: null, todayISO: TODAY }) // 15 days
  s.check('15 of 21 days → ADVISE, not refuse', tight.length === 1 && tight[0].severity === 'advise')

  /* THE BOUNDARY, pinned exactly. The refuse line is ceil(21/2) = 11 business days: 10 refuses,
   * 11 advises. This pair is what catches a quietly moved threshold — the first negative-proof
   * run moved the line to lead/4 and every non-boundary case still passed. */
  const atTen = planGates({ goal: 'firstvisit', dateISO: '2026-08-11', budgetMonthly: null, todayISO: TODAY }) // 10 days
  s.check('10 of 21 days (just under half) → REFUSE', atTen.length === 1 && atTen[0].severity === 'refuse')
  const atEleven = planGates({ goal: 'firstvisit', dateISO: '2026-08-12', budgetMonthly: null, todayISO: TODAY }) // 11 days
  s.check('11 of 21 days (half) → ADVISE', atEleven.length === 1 && atEleven[0].severity === 'advise')

  s.check('a generous date fires nothing', planGates({ goal: 'firstvisit', dateISO: '2026-09-28', budgetMonthly: null, todayISO: TODAY }).length === 0)
  s.check('no date fires nothing (estimate mode is fine)', planGates({ goal: 'firstvisit', dateISO: null, budgetMonthly: null, todayISO: TODAY }).length === 0)
  s.check('event goals are honestly silent', planGates({ goal: 'promote-event', dateISO: '2026-07-30', budgetMonthly: null, todayISO: TODAY }).length === 0)
}

s.group('Budget floor: the lean tier is the smallest real version')
{
  const floor = planCostForGoal('firstvisit', 'lean').monthly
  s.check(`the lean floor is a real number ($${floor}/mo)`, floor > 0)
  const under = planGates({ goal: 'firstvisit', dateISO: null, budgetMonthly: Math.max(1, floor - 25), todayISO: TODAY })
  s.check('under the floor → REFUSE with the exact floor named', under.length === 1 && under[0].severity === 'refuse' && under[0].whatFits.includes(`$${floor}/mo`))
  s.check('the one-tap fix sets the budget to the floor', under[0]?.adjust?.kind === 'budget' && under[0]?.adjust?.value === String(floor))
  s.check('at the floor → silent', planGates({ goal: 'firstvisit', dateISO: null, budgetMonthly: floor, todayISO: TODAY }).length === 0)
  s.check('absent budget → silent (tier suggestion handles it)', planGates({ goal: 'firstvisit', dateISO: null, budgetMonthly: null, todayISO: TODAY }).length === 0)
  s.check('non-system goals never get a budget gate', planGates({ goal: 'promote-event', dateISO: null, budgetMonthly: 10, todayISO: TODAY }).length === 0)
}

s.group('Refusals always come with a way forward')
{
  const both = planGates({ goal: 'firstvisit', dateISO: '2026-07-30', budgetMonthly: 10, todayISO: TODAY })
  s.check('two doomed inputs → two gates, refusals first', both.length === 2 && both.every((g) => g.severity === 'refuse'))
  for (const g of both) {
    s.check(`${g.key}: whatFits is a real sentence`, g.whatFits.length > 30)
    s.check(`${g.key}: the talk draft asks a human a real question`, g.talkDraft.includes('?'))
    s.check(`${g.key}: no em dash in owner copy`, !g.headline.includes('—') && !g.whatFits.includes('—'))
  }
}

s.report('Plan gates')
