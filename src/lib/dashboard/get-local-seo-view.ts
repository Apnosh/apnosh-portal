'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import type {
  DashboardView,
  DashboardMetric,
  DashboardInsight,
  ChartData,
  TimeRange,
} from '@/types/dashboard'

/**
 * Returns a DashboardView-shaped object for Local Presence & SEO, combining:
 *   - Google Business Profile interactions (directions, calls, website clicks)
 *   - Google Business Profile views (search + maps)
 *   - Reviews across all sources (Google, Yelp, Facebook, TripAdvisor)
 *
 * Rendered with the same shared components (StatusBanner, HeroMetric,
 * TrendChart, MetricGrid, InsightCard, AMNote) used by /dashboard/social
 * and /dashboard/website so all three channels feel consistent.
 *
 * Primary metric is "interactions" -- directions + calls + website clicks
 * from the GBP listing. That's what drives actual business outcomes for a
 * local business: someone took a next-step action.
 *
 * Multi-location:
 *   - When locationId is null, aggregates across every location for the client.
 *   - When locationId is provided, filters gbp_metrics to rows whose
 *     location_id equals the client_locations.gbp_location_id for that
 *     location, and filters reviews to rows whose reviews.location_id matches.
 */
export async function getLocalSeoView(
  clientId: string,
  locationId: string | null = null,
): Promise<DashboardView | null> {
  /* Use the admin client so RLS doesn't silently filter rows. The
     caller (useClient → resolveCurrentClient) has already authorized
     the user against this client_id, and the function only ever
     queries by that single client_id. */
  const supabase = createAdminClient()

  // If filtering to a specific location, resolve its GBP location ID so we can
  // match against gbp_metrics.location_id (which stores the GBP-native ID).
  let gbpLocationId: string | null = null
  if (locationId) {
    const { data: loc } = await supabase
      .from('client_locations')
      .select('gbp_location_id')
      .eq('id', locationId)
      .maybeSingle()
    gbpLocationId = loc?.gbp_location_id ?? null
  }

  const now = new Date()
  // Rolling 30-day windows. Calendar months break for clients whose data
  // syncs lag a few days: "this month" can be empty mid-month even when
  // the prior 30 days has plenty of data.
  const thisMonthStart = addDays(now, -30)
  const lastMonthStart = addDays(now, -60)
  const lastMonthSameDay = addDays(now, -31)

  const yearAgo = addDays(now, -365)

  /* Supabase's default row limit is 1000. A multi-location client with
     12 months of daily metrics easily exceeds that (5 locs × 365 days),
     so we'd silently truncate to the oldest rows and miss the current
     period. Explicit large limit forces the full dataset. */
  let gbpQuery = supabase
    .from('gbp_metrics')
    .select('date, directions, calls, website_clicks, search_views, search_views_maps, search_views_search, photo_views')
    .eq('client_id', clientId)
    .gte('date', formatDate(yearAgo))
    .order('date', { ascending: true })
    .limit(10000)
  if (gbpLocationId) gbpQuery = gbpQuery.eq('location_id', gbpLocationId)

  let reviewsQuery = supabase
    .from('reviews')
    .select('id, source, rating, author_name, review_text, responded_at, created_at')
    .eq('client_id', clientId)
    .gte('created_at', formatDate(yearAgo))
    .order('created_at', { ascending: false })
  if (locationId) reviewsQuery = reviewsQuery.eq('location_id', locationId)

  let prevReviewsQuery = supabase
    .from('reviews')
    .select('id')
    .eq('client_id', clientId)
    .gte('created_at', formatDate(lastMonthStart))
    .lte('created_at', formatDate(lastMonthSameDay))
  if (locationId) prevReviewsQuery = prevReviewsQuery.eq('location_id', locationId)

  // review_metrics holds per-platform daily aggregates (rating + review_count)
  // This covers Yelp (where we can't fetch individual reviews on the free tier)
  // and will also cover other sources as we add them.
  const reviewMetricsQuery = supabase
    .from('review_metrics')
    .select('date, platform, rating_avg, review_count, new_reviews')
    .eq('client_id', clientId)
    .order('date', { ascending: false })
    .limit(60)

  const [gbpRes, reviewsRes, prevReviewsRes, reviewMetricsRes] = await Promise.all([
    gbpQuery,
    reviewsQuery,
    prevReviewsQuery,
    reviewMetricsQuery,
  ])

  const gbpRows = (gbpRes.data ?? []) as GbpRow[]
  const reviews = (reviewsRes.data ?? []) as ReviewRow[]
  const prevReviewCount = (prevReviewsRes.data ?? []).length
  const reviewMetrics = (reviewMetricsRes.data ?? []) as ReviewMetricRow[]

  // Latest snapshot per platform (first = most recent thanks to order desc)
  const platformSnapshot = new Map<string, ReviewMetricRow>()
  for (const m of reviewMetrics) {
    if (!platformSnapshot.has(m.platform)) platformSnapshot.set(m.platform, m)
  }
  // New reviews this month summed across all aggregate platforms (Yelp etc.)
  const platformNewReviewsThisMonth = reviewMetrics
    .filter(m => m.date >= formatDate(thisMonthStart))
    .reduce((acc, m) => acc + (m.new_reviews ?? 0), 0)

  if (gbpRows.length === 0 && reviews.length === 0 && reviewMetrics.length === 0) {
    return emptyLocalSeoView()
  }

  // ---- Same-day windows for fair MoM
  const thisMonthGbp = filterByDateRange(gbpRows, thisMonthStart, now)
  const lastMonthGbp = filterByDateRange(gbpRows, lastMonthStart, lastMonthSameDay)
  const thisMonthReviews = reviews.filter(r => {
    const d = new Date(r.created_at)
    return d >= thisMonthStart && d <= now
  })

  // ---- Hero: total interactions (directions + calls + website_clicks)
  const thisInteractions = sumInteractions(thisMonthGbp)
  const lastInteractions = sumInteractions(lastMonthGbp)

  // hasMeaningfulPrev: only treat last month as "comparable history" if it
  // had genuinely substantive volume. Going from 1 to 0 is noise, not a
  // crisis — previously this triggered "needs attention" with -100%.
  const hasMeaningfulPrev = lastInteractions >= 20
  const hasPrevData = hasMeaningfulPrev || prevReviewCount >= 3
  const pctChange = hasMeaningfulPrev
    ? Math.round(((thisInteractions - lastInteractions) / lastInteractions) * 100)
    : 0
  const isUp = pctChange >= 0
  const pctLabel = hasPrevData ? (isUp ? '+' : '') + pctChange + '%' : 'New'
  const pctFullLabel = hasPrevData
    ? (isUp ? '+' : '') + pctChange + '% vs same time last month'
    : 'Not enough history for a comparison yet'

  // ---- Metric cards
  const thisDirections = sumField(thisMonthGbp, 'directions')
  const lastDirections = sumField(lastMonthGbp, 'directions')
  const thisCalls = sumField(thisMonthGbp, 'calls')
  const lastCalls = sumField(lastMonthGbp, 'calls')
  const thisClicks = sumField(thisMonthGbp, 'website_clicks')
  const lastClicks = sumField(lastMonthGbp, 'website_clicks')

  // "New reviews" combines individual-review sources (Google, FB) with
  // aggregate-only sources (Yelp) which we track as review_count deltas.
  const newReviewCount = thisMonthReviews.length + platformNewReviewsThisMonth
  const avgRatingThisMonth = thisMonthReviews.length > 0
    ? Math.round((thisMonthReviews.reduce((a, r) => a + Number(r.rating), 0) / thisMonthReviews.length) * 10) / 10
    : (platformSnapshot.get('yelp')?.rating_avg ?? null)
  const yelpSnapshot = platformSnapshot.get('yelp')

  const metricsCards: DashboardMetric[] = [
    {
      label: 'Directions',
      value: fmtNum(thisDirections),
      subtitle: 'People who got directions to you',
      trend: fmtPct(thisDirections, lastDirections),
      up: thisDirections >= lastDirections,
      sparkline: weeklySparkline(gbpRows, r => r.directions ?? 0, 12),
    },
    {
      label: 'Phone calls',
      value: fmtNum(thisCalls),
      subtitle: 'Calls from your Google listing',
      trend: fmtPct(thisCalls, lastCalls),
      up: thisCalls >= lastCalls,
      sparkline: weeklySparkline(gbpRows, r => r.calls ?? 0, 12),
    },
    {
      label: 'Website clicks',
      value: fmtNum(thisClicks),
      subtitle: 'Visits to your site from Google',
      trend: fmtPct(thisClicks, lastClicks),
      up: thisClicks >= lastClicks,
      sparkline: weeklySparkline(gbpRows, r => r.website_clicks ?? 0, 12),
    },
    {
      label: 'New reviews',
      value: fmtNum(newReviewCount),
      subtitle: yelpSnapshot
        ? `Yelp ${yelpSnapshot.rating_avg ?? '—'}★ (${fmtNum(yelpSnapshot.review_count ?? 0)} total)`
        : avgRatingThisMonth != null
          ? `Avg rating ${avgRatingThisMonth} of 5`
          : 'Across Google, Yelp, and more',
      trend: fmtPct(newReviewCount, prevReviewCount),
      up: newReviewCount >= prevReviewCount,
      sparkline: weeklyReviewSparkline(reviews, 12),
    },
  ]

  // ---- Chart: daily total interactions
  const chartData = buildChartData(gbpRows, r => sumInteractionsOfOne(r))

  // ---- Insights from real data
  const insights = buildLocalSeoInsights({
    thisMonthGbp, lastMonthGbp, thisMonthReviews, allReviews: reviews,
    thisInteractions, pctChange, hasPrevData,
    yelpSnapshot, yelpNewReviewsThisMonth: platformNewReviewsThisMonth,
  })

  // ---- AM note
  const am = await getAmNote(supabase, clientId, 'local_seo')

  return {
    headline: !hasPrevData
      ? "Your local presence is getting set up"
      : pctChange > 5
        ? "Your local presence is growing"
        : pctChange < -5
          ? "Your local presence needs attention"
          : "Your local presence is steady",
    up: isUp,
    ctx: 'People who took action on your Google listing',
    num: fmtNum(thisInteractions),
    unit: 'actions',
    pct: pctLabel,
    pctFull: pctFullLabel,
    bdtitle: "What's driving your local presence",
    bmy: thisInteractions,
    bmavg: 0,  // no benchmark data for local_seo yet
    bmmax: Math.max(thisInteractions * 1.5, 100),
    rank: '',
    metrics: metricsCards,
    insights,
    am,
    chartData,
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GbpRow {
  date: string
  directions: number | null
  calls: number | null
  website_clicks: number | null
  search_views: number | null
  search_views_maps: number | null
  search_views_search: number | null
  photo_views: number | null
}

interface ReviewRow {
  id: string
  source: string
  rating: number
  author_name: string | null
  review_text: string | null
  responded_at: string | null
  created_at: string
}

interface ReviewMetricRow {
  date: string
  platform: string
  rating_avg: number | null
  review_count: number | null
  new_reviews: number | null
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

function buildLocalSeoInsights(d: {
  thisMonthGbp: GbpRow[]
  lastMonthGbp: GbpRow[]
  thisMonthReviews: ReviewRow[]
  allReviews: ReviewRow[]
  thisInteractions: number
  pctChange: number
  hasPrevData: boolean
  yelpSnapshot?: ReviewMetricRow
  yelpNewReviewsThisMonth?: number
}): DashboardInsight[] {
  const insights: DashboardInsight[] = []

  // Yelp snapshot insight (when connected)
  if (d.yelpSnapshot && d.yelpSnapshot.review_count != null && d.yelpSnapshot.review_count > 0) {
    const rating = d.yelpSnapshot.rating_avg ?? 0
    const count = d.yelpSnapshot.review_count
    const newThisMonth = d.yelpNewReviewsThisMonth ?? 0
    if (newThisMonth > 0) {
      insights.push({
        icon: 'star',
        title: `${newThisMonth} new Yelp ${newThisMonth === 1 ? 'review' : 'reviews'} this month`,
        subtitle: `Now at ${rating}★ from ${count.toLocaleString()} total`,
      })
    } else if (rating >= 4.5) {
      insights.push({
        icon: 'star',
        title: `Yelp rating: ${rating}★ from ${count.toLocaleString()} reviews`,
        subtitle: 'Strong standing on Yelp',
      })
    }
  }

  // Insight 1: review signal
  if (d.thisMonthReviews.length > 0) {
    const avgRating = d.thisMonthReviews.reduce((a, r) => a + Number(r.rating), 0) / d.thisMonthReviews.length
    const fiveStar = d.thisMonthReviews.filter(r => r.rating >= 4.5).length
    if (fiveStar >= d.thisMonthReviews.length * 0.8 && d.thisMonthReviews.length >= 2) {
      insights.push({
        icon: 'star',
        title: `${fiveStar} new 5-star ${fiveStar === 1 ? 'review' : 'reviews'} this month`,
        subtitle: `Average rating ${avgRating.toFixed(1)} of 5`,
      })
    } else {
      insights.push({
        icon: 'star',
        title: `${d.thisMonthReviews.length} new ${d.thisMonthReviews.length === 1 ? 'review' : 'reviews'} this month`,
        subtitle: `Average rating ${avgRating.toFixed(1)} of 5`,
      })
    }
  } else if (d.allReviews.length === 0) {
    insights.push({
      icon: 'star',
      title: 'No reviews tracked yet',
      subtitle: 'Reviews will appear once your Google Business Profile is connected',
    })
  }

  // Insight 2: search visibility signal from maps vs search split
  const mapsViews = sumField(d.thisMonthGbp, 'search_views_maps')
  const searchViews = sumField(d.thisMonthGbp, 'search_views_search')
  const totalViews = mapsViews + searchViews
  if (totalViews > 0) {
    const mapsPct = Math.round((mapsViews / totalViews) * 100)
    if (mapsPct >= 60) {
      insights.push({
        icon: 'map',
        title: `${mapsPct}% of views come from Google Maps`,
        subtitle: 'Most people find you while searching on Maps',
      })
    } else if (mapsPct >= 40) {
      insights.push({
        icon: 'map',
        title: `${mapsPct}% from Maps, ${100 - mapsPct}% from Search`,
        subtitle: 'Your listing is found both ways',
      })
    } else {
      insights.push({
        icon: 'map',
        title: `${100 - mapsPct}% of views come from Google Search`,
        subtitle: 'Most people find you while searching Google',
      })
    }
  }

  // Insight 3: trend signal
  if (d.hasPrevData && d.pctChange >= 20) {
    insights.push({
      icon: 'trending',
      title: `Interactions up ${d.pctChange}% this month`,
      subtitle: 'Strong growth on your Google listing',
    })
  } else if (d.hasPrevData && d.pctChange <= -20) {
    insights.push({
      icon: 'alert',
      title: `Interactions down ${Math.abs(d.pctChange)}% this month`,
      subtitle: 'Worth discussing with your account manager',
    })
  }

  return insights.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Interaction helpers
// ---------------------------------------------------------------------------

function sumInteractionsOfOne(r: GbpRow): number {
  return (r.directions ?? 0) + (r.calls ?? 0) + (r.website_clicks ?? 0)
}

function sumInteractions(rows: GbpRow[]): number {
  return rows.reduce((acc, r) => acc + sumInteractionsOfOne(r), 0)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sumField(rows: GbpRow[], field: keyof GbpRow): number {
  return rows.reduce((acc, r) => acc + (Number(r[field]) || 0), 0)
}

function filterByDateRange<T extends { date: string }>(rows: T[], start: Date, end: Date): T[] {
  const s = formatDate(start)
  const e = formatDate(end)
  return rows.filter(r => r.date >= s && r.date <= e)
}

function weeklySparkline(rows: GbpRow[], getValue: (r: GbpRow) => number, weeks: number): number[] {
  const result: number[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = addDays(now, -w * 7)
    const weekStart = addDays(weekEnd, -6)
    const weekRows = filterByDateRange(rows, weekStart, weekEnd)
    result.push(weekRows.reduce((a, r) => a + getValue(r), 0))
  }
  return result
}

function weeklyReviewSparkline(reviews: ReviewRow[], weeks: number): number[] {
  const result: number[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = addDays(now, -w * 7); weekEnd.setHours(23, 59, 59)
    const weekStart = addDays(weekEnd, -6); weekStart.setHours(0, 0, 0)
    const count = reviews.filter(r => {
      const d = new Date(r.created_at)
      return d >= weekStart && d <= weekEnd
    }).length
    result.push(count)
  }
  return result
}

function buildChartData(rows: GbpRow[], getValue: (r: GbpRow) => number): Record<TimeRange, ChartData> {
  const now = new Date()
  return {
    '1W': buildTimeRange(rows, getValue, 7, now, 'day'),
    '1M': buildTimeRange(rows, getValue, 30, now, 'day'),
    '3M': buildTimeRange(rows, getValue, 90, now, 'biday'),
    '6M': buildTimeRange(rows, getValue, 180, now, 'biday'),
    '1Y': buildTimeRange(rows, getValue, 365, now, 'week'),
  }
}

function buildTimeRange(
  rows: GbpRow[],
  getValue: (r: GbpRow) => number,
  days: number,
  now: Date,
  resolution: 'day' | 'biday' | 'week'
): ChartData {
  const start = addDays(now, -days)
  const filtered = filterByDateRange(rows, start, now)
  if (filtered.length === 0) return { data: [0], labels: ['No data'] }

  const data: number[] = []
  const step = resolution === 'week' ? 7 : resolution === 'biday' ? 2 : 1

  let cursor = new Date(start)
  while (cursor <= now) {
    const windowEnd = addDays(cursor, step - 1)
    const windowRows = filterByDateRange(rows, cursor, windowEnd)
    data.push(windowRows.reduce((a, r) => a + getValue(r), 0))
    cursor = addDays(cursor, step)
  }
  while (data.length > 1 && data[data.length - 1] === 0) data.pop()

  const labelDates: Date[] = []
  if (days <= 7) {
    for (let i = days - 1; i >= 0; i--) labelDates.push(addDays(now, -i))
  } else if (days <= 30) {
    for (let i = 0; i < 5; i++) labelDates.push(addDays(start, Math.round((i / 4) * days)))
  } else if (days <= 90) {
    const months = new Set<string>()
    for (let i = days; i >= 0; i -= 30) {
      const d = addDays(now, -i)
      const label = d.toLocaleDateString('en-US', { month: 'short' })
      if (!months.has(label)) { months.add(label); labelDates.push(d) }
    }
  } else if (days <= 180) {
    for (let i = 6; i >= 0; i--) labelDates.push(addMonths(now, -i))
  } else {
    for (let i = 4; i >= 0; i--) labelDates.push(addMonths(now, -i * 3))
  }

  const xlabels: string[] = []
  for (const d of labelDates) {
    if (days <= 7) {
      const isTodayDate = isToday(d)
      xlabels.push(isTodayDate ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' }))
    } else if (days <= 30) {
      xlabels.push(d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
    } else if (days <= 365) {
      const month = d.toLocaleDateString('en-US', { month: 'short' })
      if (days > 180) {
        const yr = d.getFullYear().toString().slice(2)
        const isCurrentYear = d.getFullYear() === now.getFullYear()
        xlabels.push(isCurrentYear ? month : `${month} '${yr}`)
      } else {
        xlabels.push(month)
      }
    }
  }

  return { data, labels: xlabels }
}

async function getAmNote(
  supabase: ReturnType<typeof createAdminClient>,
  clientId: string,
  viewType: string
): Promise<DashboardView['am']> {
  const { data } = await supabase
    .from('am_notes')
    .select('am_name, am_initials, note_text')
    .eq('client_id', clientId)
    .eq('view_type', viewType)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!data) {
    return { name: 'Apnosh Team', initials: 'AP', role: 'Your account manager', note: '' }
  }
  return {
    name: data.am_name,
    initials: data.am_initials,
    role: 'Your account manager',
    note: data.note_text,
  }
}

function emptyLocalSeoView(): DashboardView {
  const emptyChart: Record<TimeRange, ChartData> = {
    '1W': { data: [0], labels: ['No data yet'] },
    '1M': { data: [0], labels: ['No data yet'] },
    '3M': { data: [0], labels: ['No data yet'] },
    '6M': { data: [0], labels: ['No data yet'] },
    '1Y': { data: [0], labels: ['No data yet'] },
  }
  return {
    headline: 'Setting up',
    up: true,
    ctx: 'People who took action on your Google listing',
    num: '---',
    unit: 'actions',
    pct: '---',
    pctFull: 'Collecting data',
    bdtitle: "What's driving your local presence",
    bmy: 0,
    bmavg: 0,
    bmmax: 100,
    rank: '',
    metrics: [],
    insights: [],
    am: { name: 'Apnosh Team', initials: 'AP', role: 'Your account manager', note: '' },
    chartData: emptyChart,
  }
}

// ---------------------------------------------------------------------------
// Formatting + date utils
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return n.toString()
}

function fmtPct(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? 'New' : '0%'
  const pct = Math.round(((current - previous) / previous) * 100)
  return (pct >= 0 ? '+' : '') + pct + '%'
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d)
  result.setDate(result.getDate() + n)
  return result
}

function addMonths(d: Date, n: number): Date {
  const result = new Date(d)
  result.setMonth(result.getMonth() + n)
  return result
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
}
