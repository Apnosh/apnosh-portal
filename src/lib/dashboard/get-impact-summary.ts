/**
 * Auto-generated monthly impact summary — "what your Google presence did
 * this month, and how it compares to last." Computed live from gbp_metrics +
 * reviews + the Places rating, so it needs no manual publishing.
 *
 * Fairness matters here. Google's daily performance data lags a few days, so
 * "month so far" is really only complete through the last ingested day. We
 * anchor BOTH windows to that last-complete day (this month days 1..N vs last
 * month days 1..N), otherwise an incomplete June would always look down
 * against a complete May — a false negative.
 */

import { createAdminClient } from '@/lib/supabase/admin'

const num = (v: unknown): number => Number(v ?? 0)
const ymd = (d: Date): string => {
  const y = d.getFullYear(), m = `${d.getMonth() + 1}`.padStart(2, '0'), day = `${d.getDate()}`.padStart(2, '0')
  return `${y}-${m}-${day}`
}
const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export interface ImpactMetric { key: string; label: string; value: number; prev: number; deltaPct: number | null }
export interface ImpactSummary {
  monthLabel: string
  rangeLabel: string
  throughLabel: string | null
  metrics: ImpactMetric[]
  reviewsThisMonth: number
  reviewsPrevMonth: number
  rating: number | null
  ratingCount: number | null
  hasData: boolean
}

export async function getImpactSummary(clientId: string): Promise<ImpactSummary> {
  const admin = createAdminClient()
  const now = new Date()
  const y = now.getFullYear(), m = now.getMonth()
  const monthStart = ymd(new Date(y, m, 1))
  const prevMonthStart = ymd(new Date(y, m - 1, 1))

  const [gbp, reviews, locs] = await Promise.all([
    admin.from('gbp_metrics')
      .select('date, directions, calls, website_clicks, search_views, impressions_total')
      .eq('client_id', clientId).gte('date', prevMonthStart),
    admin.from('reviews')
      .select('posted_at').eq('client_id', clientId).eq('source', 'google')
      .gte('posted_at', prevMonthStart + 'T00:00:00'),
    admin.from('gbp_locations')
      .select('place_rating, place_rating_count, is_primary').eq('client_id', clientId),
  ])

  const rows = (gbp.data ?? []) as Record<string, unknown>[]
  const viewsOf = (r: Record<string, unknown>) => num(r.impressions_total) || num(r.search_views)
  const hasAny = (r: Record<string, unknown>) =>
    viewsOf(r) + num(r.directions) + num(r.calls) + num(r.website_clicks) > 0

  // Anchor: the latest day THIS month that actually has data. Google lags a few
  // days, so trailing empty days don't count as a real decline.
  let cutoff = ''
  for (const r of rows) {
    const d = String(r.date).slice(0, 10)
    if (d >= monthStart && hasAny(r) && d > cutoff) cutoff = d
  }

  if (!cutoff) {
    const locRows0 = (locs.data ?? []) as { place_rating: number | null; place_rating_count: number | null; is_primary?: boolean }[]
    const primary0 = locRows0.find(l => l.is_primary) ?? locRows0[0]
    return {
      monthLabel: `${MON[m]} ${y}`,
      rangeLabel: '', throughLabel: null,
      metrics: [],
      reviewsThisMonth: 0, reviewsPrevMonth: 0,
      rating: primary0?.place_rating ?? null, ratingCount: primary0?.place_rating_count ?? null,
      hasData: false,
    }
  }

  const cutoffDom = parseInt(cutoff.slice(8, 10), 10)
  // Same window length last month, clamped to that month's length.
  const daysInPrevMonth = new Date(y, m, 0).getDate()
  const prevDom = Math.min(cutoffDom, daysInPrevMonth)
  const prevCutoff = ymd(new Date(y, m - 1, prevDom))

  let views_t = 0, views_p = 0, calls_t = 0, calls_p = 0, dir_t = 0, dir_p = 0, clicks_t = 0, clicks_p = 0
  for (const r of rows) {
    const d = String(r.date).slice(0, 10)
    if (d >= monthStart && d <= cutoff) {
      views_t += viewsOf(r); calls_t += num(r.calls); dir_t += num(r.directions); clicks_t += num(r.website_clicks)
    } else if (d >= prevMonthStart && d <= prevCutoff) {
      views_p += viewsOf(r); calls_p += num(r.calls); dir_p += num(r.directions); clicks_p += num(r.website_clicks)
    }
  }

  let rev_t = 0, rev_p = 0
  for (const r of (reviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.posted_at) continue
    const d = String(r.posted_at).slice(0, 10)
    if (d >= monthStart && d <= cutoff) rev_t++
    else if (d >= prevMonthStart && d <= prevCutoff) rev_p++
  }

  const locRows = (locs.data ?? []) as { place_rating: number | null; place_rating_count: number | null; is_primary?: boolean }[]
  const primary = locRows.find(l => l.is_primary) ?? locRows[0]

  const pct = (t: number, p: number): number | null => (p > 0 ? Math.round(((t - p) / p) * 100) : null)
  const actions_t = calls_t + dir_t + clicks_t, actions_p = calls_p + dir_p + clicks_p

  const metrics: ImpactMetric[] = [
    { key: 'views', label: 'Profile views', value: views_t, prev: views_p, deltaPct: pct(views_t, views_p) },
    { key: 'actions', label: 'Customer actions', value: actions_t, prev: actions_p, deltaPct: pct(actions_t, actions_p) },
    { key: 'calls', label: 'Calls', value: calls_t, prev: calls_p, deltaPct: pct(calls_t, calls_p) },
    { key: 'directions', label: 'Direction requests', value: dir_t, prev: dir_p, deltaPct: pct(dir_t, dir_p) },
    { key: 'clicks', label: 'Website clicks', value: clicks_t, prev: clicks_p, deltaPct: pct(clicks_t, clicks_p) },
  ]

  return {
    monthLabel: `${MON[m]} ${y}`,
    rangeLabel: `${MON[m].slice(0, 3)} 1–${cutoffDom}`,
    throughLabel: `${MON[m].slice(0, 3)} ${cutoffDom}`,
    metrics,
    reviewsThisMonth: rev_t,
    reviewsPrevMonth: rev_p,
    rating: primary?.place_rating ?? null,
    ratingCount: primary?.place_rating_count ?? null,
    hasData: true,
  }
}
