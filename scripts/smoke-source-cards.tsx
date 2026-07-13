/* Source-transparency cards render smoke (Phase 3).
 * ==================================================
 * Renders the state-aware source cards (src/components/mvp/mvp-insights.tsx:
 * SourceStateCard + SourceBreakdown) against a fixture stage whose sources span
 * ALL six states and asserts each state reads correctly, that no source is
 * dropped, that the counted cards still sum to the headline, and that MANUAL is
 * made visibly distinct with a who/when line. Pure renderToString, no I/O.
 *
 * Run: node_modules/.bin/tsx scripts/smoke-source-cards.tsx */

import React from 'react'
import { renderToString } from 'react-dom/server'
import { SourceStateCard, SourceBreakdown } from '../src/components/mvp/mvp-insights'
import type { ComputedStage, StageSourceView } from '../src/lib/insights/compute-stages'
import { SOURCE_BY_ID, shortLabelFor } from '../src/lib/insights/source-registry'

let fail = 0
const ok = (cond: boolean, msg: string) => { console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fail++ }

const html = (el: React.ReactElement) => renderToString(el)
// cards render the SHORT label now, not the full displayName
const name = (id: string) => shortLabelFor(id)

// One StageSourceView with sane defaults; override per state.
function src(over: Partial<StageSourceView> & { id: string; status: StageSourceView['status'] }): StageSourceView {
  const def = SOURCE_BY_ID[over.id]
  return {
    displayName: def.displayName,
    shortLabel: shortLabelFor(over.id),
    provider: def.provider,
    value: null,
    hasData: false,
    counted: false,
    feedRole: 'sum',
    ...over, // supplies id + status (+ any overrides), so no key is set twice
  }
}

// ── Fixture: a stage whose SUM group holds one of every state. Counted = the
//    CONNECTED+data source (1000) + the MANUAL source (200) = headline 1200. ──
const CONNECTED_DATA = src({ id: 'gbp_impressions_search', status: 'CONNECTED', value: 1000, hasData: true, counted: true, isHero: true })
const NO_DATA        = src({ id: 'gbp_impressions_maps', status: 'CONNECTED', value: null, hasData: false })
const AVAILABLE_CFG  = src({ id: 'ga4_menu_views', status: 'AVAILABLE_NOT_CONNECTED' }) // has configMissingReason
const AVAILABLE_PLAIN = src({ id: 'ig_profile_visits', status: 'AVAILABLE_NOT_CONNECTED' }) // no config → "Connect"
const ERRORED        = src({ id: 'ig_reach', status: 'ERROR' })
const COMING         = src({ id: 'tiktok_video_views', status: 'COMING_SOON' })
const MANUAL         = src({ id: 'ig_engaged', status: 'MANUAL_ENTRY', value: 200, counted: true, isManual: true, manualBy: 'Priya', manualAt: '2026-07-03T12:00:00Z' })
const EXPECTED_WHEN = new Date(MANUAL.manualAt!).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

const SUMS: StageSourceView[] = [CONNECTED_DATA, NO_DATA, AVAILABLE_CFG, AVAILABLE_PLAIN, ERRORED, COMING, MANUAL]
const HEADLINE = SUMS.filter((s) => s.counted).reduce((n, s) => n + (s.value ?? 0), 0)

const stage: ComputedStage = {
  stage: 1,
  label: 'Awareness',
  headline: HEADLINE,
  unit: 'views',
  sources: SUMS,
  heroSourceId: 'gbp_impressions_search',
  isEmpty: false,
}

const EM_DASH = '—'  // U+2014, banned in copy
const DASH = '–'     // U+2013, the absent-number placeholder the cards use

function main() {
  console.log('\n== every source renders a card (none dropped) ==')
  const groupHtml = html(<SourceBreakdown stage={stage} unit="views" />)
  for (const s of SUMS) ok(groupHtml.includes(name(s.id)), `card present for ${s.id} ("${name(s.id)}")`)

  console.log('\n== CONNECTED + data shows its value ==')
  ok(html(<SourceStateCard s={CONNECTED_DATA} />).includes('1,000'), 'connected card shows 1,000')

  console.log('\n== CONNECTED + NO_DATA shows a dash, not 0-as-real ==')
  const nd = html(<SourceStateCard s={NO_DATA} />)
  ok(nd.includes('no activity yet'), 'NO_DATA card shows the calm "no activity yet" hint')
  ok(!/>0</.test(nd) && !nd.includes('>0<'), 'NO_DATA card never renders a literal 0 value')
  ok(!nd.includes(EM_DASH), 'NO_DATA card uses no em dash')

  console.log('\n== AVAILABLE_NOT_CONNECTED shows "Connect" (or the config hint) ==')
  ok(html(<SourceStateCard s={AVAILABLE_PLAIN} />).includes('Connect'), 'plain AVAILABLE card shows "Connect"')
  ok(html(<SourceStateCard s={AVAILABLE_CFG} />).includes('Add your menu page path in settings'), 'AVAILABLE with configMissingReason shows the config hint instead')

  console.log('\n== ERROR shows "Reconnect", never "Connect" ==')
  const err = html(<SourceStateCard s={ERRORED} />)
  ok(err.includes('Reconnect'), 'ERROR card shows "Reconnect"')
  ok(!err.includes('Connect '), 'ERROR card never says "Connect"')
  ok(err.includes(DASH), 'ERROR card shows a dash placeholder, not a metric number')

  console.log('\n== COMING_SOON shows "Coming soon" and no number ==')
  const cs = html(<SourceStateCard s={COMING} />)
  ok(cs.includes('Coming soon'), 'COMING_SOON card shows "Coming soon"')
  ok(!cs.includes('Connect'), 'COMING_SOON card has no Connect affordance')

  console.log('\n== MANUAL shows value + MANUAL badge + who/when + is visually distinct ==')
  const man = html(<SourceStateCard s={MANUAL} />)
  ok(man.includes('MANUAL'), 'MANUAL badge text present')
  ok(man.includes('200'), 'MANUAL card shows its value (200)')
  ok(man.includes('entered by Priya'), 'MANUAL card shows who entered it')
  ok(man.includes(EXPECTED_WHEN), `MANUAL card shows a friendly when (${EXPECTED_WHEN})`)
  ok(man.includes('dashed') && man.toLowerCase().includes('#f5a623'), 'MANUAL card is visually distinct (dashed amber border)')
  // manualBy null → "entered by hand"
  const manHand = html(<SourceStateCard s={src({ id: 'ig_engaged', status: 'MANUAL_ENTRY', value: 5, isManual: true, manualBy: null, manualAt: null })} />)
  ok(manHand.includes('entered by hand'), 'MANUAL with no author falls back to "entered by hand"')
  // distinct from a plain CONNECTED API card (which never says MANUAL)
  ok(!html(<SourceStateCard s={CONNECTED_DATA} />).includes('MANUAL'), 'a connected API card never wears the MANUAL badge')

  console.log('\n== counted cards sum to the headline (reconcile holds) ==')
  ok(HEADLINE === 1200, `counted sum = 1200 (${HEADLINE})`)
  ok(groupHtml.includes('Adds up to') && groupHtml.includes('1,200'), 'breakdown shows "Adds up to 1,200"')

  console.log('\n== no em dashes anywhere in the rendered cards ==')
  ok(!groupHtml.includes(EM_DASH), 'no em dash (\\u2014) in the rendered breakdown')

  console.log(`\n${fail === 0 ? 'ALL PASS' : fail + ' FAILED'}\n`)
  process.exit(fail === 0 ? 0 : 1)
}

main()
