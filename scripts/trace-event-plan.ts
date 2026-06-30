/* DEV: generate the real promote-event plan at each budget and check it matches the blueprint
 * (low = crucial spine only ~6 items; high adds reel/SMS/boost/recap and scales ~18). Also
 * re-confirms the 4 system goals stay byte-identical to buildSystem. Exits non-zero on mismatch. */
import { buildEventPlan, buildFromAtoms } from '../src/lib/campaigns/builder/build-from-atoms'
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import type { SystemGoal } from '../src/lib/campaigns/data/priced-catalog'

const TIERS = [
  { label: 'LOW (lean, <$250)', spec: { budget: '200' } },
  { label: 'MID (standard, ~$500)', spec: { budget: '500' } },
  { label: 'HIGH (aggressive, $700+)', spec: { budget: '1000' } },
]

function show(label: string, spec: Record<string, string>) {
  const plan = buildEventPlan(spec)
  const items = plan.steps.reduce((n, s) => n + s.amount, 0)
  console.log(`\n${label} — ${plan.steps.length} steps, ${items} items`)
  for (const st of plan.stages) {
    const inStage = plan.steps.filter((s) => s.play.stage === st.stage)
    console.log(`  ${st.title}`)
    for (const s of inStage) {
      const tag = s.play.crucial ? 'spine' : 'nice-to-have'
      console.log(`    • ${s.play.role}  ×${s.amount}  [${s.play.lane.producer}/${s.play.lane.discipline}, ${tag}, track:${s.play.track.channel}]`)
    }
  }
  return { plan, items }
}

let fail = 0
const low = show(TIERS[0].label, TIERS[0].spec)
show(TIERS[1].label, TIERS[1].spec)
const high = show(TIERS[2].label, TIERS[2].spec)

console.log('\n' + '='.repeat(56))
const lowIds = new Set(low.plan.steps.map((s) => s.play.serviceId))
const highIds = new Set(high.plan.steps.map((s) => s.play.serviceId))
const check = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

check(low.plan.steps.every((s) => s.play.crucial), 'low budget = crucial spine only')
check(!['evt-reel', 'evt-sms', 'evt-boost', 'evt-recap', 'evt-tease'].some((id) => lowIds.has(id)), 'low budget excludes reel/SMS/boost/recap/teasers')
check(low.plan.steps.length === 6, `low budget is the 6-step crucial spine (got ${low.plan.steps.length} steps)`)
check(['evt-reel', 'evt-sms', 'evt-boost', 'evt-recap'].every((id) => highIds.has(id)), 'high budget unlocks reel + SMS + boost + recap')
check(high.items >= 18, `high budget scales up to ~18+ items (got ${high.items})`)
check([...lowIds].every((id) => highIds.has(id)), 'high budget keeps the entire low-budget spine')

// System goals must remain byte-identical (the Phase 1 guarantee).
const GOALS: SystemGoal[] = ['firstvisit', 'nights', 'regulars', 'reviews']
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
let sysOk = true
for (const g of GOALS) for (const b of ['', '200', '500', '1000']) {
  const spec: Record<string, string> = b ? { budget: b } : {}
  const o = buildSystem(g, spec), n = buildFromAtoms(g, spec)
  if (!eq(o.moves, n.moves) || !eq(o.stages, n.stages)) sysOk = false
}
check(sysOk, 'system goals still byte-identical to buildSystem (Phase 1 intact)')

console.log('='.repeat(56))
if (fail) { console.log(`RESULT: ${fail} checks failed`); process.exit(1) }
console.log('RESULT: all checks passed. Budget dials live; parity intact.')
