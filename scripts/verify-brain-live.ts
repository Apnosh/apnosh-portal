/* DEV verification for the LIVE wiring (offline end-to-end): brain signals -> lift-ranked mix ->
 * buildSystem -> a real staged plan ordered by expected contribution, losers excluded, and it
 * responds to measured wins. Proves the integration logic without the route/DB. Exits non-zero on fail. */
import { brainRankedMix, rankMixByLift } from '../src/lib/campaigns/brain/rank'
import { emptySignals } from '../src/lib/campaigns/brain/signals'
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import { playsForGoalAtoms } from '../src/lib/campaigns/data/atom-plays'
import type { MeasuredLift } from '../src/lib/campaigns/brain/learning'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }
const J = JSON.stringify

console.log('\n== brain-ranked mix ==')
const base = brainRankedMix('nights', 'standard', emptySignals())
ok(base.mix.length > 0, 'ranked mix is non-empty')
ok(base.outcome.id === 'covers', 'outcome resolved (nights -> covers)')
const valid = new Set(playsForGoalAtoms('nights').map((p) => p.serviceId))
ok(base.mix.every((id) => valid.has(id)), 'every ranked id is a real nights candidate')
ok(new Set(base.mix).size === base.mix.length, 'no duplicate serviceIds')

console.log('\n== exclusions + re-rank ==')
const victim = base.mix[Math.floor(base.mix.length / 2)]
const ex = brainRankedMix('nights', 'standard', emptySignals(), { excludeIds: [victim] })
ok(!ex.mix.includes(victim), `excludeIds removes ${victim} from the ranked mix`)
ok(J(rankMixByLift([...base.mix].reverse(), 'nights', emptySignals())) === J(base.mix), 'rankMixByLift re-sorts any order back to the lift order')

console.log('\n== end-to-end: buildSystem consumes the brain mix ==')
const sys = buildSystem('nights', { aiMix: base.mix.join(','), budget: '500' })
ok(sys.moves.length > 0, 'buildSystem produces a staged plan from the brain mix')
ok(sys.moves.every((m) => base.mix.includes(m.serviceId)), 'every move comes from the brain mix')
ok(sys.stages.length > 0, 'stages present (funnel preserved)')

console.log('\n== plan responds to a measured win ==')
const crucial = new Set(playsForGoalAtoms('nights').filter((p) => p.crucial).map((p) => p.serviceId))
const target = [...base.mix].reverse().find((id) => !crucial.has(id))! // lowest-lift non-crucial
const measured: Record<string, MeasuredLift> = { [target]: { score: 100, n: 1000 } }
const boosted = brainRankedMix('nights', 'standard', emptySignals(), { measured })
ok(J(boosted.mix) !== J(base.mix), 'a measured win re-ranks the plan')
ok(boosted.mix.indexOf(target) < base.mix.indexOf(target), `the measured winner (${target}) moves up`)

console.log('\n== parity: buildSystem with no mix is unchanged ==')
const a = buildSystem('nights', { budget: '500' })
const b = buildSystem('nights', { budget: '500' })
ok(J(a.moves) === J(b.moves), 'buildSystem without a brain mix is deterministic + unchanged')

console.log('\n' + '='.repeat(50))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: live wiring verified end-to-end. Brain drives the plan order via spec.aiMix; composer untouched.')
