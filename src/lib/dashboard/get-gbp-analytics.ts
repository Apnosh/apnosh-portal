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

export type AnalyticsRange = '7d' | '30d' | '90d' | '12m' | 'custom'

export interface DailyPoint {
  date: string
  impressions: number
  directions: number
  calls: number
  websiteClicks: number
  postViews: number
  postClicks: number
  photoViews: number
  conversations: number
  bookings: number
  foodOrders: number
  foodMenuClicks: number
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
    postClicks: number
    photoViews: number
    conversations: number
    bookings: number
    foodOrders: number
    foodMenuClicks: number
  }
  /* Totals for the SAME calendar window one year ago (YoY). Restaurants
     are seasonal, so YoY is more meaningful than prior-period. */
  prevTotals: AnalyticsSummary['totals']
  /* Where impressions came from across the window — Search vs Maps,
     Mobile vs Desktop. Each is a sum of impressions over the window. */
  impressionBreakdown: {
    searchMobile: number
    searchDesktop: number
    mapsMobile: number
    mapsDesktop: number
  }
  /* Top search queries that surfaced the business in the window,
     aggregated across days. Capped to top 25. */
  topQueries: Array<{ query: string; impressions: number }>
}

function emptyDaily(date: string): DailyPoint {
  return {
    date,
    impressions: 0, directions: 0, calls: 0, websiteClicks: 0,
    postViews: 0, postClicks: 0, photoViews: 0,
    conversations: 0, bookings: 0, foodOrders: 0, foodMenuClicks: 0,
  }
}

function emptyTotals(): AnalyticsSummary['totals'] {
  return {
    impressions: 0,
    directions: 0,
    calls: 0,
    websiteClicks: 0,
    postViews: 0,
    postClicks: 0,
    photoViews: 0,
    conversations: 0,
    bookings: 0,
    foodOrders: 0,
    foodMenuClicks: 0,
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

export interface AnalyticsOptions {
  range?: AnalyticsRange
  /** Used when range === 'custom'. YYYY-MM-DD inclusive. */
  customStart?: string
  customEnd?: string
  locationId?: string | null
}

export async function getGbpAnalytics(
  clientId: string,
  rangeOrOptions: AnalyticsRange | AnalyticsOptions = '30d',
  /* Legacy positional locationId arg — kept for backwards compat with
     existing callers; new code should pass AnalyticsOptions. */
  legacyLocationId: string | null = null,
): Promise<AnalyticsSummary> {
  const opts: AnalyticsOptions = typeof rangeOrOptions === 'string'
    ? { range: rangeOrOptions, locationId: legacyLocationId }
    : rangeOrOptions
  const range: AnalyticsRange = opts.range ?? '30d'
  const locationId = opts.locationId ?? null
  const admin = createAdminClient()
  const days = rangeToDays(range)

  /* Resolve the location's gbp_location_id (with the gbp_loc_ prefix
     our metrics rows use) when filtering to a specific location. */
  let metricsLocationId: string | null = null
  if (locationId) {
    const { data: loc } = await admin
      .from('client_locations')
      .select('gbp_location_id')
      .eq('id', locationId)
      .maybeSingle()
    metricsLocationId = (loc?.gbp_location_id as string | null) ?? null
  }

  /* Build the current window. Custom ranges use the caller-supplied
     dates verbatim; preset ranges anchor to "today − 3" (the Performance
     API's documented reporting lag boundary) so we never include
     dates Google hasn't aggregated yet. */
  let startDate: Date
  let endDate: Date
  if (range === 'custom' && opts.customStart && opts.customEnd) {
    startDate = new Date(opts.customStart + 'T00:00:00Z')
    endDate = new Date(opts.customEnd + 'T00:00:00Z')
  } else {
    endDate = new Date()
    endDate.setUTCDate(endDate.getUTCDate() - 3)
    startDate = new Date(endDate)
    startDate.setUTCDate(startDate.getUTCDate() - (days - 1))
  }

  /* Comparison window = SAME calendar window from one year ago.
     Restaurants are seasonal — comparing March-2026 to Feb-2026 is
     usually misleading (more rain, less foot traffic), but comparing
     March-2026 to March-2025 controls for seasonality. */
  const prevStartDate = new Date(startDate)
  prevStartDate.setUTCFullYear(prevStartDate.getUTCFullYear() - 1)
  const prevEndDate = new Date(endDate)
  prevEndDate.setUTCFullYear(prevEndDate.getUTCFullYear() - 1)

  /* Supabase / PostgREST caps row results at 1000 server-side
     regardless of .limit(). Paginate with .range() so the full
     12-month × 5-location dataset (1,825 rows) comes through. */
  async function fetchAllPaged<T>(makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null }>): Promise<T[]> {
    const page = 1000
    const out: T[] = []
    for (let from = 0; ; from += page) {
      const res = await makeQuery(from, from + page - 1)
      const rows = (res.data ?? []) as T[]
      out.push(...rows)
      if (rows.length < page) break
    }
    return out
  }

  type CurrRow = {
    date: string
    impressions_total: number | null
    directions: number | null
    calls: number | null
    website_clicks: number | null
    post_views: number | null
    post_clicks: number | null
    photo_views: number | null
    conversations: number | null
    bookings: number | null
    food_orders: number | null
    food_menu_clicks: number | null
    search_views: number | null
    impressions_search_mobile: number | null
    impressions_search_desktop: number | null
    impressions_maps_mobile: number | null
    impressions_maps_desktop: number | null
    top_queries: Array<{ query: string; impressions: number }> | null
  }
  type PrevRow = Omit<CurrRow, 'date' | 'top_queries' | 'impressions_search_mobile' | 'impressions_search_desktop' | 'impressions_maps_mobile' | 'impressions_maps_desktop'>

  const [currData, prevData] = await Promise.all([
    fetchAllPaged<CurrRow>((from, to) => {
      let q = admin
        .from('gbp_metrics')
        .select('date, impressions_total, directions, calls, website_clicks, post_views, post_clicks, photo_views, conversations, bookings, food_orders, food_menu_clicks, search_views, impressions_search_mobile, impressions_search_desktop, impressions_maps_mobile, impressions_maps_desktop, top_queries')
        .eq('client_id', clientId)
        .gte('date', ymd(startDate))
        .lte('date', ymd(endDate))
        .order('date', { ascending: true })
        .range(from, to)
      if (metricsLocationId) q = q.eq('location_id', metricsLocationId)
      return q.then(r => ({ data: r.data as CurrRow[] | null }))
    }),
    fetchAllPaged<PrevRow>((from, to) => {
      let q = admin
        .from('gbp_metrics')
        .select('impressions_total, directions, calls, website_clicks, post_views, post_clicks, photo_views, conversations, bookings, food_orders, food_menu_clicks, search_views')
        .eq('client_id', clientId)
        .gte('date', ymd(prevStartDate))
        .lte('date', ymd(prevEndDate))
        .range(from, to)
      if (metricsLocationId) q = q.eq('location_id', metricsLocationId)
      return q.then(r => ({ data: r.data as PrevRow[] | null }))
    }),
  ])

  const currRes = { data: currData }
  const prevRes = { data: prevData }

  const dailyByDate = new Map<string, DailyPoint>()
  const impressionBreakdown = {
    searchMobile: 0, searchDesktop: 0, mapsMobile: 0, mapsDesktop: 0,
  }
  const queryTotals = new Map<string, number>()
  for (const r of (currRes.data ?? []) as CurrRow[]) {
    /* Some legacy rows store impressions under search_views; treat
       impressions_total as the authoritative field and fall back. */
    const impressions = r.impressions_total ?? r.search_views ?? 0
    const existing = dailyByDate.get(r.date) ?? emptyDaily(r.date)
    /* Multi-location clients have one row per location per day, so
       sum the metrics across rows. */
    existing.impressions += impressions
    existing.directions += r.directions ?? 0
    existing.calls += r.calls ?? 0
    existing.websiteClicks += r.website_clicks ?? 0
    existing.postViews += r.post_views ?? 0
    existing.postClicks += r.post_clicks ?? 0
    existing.photoViews += r.photo_views ?? 0
    existing.conversations += r.conversations ?? 0
    existing.bookings += r.bookings ?? 0
    existing.foodOrders += r.food_orders ?? 0
    existing.foodMenuClicks += r.food_menu_clicks ?? 0
    dailyByDate.set(r.date, existing)

    impressionBreakdown.searchMobile  += r.impressions_search_mobile  ?? 0
    impressionBreakdown.searchDesktop += r.impressions_search_desktop ?? 0
    impressionBreakdown.mapsMobile    += r.impressions_maps_mobile    ?? 0
    impressionBreakdown.mapsDesktop   += r.impressions_maps_desktop   ?? 0

    if (Array.isArray(r.top_queries)) {
      for (const q of r.top_queries) {
        if (!q?.query || typeof q.impressions !== 'number') continue
        queryTotals.set(q.query, (queryTotals.get(q.query) ?? 0) + q.impressions)
      }
    }
  }
  const topQueries = Array.from(queryTotals.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 25)
    .map(([query, impressions]) => ({ query, impressions }))

  /* Fill missing dates with zeros so the chart x-axis is continuous. */
  const daily: DailyPoint[] = []
  for (let d = new Date(startDate); d <= endDate; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = ymd(d)
    daily.push(dailyByDate.get(key) ?? emptyDaily(key))
  }

  /* Trim trailing all-zero dates: the Performance API's 3-day lag is
     a guideline, not a guarantee — sometimes the last 4-5 days haven't
     aggregated yet. Showing them as zeros makes the chart look like
     traffic crashed. Drop trailing days until we hit one with data. */
  while (daily.length > 1) {
    const last = daily[daily.length - 1]
    const hasData = last.impressions || last.directions || last.calls
      || last.websiteClicks || last.postViews || last.postClicks
      || last.photoViews || last.conversations || last.bookings
      || last.foodOrders || last.foodMenuClicks
    if (hasData) break
    daily.pop()
  }

  /* Totals computed from the raw rows so we can include fields that
     DailyPoint doesn't carry (postClicks, photoViews, foodMenuClicks). */
  const visibleDates = new Set(daily.map(d => d.date))
  const totals = ((currRes.data ?? []) as CurrRow[])
    .filter(r => visibleDates.has(r.date))
    .reduce<AnalyticsSummary['totals']>((acc, r) => ({
      impressions: acc.impressions + (r.impressions_total ?? r.search_views ?? 0),
      directions: acc.directions + (r.directions ?? 0),
      calls: acc.calls + (r.calls ?? 0),
      websiteClicks: acc.websiteClicks + (r.website_clicks ?? 0),
      postViews: acc.postViews + (r.post_views ?? 0),
      postClicks: acc.postClicks + (r.post_clicks ?? 0),
      photoViews: acc.photoViews + (r.photo_views ?? 0),
      conversations: acc.conversations + (r.conversations ?? 0),
      bookings: acc.bookings + (r.bookings ?? 0),
      foodOrders: acc.foodOrders + (r.food_orders ?? 0),
      foodMenuClicks: acc.foodMenuClicks + (r.food_menu_clicks ?? 0),
    }), emptyTotals())

  const prevTotals = ((prevRes.data ?? []) as PrevRow[]).reduce<AnalyticsSummary['totals']>((acc, r) => ({
    impressions: acc.impressions + (r.impressions_total ?? r.search_views ?? 0),
    directions: acc.directions + (r.directions ?? 0),
    calls: acc.calls + (r.calls ?? 0),
    websiteClicks: acc.websiteClicks + (r.website_clicks ?? 0),
    postViews: acc.postViews + (r.post_views ?? 0),
    postClicks: acc.postClicks + (r.post_clicks ?? 0),
    photoViews: acc.photoViews + (r.photo_views ?? 0),
    conversations: acc.conversations + (r.conversations ?? 0),
    bookings: acc.bookings + (r.bookings ?? 0),
    foodOrders: acc.foodOrders + (r.food_orders ?? 0),
    foodMenuClicks: acc.foodMenuClicks + (r.food_menu_clicks ?? 0),
  }), emptyTotals())

  return {
    range,
    start: ymd(startDate),
    end: ymd(endDate),
    daily,
    totals,
    prevTotals,
    impressionBreakdown,
    topQueries,
  }
}
