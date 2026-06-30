/* DEV verification: buildFromAtoms must be byte-identical to buildSystem (the trusted oracle)
 * for every system goal, every budget tier, and the AI-mix path. Phase 1 is lossless only if
 * this passes. Exits non-zero on any mismatch. */
import { buildSystem } from '../src/lib/campaigns/builder/compose-plan'
import { buildFromAtoms } from '../src/lib/campaigns/builder/build-from-atoms'
import type { SystemGoal } from '../src/lib/campaigns/data/priced-catalog'

const GOALS: SystemGoal[] = ['firstvisit', 'nights', 'regulars', 'reviews']
const TIERS: { label: string; spec: Record<string, string> }[] = [
  { label: 'default', spec: {} },
  { label: 'lean', spec: { budget: '200' } },
  { label: 'standard', spec: { budget: '500' } },
  { label: 'aggressive', spec: { budget: '1000' } },
]

const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
let pass = 0
let fail = 0
const fails: string[] = []

function check(label: string, goal: SystemGoal, spec: Record<string, string>) {
  const oracle = buildSystem(goal, spec)
  const next = buildFromAtoms(goal, spec)
  const movesOk = eq(oracle.moves, next.moves)
  const stagesOk = eq(oracle.stages, next.stages)
  const ok = movesOk && stagesOk
  if (ok) pass++
  else {
    fail++
    fails.push(`${label}: moves=${movesOk ? 'ok' : 'DIFF'} stages=${stagesOk ? 'ok' : 'DIFF'}`)
    if (!movesOk) {
      console.log(`\n  oracle.moves (${oracle.moves.length}):`, oracle.moves.map((m) => m.serviceId).join(', '))
      console.log(`  next.moves   (${next.moves.length}):`, next.moves.map((m) => m.serviceId).join(', '))
    }
  }
  console.log(
    `  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(34)} moves=${String(oracle.moves.length).padStart(2)} stages=${oracle.stages.length}`,
  )
}

for (const goal of GOALS) {
  console.log(`\n== ${goal} ==`)
  for (const t of TIERS) check(`${goal}/${t.label}`, goal, t.spec)
  // AI-mix path: build a mix from the standard-tier selection, reversed, and feed BOTH engines.
  const base = buildSystem(goal, { budget: '500' }).moves.map((m) => m.serviceId)
  if (base.length > 1) {
    const aiMix = [...base].reverse().join(',')
    check(`${goal}/aiMix-reversed`, goal, { budget: '1000', aiMix })
    // A partial mix (first half) at aggressive, to exercise the subset restriction.
    const half = base.slice(0, Math.ceil(base.length / 2)).join(',')
    check(`${goal}/aiMix-partial`, goal, { budget: '1000', aiMix: half })
  }
}

console.log(`\n${'='.repeat(50)}`)
console.log(`RESULT: ${pass} passed, ${fail} failed`)
if (fail) { console.log('MISMATCHES:'); fails.forEach((f) => console.log('  - ' + f)); process.exit(1) }
console.log('Phase 1 lossless: buildFromAtoms == buildSystem across all goals + tiers + AI mix.')
