'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  DashboardView,
  DashboardMetric,
  ChartData,
  TimeRange,
  DashboardInsight,
} from '@/types/dashboard'
import { prettySource } from '@/lib/website-insights'

/**
 * Returns a DashboardView-shaped object for Website data, so it can be rendered
 * with the same components (StatusBanner, HeroMetric, TrendChart, MetricGrid,
 * InsightCard, AMNote) used by /dashboard/social and /dashboard/analytics.
 *
 * Data sources:
 *  - website_metrics_monthly: authoritative monthly unique visitors (hero)
 *  - website_metrics (daily): sessions, pageviews, conversions, traffic_sources,
 *    top_cities, etc.
 *  - search_metrics (daily): GSC impressions, clicks, top queries
 */
export async function getWebsiteView(clientId: string): Promise<DashboardView | null> {
  const supabase = await createClient()

  const now = new Date()
  // Rolling 30-day windows. Calendar months break for clients whose data
  // syncs lag a few days: "this month" can be empty mid-month even when
  // the prior 30 days has plenty of data.
  const thisMonthStart = addDays(now, -30)
  const lastMonthStart = addDays(now, -60)
  const lastMonthSameDay = addDays(now, -31)

  // Pull a year of daily rows for chart + trend
  const yearAgo = addDays(now, -365)

  const [monthlyRes, dailyRes, searchRes] = await Promise.all([
    supabase
      .from('website_metrics_monthly')
      .select('year, month, unique_visitors, unique_new_users, unique_returning_users')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(24),
    supabase
      .from('website_metrics')
      .select('date, visitors, sessions, page_views, bounce_rate, avg_session_duration, traffic_sources, conversion_events')
      .eq('client_id', clientId)
      .gte('date', formatDate(yearAgo))
      .order('date', { ascending: true }),
    supabase
      .from('search_metrics')
      .select('date, total_impressions, total_clicks, top_queries')
      .eq('client_id', clientId)
      .gte('date', formatDate(yearAgo))
      .order('date', { ascending: true }),
  ])

  const daily = (dailyRes.data ?? []) as DailyRow[]
  const searchDaily = (searchRes.data ?? []) as SearchRow[]
  const monthly = (monthlyRes.data ?? []) as MonthlyRow[]

  if (daily.length === 0 && searchDaily.length === 0) {
    return emptyWebsiteView()
  }

  // ---- Hero: unique visitors this month (from monthly aggregate, authoritative)
  const thisY = now.getFullYear()
  const thisM = now.getMonth() + 1

  const thisMonthAgg = monthly.find(m => m.year === thisY && m.month === thisM)
  // Note: we intentionally do NOT use lastMonthAgg for the hero trend, because
  // comparing a partial-month sum (this month) vs a full-month aggregate (last
  // month) would always look "down" mid-month. We compute trends from the
  // same-day windows below.

  // Same-day windows (fair for MoM trend)
  const thisMonthDaily = filterByDateRange(daily, thisMonthStart, now)
  const lastMonthDaily = filterByDateRange(daily, lastMonthStart, lastMonthSameDay)
  const thisMonthSearch = filterByDateRange(searchDaily, thisMonthStart, now)
  const lastMonthSearch = filterByDateRange(searchDaily, lastMonthStart, lastMonthSameDay)

  // Hero number: the accurate month-to-date unique-visitor count.
  // Use the monthly aggregate if present (authoritative full-month, but since
  // we're mid-month it reflects data through yesterday). Otherwise sum daily.
  const thisVisitors = thisMonthAgg?.unique_visitors ?? sumField(thisMonthDaily, 'visitors')

  // Hero trend: ALWAYS same-day-window sum-of-daily for both sides so the
  // comparison is apples-to-apples even mid-month.
  const thisVisitorsForTrend = sumField(thisMonthDaily, 'visitors')
  const lastVisitorsForTrend = sumField(lastMonthDaily, 'visitors')

  // Trend handling:
  // - If prev window has data: standard % change
  // - If prev window is empty but this window has data: not a "0%" change,
  //   it's "no comparison yet" (we only have partial history)
  // - If both empty: just show 0%
  const hasPrevData = lastVisitorsForTrend > 0
  const pctChange = hasPrevData
    ? Math.round(((thisVisitorsForTrend - lastVisitorsForTrend) / lastVisitorsForTrend) * 100)
    : 0
  const isUp = pctChange >= 0
  const pctLabel = hasPrevData
    ? (isUp ? '+' : '') + pctChange + '%'
    : 'New'
  const pctFullLabel = hasPrevData
    ? (isUp ? '+' : '') + pctChange + '% vs same time last month'
    : 'Not enough history for a comparison yet'

  // ---- Metric cards: Visitors, Sessions, Search Impressions, Actions Taken
  // All numbers and trends use the same-day window for fair MoM comparison.
  const thisSessions = sumField(thisMonthDaily, 'sessions')
  const lastSessions = sumField(lastMonthDaily, 'sessions')

  const thisImpressions = sumField(thisMonthSearch, 'total_impressions')
  const lastImpressions = sumField(lastMonthSearch, 'total_impressions')

  const thisActions = thisMonthDaily.reduce((acc, r) => acc + (r.conversion_events?.total ?? 0), 0)
  const lastActions = lastMonthDaily.reduce((acc, r) => acc + (r.conversion_events?.total ?? 0), 0)

  const metricsCards: DashboardMetric[] = [
    {
      label: 'Website visitors',
      value: fmtNum(thisVisitors),
      subtitle: 'Unique people who visited',
      trend: fmtPct(thisVisitorsForTrend, lastVisitorsForTrend),
      up: thisVisitorsForTrend >= lastVisitorsForTrend,
      sparkline: weeklySparkline(daily, 'visitors', 12),
    },
    {
      label: 'Website visits',
      value: fmtNum(thisSessions),
      subtitle: 'Total visits, including return visits',
      trend: fmtPct(thisSessions, lastSessions),
      up: thisSessions >= lastSessions,
      sparkline: weeklySparkline(daily, 'sessions', 12),
    },
    {
      label: 'Shown on Google',
      value: fmtNum(thisImpressions),
      subtitle: 'Times you appeared in search',
      trend: fmtPct(thisImpressions, lastImpressions),
      up: thisImpressions >= lastImpressions,
      sparkline: weeklySparkline(searchDaily, 'total_impressions', 12),
    },
    {
      label: 'Actions taken',
      value: fmtNum(thisActions),
      subtitle: 'Calls, directions, forms, bookings',
      trend: fmtPct(thisActions, lastActions),
      up: thisActions >= lastActions,
      sparkline: weeklySparklineConversions(daily, 12),
    },
  ]

  // ---- Chart: daily unique visitors over time ranges
  const chartData = buildChartData(daily, 'visitors')

  // ---- Insights: derive from real data
  const insights = buildWebsiteInsights({
    daily, searchDaily, thisMonthDaily, thisMonthSearch,
    thisVisitors, lastVisitors: lastVisitorsForTrend, pctChange,
  })

  // ---- AM note (same source as other views, keyed by view_type)
  const am = await getAmNote(supabase, clientId, 'website')

  return {
    headline: !hasPrevData
      ? "Your website is building momentum"
      : pctChange > 5
        ? "Your website is growing"
        : pctChange < -5
          ? "Your website needs a push"
          : "Your website is steady",
    up: isUp,
    ctx: 'People who visited your website',
    num: fmtNum(thisVisitors),
    unit: 'visitors',
    pct: pctLabel,
    pctFull: pctFullLabel,
    bdtitle: "What's driving your website",
    // No benchmark for website yet -- zero out so BenchmarkBar can conditionally hide
    bmy: thisVisitors,
    bmavg: 0,
    bmmax: Math.max(thisVisitors * 1.5, 100),
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

interface DailyRow {
  date: string
  visitors: number | null
  sessions: number | null
  page_views: number | null
  bounce_rate: number | null
  avg_session_duration: number | null
  traffic_sources: Record<string, number> | null
  conversion_events: {
    phone_clicks: number; direction_clicks: number; form_submits: number
    booking_clicks: number; other: number; total: number
  } | null
}

interface SearchRow {
  date: string
  total_impressions: number | null
  total_clicks: number | null
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }> | null
}

interface MonthlyRow {
  year: number
  month: number
  unique_visitors: number | null
  unique_new_users: number | null
  unique_returning_users: number | null
}

// ---------------------------------------------------------------------------
// Insights (derived from real data, no DB dependency)
// ---------------------------------------------------------------------------

function buildWebsiteInsights(d: {
  daily: DailyRow[]
  searchDaily: SearchRow[]
  thisMonthDaily: DailyRow[]
  thisMonthSearch: SearchRow[]
  thisVisitors: number
  lastVisitors: number
  pctChange: number
}): DashboardInsight[] {
  const insights: DashboardInsight[] = []

  // Insight 1: top traffic source
  const sourceTotals: Record<string, number> = {}
  for (const r of d.thisMonthDaily) {
    if (r.traffic_sources) {
      for (const [k, v] of Object.entries(r.traffic_sources)) {
        if (typeof v === 'number') sourceTotals[k] = (sourceTotals[k] ?? 0) + v
      }
    }
  }
  const sourcesSorted = Object.entries(sourceTotals).sort(([, a], [, b]) => b - a)
  const totalSessions = sourcesSorted.reduce((a, [, b]) => a + b, 0)
  if (sourcesSorted.length > 0 && totalSessions > 0) {
    const [topKey, topCount] = sourcesSorted[0]
    const topPct = Math.round((topCount / totalSessions) * 100)
    const pretty = prettySource(topKey)
    insights.push({
      icon: 'trending',
      title: `${topPct}% come from ${pretty.toLowerCase()}`,
      subtitle: pretty === 'Google Search'
        ? 'Most visitors find you through Google'
        : pretty === 'Direct'
          ? 'Most visitors type your address or click a saved link'
          : `${pretty} is your #1 source of visitors`,
    })
  }

  // Insight 2: top search query + position
  const queryMap = new Map<string, { impressions: number; position: number; posCount: number }>()
  let totalImpressions = 0
  for (const r of d.thisMonthSearch) {
    totalImpressions += r.total_impressions ?? 0
    for (const q of r.top_queries ?? []) {
      const entry = queryMap.get(q.query) ?? { impressions: 0, position: 0, posCount: 0 }
      entry.impressions += q.impressions ?? 0
      if (q.position) {
        entry.position += q.position
        entry.posCount += 1
      }
      queryMap.set(q.query, entry)
    }
  }
  if (queryMap.size > 0) {
    const [topQuery, stats] = [...queryMap.entries()].sort((a, b) => b[1].impressions - a[1].impressions)[0]
    const avgPos = stats.posCount > 0 ? stats.position / stats.posCount : null
    let title = `Top search: "${topQuery}"`
    let subtitle = ''
    if (avgPos != null) {
      if (avgPos <= 1.5) subtitle = 'You rank first on Google for this term'
      else if (avgPos <= 3) subtitle = `You rank in the top 3 (avg position ${avgPos.toFixed(1)})`
      else if (avgPos <= 10) subtitle = `You show on page 1 (avg position ${avgPos.toFixed(1)})`
      else subtitle = `Current position: ${avgPos.toFixed(0)}`
    } else {
      subtitle = `${stats.impressions.toLocaleString()} impressions this month`
    }
    // Replace title for clarity
    if (avgPos != null && avgPos <= 1.5) title = `You rank #1 for "${topQuery}"`
    insights.push({ icon: 'star', title, subtitle })
  }

  // Insight 3: trend signal
  if (d.pctChange >= 20) {
    insights.push({
      icon: 'trending',
      title: `Visitors up ${d.pctChange}% this month`,
      subtitle: 'Strong growth vs last month',
    })
  } else if (d.pctChange <= -20) {
    insights.push({
      icon: 'alert',
      title: `Visitors down ${Math.abs(d.pctChange)}% this month`,
      subtitle: 'Worth discussing with your account manager',
    })
  } else if (totalImpressions === 0 && d.thisVisitors > 0) {
    insights.push({
      icon: 'alert',
      title: 'Not showing on Google yet',
      subtitle: 'Your visitors come from other sources. SEO is an opportunity.',
    })
  }

  return insights.slice(0, 3)
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function sumField<T>(rows: T[], field: string): number {
  return rows.reduce((acc, r) => acc + (Number((r as Record<string, unknown>)[field]) || 0), 0)
}

function filterByDateRange<T extends { date: string }>(rows: T[], start: Date, end: Date): T[] {
  const s = formatDate(start)
  const e = formatDate(end)
  return rows.filter(r => r.date >= s && r.date <= e)
}

function weeklySparkline<T extends { date: string }>(daily: T[], field: string, weeks: number): number[] {
  const result: number[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = addDays(now, -w * 7)
    const weekStart = addDays(weekEnd, -6)
    const weekRows = filterByDateRange(daily, weekStart, weekEnd)
    result.push(sumField(weekRows, field))
  }
  return result
}

function weeklySparklineConversions(daily: DailyRow[], weeks: number): number[] {
  const result: number[] = []
  const now = new Date()
  for (let w = weeks - 1; w >= 0; w--) {
    const weekEnd = addDays(now, -w * 7)
    const weekStart = addDays(weekEnd, -6)
    const weekRows = filterByDateRange(daily, weekStart, weekEnd)
    result.push(weekRows.reduce((acc, r) => acc + (r.conversion_events?.total ?? 0), 0))
  }
  return result
}

function buildChartData(daily: DailyRow[], field: keyof DailyRow): Record<TimeRange, ChartData> {
  const now = new Date()
  return {
    '1W': buildTimeRange(daily, field, 7, now, 'day'),
    '1M': buildTimeRange(daily, field, 30, now, 'day'),
    '3M': buildTimeRange(daily, field, 90, now, 'biday'),
    '6M': buildTimeRange(daily, field, 180, now, 'biday'),
    '1Y': buildTimeRange(daily, field, 365, now, 'week'),
  }
}

function buildTimeRange(
  daily: DailyRow[],
  field: keyof DailyRow,
  days: number,
  now: Date,
  resolution: 'day' | 'biday' | 'week'
): ChartData {
  const start = addDays(now, -days)
  const filtered = filterByDateRange(daily, start, now)
  if (filtered.length === 0) return { data: [0], labels: ['No data'] }

  const data: number[] = []
  const step = resolution === 'week' ? 7 : resolution === 'biday' ? 2 : 1

  let cursor = new Date(start)
  while (cursor <= now) {
    const windowEnd = addDays(cursor, step - 1)
    const windowRows = filterByDateRange(daily, cursor, windowEnd)
    data.push(sumField(windowRows, field as string))
    cursor = addDays(cursor, step)
  }
  while (data.length > 1 && data[data.length - 1] === 0) data.pop()

  // Labels -- same logic as other views
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
  supabase: Awaited<ReturnType<typeof createClient>>,
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

function emptyWebsiteView(): DashboardView {
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
    ctx: 'People who visited your website',
    num: '---',
    unit: 'visitors',
    pct: '---',
    pctFull: 'Collecting data',
    bdtitle: "What's driving your website",
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
// Formatting + date utils (same semantics as get-dashboard-data.ts helpers)
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return n.toString()
}

function fmtPct(current: number, previous: number): string {
  // When we have no baseline, don't fake a percentage -- call it out as "New"
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
