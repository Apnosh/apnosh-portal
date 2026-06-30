/* DEV verification for best-plan-brain Phase 1 (pure pieces, offline):
 *  - suggestTier maps profiles to sensible editable tiers
 *  - proven-loser excludeIds is honored by the engine, and absent excludeIds keeps parity
 *  - readiness: missing is unusable, present is usable, gateValue never invents
 *  - data-richness routing: thin -> safe, rich -> tailored
 * Exits non-zero on any failure. */
import { suggestTier } from '../src/lib/campaigns/brain/suggest-tier'
import { reading, missing, usable, gateValue } from '../src/lib/campaigns/brain/readiness'
import { emptySignals, richness, planRoute } from '../src/lib/campaigns/brain/signals'
import { buildFromAtoms } from '../src/lib/campaigns/builder/build-from-atoms'
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import type { SystemGoal } from '../src/lib/campaigns/data/priced-catalog'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

console.log('\n== suggestTier ==')
ok(suggestTier({ monthlyBudget: 200 }).tier === 'lean', '$200/mo -> lean')
ok(suggestTier({ monthlyBudget: 500 }).tier === 'standard', '$500/mo -> standard')
ok(suggestTier({ monthlyBudget: 1000 }).tier === 'aggressive', '$1000/mo -> aggressive')
ok(suggestTier({ monthlyBudget: 1000 }).fromBudget === true, 'explicit budget marked fromBudget')
ok(suggestTier({ priceRange: '$' }).tier === 'lean', '$ price -> lean')
ok(suggestTier({ priceRange: '$$$', primaryGoal: 'bring in new customers' }).tier === 'aggressive', '$$$ + acquisition -> aggressive')
ok(suggestTier({ priceRange: '$$', primaryGoal: 'keep regulars' }).tier === 'standard', '$$ + retention -> standard')
ok(suggestTier({}).tier === 'standard', 'no info -> standard default')
ok(suggestTier({}).fromBudget === false, 'inferred suggestion not marked fromBudget')

console.log('\n== proven-loser exclusion + parity ==')
const goal: SystemGoal = 'firstvisit'
const spec = { budget: '1000' }
const base = buildFromAtoms(goal, spec)
const victim = base.moves[Math.floor(base.moves.length / 2)].serviceId
const excluded = buildFromAtoms(goal, spec, { excludeIds: [victim] })
ok(base.moves.some((m) => m.serviceId === victim), `baseline contains ${victim}`)
ok(!excluded.moves.some((m) => m.serviceId === victim), `excludeIds removes ${victim}`)
ok(excluded.moves.length === base.moves.length - 1, 'exactly one move removed')
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
let parity = true
for (const g of ['firstvisit', 'nights', 'regulars', 'reviews'] as SystemGoal[]) {
  for (const b of ['', '200', '500', '1000']) {
    const sp: Record<string, string> = b ? { budget: b } : {}
    const o = buildSystem(g, sp)
    const n1 = buildFromAtoms(g, sp)                       // no opts
    const n2 = buildFromAtoms(g, sp, {})                   // empty opts
    const n3 = buildFromAtoms(g, sp, { excludeIds: [] })   // empty array
    if (!eq(o.moves, n1.moves) || !eq(o.moves, n2.moves) || !eq(o.moves, n3.moves)) parity = false
    if (!eq(o.stages, n1.stages)) parity = false
  }
}
ok(parity, 'absent/empty excludeIds keeps byte-identical parity with buildSystem (all goals x tiers)')

console.log('\n== readiness ==')
ok(!usable(missing<number>()), 'missing is unusable')
ok(usable(reading(4.2)), 'present number is usable')
ok(usable(reading(0)), 'zero is a real value (usable)')
ok(!usable(reading(null)), 'null is unusable')
ok(!usable(reading(NaN)), 'NaN is unusable')
ok(!usable(reading('')), 'empty string is unusable')
ok(!usable(reading([])), 'empty array is unusable')
ok(usable(reading([], { usable: false }) as never) === false, 'explicitly-unusable stays unusable')
ok(gateValue(missing<number>(), 7) === 7, 'gateValue returns fallback when missing (never invents)')
ok(gateValue(reading(3.9), 7) === 3.9, 'gateValue returns the real value when usable')

console.log('\n== data-richness routing ==')
const empty = emptySignals()
ok(planRoute(empty) === 'safe', 'no signals -> safe route')
ok(richness(empty).usableCore === 0, 'no usable core signals when empty')
const rich = emptySignals()
rich.rating = reading(3.7)
rich.listingCompleteness = reading(82)
rich.hasList = reading(true)
ok(planRoute(rich) === 'tailored', '3 usable core signals -> tailored route')
const thin = emptySignals()
thin.rating = reading(4.5)
thin.hasList = reading(true)
ok(planRoute(thin) === 'safe', '2 usable core signals -> still safe (below threshold)')

console.log('\n' + '='.repeat(50))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: all Phase 1 checks passed. Foundation real, engine parity intact.')
