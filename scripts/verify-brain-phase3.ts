/* DEV verification for best-plan-brain Phase 3 (the learning loop, offline):
 *  - measuredLiftFrom turns outcome rows into per-service win-rate + n
 *  - blendLift shrinks toward the prior with little data, toward measured with a lot
 *  - foldOutcome updates incrementally; basisOf reports honest confidence
 *  - expectedLift prefers measured lift when present, and is unchanged with none (Phase 2 parity)
 * Exits non-zero on any failure. */
import { measuredLiftFrom, blendLift, foldOutcome, basisOf, type MeasuredLift } from '../src/lib/campaigns/brain/learning'
import { resolveOutcome, expectedLift, liftScorer } from '../src/lib/campaigns/brain/objective'
import { emptySignals } from '../src/lib/campaigns/brain/signals'
import { EVENT_PLAYS } from '../src/lib/campaigns/data/atom-plays'
import { buildFromAtoms } from '../src/lib/campaigns/builder/build-from-atoms'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }
const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps

console.log('\n== measuredLiftFrom ==')
const m = measuredLiftFrom([
  { serviceId: 'A', verdict: 'working' }, { serviceId: 'A', verdict: 'working' }, { serviceId: 'A', verdict: 'drop' },
  { serviceId: 'B', verdict: 'drop' },
])
ok(near(m.A.score, 66.67, 0.1) && m.A.n === 3, 'A: 2 of 3 worked -> ~66.7 score, n=3')
ok(m.B.score === 0 && m.B.n === 1, 'B: 0 of 1 -> score 0, n=1')

console.log('\n== blendLift (shrinkage) ==')
ok(blendLift(20, undefined) === 20, 'no measured -> seeded prior stands')
ok(blendLift(20, { score: 90, n: 0 }) === 20, 'zero readings -> seeded prior stands')
ok(near(blendLift(20, { score: 80, n: 100 }), 77.14, 0.1), 'lots of readings -> close to measured (77.1)')
const mid = blendLift(20, { score: 80, n: 5 })
ok(mid > 20 && mid < 80, 'some readings -> between prior and measured')

console.log('\n== foldOutcome + basisOf ==')
const f1 = foldOutcome(undefined, true)
ok(f1.score === 100 && f1.n === 1, 'first win -> 100, n=1')
const f2 = foldOutcome(f1, false)
ok(f2.score === 50 && f2.n === 2, 'then a miss -> 50, n=2')
ok(basisOf(undefined) === 'prior', 'no data -> prior')
ok(basisOf({ score: 70, n: 4 }) === 'learning', '4 readings -> learning')
ok(basisOf({ score: 70, n: 12 }) === 'measured', '12 readings -> measured')

console.log('\n== expectedLift uses measured lift ==')
const reel = EVENT_PLAYS.find((p) => p.serviceId === 'evt-reel')!
const att = resolveOutcome('promote-event')
const empty = emptySignals()
const baseNoData = expectedLift(reel, att, empty)
const high: Record<string, MeasuredLift> = { 'evt-reel': { score: 100, n: 100 } }
const low: Record<string, MeasuredLift> = { 'evt-reel': { score: 0, n: 100 } }
ok(expectedLift(reel, att, empty, high) > baseNoData, 'a play that measurably wins here ranks higher')
ok(expectedLift(reel, att, empty, low) < baseNoData, 'a play that measurably loses here ranks lower')
ok(expectedLift(reel, att, empty, {}) === baseNoData, 'empty measured map -> unchanged (cold start = Phase 2)')
ok(expectedLift(reel, att, empty) === baseNoData, 'no measured arg -> unchanged (Phase 2 parity)')

console.log('\n== engine: measured lift reorders, parity without it ==')
const spec = { budget: '1000' }
const baseline = buildFromAtoms('firstvisit', spec)
// Give every play a low measured score except one mid-pack service, which should float up.
const target = baseline.atomMoves.find((p) => !p.crucial)!.serviceId
const measured: Record<string, MeasuredLift> = {}
for (const p of baseline.atomMoves) measured[p.serviceId] = { score: p.serviceId === target ? 100 : 5, n: 50 }
const learned = buildFromAtoms('firstvisit', spec, { scoreOf: liftScorer(resolveOutcome('firstvisit'), emptySignals(), measured) })
ok(JSON.stringify(learned.moves) !== JSON.stringify(baseline.moves), 'measured lift reorders the plan')
ok(JSON.stringify(buildFromAtoms('firstvisit', spec).moves) === JSON.stringify(baseline.moves), 'no measured/scoreOf -> unchanged')

console.log('\n' + '='.repeat(50))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: all Phase 3 checks passed. Learning loop math live; prior gives way to measured.')
