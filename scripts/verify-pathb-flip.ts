/* DEV verification for Path B flip v1 (offline): promote-event now composes from the dialed atom
 * engine, mapped to content beats, rendering like today's content plan. Checks totality, that every
 * beat type is priceable (in CONTENT_META), the budget dial (lean ⊂ aggressive), the self-healing
 * fall-through for non-brain items, and that the 4 system goals are unaffected. Exits non-zero on fail. */
import { composePlanForGoal, resolveBrainGoal } from '../src/lib/campaigns/builder/compose-plan'
import { eventContentBeats, buildEventPlan, dialedContentBeats } from '../src/lib/campaigns/builder/build-from-atoms'
import { CONTENT_META } from '../src/lib/campaigns/catalog'
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import { buildFromAtoms } from '../src/lib/campaigns/builder/build-from-atoms'
import type { SystemGoal } from '../src/lib/campaigns/data/priced-catalog'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

console.log('\n== promote-event composes from the engine ==')
let r: ReturnType<typeof composePlanForGoal> | null = null
try { r = composePlanForGoal('promoevent', {}) } catch (e) { console.log('  threw:', (e as Error).message) }
ok(!!r, "composePlanForGoal('promoevent', {}) does not throw (totality)")
const plan = r?.tpl.contentPlan ?? []
ok(plan.length > 0, `produces content beats from the engine (${plan.length})`)
ok(plan.every((b) => !!CONTENT_META[b.type]), 'every beat type is priceable (known to CONTENT_META)')
ok(!!r && !r.moves, 'sets no moves → renders as content, exactly like today')

console.log('\n== the budget dial is visible ==')
const lean = eventContentBeats({ budget: '200' })
const agg = eventContentBeats({ budget: '1000' })
ok(lean.length > 0, `lean produces the crucial spine (${lean.length} beats)`)
ok(agg.length > lean.length, `aggressive scales up (${lean.length} → ${agg.length} beats)`)
const leanTypes = new Set(lean.map((b) => b.type)), aggTypes = new Set(agg.map((b) => b.type))
ok([...leanTypes].every((t) => aggTypes.has(t)), 'lean beat types are a subset of aggressive')
ok(aggTypes.has('reel') && !leanTypes.has('reel'), 'aggressive unlocks video (reel); lean has none')

console.log('\n== lift order (spec.aiMix) + no-list rule ==')
const baseOrder = buildEventPlan({ budget: '1000' }).steps.map((s) => s.play.serviceId)
const reordered = buildEventPlan({ budget: '1000', aiMix: [...baseOrder].reverse().join(',') }).steps.map((s) => s.play.serviceId)
ok(JSON.stringify(reordered) !== JSON.stringify(baseOrder), 'spec.aiMix reorders the event plan (lift order honored)')
const withList = composePlanForGoal('promoevent', { list: 'email list', budget: '1000' }).tpl.contentPlan
const noList = composePlanForGoal('promoevent', { budget: '1000' }).tpl.contentPlan
ok(withList.some((b) => b.type === 'email'), 'with a list, the event plan includes an email')
ok(!noList.some((b) => b.type === 'email' || b.type === 'sms'), 'with no list, the event plan drops email/text')

console.log('\n== launch + deal flipped too ==')
for (const [item, brain] of [['launch', 'launch'], ['deal', 'run-deal']] as const) {
  ok(resolveBrainGoal(item) === brain, `${item} resolves to the '${brain}' brain goal`)
  const cp = composePlanForGoal(item, { budget: '1000', list: 'email list' }).tpl.contentPlan
  ok(cp.length > 0 && cp.every((b) => !!CONTENT_META[b.type]), `${item} composes priceable content beats from the engine (${cp.length})`)
  const ln = dialedContentBeats(brain, { budget: '200' }).length
  const ag = dialedContentBeats(brain, { budget: '1000' }).length
  ok(ln > 0 && ag > ln, `${item} budget dial works (lean ${ln} < aggressive ${ag})`)
}

console.log('\n== self-healing fall-through ==')
let reelOk = false
try { reelOk = (composePlanForGoal('reel', {}).tpl.contentPlan?.length ?? 0) > 0 } catch { /* */ }
ok(reelOk, 'a non-brain item (reel) still composes via the legacy content path')

console.log('\n== system goals unaffected ==')
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
let parity = true
for (const g of ['firstvisit', 'nights', 'regulars', 'reviews'] as SystemGoal[]) {
  for (const b of ['', '500', '1000']) {
    const sp: Record<string, string> = b ? { budget: b } : {}
    if (!eq(buildSystem(g, sp).moves, buildFromAtoms(g, sp).moves)) parity = false
  }
}
ok(parity, 'buildSystem == buildFromAtoms for the 4 system goals (no regression)')

console.log('\n' + '='.repeat(52))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: Path B flip v1 verified. promote-event runs on the brain engine; content render + system goals intact.')
