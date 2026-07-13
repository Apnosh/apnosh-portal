/* Verify the insights source-of-truth registry + pure status resolver.
 * Offline, no DB — connection reads are mocked as ConnectionsByChannel maps.
 * Exits non-zero on any failure. 30+ checks. */
import {
  SOURCES,
  SOURCE_BY_ID,
  SHORT_LABELS,
  shortLabelFor,
  STAGE_NAMES,
  PROVIDER_CHANNELS,
  sourceActionVerb,
  resolveSourceStatusesFrom,
  type SourceDef,
  type SourceStatus,
  type SourceProvider,
  type ConnectionsByChannel,
} from '../src/lib/insights/source-registry'
import { getConnector } from '../src/lib/integrations/registry'

let fail = 0
let count = 0
const ok = (cond: boolean, msg: string) => {
  count++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fail++
}

// ── 1. Every stage has its spec'd sources ────────────────────────────────
console.log('\n== 1. Stage coverage ==')
const EXPECT_BY_STAGE: Record<number, string[]> = {
  1: ['gbp_impressions_search', 'gbp_impressions_maps', 'ig_reach', 'tiktok_video_views', 'facebook_reach', 'yelp_views', 'gbp_search_keywords', 'ig_nonfollower_reach_pct', 'gsc_site_impressions'],
  2: ['ga4_website_visits', 'gbp_website_clicks', 'ig_profile_visits', 'ig_engaged', 'ig_saves', 'ig_shares', 'ig_link_clicks', 'ga4_menu_views', 'gbp_menu_clicks', 'facebook_page_visits', 'tiktok_profile_views'],
  3: ['gbp_direction_requests', 'gbp_calls', 'gbp_booking_clicks', 'ga4_order_clicks', 'ga4_phone_taps', 'reservations', 'ig_profile_actions', 'facebook_cta_clicks', 'tiktok_link_clicks'],
  4: ['pos_covers', 'pos_revenue', 'pos_avg_ticket', 'delivery_orders'],
  5: ['pos_repeat_customers', 'loyalty_redemptions', 'ga4_returning_users', 'gbp_review_count', 'gbp_rating_trend', 'ig_follower_growth'],
}
for (const [stage, ids] of Object.entries(EXPECT_BY_STAGE)) {
  const present = SOURCES.filter(s => s.stage === Number(stage)).map(s => s.id)
  for (const id of ids) ok(present.includes(id), `stage ${stage} (${STAGE_NAMES[Number(stage) as 1]}) has ${id}`)
  ok(present.length === ids.length, `stage ${stage} has exactly ${ids.length} sources (found ${present.length})`)
}
ok(SOURCES.length === Object.values(EXPECT_BY_STAGE).flat().length, `total source count == ${Object.values(EXPECT_BY_STAGE).flat().length}`)

// ── 2. Required fields present + well-formed ─────────────────────────────
console.log('\n== 2. Every source is well-formed ==')
const VALID_STATUS: SourceStatus[] = ['CONNECTED', 'AVAILABLE_NOT_CONNECTED', 'ERROR', 'COMING_SOON', 'MANUAL_ENTRY']
const VALID_PROVIDER: SourceProvider[] = ['google_business_profile', 'instagram', 'google_analytics', 'google_search_console', 'tiktok', 'facebook', 'yelp', 'pos', 'reservations', 'delivery', 'loyalty', 'email']
let wellFormed = true
let uniqueIds = true
const seen = new Set<string>()
for (const s of SOURCES) {
  if (seen.has(s.id)) uniqueIds = false
  seen.add(s.id)
  const good =
    typeof s.id === 'string' && s.id.length > 0 &&
    typeof s.displayName === 'string' && s.displayName.length > 0 &&
    VALID_PROVIDER.includes(s.provider) &&
    [1, 2, 3, 4, 5].includes(s.stage) &&
    Array.isArray(s.metricKeys) &&
    VALID_STATUS.includes(s.baseStatus) &&
    ['oauth', 'api_key', 'manual', 'none'].includes(s.authType) &&
    (s.docsUrl === null || typeof s.docsUrl === 'string') &&
    typeof s.notes === 'string' && s.notes.length > 0 &&
    typeof s.wired === 'boolean'
  if (!good) { wellFormed = false; console.log(`     -> malformed: ${s.id}`) }
}
ok(wellFormed, 'every source has all required, well-typed fields')
ok(uniqueIds, 'all source ids are unique')
ok(SOURCE_BY_ID['gbp_direction_requests']?.id === 'gbp_direction_requests', 'SOURCE_BY_ID lookup works')

// ── 3. No-adapter sources are COMING_SOON + not wired ────────────────────
console.log('\n== 3. No-adapter sources are honest stubs ==')
const NO_ADAPTER = ['tiktok_video_views', 'facebook_reach', 'yelp_views', 'reservations', 'pos_covers', 'pos_revenue', 'pos_avg_ticket', 'delivery_orders', 'pos_repeat_customers', 'loyalty_redemptions']
for (const id of NO_ADAPTER) {
  const s = SOURCE_BY_ID[id]
  ok(s?.baseStatus === 'COMING_SOON', `${id} baseStatus === COMING_SOON`)
  ok(s?.wired === false, `${id} wired === false`)
}
// COMING_SOON sources have NO connector adapter registered (the true "no adapter" test).
// (A provider may have a planned channel key — e.g. tiktok — but no adapter in the registry.)
for (const id of NO_ADAPTER) {
  const s = SOURCE_BY_ID[id]
  const channels = PROVIDER_CHANNELS[s.provider] ?? []
  const anyAdapter = channels.some(ch => !!getConnector(ch))
  ok(!anyAdapter, `${id} provider "${s.provider}" has no registered connector adapter`)
}

// ── 4. IG sub-metrics are AVAILABLE_NOT_CONNECTED, never CONNECTED ────────
console.log('\n== 4. Instagram limitation encoded ==')
const IG_NOT_WIRED = ['ig_saves', 'ig_shares', 'ig_link_clicks', 'ig_nonfollower_reach_pct']
for (const id of IG_NOT_WIRED) {
  const s = SOURCE_BY_ID[id]
  ok(s?.baseStatus === 'AVAILABLE_NOT_CONNECTED', `${id} baseStatus === AVAILABLE_NOT_CONNECTED`)
  ok(s?.wired === false, `${id} wired === false (not pulled by our sync)`)
}
// The account-level IG metrics we DO pull (the daily sync-social-metrics edge
// function writes reach, profile_visits, engagement, followers_gained).
for (const id of ['ig_reach', 'ig_profile_visits', 'ig_engaged', 'ig_follower_growth']) {
  ok(SOURCE_BY_ID[id]?.wired === true && SOURCE_BY_ID[id]?.baseStatus === 'CONNECTED', `${id} is CONNECTED + wired`)
}
// The dead Google metric stays dead: photo views left the registry entirely
// (the Performance API no longer reports them — every ingested row was 0).
ok(SOURCE_BY_ID['gbp_photo_views'] === undefined, 'gbp_photo_views is NOT in the registry (unsourceable metric removed)')

// ── 5. Hero / stage-number / drilldown flags ─────────────────────────────
console.log('\n== 5. Semantic flags ==')
ok(SOURCE_BY_ID['gbp_direction_requests']?.isHero === true && SOURCE_BY_ID['gbp_direction_requests']?.stage === 3, 'gbp_direction_requests isHero on stage 3')
ok(SOURCE_BY_ID['pos_covers']?.isStageNumber === true && SOURCE_BY_ID['pos_covers']?.stage === 4, 'pos_covers isStageNumber on stage 4')
ok(SOURCE_BY_ID['pos_repeat_customers']?.isStageNumber === true && SOURCE_BY_ID['pos_repeat_customers']?.stage === 5, 'pos_repeat_customers isStageNumber on stage 5')
const drilldowns = SOURCES.filter(s => s.isDrilldown).map(s => s.id).sort()
ok(JSON.stringify(drilldowns) === JSON.stringify(['gbp_search_keywords', 'gsc_site_impressions', 'ig_nonfollower_reach_pct']), 'exactly the 3 spec drill-downs are marked isDrilldown')
// Exactly one hero total.
ok(SOURCES.filter(s => s.isHero).length === 1, 'exactly one isHero source')

// ── 6. Resolver: active connection lights up wired GBP + IG sources ──────
console.log('\n== 6. Resolver — active connections ==')
const ALL_ACTIVE: ConnectionsByChannel = {
  google_business_profile: { status: 'active', sync_error: null, last_sync_at: '2026-07-10T00:00:00Z' },
  instagram: { status: 'active', sync_error: null, last_sync_at: '2026-07-10T00:00:00Z' },
  google_analytics: { status: 'active', sync_error: null, last_sync_at: '2026-07-10T00:00:00Z' },
  google_search_console: { status: 'active', sync_error: null, last_sync_at: '2026-07-10T00:00:00Z' },
}
const active = resolveSourceStatusesFrom(ALL_ACTIVE)
for (const id of ['gbp_impressions_search', 'gbp_impressions_maps', 'gbp_direction_requests', 'gbp_calls', 'gbp_website_clicks', 'ig_reach', 'ig_profile_visits', 'ig_engaged']) {
  ok(active[id].status === 'CONNECTED', `${id} → CONNECTED when connection active`)
  ok(active[id].hasData === true, `${id} hasData true when connected`)
}
// Active-but-not-wired stays AVAILABLE_NOT_CONNECTED even with an active connection.
for (const id of ['ig_saves', 'ig_shares', 'ig_link_clicks', 'ga4_phone_taps']) {
  ok(active[id].status === 'AVAILABLE_NOT_CONNECTED', `${id} → AVAILABLE_NOT_CONNECTED despite active connection (metric not wired)`)
}
// GA4 wired metric + GSC drill-down light up when their connection is active.
ok(active['ga4_returning_users'].status === 'CONNECTED', 'ga4_returning_users → CONNECTED (sessions ingested) when GA4 active')
ok(active['ga4_website_visits'].status === 'CONNECTED', 'ga4_website_visits → CONNECTED (sessions) when GA4 active')
ok(active['gsc_site_impressions'].status === 'CONNECTED', 'gsc_site_impressions → CONNECTED when GSC active')
// No-adapter sources stay COMING_SOON no matter what.
for (const id of NO_ADAPTER) ok(active[id].status === 'COMING_SOON', `${id} → COMING_SOON even with connections present`)

// ── 6b. GA4 event sources are wired BUT config-gated (Phase 1.5) ──────────
console.log('\n== 6b. GA4 event sources — wired + config-gated ==')
// Now wired (an event we DO ingest), but need the owner's exact per-client config.
ok(SOURCE_BY_ID['ga4_menu_views']?.wired === true, 'ga4_menu_views is wired')
ok(SOURCE_BY_ID['ga4_order_clicks']?.wired === true, 'ga4_order_clicks is wired')
ok(SOURCE_BY_ID['ga4_menu_views']?.requiresClientConfig === 'ga4_menu_path', 'ga4_menu_views requires ga4_menu_path config')
ok(SOURCE_BY_ID['ga4_order_clicks']?.requiresClientConfig === 'ga4_order_domain', 'ga4_order_clicks requires ga4_order_domain config')

// GA4 active but NO config → AVAILABLE_NOT_CONNECTED + a config-missing hint.
ok(active['ga4_menu_views'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_menu_views → AVAILABLE_NOT_CONNECTED when GA4 active but menu path missing')
ok(active['ga4_menu_views'].hint === 'Add your menu page path in settings', 'ga4_menu_views carries the menu-path config hint')
ok(active['ga4_order_clicks'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_order_clicks → AVAILABLE_NOT_CONNECTED when GA4 active but ordering site missing')
ok(active['ga4_order_clicks'].hint === 'Add your ordering site in settings', 'ga4_order_clicks carries the ordering-site config hint')

// GA4 active AND config present → CONNECTED.
const activeWithConfig = resolveSourceStatusesFrom(ALL_ACTIVE, { ga4_menu_path: '/menu', ga4_order_domain: 'order.toasttab.com' })
ok(activeWithConfig['ga4_menu_views'].status === 'CONNECTED', 'ga4_menu_views → CONNECTED when GA4 active + menu path set')
ok(activeWithConfig['ga4_order_clicks'].status === 'CONNECTED', 'ga4_order_clicks → CONNECTED when GA4 active + ordering site set')
// A blank/whitespace config value is treated as missing.
const activeBlankConfig = resolveSourceStatusesFrom(ALL_ACTIVE, { ga4_menu_path: '   ', ga4_order_domain: '' })
ok(activeBlankConfig['ga4_menu_views'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_menu_views → AVAILABLE_NOT_CONNECTED when menu path is blank')
ok(activeBlankConfig['ga4_order_clicks'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_order_clicks → AVAILABLE_NOT_CONNECTED when ordering site is blank')

// GA4 errored → ERROR even with config present.
const GA4_ERROR: ConnectionsByChannel = {
  google_analytics: { status: 'error', sync_error: 'invalid_grant', last_sync_at: '2026-07-01T00:00:00Z' },
}
const ga4Errored = resolveSourceStatusesFrom(GA4_ERROR, { ga4_menu_path: '/menu', ga4_order_domain: 'order.toasttab.com' })
ok(ga4Errored['ga4_menu_views'].status === 'ERROR', 'ga4_menu_views → ERROR when GA4 connection errored')
ok(ga4Errored['ga4_order_clicks'].status === 'ERROR', 'ga4_order_clicks → ERROR when GA4 connection errored')

// GA4 missing entirely → AVAILABLE_NOT_CONNECTED (connect GA4 first), config irrelevant.
const noGa4 = resolveSourceStatusesFrom({}, { ga4_menu_path: '/menu', ga4_order_domain: 'order.toasttab.com' })
ok(noGa4['ga4_menu_views'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_menu_views → AVAILABLE_NOT_CONNECTED when GA4 not connected')
ok(noGa4['ga4_order_clicks'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_order_clicks → AVAILABLE_NOT_CONNECTED when GA4 not connected')

// ── 6c. Phone taps stay honestly off (GA4 can't see tel: taps) ───────────
console.log('\n== 6c. Phone taps honest note ==')
ok(SOURCE_BY_ID['ga4_phone_taps']?.wired === false, 'ga4_phone_taps stays wired:false')
ok(SOURCE_BY_ID['ga4_phone_taps']?.baseStatus === 'AVAILABLE_NOT_CONNECTED', 'ga4_phone_taps baseStatus AVAILABLE_NOT_CONNECTED')
ok(
  SOURCE_BY_ID['ga4_phone_taps']?.notes === 'Google Analytics cannot see phone taps on its own. Add a small tracking tag to your website to count them.',
  'ga4_phone_taps carries the exact honest tel: note',
)
ok(!SOURCE_BY_ID['ga4_phone_taps']?.requiresClientConfig, 'ga4_phone_taps has no config gate (never queried)')
// Even with GA4 active + all config, phone taps never light up (not wired).
ok(activeWithConfig['ga4_phone_taps'].status === 'AVAILABLE_NOT_CONNECTED', 'ga4_phone_taps stays AVAILABLE_NOT_CONNECTED even with GA4 active + config')

// ── 7. Resolver: errored connection → ERROR + "Reconnect" ────────────────
console.log('\n== 7. Resolver — errored connection ==')
const GBP_ERROR: ConnectionsByChannel = {
  google_business_profile: { status: 'error', sync_error: 'invalid_grant: token expired', last_sync_at: '2026-07-01T00:00:00Z' },
}
const errored = resolveSourceStatusesFrom(GBP_ERROR)
ok(errored['gbp_direction_requests'].status === 'ERROR', 'errored GBP connection → gbp_direction_requests ERROR')
ok(errored['gbp_direction_requests'].errorReason === 'invalid_grant: token expired', 'ERROR carries sync_error reason')
ok(sourceActionVerb(errored['gbp_direction_requests'].status) === 'Reconnect', 'ERROR verb is "Reconnect"')
ok(errored['gbp_direction_requests'].hasData === false, 'ERROR source has no data')

// ── 8. Resolver: disconnected / missing → AVAILABLE_NOT_CONNECTED + "Connect" ──
console.log('\n== 8. Resolver — disconnected / missing ==')
const NONE: ConnectionsByChannel = {}
const none = resolveSourceStatusesFrom(NONE)
ok(none['gbp_direction_requests'].status === 'AVAILABLE_NOT_CONNECTED', 'no GBP connection → gbp_direction_requests AVAILABLE_NOT_CONNECTED')
ok(sourceActionVerb(none['gbp_direction_requests'].status) === 'Connect', 'AVAILABLE_NOT_CONNECTED verb is "Connect"')
ok(none['ig_reach'].status === 'AVAILABLE_NOT_CONNECTED', 'no IG connection → ig_reach AVAILABLE_NOT_CONNECTED')
const DISC: ConnectionsByChannel = { google_business_profile: { status: 'disconnected', sync_error: null, last_sync_at: null } }
const disc = resolveSourceStatusesFrom(DISC)
ok(disc['gbp_calls'].status === 'AVAILABLE_NOT_CONNECTED', 'disconnected GBP → gbp_calls AVAILABLE_NOT_CONNECTED')
// pending is also not-connected
const PEND: ConnectionsByChannel = { instagram: { status: 'pending', sync_error: null, last_sync_at: null } }
ok(resolveSourceStatusesFrom(PEND)['ig_reach'].status === 'AVAILABLE_NOT_CONNECTED', 'pending IG → ig_reach AVAILABLE_NOT_CONNECTED')

// ── 9. Resolver: IG via agency-login channel (instagram_direct) ──────────
console.log('\n== 9. Resolver — instagram_direct fallback channel ==')
const IG_DIRECT: ConnectionsByChannel = { instagram_direct: { status: 'active', sync_error: null, last_sync_at: '2026-07-09T00:00:00Z' } }
ok(resolveSourceStatusesFrom(IG_DIRECT)['ig_reach'].status === 'CONNECTED', 'ig_reach → CONNECTED via instagram_direct channel')

// ── 10. Verb helper sanity ───────────────────────────────────────────────
console.log('\n== 10. Action verbs ==')
ok(sourceActionVerb('CONNECTED') === null, 'CONNECTED has no verb')
ok(sourceActionVerb('COMING_SOON') === null, 'COMING_SOON has no verb')
ok(sourceActionVerb('MANUAL_ENTRY') === null, 'MANUAL_ENTRY has no verb')

// ── 11. Short card labels — every source has one, all short + distinct ─────
console.log('\n== 11. Short card labels ==')
for (const s of SOURCES) ok(typeof SHORT_LABELS[s.id] === 'string' && SHORT_LABELS[s.id].length > 0, `${s.id} has a short label ("${SHORT_LABELS[s.id]}")`)
ok(SOURCES.every(s => shortLabelFor(s.id).length <= 22), 'every short label is <= 22 chars (fits a small card)')
ok(new Set(SOURCES.map(s => shortLabelFor(s.id))).size === SOURCES.length, 'all short labels are distinct')
ok(shortLabelFor('not_a_real_source') === 'not_a_real_source', 'unknown id falls back to the id (never throws)')

// ── Summary ──────────────────────────────────────────────────────────────
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${count - fail}/${count} checks passed`)
if (fail > 0) process.exit(1)
