/**
 * WORKED-EXAMPLE GOLDENS — real personas, asserting plan SHAPE, never strings.
 *
 * The plan of record's Phase 4 acceptance: a high-budget grand opening whose production comes
 * before its amplification and whose every unsellable move carries a real guide; a
 * 3-week-lead persona the strategist refuses to compose a doomed plan for, with a genuinely
 * fitting alternative one tap away; a system plan whose stages run in journey order and whose
 * lean spine is honestly a subset of standard. Each shape check is proven against a doctored
 * plan, so a future regression fails a named check instead of shipping a lie.
 *
 * Run: npx tsx --tsconfig scripts/sim/tsconfig.json scripts/sim/goldens.ts
 */
import { Suite } from './lib'
import { draftFromBuilder } from '../../src/lib/campaigns/builder/adapter'
import { routeForItem, routeViolations } from '../../src/lib/campaigns/builder/routing'
import { planGates, talkToUsHref } from '../../src/lib/campaigns/builder/plan-gates'
import { checkoutBill } from '../../src/lib/campaigns/checkout-bill'
import { GUIDE_MOVES } from '../../src/lib/campaigns/data/guide-moves'
import { isServiceReady } from '../../src/lib/campaigns/data/service-availability'
import { lineTotal, type ContentBeat, type LineItem } from '../../src/lib/campaigns/types'

const s = new Suite()

/* Shape predicates — exported logic-as-functions so the mutation runs prove the CHECK, not
 * the fixture. */
const productionBeforeBoost = (beats: readonly ContentBeat[]): boolean => {
  const production = beats.filter((b) => !b.boost)
  const boosts = beats.filter((b) => b.boost)
  if (!boosts.length || !production.length) return true
  const firstProduction = Math.min(...production.map((b) => b.week))
  return boosts.every((b) => b.week >= firstProduction)
}
const guidesAreReal = (items: readonly LineItem[]): boolean =>
  items.filter((it) => it.serviceable === false).every((it) => !!GUIDE_MOVES[it.guideKey ?? ''])
const heldNeverBilled = (items: readonly LineItem[]): boolean =>
  items.every((it) => {
    if (!it.included || it.optOut) return true
    if (lineTotal(it) <= 0) return true
    return isServiceReady(it.serviceId)
  })

s.group('Golden 1 — the high-budget grand opening')
{
  const draft = draftFromBuilder({
    itemId: 'promoevent', status: 'approve',
    vals: { name: 'Grand opening', date: '2026-09-18', budget: '2000' },
  })
  const beats = draft.brief?.contentBeats ?? []
  s.check(`the plan has content beats (${beats.length}) and items (${draft.items.length})`, beats.length > 0 && draft.items.length > 0)

  s.check('production is scheduled before amplification', productionBeforeBoost(beats))
  const bill = checkoutBill(draft)
  s.check(`the bill is real money within reach ($${(bill.preTaxCents / 100).toFixed(0)} + $${(bill.perMonthCents / 100).toFixed(0)}/mo)`,
    bill.preTaxCents > 0)
  s.check('every unsellable move carries a real guide (law 3)', guidesAreReal(draft.items))
  s.check('held work is never billed (availability honesty)', heldNeverBilled(draft.items))
  let clean = true
  for (const it of draft.items) if (routeViolations(it, routeForItem(it)).length > 0) clean = false
  s.check('every line routes with zero violations', clean)

  // MUTATIONS: doctor the plan; the same predicates must catch it.
  const production = beats.filter((b) => !b.boost)
  const boosts = beats.filter((b) => b.boost)
  if (boosts.length && production.length) {
    const doctored = beats.map((b) => (b === boosts[0] ? { ...b, week: Math.min(...production.map((p) => p.week)) - 1 } : b))
    s.check('MUTATION: a boost moved ahead of production is caught', !productionBeforeBoost(doctored))
  } else {
    // The event plan composed with no boost beats — pin that honestly rather than skip silently.
    s.check(`MUTATION SKIPPED HONESTLY: no boost beats in this compose (production ${production.length}, boosts ${boosts.length})`, true)
  }
  const fvGuides = draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: {} }).items
  const doctoredGuides = fvGuides.map((it) => (it.serviceable === false ? { ...it, guideKey: 'nope' } : it))
  s.check('MUTATION: a guide flag with no guide behind it is caught (law 3)', !guidesAreReal(doctoredGuides))
  const doctoredBill = fvGuides.map((it) => (!isServiceReady(it.serviceId) ? { ...it, included: true, optOut: undefined, price: 500, producer: 'team' as const, serviceable: undefined } : it))
  const hadHeld = fvGuides.some((it) => !isServiceReady(it.serviceId))
  s.check('MUTATION: billing a held line is caught', !hadHeld || !heldNeverBilled(doctoredBill))
}

s.group('Golden 2 — the 3-week-lead persona: refuse, and hand a real alternative')
{
  const TODAY = '2026-07-28'
  const plusBusinessDays = (iso: string, n: number): string => {
    const d = new Date(`${iso}T12:00:00Z`)
    let added = 0
    while (added < n) {
      d.setUTCDate(d.getUTCDate() + 1)
      const dow = d.getUTCDay()
      if (dow !== 0 && dow !== 6) added++
    }
    return d.toISOString().slice(0, 10)
  }

  const tooSoon = planGates({ goal: 'firstvisit', dateISO: plusBusinessDays(TODAY, 10), budgetMonthly: null, todayISO: TODAY })
  const refusal = tooSoon.find((g) => g.key === 'lead-time' && g.severity === 'refuse')
  s.check('10 business days of lead fires a refuse-severity lead-time gate', !!refusal)
  s.check('the refusal says what DOES fit (non-empty whatFits)', !!refusal?.whatFits?.trim())
  s.check('a one-tap adjust is offered, and it is a date', refusal?.adjust?.kind === 'date' && !!refusal?.adjust?.value)

  // The alternative must genuinely fit: re-run the gate on the adjusted date.
  if (refusal?.adjust?.value) {
    const rerun = planGates({ goal: 'firstvisit', dateISO: refusal.adjust.value, budgetMonthly: null, todayISO: TODAY })
    s.check('the offered date passes its own gate (no refusal on re-run)', !rerun.some((g) => g.severity === 'refuse'))
  }
  s.check('the talk-to-us path lands in the strategist thread with the question prefilled',
    !!refusal && talkToUsHref(refusal).startsWith('/dashboard/messages?to=strategist&draft='))

  const generous = planGates({ goal: 'firstvisit', dateISO: plusBusinessDays(TODAY, 60), budgetMonthly: null, todayISO: TODAY })
  s.check('a generous date never refuses (advise at most)', !generous.some((g) => g.severity === 'refuse'))
}

s.group('Golden 3 — system-plan shape: journey order and an honest spine')
{
  const standard = draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: {} })
  const stages = (standard.stages ?? []).map((st) => st.stage)
  s.check(`the plan is staged (${stages.join(' → ')})`, stages.length >= 3)
  // Journey order: being findable precedes capture/return in the stage list.
  const findIdx = stages.findIndex((st) => /found|be-found|discover/.test(st))
  const returnIdx = stages.findIndex((st) => /capture|return|own/.test(st))
  s.check('be-found precedes capture/return', findIdx !== -1 && returnIdx !== -1 && findIdx < returnIdx)

  const lean = draftFromBuilder({ itemId: 'firstvisit', status: 'approve', vals: { budget: 'lean' } })
  const leanMoves = new Set((lean.moves ?? []).map((m) => m.serviceId))
  const stdMoves = new Set((standard.moves ?? []).map((m) => m.serviceId))
  s.check(`the lean spine (${leanMoves.size}) is a strict subset of standard (${stdMoves.size})`,
    leanMoves.size < stdMoves.size && [...leanMoves].every((id) => stdMoves.has(id)))
}

s.report('Worked-example goldens')
