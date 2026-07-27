/**
 * mechanisms — the rules a campaign is built around must be real, whole, and honest.
 *
 * A mechanism names catalog services by id, so the failure mode is the one this codebase keeps
 * producing: a beautifully authored rule pointing at work that does not exist, is held on a missing
 * rail, or silently disappears from the plan. These checks make each of those a build failure.
 *
 * The stage checks matter most. A mechanism with nothing under `found` is the exact mistake the
 * bake-off exposed — a brilliant offer nobody hears about — and it is invisible unless something
 * asserts it.
 *
 * Run: npx tsx scripts/sim/mechanisms.ts
 */

import { Suite } from './lib'
import { MECHANISMS, mechanismsFor, composeMechanism, mechanismById, reachNeeded } from '../../src/lib/campaigns/data/mechanisms'
import { PLAN_GOALS, SHAPES, SITUATIONS } from '../../src/lib/campaigns/data/plan-goals'
import { GENERATED_CATALOG } from '../../src/lib/campaigns/data/catalog.generated'
import { isServiceReady } from '../../src/lib/campaigns/data/service-availability'

const s = new Suite()
const CAT = GENERATED_CATALOG as unknown as { id: string; prices?: { amount?: number; kind?: string }[] }[]
const exists = (id: string) => CAT.some((x) => x.id === id)

// ---------------------------------------------------------------- real work
s.group('Every rule points at work that exists')
for (const m of MECHANISMS) {
  const ids = [...m.carriedBy.found, ...m.carriedBy.reason, ...m.carriedBy.easy]
  const ghosts = ids.filter((id) => !exists(id))
  s.check(`${m.id}: ${ids.length} services, all real`, ghosts.length === 0, ghosts.length ? `not in the catalog: ${ghosts.join(', ')}` : '')
}

s.group('Every rule can actually be carried today')
for (const m of MECHANISMS) {
  const held = [...m.carriedBy.found, ...m.carriedBy.reason, ...m.carriedBy.easy].filter((id) => !isServiceReady(id))
  /* Held work is allowed — it stays visible and unbilled. What is NOT allowed is a stage that is
   * entirely held, because then the rule has a leg it cannot stand on and nothing says so. */
  const dead = (['found', 'reason', 'easy'] as const).filter(
    (k) => m.carriedBy[k].length > 0 && m.carriedBy[k].every((id) => !isServiceReady(id)),
  )
  s.check(`${m.id}: no stage is entirely undeliverable`, dead.length === 0, dead.length ? `dead stages: ${dead.join(', ')}` : `${held.length} held line(s), visible and unbilled`)
}

// ---------------------------------------------------------------- whole
s.group('Every rule covers all three stages')
for (const m of MECHANISMS) {
  const f = m.carriedBy.found.length
  const r = m.carriedBy.reason.length
  const e = m.carriedBy.easy.length
  s.check(
    `${m.id}: found ${f} · reason ${r} · easy ${e}`,
    f > 0 && r > 0 && e > 0,
    'a rule missing a stage is the bake-off mistake: a great offer nobody hears about',
  )
}

s.group('Every rule can be counted, and says how')
for (const m of MECHANISMS) {
  s.check(`${m.id}: counts "${m.count.label}"`, !!m.count.label && !!m.count.when)
  s.check(`${m.id}: names what it costs you`, m.risks.length > 0, m.risks[0] ?? '')
  s.check(`${m.id}: says how to price the cap`, m.costModel.length > 20)
}

s.group('An early signal, or an honest admission there is none')
const withLeading = MECHANISMS.filter((m) => m.leading)
s.check(`${withLeading.length} of ${MECHANISMS.length} can be checked before the moment`, withLeading.length >= 10)
for (const m of withLeading) {
  s.check(`${m.id}: "${m.leading!.label}" · ${m.leading!.when}`, !!m.leading!.healthy, 'a leading number with no threshold is a number, not a signal')
}
const blind = MECHANISMS.filter((m) => !m.leading)
for (const m of blind) {
  s.check(
    `${m.id}: no early signal, and the risks say so`,
    m.risks.some((r) => /before the day|find out|early warning|morning/i.test(r)),
    'if it cannot be checked early the owner has to be told that, on the card',
  )
}

// ---------------------------------------------------------------- vocabulary
s.group('It speaks the same language as the rest of the builder')
const goalKeys = new Set(PLAN_GOALS.map((g) => g.key))
const shapeKeys = new Set(SHAPES.map((x) => x.v))
for (const m of MECHANISMS) {
  const badGoals = m.worksFor.filter((g) => !goalKeys.has(g))
  const badShapes = m.shapes.filter((x) => !shapeKeys.has(x))
  s.check(`${m.id}: goals are real`, badGoals.length === 0, badGoals.join(', '))
  s.check(`${m.id}: shapes are real`, badShapes.length === 0, badShapes.join(', '))
}

s.group('Every situation an owner can pick has a rule behind it')
for (const sit of SITUATIONS) {
  const g = PLAN_GOALS.find((x) => x.key === sit.goal)
  if (g?.state !== 'ready') { s.check(`${sit.v}: not sold, skipped`, true); continue }
  const fits = mechanismsFor([sit.goal], sit.shape)
  s.check(`${sit.v} (${sit.shape}) → ${fits.length} rule(s)`, fits.length > 0, fits.map((m) => m.id).join(', '))
}

// ---------------------------------------------------------------- composition
s.group('Composing is honest about money')
for (const m of MECHANISMS) {
  const p = composeMechanism(m)
  const all = [...p.stages.found, ...p.stages.reason, ...p.stages.easy]
  const heldBilled = all.filter((l) => l.held).reduce((n, l) => n + l.amount, 0)
  const manualStart = all.filter((l) => !l.held && l.kind !== 'monthly').reduce((n, l) => n + l.amount, 0)
  const manualMonthly = all.filter((l) => !l.held && l.kind === 'monthly').reduce((n, l) => n + l.amount, 0)
  s.check(`${m.id}: $${p.bill.start} + $${p.bill.monthly}/mo`, p.bill.start === manualStart && p.bill.monthly === manualMonthly)
  s.check(`${m.id}: held work is never billed (${heldBilled ? '$' + heldBilled + ' excluded' : 'none held'})`, true)
  s.check(`${m.id}: the rule reads as a sentence`, !p.rule.includes('{cap}') && p.rule.endsWith('.'), p.rule)
}

s.group('The free steps are real asks, not filler')
for (const m of MECHANISMS) {
  s.check(`${m.id}: ${m.freeActions.length} free step(s)`, m.freeActions.length > 0)
  const bad = m.freeActions.filter((a) => !a.minutes || a.minutes > 120 || !a.why || a.why.length < 30)
  s.check(`${m.id}: each has a real time and a real reason`, bad.length === 0, bad.map((a) => a.id).join(', '))
}
const everyFree = MECHANISMS.flatMap((m) => m.freeActions)
s.check(
  'at least one free step warns what it holds up',
  everyFree.some((a) => !!a.blocks),
  'a two-minute task blocking a $1,295 package is the top reason paid work stalls',
)

// ---------------------------------------------------------------- the brief
s.group('Yellowbee: the actual brief that started this')
const fits = mechanismsFor(['opening'], 'date')
s.check(`${fits.length} rules fit a dated opening`, fits.length >= 3, fits.map((m) => m.id).join(', '))
s.check('at least one of them can be checked early', fits.some((m) => !!m.leading))

const plan = composeMechanism(mechanismById('claim-show')!, { cap: 100 })
s.check('the rule carries the cap', plan.rule.includes('online now'), plan.rule)
s.check(`it reaches people who have never heard of them (${plan.stages.found.length} lines under found)`, plan.stages.found.length >= 5)
s.check('it gives them something to want', plan.stages.reason.length >= 2)
s.check('it makes turning up easy', plan.stages.easy.length >= 2)
s.check(`it asks ${plan.yourMinutes} minutes of the owner's own time`, plan.yourMinutes > 0 && plan.yourMinutes < 400)
s.check(`priced at $${plan.bill.start} + $${plan.bill.monthly}/mo + $${plan.bill.passThroughMonthly} pass-through`, plan.bill.start > 0)
s.check('and the ad spend is named separately', plan.bill.passThroughMonthly > 0, 'paid-ads is in this plan, so its platform minimum must show')

// ---------------------------------------------------------------- reach
s.group('The cap sizes the reach, and the assumptions are visible')
for (const m of MECHANISMS) {
  const r = m.reach
  s.check(`${m.id}: rates are possible (${(r.actRate * 100).toFixed(1)}% act, ${r.showRate * 100}% show)`,
    r.actRate > 0 && r.actRate <= 1 && r.showRate > 0 && r.showRate <= 1)
  s.check(`${m.id}: says why those numbers`, r.basis.length > 30, r.basis)
}

s.group('The funnel arithmetic holds')
for (const m of MECHANISMS) {
  const r = reachNeeded(m, m.cap.suggest)
  s.check(`${m.id}: ${r.cap} ← ${r.actsNeeded} acts ← ${r.seenNeeded} seen`,
    r.seenNeeded >= r.actsNeeded && r.actsNeeded >= r.cap,
    'you can never need fewer people to see it than to act on it')
  const bigger = reachNeeded(m, m.cap.suggest * 2)
  s.check(`${m.id}: a bigger cap needs more reach`, bigger.seenNeeded > r.seenNeeded)
}

s.group('We never guess what we have not been told')
for (const m of MECHANISMS.slice(0, 4)) {
  const blind = reachNeeded(m, m.cap.suggest)
  s.check(`${m.id}: no footfall given → no claim about their own reach`, blind.ownReach === null && blind.gap === null)
  const told = reachNeeded(m, m.cap.suggest, { dailyFootfall: 300 })
  s.check(`${m.id}: told 300/day → own reach counted, gap shrinks`,
    told.ownReach !== null && told.gap !== null && told.gap < told.seenNeeded)
}

s.group('The rule chosen changes the reach needed, a lot')
const opening = mechanismsFor(['opening'], 'date').map((m) => ({ id: m.id, seen: reachNeeded(m, m.cap.suggest).seenNeeded }))
const spread = Math.max(...opening.map((x) => x.seen)) / Math.min(...opening.map((x) => x.seen))
s.check(
  `${Math.round(spread)}x between the cheapest and dearest rule to reach`,
  spread > 5,
  opening.map((x) => `${x.id}:${x.seen}`).join('  ') + ' — this is the number that should drive the choice, and it was invisible before',
)

s.report('Mechanisms')
