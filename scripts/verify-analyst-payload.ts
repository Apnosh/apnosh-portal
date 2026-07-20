/* Analyst-payload pure-derivation checks (Phase A).
 * ================================================
 * deriveDropOffs + summarizeSources are the I/O-free heart of the grounded brief.
 * This proves: drop-offs only chain ADJACENT stages that BOTH have real numbers
 * (never leap a gap, never divide by zero), keptPct is right, and sources split
 * connected vs dark correctly (a label live anywhere is never called dark).
 *
 * Run: node_modules/.bin/tsx scripts/verify-analyst-payload.ts */

import { deriveDropOffs, summarizeSources, type AnalystStage } from '../src/lib/insights/analyst-derive'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const src = (label: string, status: string, value: number | null, counted = false) => ({ label, provider: 'x', value, status, counted })
const stage = (n: number, label: string, headline: number | null, isEmpty: boolean, sources: AnalystStage['sources']): AnalystStage =>
  ({ stage: n, label, headline, isEmpty, sources })

console.log('\n== deriveDropOffs ==')
{
  const stages: AnalystStage[] = [
    stage(1, 'Awareness', 16000, false, [src('Google Maps views', 'CONNECTED', 10000, true)]),
    stage(2, 'Interest', 800, false, [src('Profile visits', 'CONNECTED', 800, true)]),
    stage(3, 'Actions', 40, false, [src('Directions', 'CONNECTED', 40, true)]),
    stage(4, 'Sales', null, true, [src('Guests served', 'COMING_SOON', null)]),
    stage(5, 'Retention', 12, false, [src('Google reviews', 'CONNECTED', 12, true)]),
  ]
  const d = deriveDropOffs(stages)
  ok(d.length === 2, `two drop-offs (1→2, 2→3), not across the empty Sales gap (${d.length})`)
  ok(d[0].fromStage === 1 && d[0].toStage === 2, 'first is Awareness→Interest')
  ok(d[0].keptPct === 5, `16000→800 keeps 5% (${d[0].keptPct})`)
  ok(d[1].keptPct === 5, `800→40 keeps 5% (${d[1].keptPct})`)
  ok(!d.some((x) => x.fromStage === 3 && x.toStage === 5), 'never chains Actions→Retention across the empty stage')
  ok(!d.some((x) => x.toStage === 4), 'the empty Sales stage is never a drop-off endpoint')
}

console.log('\n== deriveDropOffs guards ==')
{
  const zero: AnalystStage[] = [
    stage(1, 'Awareness', 0, false, []),
    stage(2, 'Interest', 5, false, []),
  ]
  ok(deriveDropOffs(zero).length === 0, 'no drop-off when the earlier stage is 0 (never divides by zero)')
  const one: AnalystStage[] = [stage(1, 'Awareness', 100, false, [])]
  ok(deriveDropOffs(one).length === 0, 'a single stage yields no drop-off')
}

console.log('\n== summarizeSources ==')
{
  const stages: AnalystStage[] = [
    stage(1, 'Awareness', 100, false, [
      src('Google Maps views', 'CONNECTED', 60, true),
      src('Instagram reach', 'CONNECTED', 40, true),
      src('TikTok views', 'COMING_SOON', null),
      src('Facebook reach', 'COMING_SOON', null),
    ]),
    stage(3, 'Actions', 5, false, [
      src('Directions', 'CONNECTED', 5, true),
      src('Phone taps', 'AVAILABLE_NOT_CONNECTED', null),
      src('Website clicks', 'ERROR', null),
    ]),
  ]
  const s = summarizeSources(stages)
  ok(s.connected.includes('Google Maps views') && s.connected.includes('Directions'), 'live sources land in connected')
  ok(s.dark.some((d) => d.label === 'TikTok views' && d.state === 'COMING_SOON'), 'no-adapter source is dark w/ its state')
  ok(s.dark.some((d) => d.label === 'Phone taps' && d.state === 'AVAILABLE_NOT_CONNECTED'), 'not-connected source is dark')
  ok(s.dark.some((d) => d.label === 'Website clicks' && d.state === 'ERROR'), 'errored source is dark')
  ok(!s.connected.some((l) => s.dark.some((d) => d.label === l)), 'no label is both connected and dark')
}

console.log('\n== summarizeSources — live-anywhere wins ==')
{
  // same label CONNECTED in one stage, not-connected in another → connected, never dark
  const stages: AnalystStage[] = [
    stage(1, 'Awareness', 10, false, [src('Instagram reach', 'AVAILABLE_NOT_CONNECTED', null)]),
    stage(2, 'Interest', 10, false, [src('Instagram reach', 'CONNECTED', 10, true)]),
  ]
  const s = summarizeSources(stages)
  ok(s.connected.includes('Instagram reach'), 'a label live in any stage counts as connected')
  ok(!s.dark.some((d) => d.label === 'Instagram reach'), 'and is not also listed as dark')
}

console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}\n`)
process.exit(fail === 0 ? 0 : 1)
