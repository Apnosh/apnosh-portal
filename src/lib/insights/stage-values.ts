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
import type { InsightsWindow } from './compute-stages'

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
 *  - other: a plain last-N-days bound for social / website / search / reviews. */
function windowBounds(w: InsightsWindow): { gbpStart: string; gbpEnd: string; otherBound: string } {
  const days = windowDays(w)
  const gbpEnd = new Date()
  gbpEnd.setUTCDate(gbpEnd.getUTCDate() - 3)
  const gbpStart = new Date(gbpEnd)
  gbpStart.setUTCDate(gbpStart.getUTCDate() - (days - 1))
  const other = new Date()
  other.setUTCDate(other.getUTCDate() - (days - 1))
  return { gbpStart: ymd(gbpStart), gbpEnd: ymd(gbpEnd), otherBound: ymd(other) }
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
export async function loadStageValues(clientId: string, w: InsightsWindow = '30d'): Promise<StageValueMap> {
  const out: StageValueMap = {}
  const { gbpStart, gbpEnd, otherBound } = windowBounds(w)
  const admin = createAdminClient()

  // ── Google Business Profile (gbp_metrics) ──────────────────────────────
  try {
    const { data, error } = await admin
      .from('gbp_metrics')
      .select('impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, search_views, impressions_total, directions, calls, website_clicks, bookings, food_menu_clicks')
      .eq('client_id', clientId)
      .gte('date', gbpStart)
      .lte('date', gbpEnd)
    if (!error && data) {
      let searchSplit = 0, searchFallback = 0, maps = 0
      let directions = 0, calls = 0, clicks = 0, bookings = 0, menuClicks = 0
      for (const r of data as Record<string, unknown>[]) {
        searchSplit += num(r.impressions_search_mobile) + num(r.impressions_search_desktop)
        // fallback per legacy rows with no split columns: search_views mirrors the total
        searchFallback += num(r.search_views ?? r.impressions_total)
        maps += num(r.impressions_maps_mobile) + num(r.impressions_maps_desktop)
        directions += num(r.directions)
        calls += num(r.calls)
        clicks += num(r.website_clicks)
        bookings += num(r.bookings)
        menuClicks += num(r.food_menu_clicks)
      }
      // prefer the real split; only fall back to search_views/total when the split is empty
      out.gbp_impressions_search = searchSplit > 0 ? searchSplit : searchFallback
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
      admin.from('reviews').select('rating, posted_at').eq('client_id', clientId).gte('posted_at', otherBound + 'T00:00:00'),
      admin.from('local_reviews').select('rating, created_at_platform').eq('client_id', clientId).gte('created_at_platform', otherBound + 'T00:00:00'),
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

  // ── Instagram (social_metrics) -> reach, profile visits, engagement,
  //    follower growth. All written daily by the sync-social-metrics edge fn. ──
  try {
    const { data, error } = await admin
      .from('social_metrics')
      .select('reach, followers_gained, profile_visits, engagement')
      .eq('client_id', clientId)
      .gte('date', otherBound)
    if (!error && data) {
      let reach = 0, gained = 0, visits = 0, engaged = 0
      for (const r of data as Record<string, unknown>[]) {
        reach += num(r.reach)
        gained += num(r.followers_gained)
        visits += num(r.profile_visits)
        engaged += num(r.engagement)
      }
      out.ig_reach = reach
      out.ig_follower_growth = gained
      out.ig_profile_visits = visits
      out.ig_engaged = engaged
    }
  } catch { /* social unavailable */ }

  // ── Website / GA4 (website_metrics) -> website visits (sessions), menu views,
  //    order clicks, returning users. sessions are always ingested when GA4 is
  //    connected; menu_views / order_clicks come from migration 206. ──
  try {
    const { data, error } = await admin
      .from('website_metrics')
      .select('sessions, menu_views, order_clicks, returning_users')
      .eq('client_id', clientId)
      .gte('date', otherBound)
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
    const { data, error } = await admin
      .from('search_metrics')
      .select('total_impressions')
      .eq('client_id', clientId)
      .gte('date', otherBound)
    if (!error && data) {
      let impr = 0
      for (const r of data as Record<string, unknown>[]) impr += num(r.total_impressions)
      out.gsc_site_impressions = impr
    }
  } catch { /* GSC unavailable */ }

  return out
}
