/**
 * SERVER-ONLY per-source VALUE resolver for the outcome funnel (Phase 2).
 * =======================================================================
 * The status resolver (resolve-source-statuses.ts) answers "is this source
 * CONNECTED?". This module answers the second half: "what is its real number
 * for the window?" — read straight from the metric tables, summed over the
 * window, per the source -> column map in the registry.
 *
 * Rules that make it honest:
 *  - Every value is a SUM (or count/avg) of REAL rows over the window. We never
 *    estimate, extrapolate, or fill a gap.
 *  - Best-effort + never throws: a missing table/column or a failed read leaves
 *    that source's value `null` (excluded from every headline sum), not a fake 0.
 *  - A genuinely queried zero IS a real 0 (contributes 0, honest). Only an
 *    unavailable source is null.
 *  - Sources with no adapter / not wired (tiktok, ig sub-metrics, pos_*,
 *    delivery, reservations, loyalty, ga4_phone_taps) are never queried — they
 *    stay absent (null) and can never enter a sum.
 *
 * The pure stage math consumes this map alongside the status map; keeping the
 * I/O here means computeStagesFrom stays unit-testable offline.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getDataFrontier } from '@/lib/dashboard/data-frontier'
import type { InsightsWindow, StageExplore } from './compute-stages'

/** source id -> real value for the window (null = unavailable, excluded from sums). */
export type StageValueMap = Record<string, number | null>

function windowDays(w: InsightsWindow): number {
  if (w === '7d') return 7
  if (w === '90d') return 90
  if (w === '12m') return 365
  return 30
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/** The two windows we read against:
 *  - gbp: anchored to today-3 (the GBP Performance API's documented lag boundary),
 *    matching getGbpAnalytics so the funnel agrees with the Visibility tab.
 *  - other: a plain last-N-days bound for social / website / search / reviews.
 *
 * `periodsBack` slides BOTH windows back by whole periods, so periodsBack=1 on a
 * 30d window is the 30 days immediately before the current 30. That is what lets
 * the analyst compare the owner to their own past instead of to other businesses.
 *
 * The upper bound on the "other" sources is null for the live period and only set
 * when looking back. That is deliberate: the live query stays exactly as it was
 * (`>= start`, open-ended), so adding history cannot change a number the owner
 * already sees on the dashboard today.
 */
function windowBounds(
  w: InsightsWindow,
  periodsBack = 0,
  endAnchor?: string,
): { gbpStart: string; gbpEnd: string; otherStart: string; otherEnd: string | null } {
  const days = windowDays(w)
  const shift = days * periodsBack

  // ONE window for every source, ending at the shared data frontier (the last
  // day all active sources reported — see getDataFrontier). The chart bars use
  // the same anchor, so headline and bars cover the SAME days. Without an
  // anchor (frontier read failed) fall back to the old per-source lags.
  if (endAnchor) {
    const end = new Date(endAnchor + 'T00:00:00Z')
    end.setUTCDate(end.getUTCDate() - shift)
    const start = new Date(end)
    start.setUTCDate(start.getUTCDate() - (days - 1))
    return { gbpStart: ymd(start), gbpEnd: ymd(end), otherStart: ymd(start), otherEnd: ymd(end) }
  }

  const gbpEnd = new Date()
  gbpEnd.setUTCDate(gbpEnd.getUTCDate() - 3 - shift)
  const gbpStart = new Date(gbpEnd)
  gbpStart.setUTCDate(gbpStart.getUTCDate() - (days - 1))

  const otherStart = new Date()
  otherStart.setUTCDate(otherStart.getUTCDate() - (days - 1) - shift)
  // The day before the next period begins, so consecutive periods never double-count.
  const otherEndDate = new Date(otherStart)
  otherEndDate.setUTCDate(otherEndDate.getUTCDate() + (days - 1))

  return {
    gbpStart: ymd(gbpStart),
    gbpEnd: ymd(gbpEnd),
    otherStart: ymd(otherStart),
    otherEnd: periodsBack > 0 ? ymd(otherEndDate) : null,
  }
}

const num = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) ? n : 0
}

/**
 * Load every source's real value for the window. Never throws; any failed read
 * leaves its sources null. Only wired sources that can plausibly resolve
 * CONNECTED are read — the rest are simply never added to the map (=> null).
 */
/** Per-source "as of" stamps, filled alongside the values (see loadStageFreshness). */
export type StageFreshnessMap = Record<string, string>

export async function loadStageValues(
  clientId: string,
  w: InsightsWindow = '30d',
  periodsBack = 0,
): Promise<StageValueMap> {
  const out: StageValueMap = {}
  const admin = createAdminClient()
  // Shared complete-data frontier — the same anchor the chart bars use.
  const frontier = await getDataFrontier(admin, clientId).catch(() => undefined)
  const { gbpStart, gbpEnd, otherStart, otherEnd } = windowBounds(w, periodsBack, frontier)
  // Close the top of the window only when looking back, so a past period stops where
  // the next one starts. On the live period this is a no-op and the query is untouched.
  const capDate = <T extends { lte: (col: string, v: string) => T }>(q: T, col = 'date'): T =>
    otherEnd ? q.lte(col, otherEnd) : q
  const capTs = <T extends { lte: (col: string, v: string) => T }>(q: T, col: string): T =>
    otherEnd ? q.lte(col, otherEnd + 'T23:59:59.999Z') : q

  // ── Google Business Profile (gbp_metrics) ──────────────────────────────
  try {
    const { data, error } = await admin
      .from('gbp_metrics')
      .select('impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, search_views, impressions_total, directions, calls, website_clicks, bookings, food_menu_clicks')
      .eq('client_id', clientId)
      .gte('date', gbpStart)
      .lte('date', gbpEnd)
    if (!error && data) {
      let search = 0, maps = 0
      let directions = 0, calls = 0, clicks = 0, bookings = 0, menuClicks = 0
      for (const r of data as Record<string, unknown>[]) {
        // per-ROW fallback (same rule as the chart's daily fold, so the two
        // always sum identically): the real split when the row has it, else
        // the legacy search_views/impressions_total
        const split = num(r.impressions_search_mobile) + num(r.impressions_search_desktop)
        search += split > 0 ? split : num(r.search_views ?? r.impressions_total)
        maps += num(r.impressions_maps_mobile) + num(r.impressions_maps_desktop)
        directions += num(r.directions)
        calls += num(r.calls)
        clicks += num(r.website_clicks)
        bookings += num(r.bookings)
        menuClicks += num(r.food_menu_clicks)
      }
      out.gbp_impressions_search = search
      out.gbp_impressions_maps = maps
      out.gbp_direction_requests = directions
      out.gbp_calls = calls
      out.gbp_website_clicks = clicks
      out.gbp_booking_clicks = bookings
      out.gbp_menu_clicks = menuClicks
    }
  } catch { /* GBP unavailable -> its sources stay null */ }

  // ── Reviews (reviews + local_reviews) -> review count + rating trend ────
  try {
    let count = 0
    let ratingSum = 0
    let ratingN = 0
    const [rev, local] = await Promise.all([
      capTs(admin.from('reviews').select('rating, posted_at').eq('client_id', clientId).gte('posted_at', otherStart + 'T00:00:00'), 'posted_at'),
      capTs(admin.from('local_reviews').select('rating, created_at_platform').eq('client_id', clientId).gte('created_at_platform', otherStart + 'T00:00:00'), 'created_at_platform'),
    ])
    for (const r of (rev.data ?? []) as Record<string, unknown>[]) {
      count++
      if (r.rating != null) { ratingSum += num(r.rating); ratingN++ }
    }
    for (const r of (local.data ?? []) as Record<string, unknown>[]) {
      count++
      if (r.rating != null) { ratingSum += num(r.rating); ratingN++ }
    }
    // only claim a value if at least one of the two reads succeeded (not both errored)
    if (!rev.error || !local.error) {
      out.gbp_review_count = count
      out.gbp_rating_trend = ratingN > 0 ? Math.round((ratingSum / ratingN) * 10) / 10 : null
    }
  } catch { /* reviews unavailable */ }

  // ── Socials (social_metrics) -> per-PLATFORM reach, plus follower growth /
  //    profile visits / engagement. Written daily by the social vendor sync.
  //    Reach is split by platform so each chip shows ITS number — Facebook
  //    reach under Facebook, never silently folded into the Instagram chip. ──
  try {
    const { data, error } = await capDate(admin
      .from('social_metrics')
      .select('platform, reach, impressions, followers_gained, profile_visits, engagement, raw_data')
      .eq('client_id', clientId)
      .gte('date', otherStart))
    if (!error && data) {
      const reachBy: Record<string, number> = {}
      const imprBy: Record<string, number> = {}
      const engBy: Record<string, number> = {}
      const folBy: Record<string, number> = {}
      const ssBy: Record<string, number> = {}
      let gained = 0, visits = 0, linkClicks = 0, savesShares = 0
      for (const r of data as Record<string, unknown>[]) {
        const p = typeof r.platform === 'string' ? r.platform : 'instagram'
        reachBy[p] = (reachBy[p] ?? 0) + num(r.reach)
        imprBy[p] = (imprBy[p] ?? 0) + num(r.impressions)
        engBy[p] = (engBy[p] ?? 0) + num(r.engagement)
        folBy[p] = (folBy[p] ?? 0) + num(r.followers_gained)
        gained += num(r.followers_gained)
        visits += num(r.profile_visits)
        /* per-post link clicks + saves + shares live in the day row's raw_data.totals */
        const totals = (r.raw_data as { totals?: { clicks?: unknown; saves?: unknown; shares?: unknown } } | null)?.totals
        linkClicks += num(totals?.clicks)
        const ss = num(totals?.saves) + num(totals?.shares)
        ssBy[p] = (ssBy[p] ?? 0) + ss
        savesShares += ss
      }
      /* Platforms report differently: IG/FB have reach; TikTok and LinkedIn report
       * views/impressions and no reach. Each chip shows the platform's real number
       * instead of a false 0 — views first for TikTok (that IS its number). */
      const best = (p: string) => (reachBy[p] ?? 0) > 0 ? (reachBy[p] ?? 0) : (imprBy[p] ?? 0)
      out.ig_reach = best('instagram')
      out.facebook_reach = best('facebook')
      out.tiktok_video_views = (imprBy.tiktok ?? 0) > 0 ? (imprBy.tiktok ?? 0) : (reachBy.tiktok ?? 0)
      out.linkedin_reach = best('linkedin')
      /* YouTube reports views (mapped to impressions by the sync), never reach */
      out.youtube_views = (imprBy.youtube ?? 0) > 0 ? (imprBy.youtube ?? 0) : (reachBy.youtube ?? 0)
      out.ig_follower_growth = gained
      /* profile visits only when the vendor actually provides them (ayrshare does,
       * zernio does not) — a permanent 0 would read as data for a missing metric */
      if (visits > 0) out.ig_profile_visits = visits
      /* engagement splits per platform (owner ask 2026-08-12) — the five sources
       * sum to the old all-platform ig_engaged, so the Interest total is unchanged */
      out.ig_engaged = engBy.instagram ?? 0
      out.facebook_engaged = engBy.facebook ?? 0
      out.tiktok_engaged = engBy.tiktok ?? 0
      out.linkedin_engaged = engBy.linkedin ?? 0
      out.youtube_engaged = engBy.youtube ?? 0
      out.social_link_clicks = linkClicks
      out.social_follows = gained
      out.social_saves_shares = savesShares
      /* per-platform splits (owner ask: follows + saves/shares BY SOURCE) */
      for (const pl of ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const) {
        out[`${pl}_follows`] = folBy[pl] ?? 0
        out[`${pl}_saves_shares`] = ssBy[pl] ?? 0
      }
    }
  } catch { /* social unavailable */ }

  // ── Register + delivery (pos_daily_sales) -> orders, revenue, avg ticket,
  //    delivery orders. Written daily by the Square/Clover sync; delivery rows
  //    come from uploaded statements (source statement:*). ──
  try {
    const { data, error } = await capDate(admin
      .from('pos_daily_sales')
      .select('source, day, gross_cents, orders')
      .eq('client_id', clientId)
      .gte('day', otherStart), 'day')
    if (!error && data) {
      let regOrders = 0, regGross = 0, delOrders = 0
      for (const r of data as Record<string, unknown>[]) {
        const src = typeof r.source === 'string' ? r.source : ''
        if (src === 'square' || src === 'clover') {
          regOrders += num(r.orders)
          regGross += num(r.gross_cents)
        } else if (src.startsWith('statement:')) {
          delOrders += num(r.orders)
        }
      }
      out.pos_covers = regOrders
      out.pos_revenue = Math.round(regGross / 100)
      out.pos_avg_ticket = regOrders > 0 ? Math.round(regGross / regOrders / 100) : null
      out.delivery_orders = delOrders
    }
  } catch { /* register unavailable -> its sources stay null */ }

  // ── Website / GA4 (website_metrics) -> website visits (sessions), menu views,
  //    order clicks, returning users. sessions are always ingested when GA4 is
  //    connected; menu_views / order_clicks come from migration 206. ──
  try {
    const { data, error } = await capDate(admin
      .from('website_metrics')
      .select('sessions, menu_views, order_clicks, returning_users')
      .eq('client_id', clientId)
      .gte('date', otherStart))
    if (!error && data) {
      let visits = 0, menu = 0, order = 0, ret = 0
      let sawSessions = false, sawReturning = false
      for (const r of data as Record<string, unknown>[]) {
        if (r.sessions != null) { visits += num(r.sessions); sawSessions = true }
        menu += num(r.menu_views)
        order += num(r.order_clicks)
        if (r.returning_users != null) { ret += num(r.returning_users); sawReturning = true }
      }
      out.ga4_website_visits = sawSessions ? visits : null
      out.ga4_menu_views = menu
      out.ga4_order_clicks = order
      out.ga4_returning_users = sawReturning ? ret : null
    }
  } catch { /* website metrics unavailable */ }

  // ── Search Console (search_metrics) -> site impressions (drill-down) ────
  try {
    const { data, error } = await capDate(admin
      .from('search_metrics')
      .select('total_impressions')
      .eq('client_id', clientId)
      .gte('date', otherStart))
    if (!error && data) {
      let impr = 0
      for (const r of data as Record<string, unknown>[]) impr += num(r.total_impressions)
      out.gsc_site_impressions = impr
    }
  } catch { /* GSC unavailable */ }

  return out
}

/** Interest enrichment: the real GA4 "what they explored" + engagement depth for
 *  the window. Best-effort; returns null when there's no real website data, so
 *  the Interest panel simply hides rather than inventing an empty state. Every
 *  number is a real sum/weighted-average of rows — nothing estimated. */
export async function loadInterestExplore(clientId: string, w: InsightsWindow = '30d'): Promise<StageExplore | null> {
  const { otherStart } = windowBounds(w)
  const admin = createAdminClient()
  try {
    const { data, error } = await admin
      .from('website_metrics')
      .select('sessions, page_views, visitors, avg_session_duration, top_pages')
      .eq('client_id', clientId)
      .gte('date', otherStart)
    if (error || !data || data.length === 0) return null
    let sessions = 0, pageViews = 0, visitors = 0, durSum = 0, durWeight = 0
    let sawSessions = false, sawVisitors = false, sawDur = false
    const pageViewsByPath = new Map<string, number>()
    for (const r of data as Record<string, unknown>[]) {
      if (r.sessions != null) { sessions += num(r.sessions); sawSessions = true }
      pageViews += num(r.page_views)
      if (r.visitors != null) { visitors += num(r.visitors); sawVisitors = true }
      if (r.avg_session_duration != null) {
        const s = num(r.sessions) || 1
        durSum += num(r.avg_session_duration) * s
        durWeight += s
        sawDur = true
      }
      const tp = r.top_pages
      if (Array.isArray(tp)) {
        for (const p of tp as Array<{ path?: unknown; views?: unknown }>) {
          const path = typeof p?.path === 'string' ? p.path : null
          if (!path) continue
          pageViewsByPath.set(path, (pageViewsByPath.get(path) ?? 0) + num(p.views))
        }
      }
    }
    if (!sawSessions || sessions === 0) return null  // no real website data -> hide the panel
    const topPages = [...pageViewsByPath.entries()]
      .map(([path, views]) => ({ path, label: labelForPath(path), views }))
      .sort((a, b) => b.views - a.views)
      .slice(0, 6)
    return {
      topPages,
      pagesPerVisit: sessions > 0 ? Math.round((pageViews / sessions) * 10) / 10 : null,
      avgSeconds: sawDur && durWeight > 0 ? Math.round(durSum / durWeight) : null,
      visitors: sawVisitors ? visitors : null,
    }
  } catch {
    return null
  }
}

/** "/menu/" -> "Menu", "/" -> "Home", "/about-us/#team" -> "About us". */
function labelForPath(path: string): string {
  const clean = path.split('#')[0].split('?')[0].replace(/^\/+|\/+$/g, '')
  if (!clean) return 'Home'
  const seg = clean.split('/').pop() || clean
  const words = seg.replace(/[-_]+/g, ' ').trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/**
 * WHEN each platform's numbers were last refreshed BY THE PLATFORM, keyed by source id.
 *
 * Not "when we synced": the owner asked for the date they can actually trust, and those are
 * different facts. A sync that runs every night still reports Instagram numbers the platform
 * refreshed an hour ago and TikTok numbers it refreshed yesterday. The vendor stamps each
 * analytics row with its own lastUpdated; the sync keeps the newest per platform, and this
 * reads it back for the cards.
 */
export async function loadStageFreshness(clientId: string): Promise<StageFreshnessMap> {
  const out: StageFreshnessMap = {}
  try {
    const admin = createAdminClient()
    const since = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10)
    const { data } = await admin
      .from('social_metrics')
      .select('platform, date, raw_data')
      .eq('client_id', clientId)
      .gte('date', since)
      .order('date', { ascending: false })
    const newest: Record<string, string> = {}
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const p = typeof r.platform === 'string' ? r.platform : ''
      if (!p) continue
      const stamp = (r.raw_data as { source_updated_at?: unknown } | null)?.source_updated_at
      /* The vendor's own refresh time when we have it. When we do not — rows written before
       * we started keeping it, or a source that does not report one — fall back to the day
       * the row covers, so the card still dates its number instead of showing nothing. A
       * date-only fallback renders as midnight, which reads as "that day" rather than
       * claiming a precision we do not have. */
      const v = typeof stamp === 'string' && stamp
        ? stamp
        : (typeof r.date === 'string' ? `${r.date} 00:00:00` : '')
      if (v && (!newest[p] || v > newest[p])) newest[p] = v
    }
    /* map platform -> the source ids that platform feeds */
    const FEEDS: Record<string, string[]> = {
      instagram: ['ig_reach', 'instagram_follows', 'instagram_saves_shares'],
      facebook: ['facebook_reach', 'facebook_follows', 'facebook_saves_shares'],
      tiktok: ['tiktok_video_views', 'tiktok_follows', 'tiktok_saves_shares'],
      linkedin: ['linkedin_reach', 'linkedin_follows', 'linkedin_saves_shares'],
      youtube: ['youtube_views', 'youtube_follows', 'youtube_saves_shares'],
    }
    for (const [platform, stamp] of Object.entries(newest)) {
      for (const id of FEEDS[platform] ?? []) out[id] = stamp
    }

    /* Google and the website report BY DAY, with no per-pull timestamp of their own — but
     * "no stamp at all" reads as "we have no idea when this came from", which is worse than
     * a date. The owner asked for a stamp on every platform (2026-08-13) and Google was the
     * one still bare. Stamp them with the last day they actually reported, date-only, so the
     * card says "as of Aug 8" rather than claiming an hour we cannot know. */
    const dayStamp = async (table: string, ids: string[]) => {
      const { data } = await admin
        .from(table)
        .select('date')
        .eq('client_id', clientId)
        .order('date', { ascending: false })
        .limit(1)
      const d = (data ?? [])[0] as { date?: unknown } | undefined
      if (d && typeof d.date === 'string') for (const id of ids) out[id] = d.date
    }
    await Promise.all([
      dayStamp('gbp_metrics', [
        'gbp_impressions_search', 'gbp_impressions_maps', 'gbp_website_clicks',
        'gbp_direction_requests', 'gbp_calls', 'gbp_booking_clicks', 'gbp_menu_clicks',
      ]),
      dayStamp('website_metrics', ['ga4_website_visits', 'ga4_order_clicks', 'ga4_returning_users']),
    ])
  } catch { /* freshness is a nicety; never break the numbers for it */ }
  return out
}

/**
 * Per-source CONTEXT lines — a second true number the card needs to not mislead.
 *
 * Built for one specific lie: the Interest breakdown lists "Instagram followers 0",
 * "TikTok followers 0" and so on, because those rows measure follows GAINED in the window
 * and only Instagram reports that. The owner reads a row labelled followers showing 0 and
 * concludes we lost their audience — reasonably. We now store the real audience size
 * (social_metrics.followers_total), so each row can carry it.
 *
 * This never enters a sum. Followers are a STOCK (how many you have) and the stage headline
 * is a FLOW (what happened in 30 days); adding them would be the same category error that
 * produced the disagreeing numbers this dashboard has been chased over all week.
 */
export async function loadSourceContext(clientId: string): Promise<StageFreshnessMap> {
  const out: StageFreshnessMap = {}
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('social_metrics')
      .select('platform, date, followers_total')
      .eq('client_id', clientId)
      .order('date', { ascending: false })
      .limit(60)
    const seen: Record<string, number> = {}
    for (const r of (data ?? []) as Record<string, unknown>[]) {
      const p = typeof r.platform === 'string' ? r.platform : ''
      const v = num(r.followers_total)
      if (!p || p in seen) continue
      if (v > 0) seen[p] = v
    }
    for (const [platform, total] of Object.entries(seen)) {
      out[`${platform}_follows`] = `${total.toLocaleString()} followers now`
    }
  } catch { /* context is a nicety; never break the numbers for it */ }
  return out
}
