/* Phase 3 guard: the pure outcome verdict (heir to the deleted mock perf.ts).
 * Run: npx tsx scripts/sim/verdict-test.ts */
import { computeVerdict } from '@/lib/campaigns/outcomes/verdict'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗ FAIL'}  ${m}`); if (!c) fails++ }

// HARD RULE: no data → gathering, NEVER a number.
const g = computeVerdict({ hasData: false, attribution: 'none' })
ok(g.gathering === true && g.value === null && g.verdict === null, 'no data → gathering, no number, no verdict')

// per_post: strong engagement → working, weak → drop, middle → watch.
const strong = computeVerdict({ hasData: true, attribution: 'per_post', reach: 4200, interactions: 380 }) // ~9%
ok(strong.gathering === false && strong.verdict === 'working' && strong.value === '4.2k reached', `strong per_post → working (${strong.value})`)
const weak = computeVerdict({ hasData: true, attribution: 'per_post', reach: 5000, interactions: 30 }) // 0.6%
ok(weak.verdict === 'drop' && weak.up === false, 'weak per_post → drop')
const mid = computeVerdict({ hasData: true, attribution: 'per_post', reach: 1000, interactions: 30 }) // 3%
ok(mid.verdict === 'watch', 'middling per_post → watch')

// per_post value never fabricated — always derived from real reach/interactions.
ok(computeVerdict({ hasData: true, attribution: 'per_post', reach: 0, interactions: 12 }).value === '12 interactions', 'zero reach falls back to real interactions count')

// window_lift is correlation: never 'drop' on its own, even on a negative delta.
const dip = computeVerdict({ hasData: true, attribution: 'window_lift', metricLabel: 'directions', metricDelta: -0.2 })
ok(dip.verdict !== 'drop', 'window_lift negative delta never → drop (correlation, not causation)')
const up = computeVerdict({ hasData: true, attribution: 'window_lift', metricLabel: 'directions', metricDelta: 0.18 })
ok(up.verdict === 'working' && up.value === '+18% directions', `window_lift +18% → working (${up.value})`)

console.log(fails === 0 ? '\nALL VERDICT CHECKS PASS' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
