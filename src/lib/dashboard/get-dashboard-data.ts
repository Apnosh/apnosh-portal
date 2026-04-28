'use server'

import { createClient } from '@/lib/supabase/server'
import type {
  DashboardData,
  DashboardView,
  DashboardMetric,
  DashboardInsight,
  ChartData,
  TimeRange,
  InsightIcon,
} from '@/types/dashboard'

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function getDashboardData(
  clientId: string
): Promise<DashboardData | null> {
  const supabase = await createClient()

  // Fetch client name + location + industry for benchmark lookups
  const { data: client } = await supabase
    .from('clients')
    .select('name, location, industry')
    .eq('id', clientId)
    .maybeSingle()

  if (!client) return null

  // Resolve city and business type for benchmarks
  const city = client.location || 'Seattle'
  const bizType = (client.industry || 'restaurant').toLowerCase().replace(/[^a-z_]/g, '_')

  const [visibility, footTraffic] = await Promise.all([
    buildVisibilityView(supabase, clientId, city, bizType),
    buildFootTrafficView(supabase, clientId, city, bizType),
  ])

  // Pending approvals count
  const { count: pendingApprovals } = await supabase
    .from('deliverables')
    .select('id', { count: 'exact', head: true })
    .eq('business_id', clientId)
    .eq('status', 'client_review')

  // Compute health signal from both views
  const visUp = visibility.up
  const ftUp = footTraffic.up
  const healthSignal: import('@/types/dashboard').HealthSignal =
    (visUp && ftUp) ? 'green' : (!visUp && !ftUp) ? 'red' : 'amber'

  const healthHeadline = healthSignal === 'green'
    ? 'Your marketing is performing well'
    : healthSignal === 'red'
      ? "Let's focus on turning things around"
      : 'Mostly on track, one area needs attention'

  // Build action items
  const actionItems: import('@/types/dashboard').ActionItem[] = []
  if ((pendingApprovals ?? 0) > 0) {
    actionItems.push({
      icon: 'inbox',
      title: `${pendingApprovals} post${pendingApprovals === 1 ? '' : 's'} ready for your review`,
      href: '/dashboard/social/action-needed',
    })
  }
  // Flag metric drops > 10%
  const visPct = parseInt(visibility.pct)
  const ftPct = parseInt(footTraffic.pct)
  if (!isNaN(visPct) && visPct < -10) {
    actionItems.push({
      icon: 'alert',
      title: `Social reach dropped ${Math.abs(visPct)}% in the last 30 days`,
      href: '/dashboard/social/performance',
    })
  }
  if (!isNaN(ftPct) && ftPct < -10) {
    actionItems.push({
      icon: 'alert',
      title: `Foot traffic dropped ${Math.abs(ftPct)}% in the last 30 days`,
      href: '/dashboard/analytics',
    })
  }
  // AM note as action item if exists
  if (visibility.am.note) {
    actionItems.push({
      icon: 'message',
      title: `Note from ${visibility.am.name}: ${visibility.am.note.slice(0, 60)}...`,
      href: '/dashboard/messages',
    })
  }

  return {
    visibility,
    footTraffic,
    businessName: client.name,
    healthSignal,
    healthHeadline,
    pendingApprovals: pendingApprovals ?? 0,
    actionItems: actionItems.slice(0, 3),
  }
}

// ---------------------------------------------------------------------------
// Visibility View
// ---------------------------------------------------------------------------

async function buildVisibilityView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  city: string = 'Seattle',
  bizType: string = 'restaurant'
): Promise<DashboardView> {
  const now = new Date()
  // Use rolling 30-day windows (same pattern as the AI Operator + MCP).
  // Calendar months break for clients whose data was loaded historically:
  // "this month" can be empty even when last 30 days has plenty of data.
  const thisMonthStart = addDays(now, -30)
  const lastMonthStart = addDays(now, -60)
  const lastMonthEnd = addDays(now, -31)

  // Fetch all social metrics for last 365 days
  const yearAgo = addDays(now, -365)
  const { data: metrics } = await supabase
    .from('social_metrics')
    .select('date, reach, impressions, profile_visits, followers_gained, engagement')
    .eq('client_id', clientId)
    .gte('date', formatDate(yearAgo))
    .order('date', { ascending: true })

  if (!metrics || metrics.length === 0) {
    return emptyView('visibility')
  }

  // Aggregate by day (sum across platforms)
  const daily = aggregateByDay(metrics, [
    'reach', 'impressions', 'profile_visits', 'followers_gained', 'engagement',
  ])

  // Current month totals
  const thisMonth = filterByDateRange(daily, thisMonthStart, now)
  const lastMonth = filterByDateRange(daily, lastMonthStart, lastMonthEnd)

  const thisReach = sumField(thisMonth, 'reach')
  const lastReach = sumField(lastMonth, 'reach')
  const pctChange = lastReach > 0 ? Math.round(((thisReach - lastReach) / lastReach) * 100) : 0
  const isUp = pctChange >= 0

  // Sparklines: last 12 weeks, weekly totals
  const sparkReach = weeklySparkline(daily, 'reach', 12)
  const sparkVisits = weeklySparkline(daily, 'profile_visits', 12)
  const sparkImpressions = weeklySparkline(daily, 'impressions', 12)
  const sparkFollowers = weeklySparkline(daily, 'followers_gained', 12)

  // Metric cards
  const thisImpressions = sumField(thisMonth, 'impressions')
  const lastImpressions = sumField(lastMonth, 'impressions')
  const thisVisits = sumField(thisMonth, 'profile_visits')
  const lastVisits = sumField(lastMonth, 'profile_visits')
  const thisFollowers = sumField(thisMonth, 'followers_gained')
  const lastFollowers = sumField(lastMonth, 'followers_gained')

  const metricsCards: DashboardMetric[] = [
    {
      label: 'Social reach',
      value: fmtNum(thisReach),
      subtitle: 'People who saw your content',
      trend: fmtPct(thisReach, lastReach),
      up: thisReach >= lastReach,
      sparkline: sparkReach,
    },
    {
      label: 'Profile visits',
      value: fmtNum(thisVisits),
      subtitle: 'People who checked your page',
      trend: fmtPct(thisVisits, lastVisits),
      up: thisVisits >= lastVisits,
      sparkline: sparkVisits,
    },
    {
      label: 'Impressions',
      value: fmtNum(thisImpressions),
      subtitle: 'Times your content was shown',
      trend: fmtPct(thisImpressions, lastImpressions),
      up: thisImpressions >= lastImpressions,
      sparkline: sparkImpressions,
    },
    {
      label: 'New followers',
      value: '+' + fmtNum(thisFollowers),
      subtitle: 'People who followed you',
      trend: fmtPct(thisFollowers, lastFollowers),
      up: thisFollowers >= lastFollowers,
      sparkline: sparkFollowers,
    },
  ]

  // Chart data for all time ranges
  const chartData = buildChartData(daily, 'reach')

  // Benchmarks
  const benchmark = await getBenchmark(supabase, 'visibility', city, bizType)
  const rank = computeRank(thisReach, benchmark)

  // Insights
  const insights = await getInsights(supabase, clientId, 'visibility')

  // AM note
  const am = await getAmNote(supabase, clientId, 'visibility')

  return {
    headline: pctChange > 3 ? "You're growing" : pctChange < -3 ? "Let's turn this around" : 'Holding steady',
    up: isUp,
    ctx: 'People who discovered you',
    num: fmtNum(thisReach),
    unit: 'people',
    pct: (isUp ? '+' : '') + pctChange + '%',
    pctFull: (isUp ? '+' : '') + pctChange + '% vs prior 30 days',
    bdtitle: "What's driving visibility",
    bmy: thisReach,
    bmavg: benchmark?.avg ?? 0,
    bmmax: benchmark?.max ?? thisReach * 1.5,
    rank,
    metrics: metricsCards,
    insights,
    am,
    chartData,
  }
}

// ---------------------------------------------------------------------------
// Foot Traffic View
// ---------------------------------------------------------------------------

async function buildFootTrafficView(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  city: string = 'Seattle',
  bizType: string = 'restaurant'
): Promise<DashboardView> {
  const now = new Date()
  // Rolling 30-day windows -- see comment on buildVisibilityView.
  const thisMonthStart = addDays(now, -30)
  const lastMonthStart = addDays(now, -60)
  const lastMonthEnd = addDays(now, -31)

  const yearAgo = addDays(now, -365)
  const { data: metrics } = await supabase
    .from('gbp_metrics')
    .select('date, directions, calls, website_clicks, search_views')
    .eq('client_id', clientId)
    .gte('date', formatDate(yearAgo))
    .order('date', { ascending: true })

  if (!metrics || metrics.length === 0) {
    return emptyView('foot_traffic')
  }

  // Aggregate by day (sum across locations)
  const daily = aggregateByDay(metrics, [
    'directions', 'calls', 'website_clicks', 'search_views',
  ])

  // Add a computed "actions" field (directions + calls + website_clicks)
  for (const row of daily) {
    row.actions = Number(row.directions || 0) + Number(row.calls || 0) + Number(row.website_clicks || 0)
  }

  const thisMonth = filterByDateRange(daily, thisMonthStart, now)
  const lastMonth = filterByDateRange(daily, lastMonthStart, lastMonthEnd)

  const thisActions = sumField(thisMonth, 'actions')
  const lastActions = sumField(lastMonth, 'actions')
  const pctChange = lastActions > 0 ? Math.round(((thisActions - lastActions) / lastActions) * 100) : 0
  const isUp = pctChange >= 0

  const thisDirections = sumField(thisMonth, 'directions')
  const lastDirections = sumField(lastMonth, 'directions')
  const thisCalls = sumField(thisMonth, 'calls')
  const lastCalls = sumField(lastMonth, 'calls')
  const thisClicks = sumField(thisMonth, 'website_clicks')
  const lastClicks = sumField(lastMonth, 'website_clicks')
  const thisSearch = sumField(thisMonth, 'search_views')
  const lastSearch = sumField(lastMonth, 'search_views')

  const metricsCards: DashboardMetric[] = [
    {
      label: 'Directions',
      value: fmtNum(thisDirections),
      subtitle: 'People who got directions to you',
      trend: fmtPct(thisDirections, lastDirections),
      up: thisDirections >= lastDirections,
      sparkline: weeklySparkline(daily, 'directions', 12),
    },
    {
      label: 'Phone calls',
      value: fmtNum(thisCalls),
      subtitle: 'Calls from your Google listing',
      trend: fmtPct(thisCalls, lastCalls),
      up: thisCalls >= lastCalls,
      sparkline: weeklySparkline(daily, 'calls', 12),
    },
    {
      label: 'Website clicks',
      value: fmtNum(thisClicks),
      subtitle: 'Visits to your site from Google',
      trend: fmtPct(thisClicks, lastClicks),
      up: thisClicks >= lastClicks,
      sparkline: weeklySparkline(daily, 'website_clicks', 12),
    },
    {
      label: 'Search views',
      value: fmtNum(thisSearch),
      subtitle: 'Times you appeared in search',
      trend: fmtPct(thisSearch, lastSearch),
      up: thisSearch >= lastSearch,
      sparkline: weeklySparkline(daily, 'search_views', 12),
    },
  ]

  const chartData = buildChartData(daily, 'actions')

  const benchmark = await getBenchmark(supabase, 'foot_traffic', city, bizType)
  const rank = computeRank(thisActions, benchmark)

  const insights = await getInsights(supabase, clientId, 'foot_traffic')
  const am = await getAmNote(supabase, clientId, 'foot_traffic')

  return {
    headline: pctChange > 3 ? 'Traffic is climbing' : pctChange < -3 ? 'Traffic needs a boost' : 'Traffic is steady',
    up: isUp,
    ctx: 'People taking action to visit',
    num: fmtNum(thisActions),
    unit: 'actions',
    pct: (isUp ? '+' : '') + pctChange + '%',
    pctFull: (isUp ? '+' : '') + pctChange + '% vs prior 30 days',
    bdtitle: "What's driving foot traffic",
    bmy: thisActions,
    bmavg: benchmark?.avg ?? 0,
    bmmax: benchmark?.max ?? thisActions * 1.5,
    rank,
    metrics: metricsCards,
    insights,
    am,
    chartData,
  }
}

// ---------------------------------------------------------------------------
// Helpers: Aggregation
// ---------------------------------------------------------------------------

interface DayRow {
  date: string
  [key: string]: number | string | undefined
}

function aggregateByDay(
  rows: Record<string, unknown>[],
  fields: string[]
): DayRow[] {
  const map = new Map<string, DayRow>()
  for (const row of rows) {
    const date = row.date as string
    if (!map.has(date)) {
      const entry: DayRow = { date }
      for (const f of fields) entry[f] = 0
      map.set(date, entry)
    }
    const entry = map.get(date)!
    for (const f of fields) {
      entry[f] = (Number(entry[f]) || 0) + (Number(row[f]) || 0)
    }
  }
  return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
}

function filterByDateRange(rows: DayRow[], start: Date, end: Date): DayRow[] {
  const s = formatDate(start)
  const e = formatDate(end)
  return rows.filter((r) => r.date >= s && r.date <= e)
}

function sumField(rows: DayRow[], field: string): number {
  return rows.reduce((acc, r) => acc + ((r[field] as number) || 0), 0)
}

function weeklySparkline(daily: DayRow[], field: string, weeks: number): number[] {
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

// ---------------------------------------------------------------------------
// Helpers: Chart Data
// ---------------------------------------------------------------------------

function buildChartData(daily: DayRow[], field: string): Record<TimeRange, ChartData> {
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
  daily: DayRow[],
  field: string,
  days: number,
  now: Date,
  resolution: 'day' | 'biday' | 'week'
): ChartData {
  const start = addDays(now, -days)
  const filtered = filterByDateRange(daily, start, now)

  if (filtered.length === 0) {
    return { data: [0], labels: ['No data'] }
  }

  const data: number[] = []
  const labels: string[] = []
  const step = resolution === 'week' ? 7 : resolution === 'biday' ? 2 : 1

  // Generate labels based on resolution
  const labelDates: Date[] = []
  if (days <= 7) {
    // 1W: label each day
    for (let i = days - 1; i >= 0; i--) {
      const d = addDays(now, -i)
      labelDates.push(d)
    }
  } else if (days <= 30) {
    // 1M: label every ~7 days
    for (let i = 0; i < 5; i++) {
      labelDates.push(addDays(start, Math.round((i / 4) * days)))
    }
  } else if (days <= 90) {
    // 3M: monthly labels
    const months = new Set<string>()
    for (let i = days; i >= 0; i -= 30) {
      const d = addDays(now, -i)
      const label = d.toLocaleDateString('en-US', { month: 'short' })
      if (!months.has(label)) {
        months.add(label)
        labelDates.push(d)
      }
    }
  } else if (days <= 180) {
    // 6M: monthly labels
    for (let i = 6; i >= 0; i--) {
      labelDates.push(addMonths(now, -i))
    }
  } else {
    // 1Y: quarterly-ish labels
    for (let i = 4; i >= 0; i--) {
      labelDates.push(addMonths(now, -i * 3))
    }
  }

  // Build data points
  let cursor = new Date(start)
  while (cursor <= now) {
    const windowEnd = addDays(cursor, step - 1)
    const windowRows = filterByDateRange(daily, cursor, windowEnd)
    data.push(sumField(windowRows, field))
    cursor = addDays(cursor, step)
  }

  // Trim trailing zeros so the chart doesn't drop to 0 at the end
  // (happens when today's sync hasn't populated all fields yet)
  while (data.length > 1 && data[data.length - 1] === 0) {
    data.pop()
  }

  // Build label strings
  const xlabels: string[] = []
  for (const d of labelDates) {
    if (days <= 7) {
      const dayOfWeek = d.toLocaleDateString('en-US', { weekday: 'short' })
      xlabels.push(isToday(d) ? 'Today' : dayOfWeek)
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

// ---------------------------------------------------------------------------
// Helpers: Benchmarks, Insights, AM Notes
// ---------------------------------------------------------------------------

interface BenchmarkRow {
  avg: number
  max: number
  p25: number
  p50: number
  p75: number
}

async function getBenchmark(
  supabase: Awaited<ReturnType<typeof createClient>>,
  metricType: string,
  city: string,
  businessType: string
): Promise<BenchmarkRow | null> {
  // Try city-level benchmark first, fall back to national
  let { data } = await supabase
    .from('benchmarks')
    .select('avg_value, max_value, percentile_25, percentile_50, percentile_75')
    .eq('metric_type', metricType)
    .eq('area_type', 'city')
    .eq('area_value', city)
    .eq('business_type', businessType)
    .maybeSingle()

  if (!data) {
    const national = await supabase
      .from('benchmarks')
      .select('avg_value, max_value, percentile_25, percentile_50, percentile_75')
      .eq('metric_type', metricType)
      .eq('area_type', 'national')
      .eq('business_type', businessType)
      .maybeSingle()
    data = national.data
  }

  if (!data) return null
  return {
    avg: Number(data.avg_value),
    max: Number(data.max_value),
    p25: Number(data.percentile_25 ?? 0),
    p50: Number(data.percentile_50 ?? 0),
    p75: Number(data.percentile_75 ?? 0),
  }
}

function computeRank(value: number, benchmark: BenchmarkRow | null): string {
  if (!benchmark) return ''
  if (value >= benchmark.p75) return 'Top 25%'
  if (value >= benchmark.p50) return 'Top 50%'
  if (value >= benchmark.p25) return 'Top 75%'
  return 'Building up'
}

async function getInsights(
  supabase: Awaited<ReturnType<typeof createClient>>,
  clientId: string,
  viewType: string
): Promise<DashboardInsight[]> {
  const { data } = await supabase
    .from('insights')
    .select('icon, title, subtitle')
    .eq('client_id', clientId)
    .eq('view_type', viewType)
    .eq('active', true)
    .order('priority', { ascending: false })
    .limit(2)

  if (!data || data.length === 0) return []
  return data.map((r) => ({
    icon: r.icon as InsightIcon,
    title: r.title,
    subtitle: r.subtitle,
  }))
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

// ---------------------------------------------------------------------------
// Helpers: Empty state
// ---------------------------------------------------------------------------

function emptyView(viewType: 'visibility' | 'foot_traffic'): DashboardView {
  const isVisibility = viewType === 'visibility'
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
    ctx: isVisibility ? 'People who discovered you' : 'People taking action to visit',
    num: '---',
    unit: isVisibility ? 'people' : 'actions',
    pct: '---',
    pctFull: 'Collecting data',
    bdtitle: isVisibility ? "What's driving visibility" : "What's driving foot traffic",
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
// Helpers: Formatting
// ---------------------------------------------------------------------------

function fmtNum(n: number): string {
  if (n >= 10000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return n.toString()
}

function fmtPct(current: number, previous: number): string {
  if (previous === 0) return current > 0 ? '+100%' : '0%'
  const pct = Math.round(((current - previous) / previous) * 100)
  return (pct >= 0 ? '+' : '') + pct + '%'
}

// ---------------------------------------------------------------------------
// Helpers: Date utilities
// ---------------------------------------------------------------------------

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
