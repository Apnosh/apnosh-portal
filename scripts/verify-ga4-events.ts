/* Verify the GA4 event sources (Phase 1.5 outcome funnel) — OFFLINE.
 * The GA4 Data API fetch is mocked; no network, no DB. Exits non-zero on any
 * failure. 20+ checks. Proves:
 *   - menu_views sums screenPageViews ONLY for rows matching the menu path
 *     (exact-or-prefix), never /menuitems or unrelated pages.
 *   - order_clicks sums eventCount ONLY for eventName=click AND the configured
 *     linkDomain, ignoring other events and other domains.
 *   - no-config → returns null (skip), never a fake 0, and never calls GA4.
 *   - a missing-column write error is detected so the sync can skip gracefully.
 *   - phone taps are NEVER queried (no request mentions phone/tel).
 */
import {
  matchesMenuPath,
  sumMenuViews,
  sumOrderClicks,
  isMissingColumnError,
  runGA4EventReport,
  type GA4ReportRow,
} from '../src/lib/google'

let fail = 0
let count = 0
const ok = (cond: boolean, msg: string) => {
  count++
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${msg}`)
  if (!cond) fail++
}

// ── 1. matchesMenuPath: exact-or-prefix, path-segment aware ──────────────
console.log('\n== 1. matchesMenuPath ==')
ok(matchesMenuPath('/menu', '/menu'), '/menu matches /menu (exact)')
ok(matchesMenuPath('/menu/', '/menu'), '/menu/ matches /menu (trailing slash)')
ok(matchesMenuPath('/menu/lunch', '/menu'), '/menu/lunch matches /menu (sub-path)')
ok(!matchesMenuPath('/menuitems', '/menu'), '/menuitems does NOT match /menu (not a path segment)')
ok(!matchesMenuPath('/about', '/menu'), '/about does NOT match /menu')
ok(!matchesMenuPath('/menu', ''), 'empty menu path matches nothing')

// ── 2. sumMenuViews: sum screenPageViews for matching rows only ──────────
console.log('\n== 2. sumMenuViews ==')
const MENU_ROWS: GA4ReportRow[] = [
  { dimensionValues: [{ value: '/menu' }], metricValues: [{ value: '40' }] },
  { dimensionValues: [{ value: '/menu/lunch' }], metricValues: [{ value: '10' }] },
  { dimensionValues: [{ value: '/menuitems' }], metricValues: [{ value: '5' }] },  // must be ignored
  { dimensionValues: [{ value: '/about' }], metricValues: [{ value: '99' }] },      // must be ignored
]
ok(sumMenuViews(MENU_ROWS, '/menu') === 50, 'sums /menu (40) + /menu/lunch (10) = 50, ignores /menuitems + /about')
ok(sumMenuViews([], '/menu') === 0, 'no rows → 0 (a real, queried zero)')
ok(sumMenuViews(MENU_ROWS, '/specials') === 0, 'no matching rows → 0')

// ── 3. sumOrderClicks: eventName=click AND matching linkDomain only ──────
console.log('\n== 3. sumOrderClicks ==')
const ORDER_ROWS: GA4ReportRow[] = [
  { dimensionValues: [{ value: 'click' }, { value: 'order.toasttab.com' }], metricValues: [{ value: '12' }] },
  { dimensionValues: [{ value: 'click' }, { value: 'order.toasttab.com' }], metricValues: [{ value: '3' }] },
  { dimensionValues: [{ value: 'click' }, { value: 'facebook.com' }], metricValues: [{ value: '99' }] },   // wrong domain
  { dimensionValues: [{ value: 'scroll' }, { value: 'order.toasttab.com' }], metricValues: [{ value: '50' }] }, // wrong event
  { dimensionValues: [{ value: 'click' }, { value: 'ORDER.TOASTTAB.COM' }], metricValues: [{ value: '5' }] }, // case-insensitive host
]
ok(sumOrderClicks(ORDER_ROWS, 'order.toasttab.com') === 20, 'sums 12 + 3 + 5(case) = 20, ignores facebook.com + scroll')
ok(sumOrderClicks(ORDER_ROWS, 'order.otherdomain.com') === 0, 'no matching domain → 0')
ok(sumOrderClicks([], 'order.toasttab.com') === 0, 'no rows → 0 (a real, queried zero)')
ok(sumOrderClicks(ORDER_ROWS, '') === 0, 'empty domain → 0 (never sums everything)')

// ── 4. isMissingColumnError: detect un-applied migration writes ──────────
console.log('\n== 4. isMissingColumnError ==')
ok(isMissingColumnError({ code: '42703' }), 'Postgres 42703 (undefined_column) → true')
ok(isMissingColumnError({ code: 'PGRST204' }), 'PostgREST PGRST204 (schema cache) → true')
ok(isMissingColumnError({ message: 'column "menu_views" does not exist' }), 'message "column ... does not exist" → true')
ok(isMissingColumnError({ message: "Could not find the 'order_clicks' column of 'website_metrics'" }), 'PostgREST could-not-find message → true')
ok(!isMissingColumnError({ code: '23505', message: 'duplicate key' }), 'unrelated error → false')
ok(!isMissingColumnError(null), 'null → false')

// ── 5. runGA4EventReport with mocked fetch ───────────────────────────────
console.log('\n== 5. runGA4EventReport (GA4 fetch mocked) ==')

interface Captured { url: string; body: Record<string, unknown> }
const realFetch = globalThis.fetch
let captured: Captured[] = []

function installMock(shouldError = false) {
  captured = []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  globalThis.fetch = (async (url: any, init: any) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    captured.push({ url: String(url), body })
    if (shouldError) {
      return { json: async () => ({ error: { message: 'quota exceeded' } }) } as unknown as Response
    }
    const dims = (body.dimensions as Array<{ name: string }> | undefined)?.map(d => d.name) ?? []
    if (dims.includes('pagePath')) {
      return { json: async () => ({ rows: MENU_ROWS }) } as unknown as Response
    }
    if (dims.includes('eventName')) {
      return { json: async () => ({ rows: ORDER_ROWS }) } as unknown as Response
    }
    return { json: async () => ({ rows: [] }) } as unknown as Response
  }) as typeof fetch
}

async function run() {
  // 5a. Both configured → both queried and summed.
  installMock()
  const both = await runGA4EventReport('properties/1', 'tok', '2026-07-10', {
    menuPath: '/menu',
    orderDomain: 'order.toasttab.com',
  })
  ok(both.menuViews === 50, 'both config: menuViews === 50')
  ok(both.orderClicks === 20, 'both config: orderClicks === 20')
  ok(captured.length === 2, 'both config: exactly 2 GA4 requests')
  // Menu request shape.
  const menuReq = captured.find(c => JSON.stringify(c.body).includes('pagePath'))!
  ok(JSON.stringify(menuReq.body).includes('screenPageViews'), 'menu request uses screenPageViews metric')
  ok(JSON.stringify(menuReq.body).includes('BEGINS_WITH'), 'menu request filters pagePath BEGINS_WITH the menu path')
  // Order request shape.
  const orderReq = captured.find(c => JSON.stringify(c.body).includes('eventName'))!
  const orderStr = JSON.stringify(orderReq.body)
  ok(orderStr.includes('eventCount'), 'order request uses eventCount metric')
  ok(orderStr.includes('linkDomain'), 'order request uses linkDomain dimension')
  ok(orderStr.includes('"value":"click"'), 'order request filters eventName == click')
  ok(orderStr.includes('order.toasttab.com'), 'order request filters linkDomain == configured domain')
  // Phone taps are NEVER queried.
  const anyPhone = captured.some(c => /phone|tel:/i.test(JSON.stringify(c.body)))
  ok(!anyPhone, 'no GA4 request ever mentions phone / tel (phone taps never queried)')

  // 5b. Only menu configured → order stays null, one request.
  installMock()
  const menuOnly = await runGA4EventReport('properties/1', 'tok', '2026-07-10', {
    menuPath: '/menu',
    orderDomain: null,
  })
  ok(menuOnly.menuViews === 50, 'menu-only: menuViews === 50')
  ok(menuOnly.orderClicks === null, 'menu-only: orderClicks === null (not queried, not 0)')
  ok(captured.length === 1, 'menu-only: exactly 1 GA4 request')

  // 5c. Only order configured → menu stays null.
  installMock()
  const orderOnly = await runGA4EventReport('properties/1', 'tok', '2026-07-10', {
    menuPath: null,
    orderDomain: 'order.toasttab.com',
  })
  ok(orderOnly.menuViews === null, 'order-only: menuViews === null (not queried, not 0)')
  ok(orderOnly.orderClicks === 20, 'order-only: orderClicks === 20')
  ok(captured.length === 1, 'order-only: exactly 1 GA4 request')

  // 5d. No config → both null, GA4 never called.
  installMock()
  const none = await runGA4EventReport('properties/1', 'tok', '2026-07-10', {
    menuPath: null,
    orderDomain: null,
  })
  ok(none.menuViews === null && none.orderClicks === null, 'no config: both null (honest skip, never 0)')
  ok(captured.length === 0, 'no config: GA4 is NOT called at all')

  // 5e. Blank/whitespace config is treated as no config.
  installMock()
  const blank = await runGA4EventReport('properties/1', 'tok', '2026-07-10', {
    menuPath: '   ',
    orderDomain: '',
  })
  ok(blank.menuViews === null && blank.orderClicks === null, 'blank config: both null')
  ok(captured.length === 0, 'blank config: GA4 is NOT called')

  // 5f. GA4 API error → throws (caller treats event ingest as best-effort).
  installMock(true)
  let threw = false
  try {
    await runGA4EventReport('properties/1', 'tok', '2026-07-10', { menuPath: '/menu', orderDomain: null })
  } catch {
    threw = true
  }
  ok(threw, 'GA4 API error → runGA4EventReport throws (main sync swallows it)')

  globalThis.fetch = realFetch

  console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${count - fail}/${count} checks passed`)
  if (fail > 0) process.exit(1)
}

run()
