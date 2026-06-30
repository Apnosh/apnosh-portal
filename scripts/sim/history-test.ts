/* Phase 3 learning guard: the pure outcome → PlanningHistory collapse.
 * Run: npx tsx scripts/sim/history-test.ts */
import { collapseHistory, type OutcomeRow } from '@/lib/campaigns/planning/history-collapse'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗ FAIL'}  ${m}`); if (!c) fails++ }
const row = (service_id: string | null, verdict: OutcomeRow['verdict'], er: number, asOf: string, hasData = true): OutcomeRow => ({ service_id, verdict, engagement_rate: er, has_data: hasData, as_of_date: asOf })

// One line per service; the LATEST reading wins; strong engagement → positive metricDelta.
const h1 = collapseHistory([row('video-engine', 'watch', 0.03, '2026-06-01'), row('video-engine', 'working', 0.09, '2026-06-10')])
ok(h1.pastLines.length === 1 && h1.pastLines[0].serviceId === 'video-engine' && h1.pastLines[0].verdict === 'working', 'one line per service, latest verdict wins')
ok(h1.pastLines[0].metricDelta > 0, 'strong engagement → positive metricDelta')
ok(h1.droppedServiceIds.length === 0, 'a service that ever worked is never dropped')

// Dropped ONLY with >=2 readings, all 'drop', never 'working' — and only NON-essential services.
const h2 = collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01'), row('paid-ads', 'drop', 0.004, '2026-06-08')])
ok(h2.droppedServiceIds.includes('paid-ads'), '>=2 all-drop, never-worked, NON-essential → dropped')
ok(h2.pastLines[0].metricDelta < 0, 'low engagement → negative metricDelta')

// Foundation guard: an ESSENTIAL service is never dropped, even with consistent bad readings.
const hEss = collapseHistory([row('video-engine', 'drop', 0.005, '2026-06-01'), row('video-engine', 'drop', 0.004, '2026-06-08')])
ok(hEss.droppedServiceIds.length === 0, 'an ESSENTIAL/foundation service is never dropped, even with >=2 drops')
ok(hEss.pastLines.length === 1, 'but the essential service still shows up as evidence in pastLines')

ok(collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01')]).droppedServiceIds.length === 0, 'single drop reading → NOT dropped (needs ≥2, the stability gate)')
ok(collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01'), row('paid-ads', 'working', 0.08, '2026-06-08')]).droppedServiceIds.length === 0, 'drop then working → NOT dropped')

// Ignore rows with no service or no data.
const h5 = collapseHistory([row(null, 'drop', 0.005, '2026-06-01'), row('x', 'drop', 0.005, '2026-06-01', false)])
ok(h5.pastLines.length === 0 && h5.droppedServiceIds.length === 0, 'rows without service_id or has_data are ignored')

console.log(fails === 0 ? '\nALL HISTORY CHECKS PASS' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
