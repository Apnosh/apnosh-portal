/* DEV verification for best-plan-brain Phase 2 (the objective function, offline):
 *  - resolveOutcome maps each goal to its result
 *  - expectedLift: crucial floor dominates, working-history boosts, driver-channel match, loser sinks
 *  - the engine's within-stage order responds to scoreOf, and the crucial spine still leads
 *  - absent scoreOf keeps byte-identical parity with buildSystem
 * Exits non-zero on any failure. */
import { resolveOutcome, expectedLift, liftScorer, type Outcome } from '../src/lib/campaigns/brain/objective'
import { emptySignals } from '../src/lib/campaigns/brain/signals'
import { reading } from '../src/lib/campaigns/brain/readiness'
import { EVENT_PLAYS } from '../src/lib/campaigns/data/atom-plays'
import { buildFromAtoms, buildEventPlan } from '../src/lib/campaigns/builder/build-from-atoms'
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import type { SystemGoal } from '../src/lib/campaigns/data/priced-catalog'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }
const play = (id: string) => EVENT_PLAYS.find((p) => p.serviceId === id)!
const graphic = play('evt-graphic')   // crucial, channel 'content'
const reel = play('evt-reel')         // non-crucial, channel 'content'

console.log('\n== resolveOutcome ==')
ok(resolveOutcome('promote-event').id === 'attendance', 'promote-event -> attendance')
ok(resolveOutcome('nights').id === 'covers', 'nights -> covers')
ok(resolveOutcome('reviews').id === 'fresh-reviews', 'reviews -> fresh reviews')
ok(resolveOutcome('firstvisit').id === 'new-guests', 'firstvisit -> new guests')

console.log('\n== expectedLift ==')
const att = resolveOutcome('promote-event')
const empty = emptySignals()
ok(expectedLift(graphic, att, empty) > expectedLift(reel, att, empty) + 500, 'crucial play floor dominates any non-crucial')
const working = emptySignals(); working.workingServiceIds = reading(['evt-reel'])
ok(expectedLift(reel, att, working) - expectedLift(reel, att, empty) === 60, 'a play that worked here gets +60')
const dropped = emptySignals(); dropped.droppedServiceIds = reading(['evt-reel'])
ok(expectedLift(reel, att, dropped) === expectedLift(reel, att, empty) - 10000, 'a proven loser sinks (-10000)')
const withCh: Outcome = { id: 'x', metric: '', label: '', drivers: { channels: ['content'], serviceHints: [] } }
const noCh: Outcome = { id: 'y', metric: '', label: '', drivers: { channels: ['social'], serviceHints: [] } }
ok(expectedLift(reel, withCh, empty) - expectedLift(reel, noCh, empty) === 40, 'a play on a driver channel gets +40')

console.log('\n== engine responds to scoreOf, spine still leads ==')
const spec = { budget: '1000' }
// A custom score (reverse serviceId) reorders within-stage, proving scoreOf is honored.
const baseline = buildFromAtoms('firstvisit', spec)
const reordered = buildFromAtoms('firstvisit', spec, { scoreOf: (p) => -p.serviceId.charCodeAt(0) })
ok(JSON.stringify(baseline.moves) !== JSON.stringify(reordered.moves), 'scoreOf changes the within-stage order')
// With the real lift scorer, the crucial spine still leads each stage of the event plan.
const ev = buildEventPlan(spec, { scoreOf: liftScorer(att, empty) })
let spineLeads = true
for (const st of ev.stages) {
  const inStage = ev.steps.filter((s) => s.play.stage === st.stage)
  let seenOptional = false
  for (const s of inStage) {
    if (!s.play.crucial) seenOptional = true
    else if (seenOptional) spineLeads = false // a crucial step appeared after an optional one
  }
}
ok(spineLeads, 'crucial spine leads every stage even under lift ordering')

console.log('\n== parity preserved when no scoreOf ==')
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
let parity = true
for (const g of ['firstvisit', 'nights', 'regulars', 'reviews'] as SystemGoal[]) {
  for (const b of ['', '200', '500', '1000']) {
    const sp: Record<string, string> = b ? { budget: b } : {}
    const o = buildSystem(g, sp)
    const n = buildFromAtoms(g, sp)
    if (!eq(o.moves, n.moves) || !eq(o.stages, n.stages)) parity = false
  }
}
ok(parity, 'buildFromAtoms with no scoreOf still byte-identical to buildSystem (all goals x tiers)')

console.log('\n' + '='.repeat(50))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: all Phase 2 checks passed. Objective function live; signal-responsive; parity intact.')
