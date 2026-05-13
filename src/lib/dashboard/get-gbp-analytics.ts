'use server'

/**
 * Aggregated GBP analytics for the connected client.
 *
 * Reads `gbp_metrics` (daily rows) and rolls them up to the requested
 * date range. Returns the raw daily series plus prior-period totals
 * for change comparisons. Powers /dashboard/local-seo/analytics.
 *
 * Unlike the older /dashboard/analytics page (which reads
 * gbp_monthly_data from CSV uploads), this taps the per-client
 * channel-connection sync that already populates gbp_metrics daily.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type AnalyticsRange = '7d' | '30d' | '90d' | '12m'

export interface DailyPoint {
  date: string
  impressions: number
  directions: number
  calls: number
  websiteClicks: number
  postViews: number
  conversations: number
  bookings: number
  foodOrders: number
}

export interface AnalyticsSummary {
  range: AnalyticsRange
  start: string
  end: string
  daily: DailyPoint[]
  totals: {
    impressions: number
    directions: number
    calls: number
    websiteClicks: number
    postViews: number
    conversations: number
    bookings: number
    foodOrders: number
  }
  /* Same totals for the immediately preceding window of the same
     length, so the UI can show percentage deltas without a second
     round-trip. */
  prevTotals: AnalyticsSummary['totals']
}

function emptyTotals(): AnalyticsSummary['totals'] {
  return {
    impressions: 0,
    directions: 0,
    calls: 0,
    websiteClicks: 0,
    postViews: 0,
    conversations: 0,
    bookings: 0,
    foodOrders: 0,
  }
}

function rangeToDays(range: AnalyticsRange): number {
  if (range === '7d') return 7
  if (range === '30d') return 30
  if (range === '90d') return 90
  return 365
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getGbpAnalytics(
  clientId: string,
  range: AnalyticsRange = '30d',
): Promise<AnalyticsSummary> {
  const admin = createAdminClient()
  const days = rangeToDays(range)

  /* The Performance API typically lags ~3 days, so anchor the window
     end at 1 day ago to avoid leading zeros polluting the view. */
  const endDate = new Date()
  endDate.setUTCDate(endDate.getUTCDate() - 1)
  const startDate = new Date(endDate)
  startDate.setUTCDate(startDate.getUTCDate() - (days - 1))

  /* Prior-period window of the same length, ending the day before
     the current window starts. */
  const prevEndDate = new Date(startDate)
  prevEndDate.setUTCDate(prevEndDate.getUTCDate() - 1)
  const prevStartDate = new Date(prevEndDate)
  prevStartDate.setUTCDate(prevStartDate.getUTCDate() - (days - 1))

  const [currRes, prevRes] = await Promise.all([
    admin
      .from('gbp_metrics')
      .select('date, impressions_total, directions, calls, website_clicks, post_views, conversations, bookings, food_orders, search_views')
      .eq('client_id', clientId)
      .gte('date', ymd(startDate))
      .lte('date', ymd(endDate))
      .order('date', { ascending: true }),
    admin
      .from('gbp_metrics')
      .select('impressions_total, directions, calls, website_clicks, post_views, conversations, bookings, food_orders, search_views')
      .eq('client_id', clientId)
      .gte('date', ymd(prevStartDate))
      .lte('date', ymd(prevEndDate)),
  ])

  const dailyByDate = new Map<string, DailyPoint>()
  for (const r of (currRes.data ?? []) as Array<{
    date: string
    impressions_total: number | null
    directions: number | null
    calls: number | null
    website_clicks: number | null
    post_views: number | null
    conversations: number | null
    bookings: number | null
    food_orders: number | null
    search_views: number | null
  }>) {
    /* Some legacy rows store impressions under search_views; treat
       impressions_total as the authoritative field and fall back. */
    const impressions = r.impressions_total ?? r.search_views ?? 0
    const existing = dailyByDate.get(r.date) ?? {
      date: r.date,
      impressions: 0, directions: 0, calls: 0, websiteClicks: 0,
      postViews: 0, conversations: 0, bookings: 0, foodOrders: 0,
    }
    /* Multi-location clients have one row per location per day, so
       sum the metrics across rows. */
    existing.impressions += impressions
    existing.directions += r.directions ?? 0
    existing.calls += r.calls ?? 0
    existing.websiteClicks += r.website_clicks ?? 0
    existing.postViews += r.post_views ?? 0
    existing.conversations += r.conversations ?? 0
    existing.bookings += r.bookings ?? 0
    existing.foodOrders += r.food_orders ?? 0
    dailyByDate.set(r.date, existing)
  }

  /* Fill missing dates with zeros so the chart x-axis is continuous. */
  const daily: DailyPoint[] = []
  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d)
    daily.push(dailyByDate.get(key) ?? {
      date: key,
      impressions: 0, directions: 0, calls: 0, websiteClicks: 0,
      postViews: 0, conversations: 0, bookings: 0, foodOrders: 0,
    })
  }

  const totals = daily.reduce((acc, d) => ({
    impressions: acc.impressions + d.impressions,
    directions: acc.directions + d.directions,
    calls: acc.calls + d.calls,
    websiteClicks: acc.websiteClicks + d.websiteClicks,
    postViews: acc.postViews + d.postViews,
    conversations: acc.conversations + d.conversations,
    bookings: acc.bookings + d.bookings,
    foodOrders: acc.foodOrders + d.foodOrders,
  }), emptyTotals())

  const prevTotals = ((prevRes.data ?? []) as Array<{
    impressions_total: number | null
    directions: number | null
    calls: number | null
    website_clicks: number | null
    post_views: number | null
    conversations: number | null
    bookings: number | null
    food_orders: number | null
    search_views: number | null
  }>).reduce((acc, r) => ({
    impressions: acc.impressions + (r.impressions_total ?? r.search_views ?? 0),
    directions: acc.directions + (r.directions ?? 0),
    calls: acc.calls + (r.calls ?? 0),
    websiteClicks: acc.websiteClicks + (r.website_clicks ?? 0),
    postViews: acc.postViews + (r.post_views ?? 0),
    conversations: acc.conversations + (r.conversations ?? 0),
    bookings: acc.bookings + (r.bookings ?? 0),
    foodOrders: acc.foodOrders + (r.food_orders ?? 0),
  }), emptyTotals())

  return {
    range,
    start: ymd(startDate),
    end: ymd(endDate),
    daily,
    totals,
    prevTotals,
  }
}
