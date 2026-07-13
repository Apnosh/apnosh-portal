/* Verify computeStagesFrom — the honest outcome-funnel stage math. OFFLINE.
 * No DB, no network: statuses come from resolveSourceStatusesFrom (fixture
 * connections + config), values are injected as a fixture map. Exits non-zero on
 * any failure. 30+ checks. Proves the product promise:
 *   (a) each stage headline === the SUM of its CONNECTED (counted) source values
 *   (b) a NOT_CONNECTED / COMING_SOON source is EXCLUDED from the sum but still
 *       present in sources[]
 *   (c) Awareness's number is labeled "views"
 *   (d) Stage 3 heroSourceId === gbp_direction_requests
 *   (e) Stage 4 with all-COMING_SOON POS -> isEmpty true, headline null (collapse)
 *   (f) Stage 5 with no POS -> headline = new reviews (fallback) with a note
 *   (g) GA4 order clicks enter Actions ONLY when CONNECTED (GA4 active + config)
 *   (h) NO non-connected value is ever added (values present but source not
 *       CONNECTED stay out of every sum)
 *
 * Run: node_modules/.bin/tsx scripts/verify-compute-stages.ts */

import { resolveSourceStatusesFrom, type ConnectionSnapshot } from '../src/lib/insights/source-registry'
import { computeStagesFrom, type ComputedStage, type ManualStore } from '../src/lib/insights/compute-stages'

let fail = 0
let count = 0
const ok = (cond: boolean, msg: string) => {
  count++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fail++
}

const stage = (stages: ComputedStage[], n: number) => stages.find(s => s.stage === n)!
// the reconcile invariant: headline must equal the sum of exactly the counted sources
const sumCounted = (s: ComputedStage) => s.sources.reduce((a, v) => a + (v.counted && v.value != null ? v.value : 0), 0)
const src = (s: ComputedStage, id: string) => s.sources.find(v => v.id === id)!

// ── Shared fixtures ────────────────────────────────────────────────────────
const ACTIVE = (): ConnectionSnapshot => ({ status: 'active', sync_error: null, last_sync_at: '2026-07-10T00:00:00Z' })

// values map: gbp all present; ig_reach + ga4 values present too, so we can prove
// they only count when their provider is CONNECTED (never from the value alone).
const VALUES: Record<string, number | null> = {
  gbp_impressions_search: 1000,
  gbp_impressions_maps: 500,
  ig_profile_visits: 70,   // present, but must NOT count unless IG connected
  ig_engaged: 130,         // present, but must NOT count unless IG connected
  gbp_direction_requests: 40,
  gbp_calls: 10,
  gbp_website_clicks: 25,
  gbp_booking_clicks: 5,
  gbp_review_count: 7,
  gbp_rating_trend: 4.5,
  ig_reach: 9999,          // present, but must NOT count unless IG connected
  ig_follower_growth: 12,
  ga4_website_visits: 900,
  ga4_menu_views: 300,
  ga4_order_clicks: 150,   // present, but must NOT count unless GA4 connected + configured
  ga4_returning_users: 60,
  gsc_site_impressions: 4321,
}

// ── 1. GBP-ONLY client (the common case) ────────────────────────────────────
console.log('\n== 1. GBP-only client ==')
const gbpOnly = resolveSourceStatusesFrom({ google_business_profile: ACTIVE() })
const gbpStages = computeStagesFrom(gbpOnly, VALUES)

const aw = stage(gbpStages, 1)
ok(aw.headline === 1500, `Awareness headline = 1000 search + 500 maps = 1500 (${aw.headline})`)
ok(aw.headline === sumCounted(aw), `Awareness headline == sum(counted) (${sumCounted(aw)})`)
ok(aw.unit === 'views', `Awareness unit is "views" (${aw.unit})`)
ok(src(aw, 'ig_reach').value === null, 'ig_reach value is null when IG not connected (never read from the value map)')
ok(src(aw, 'ig_reach').counted === false, 'ig_reach NOT counted for a GBP-only client')
ok(aw.sources.some(s => s.id === 'ig_reach'), 'ig_reach still LISTED in Awareness sources (present, excluded)')
ok(src(aw, 'tiktok_video_views').status === 'COMING_SOON', 'tiktok_video_views is COMING_SOON')
ok(src(aw, 'tiktok_video_views').counted === false, 'COMING_SOON tiktok excluded from the sum')
ok(src(aw, 'gbp_search_keywords').feedRole === 'drilldown', 'gbp_search_keywords is a drilldown (not summed)')

// Interest (owner def 2026-07-13): people EXPLORING you — website visits, menu
// looks, profile taps. A GBP-only client (no GA4) falls back to its GBP website
// clicks as the one website signal.
const inte = stage(gbpStages, 2)
ok(inte.headline === 25, `Interest = GBP website clicks 25 for a GBP-only client (${inte.headline})`)
ok(src(inte, 'gbp_website_clicks').counted === true, 'gbp_website_clicks IS counted for a GBP-only client (no GA4 to dedupe against)')
ok(inte.headline === sumCounted(inte), `Interest headline == sum(counted) (${sumCounted(inte)})`)
ok(src(inte, 'ig_profile_visits').counted === false, 'ig_profile_visits NOT counted (IG not connected) despite value 70 present')
ok(src(inte, 'ig_engaged').counted === false, 'ig_engaged never summed — engagement is context, not interest')
ok(src(inte, 'ga4_menu_views').counted === false, 'ga4_menu_views NOT counted (GA4 not connected)')
ok(src(inte, 'ga4_website_visits').counted === false, 'ga4_website_visits NOT counted (GA4 not connected) despite value 900 present')

const act = stage(gbpStages, 3)
ok(act.headline === 55, `Actions = directions 40 + calls 10 + bookings 5 = 55 (site clicks now Interest) (${act.headline})`)
ok(act.headline === sumCounted(act), `Actions headline == sum(counted) (${sumCounted(act)})`)
ok(act.heroSourceId === 'gbp_direction_requests', `Stage 3 heroSourceId === gbp_direction_requests (${act.heroSourceId})`)
ok(src(act, 'gbp_direction_requests').isHero === true, 'gbp_direction_requests carries isHero')
ok(src(act, 'ga4_order_clicks').counted === false, 'ga4_order_clicks NOT counted (GA4 absent) despite value 150 present')

const sales = stage(gbpStages, 4)
ok(sales.isEmpty === true, 'Stage 4 (Sales) isEmpty — no connected register')
ok(sales.headline === null, `Stage 4 headline is null when empty (${sales.headline})`)
ok(sales.sources.length > 0, 'Stage 4 still lists its (unconnected) sources')
ok(!!sales.note && !sales.note.includes('—'), 'Stage 4 carries a calm collapse note, no em dash')

const ret = stage(gbpStages, 5)
ok(ret.headline === 7, `Stage 5 falls back to new reviews = 7 (${ret.headline})`)
ok(ret.headline === sumCounted(ret), `Stage 5 headline == sum(counted) (${sumCounted(ret)})`)
ok(src(ret, 'gbp_review_count').counted === true, 'Stage 5 counts gbp_review_count (fallback)')
ok(src(ret, 'pos_repeat_customers').counted === false, 'pos_repeat_customers NOT counted (no register)')
ok(src(ret, 'gbp_rating_trend').counted === false && src(ret, 'gbp_rating_trend').feedRole === 'context', 'rating trend is context, never summed')
ok(src(ret, 'ig_follower_growth').counted === false, 'follower growth NOT summed into Retention')
ok(!!ret.note && ret.note.toLowerCase().includes('review'), 'Stage 5 documents the review-count fallback in its note')

// (h) global: no counted source anywhere is non-connected/non-manual
const allCountedValid = gbpStages.every(s => s.sources.every(v => !v.counted || v.status === 'CONNECTED' || v.isManual === true))
ok(allCountedValid, 'no non-connected (and non-manual) source is ever counted, across all stages')

// ── 2. GA4 order clicks: connected ONLY with an active GA4 + config ─────────
console.log('\n== 2. GA4 order clicks gating ==')
// 2a. GA4 active but NO config -> order clicks AVAILABLE_NOT_CONNECTED, excluded
const ga4NoCfg = resolveSourceStatusesFrom(
  { google_business_profile: ACTIVE(), google_analytics: ACTIVE() },
  {}, // no menu path / order domain
)
const actNoCfg = stage(computeStagesFrom(ga4NoCfg, VALUES), 3)
ok(src(actNoCfg, 'ga4_order_clicks').status === 'AVAILABLE_NOT_CONNECTED', 'GA4 active, no config -> ga4_order_clicks AVAILABLE_NOT_CONNECTED')
ok(src(actNoCfg, 'ga4_order_clicks').counted === false, 'ga4_order_clicks excluded when config missing')
ok(actNoCfg.headline === 55, `Actions still 55 (order clicks excluded) (${actNoCfg.headline})`)

// 2b. GA4 active AND config -> order clicks CONNECTED and counted
const fullStatuses = resolveSourceStatusesFrom(
  { google_business_profile: ACTIVE(), instagram: ACTIVE(), google_analytics: ACTIVE() },
  { ga4_menu_path: '/menu', ga4_order_domain: 'order.toasttab.com' },
)
const full = computeStagesFrom(fullStatuses, VALUES)
const actFull = stage(full, 3)
ok(src(actFull, 'ga4_order_clicks').status === 'CONNECTED', 'GA4 active + config -> ga4_order_clicks CONNECTED')
ok(src(actFull, 'ga4_order_clicks').counted === true, 'ga4_order_clicks counted when connected + configured')
ok(actFull.headline === 205, `Actions headline = 55 + 150 order clicks = 205 (${actFull.headline})`)
ok(actFull.headline === sumCounted(actFull), 'Actions reconciles with GA4 connected')

// full-client Awareness folds ig_reach now that IG is connected
const awFull = stage(full, 1)
ok(src(awFull, 'ig_reach').counted === true, 'ig_reach counted once IG is connected')
ok(awFull.headline === 1000 + 500 + VALUES.ig_reach!, `Awareness folds ig_reach when IG connected (${awFull.headline})`)
const inteFull = stage(full, 2)
ok(src(inteFull, 'ig_profile_visits').counted === true, 'ig_profile_visits counted once IG is connected')
ok(src(inteFull, 'ig_engaged').counted === false, 'ig_engaged NOT summed even when IG connected — engagement is context, not interest')
ok(src(inteFull, 'gbp_website_clicks').counted === false, 'gbp_website_clicks deduped when GA website visits are counted (no double count)')
ok(inteFull.headline === 900 + 300 + 70, `Interest = web visits 900 + menu 300 + profile 70 = 1270; GBP clicks 25 deduped against GA visits (${inteFull.headline})`)

// ── 3. Empty / disconnected client ─────────────────────────────────────────
console.log('\n== 3. No connections at all ==')
const noneStages = computeStagesFrom(resolveSourceStatusesFrom({}), VALUES)
for (const n of [1, 2, 3, 4, 5]) {
  const s = stage(noneStages, n)
  ok(s.isEmpty === true && s.headline === null, `stage ${n} empty + null headline with no connections`)
}
ok(noneStages.every(s => s.sources.every(v => !v.counted)), 'nothing counted anywhere when no provider is connected')

// ── 4. ERROR status is excluded from the sum ────────────────────────────────
console.log('\n== 4. Errored connection excluded ==')
const erroredStages = computeStagesFrom(
  resolveSourceStatusesFrom({ google_business_profile: { status: 'error', sync_error: 'invalid_grant', last_sync_at: null } }),
  VALUES,
)
const awErr = stage(erroredStages, 1)
ok(src(awErr, 'gbp_impressions_search').status === 'ERROR', 'errored GBP -> impressions ERROR')
ok(src(awErr, 'gbp_impressions_search').counted === false, 'ERROR source excluded from the sum')
ok(awErr.isEmpty === true && awErr.headline === null, 'Awareness empty when its only provider errored (no fabricated number)')

// ── 5. Manual entry (Sales / Retention) — modeled now ───────────────────────
console.log('\n== 5. Manual entry support ==')
const manual: ManualStore = {
  pos_covers: { value: 220, by: 'owner', at: '2026-07-01' },
  pos_revenue: { value: 5500, by: 'owner', at: '2026-07-01' },
  pos_repeat_customers: { value: 64, by: 'owner', at: '2026-07-01' },
}
const manStages = computeStagesFrom(gbpOnly, VALUES, manual)
const manSales = stage(manStages, 4)
ok(manSales.headline === 220, `manual covers -> Sales headline 220 (${manSales.headline})`)
ok(manSales.isEmpty === false, 'Sales not empty with a manual covers value')
ok(src(manSales, 'pos_covers').isManual === true, 'pos_covers flagged isManual')
ok(src(manSales, 'pos_covers').manualBy === 'owner', 'pos_covers carries manualBy')
ok(src(manSales, 'pos_avg_ticket').value === 25, `avg ticket = 5500 / 220 = 25 (${src(manSales, 'pos_avg_ticket').value})`)
const manRet = stage(manStages, 5)
ok(manRet.headline === 64, `manual repeat customers -> Retention headline 64 (${manRet.headline})`)
ok(manRet.note === undefined, 'no review fallback note when repeat customers present')

// ── 6. avg ticket requires BOTH revenue and covers ──────────────────────────
console.log('\n== 6. avg ticket needs both ==')
const coversOnly = computeStagesFrom(gbpOnly, VALUES, { pos_covers: { value: 100 } })
ok(src(stage(coversOnly, 4), 'pos_avg_ticket').value === null, 'avg ticket null when revenue missing')

// ── Summary ─────────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${count - fail}/${count} checks passed`)
if (fail > 0) process.exit(1)
