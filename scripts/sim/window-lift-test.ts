/* Phase 3 window-lift guard: the maturity gate (no fake collapse at launch) + baseline/clamp.
 * Run: npx tsx scripts/sim/window-lift-test.ts */
import { maturedWindow, channelLift, shiftDay } from '@/lib/campaigns/outcomes/window-lift-math'

let fails = 0
const ok = (c: boolean, m: string) => { console.log(`${c ? '✓' : '✗ FAIL'}  ${m}`); if (!c) fails++ }
const dd = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

const today = '2026-06-27'

// THE BLOCKER FIX: a campaign shipped today has an unsettled (empty) post-window → no lift,
// so the owner reads an honest "gathering", never a fabricated "-100%".
ok(maturedWindow(today, today) === null, 'shipped today → no lift (post-window not settled)')
ok(maturedWindow(shiftDay(today, -5), today) === null, 'shipped 5 days ago → still immature (settled days < min)')

// Once matured, the windows are equal-length and meet at the anchor (a fair compare).
const w = maturedWindow(shiftDay(today, -12), today)
ok(w !== null, 'shipped 12 days ago → matured')
if (w) {
  ok(dd(w.postStart, w.postEnd) === dd(w.preStart, w.preEnd), 'post and pre windows are EQUAL length (no length-mismatch artifact)')
  ok(dd(w.postStart, w.postEnd) === w.elapsed, 'window length equals the matured elapsed days')
  ok(w.preEnd === w.postStart, 'pre window ends exactly where the post window begins (the anchor)')
  ok(w.postEnd <= shiftDay(today, -3), 'post window never includes unsettled (lagged) days')
}

// Baseline gate + magnitude clamp: tiny denominators can't read as a triumph or a collapse.
ok(channelLift(20, 5, 30).hasData === false, 'below baseline → no data (no noisy +300%)')
ok(channelLift(120, 60, 30).delta === 1, 'a big rise clamps to +100%')
ok(channelLift(0, 60, 30).delta === -1, 'a collapse clamps to -100%')
ok(Math.abs(channelLift(72, 60, 30).delta - 0.2) < 1e-9, 'a +20% lift is computed correctly')

console.log(fails === 0 ? '\nALL WINDOW-LIFT CHECKS PASS' : `\n${fails} CHECK(S) FAILED`)
process.exit(fails === 0 ? 0 : 1)
