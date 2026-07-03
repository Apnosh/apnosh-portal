/* Phase 3 learning guard: the pure outcome → PlanningHistory collapse.
 * Run: npx tsx scripts/sim/history-test.ts */
import { collapseHistory, type OutcomeRow } from '@/lib/campaigns/planning/history-collapse'
import { measuredLiftFrom } from '@/lib/campaigns/brain/learning'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗ FAIL'}  ${m}`); if (!c) fails++ }
const row = (service_id: string | null, verdict: OutcomeRow['verdict'], er: number, asOf: string, piece = 'p1', hasData = true): OutcomeRow => ({ service_id, verdict, engagement_rate: er, has_data: hasData, as_of_date: asOf, content_draft_id: piece })

// Same piece polled on two days is ONE reading; the LATEST wins; strong engagement → positive metricDelta.
const h1 = collapseHistory([row('video-engine', 'watch', 0.03, '2026-06-01'), row('video-engine', 'working', 0.09, '2026-06-10')])
ok(h1.pastLines.length === 1 && h1.pastLines[0].serviceId === 'video-engine' && h1.pastLines[0].verdict === 'working', 'one line per distinct piece, latest verdict wins')
ok(h1.pastLines[0].metricDelta > 0, 'strong engagement → positive metricDelta')
ok(h1.droppedServiceIds.length === 0, 'a service that ever worked is never dropped')

// 'watch' is neither a win nor a loss — a still-gathering piece leaves no evidence line.
ok(collapseHistory([row('paid-ads', 'watch', 0.03, '2026-06-01')]).pastLines.length === 0, "a 'watch' piece is excluded from pastLines (neither win nor loss)")

// ONE weak piece re-polled on two days is still one reading — never enough to blocklist.
const h2 = collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01'), row('paid-ads', 'drop', 0.004, '2026-06-08')])
ok(h2.droppedServiceIds.length === 0, 'same piece polled twice → ONE reading, NOT dropped (needs ≥2 distinct pieces)')
ok(h2.pastLines.length === 1 && h2.pastLines[0].metricDelta < 0, 'deduped to one line; low engagement → negative metricDelta')

// Dropped ONLY with >=2 DISTINCT pieces, all 'drop', never 'working' — and only NON-essential services.
const h3 = collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01', 'p1'), row('paid-ads', 'drop', 0.004, '2026-06-08', 'p2')])
ok(h3.droppedServiceIds.includes('paid-ads'), '>=2 distinct all-drop pieces, never-worked, NON-essential → dropped')

// Foundation guard: an ESSENTIAL service is never dropped, even with consistent bad readings.
const hEss = collapseHistory([row('video-engine', 'drop', 0.005, '2026-06-01', 'p1'), row('video-engine', 'drop', 0.004, '2026-06-08', 'p2')])
ok(hEss.droppedServiceIds.length === 0, 'an ESSENTIAL/foundation service is never dropped, even with >=2 distinct drops')
ok(hEss.pastLines.length === 2, 'but the essential service still shows up as evidence in pastLines')

ok(collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01', 'p1')]).droppedServiceIds.length === 0, 'single drop piece → NOT dropped (needs ≥2, the stability gate)')
ok(collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01', 'p1'), row('paid-ads', 'working', 0.08, '2026-06-08', 'p2')]).droppedServiceIds.length === 0, 'drop piece + working piece → NOT dropped')
ok(collapseHistory([row('paid-ads', 'drop', 0.005, '2026-06-01', 'p1'), row('paid-ads', 'drop', 0.004, '2026-06-08', 'p2'), row('paid-ads', 'watch', 0.03, '2026-06-08', 'p3')]).droppedServiceIds.length === 0, "a 'watch' piece blocks the blocklist (not ALL drop)")

// Ever-worked spans superseded readings: a piece that worked once, then decayed, still protects the service.
const hDecay = collapseHistory([row('paid-ads', 'working', 0.08, '2026-06-01', 'p1'), row('paid-ads', 'drop', 0.005, '2026-06-20', 'p1'), row('paid-ads', 'drop', 0.004, '2026-06-20', 'p2')])
ok(hDecay.droppedServiceIds.length === 0, "a superseded 'working' reading still counts as ever-worked → NOT dropped")

// Honest n: pastLines carry one line per decisive piece, so measuredLiftFrom sees the real sample size.
const hN = collapseHistory([
  row('video-engine', 'working', 0.08, '2026-06-10', 'p1'), row('video-engine', 'working', 0.07, '2026-06-10', 'p2'),
  row('video-engine', 'drop', 0.005, '2026-06-10', 'p3'), row('video-engine', 'watch', 0.03, '2026-06-10', 'p4'),
])
const lift = measuredLiftFrom(hN.pastLines)['video-engine']
ok(lift.n === 3, 'measuredLiftFrom n = decisive pieces (2 working + 1 drop = 3; watch excluded)')
ok(Math.round(lift.score) === 67, 'win-rate = working / decisive = 2/3 → score ~67')

// Ignore rows with no service or no data.
const h5 = collapseHistory([row(null, 'drop', 0.005, '2026-06-01'), row('x', 'drop', 0.005, '2026-06-01', 'p1', false)])
ok(h5.pastLines.length === 0 && h5.droppedServiceIds.length === 0, 'rows without service_id or has_data are ignored')

console.log(fails === 0 ? '\nALL HISTORY CHECKS PASS' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
