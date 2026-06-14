/**
 * Auto-generated monthly impact summary — "what your Google presence did
 * this month, and how it compares to last." Computed live from gbp_metrics +
 * reviews + the Places rating, so it needs no manual publishing.
 *
 * Comparison is month-to-date vs the SAME number of days last month, so the
 * delta is fair even early in the month (not partial-month vs full-month).
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
  const y = now.getFullYear(), m = now.getMonth(), dom = now.getDate()
  const monthStart = ymd(new Date(y, m, 1))
  const prevMonthStart = ymd(new Date(y, m - 1, 1))
  // Same window length last month (days 1..today-of-month).
  const prevCutoff = ymd(new Date(y, m - 1, dom))

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

  let views_t = 0, views_p = 0, calls_t = 0, calls_p = 0, dir_t = 0, dir_p = 0, clicks_t = 0, clicks_p = 0
  for (const r of (gbp.data ?? []) as Record<string, unknown>[]) {
    const d = String(r.date).slice(0, 10)
    const views = num(r.impressions_total) || num(r.search_views)
    if (d >= monthStart) {
      views_t += views; calls_t += num(r.calls); dir_t += num(r.directions); clicks_t += num(r.website_clicks)
    } else if (d >= prevMonthStart && d <= prevCutoff) {
      views_p += views; calls_p += num(r.calls); dir_p += num(r.directions); clicks_p += num(r.website_clicks)
    }
  }

  let rev_t = 0, rev_p = 0
  for (const r of (reviews.data ?? []) as Record<string, unknown>[]) {
    if (!r.posted_at) continue
    const d = String(r.posted_at).slice(0, 10)
    if (d >= monthStart) rev_t++
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

  const hasData = views_t + actions_t + rev_t > 0

  return {
    monthLabel: `${MON[m]} ${y}`,
    rangeLabel: `${MON[m].slice(0, 3)} 1–${dom}`,
    metrics,
    reviewsThisMonth: rev_t,
    reviewsPrevMonth: rev_p,
    rating: primary?.place_rating ?? null,
    ratingCount: primary?.place_rating_count ?? null,
    hasData,
  }
}
