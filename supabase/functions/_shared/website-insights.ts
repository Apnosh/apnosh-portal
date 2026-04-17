// DO NOT EDIT DIRECTLY.
// This is a Deno-compatible mirror of src/lib/website-insights.ts.
// Both files must be kept in sync. Any change made here MUST be made in the
// canonical source too (or vice versa). The library is pure TypeScript with
// no framework dependencies, which makes the mirror safe.
// ============================================================================

/**
 * website-insights.ts
 *
 * Pure functions that turn daily/monthly analytics rows into a narrative-shaped
 * insight object. Used by:
 * - /dashboard/website/traffic (live view, any time range)
 * - generate-weekly-brief Edge Function (persisted weekly snapshot)
 * - /dashboard/briefs/[id] (rendering saved briefs)
 *
 * No framework dependencies. Input/output is plain TypeScript.
 */

// ---------------------------------------------------------------------------
// Input types (what callers pass in)
// ---------------------------------------------------------------------------

export interface DailyWebsiteRow {
  date: string                                       // "YYYY-MM-DD"
  visitors: number | null
  page_views: number | null
  sessions: number | null
  bounce_rate: number | null                         // GA4 0-1 fraction
  avg_session_duration: number | null
  mobile_pct: number | null
  traffic_sources: Record<string, number> | null
  top_pages: Array<{ path: string; views: number }> | null
  conversion_events: ConversionEvents | null
  top_cities: Array<{ city: string; sessions: number }> | null
  landing_pages: Array<{ path: string; sessions: number }> | null
  new_users: number | null
  returning_users: number | null
  top_referrers: Array<{ source: string; sessions: number }> | null
}

export interface DailySearchRow {
  date: string
  total_impressions: number | null
  total_clicks: number | null
  avg_ctr: number | null
  avg_position: number | null
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }> | null
}

export interface ConversionEvents {
  phone_clicks: number
  direction_clicks: number
  form_submits: number
  booking_clicks: number
  other: number
  total: number
}

export interface UniqueAggregateOverride {
  // When available, overrides the sum-of-daily visitors with the authoritative
  // total for the window. Used when we pre-computed monthly aggregates or
  // when we query GA4 for an arbitrary range directly.
  unique_visitors?: number
  unique_new_users?: number
  unique_returning_users?: number
}

// ---------------------------------------------------------------------------
// Output shape (what UIs render)
// ---------------------------------------------------------------------------

export interface WebsiteInsight {
  // Summary
  headline: string                    // One-line plain-English insight
  narrative: string                   // 2-3 sentence paragraph

  // Hero metrics (render these big)
  hero: {
    visitors: Metric
    actions: Metric                   // conversions total (calls + directions + forms + bookings)
    searchVisibility: Metric          // search impressions (proxy for "how often you show up")
  }

  // "Where visitors came from"
  sources: Array<{ label: string; count: number; pct: number }>

  // "Where they are"
  cities: Array<{ city: string; sessions: number }>

  // "What they looked at"
  topPages: Array<{ path: string; label: string; views: number }>

  // "How you rank on Google"
  search: {
    hasData: boolean
    impressions: number
    clicks: number
    topQuery: string | null
    avgPosition: number | null
    insight: string | null            // "Ranks first on Google for 'apnosh'"
  }

  // Advanced / detail section
  advanced: {
    pageViews: number
    sessions: number
    bounceRate: number | null         // 0-100 percentage
    avgSessionDuration: number | null
    mobilePct: number | null
    newUsers: number
    returningUsers: number
    landingPages: Array<{ path: string; sessions: number }>
    referrers: Array<{ source: string; sessions: number }>
    conversionBreakdown: ConversionEvents
  }

  // Data-quality / freshness meta
  meta: {
    daysWithData: number
    startDate: string
    endDate: string
    usingMonthlyAggregate: boolean    // true if visitors came from authoritative source
  }
}

export interface Metric {
  value: number
  label: string
  sublabel: string | null             // e.g. "+22% vs last period"
  trendPct: number | null
  hasData: boolean
}

export interface ComparisonWindow {
  daily: DailyWebsiteRow[]
  search: DailySearchRow[]
  uniqueOverride?: UniqueAggregateOverride
}

// ---------------------------------------------------------------------------
// Source labels (plain language for local business owners)
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, string> = {
  direct: 'Direct',
  'organic search': 'Google search',
  search: 'Google search',
  'organic social': 'Social media',
  social: 'Social media',
  'paid social': 'Paid social',
  'paid search': 'Paid search',
  paid: 'Paid ads',
  referral: 'Other websites',
  email: 'Email',
  unassigned: 'Other',
}

export function prettySource(key: string): string {
  return SOURCE_LABELS[key.toLowerCase()] ?? key.replace(/^\w/, c => c.toUpperCase())
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

export function buildWebsiteInsight(
  current: ComparisonWindow,
  previous: ComparisonWindow | null,
  startDate: string,
  endDate: string,
): WebsiteInsight {
  const curr = aggregate(current)
  const prev = previous ? aggregate(previous) : null

  // Visitors: prefer authoritative override if provided, else sum of daily
  const uniqueVisitors = current.uniqueOverride?.unique_visitors
    ?? curr.visitors
  const uniqueNewUsers = current.uniqueOverride?.unique_new_users
    ?? curr.newUsers
  const uniqueReturningUsers = current.uniqueOverride?.unique_returning_users
    ?? curr.returningUsers
  const prevUniqueVisitors = previous?.uniqueOverride?.unique_visitors
    ?? prev?.visitors
    ?? 0

  const visitorTrend = trendPct(uniqueVisitors, prevUniqueVisitors)
  const actionsTrend = trendPct(curr.conversionTotal, prev?.conversionTotal ?? 0)
  const searchTrend = trendPct(curr.searchImpressions, prev?.searchImpressions ?? 0)

  // Build source breakdown with plain labels, merging near-duplicates
  const sourceTotals = curr.sourceTotals
  const sourcesSum = Object.values(sourceTotals).reduce((a, b) => a + b, 0)
  const sources = Object.entries(sourceTotals)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([key, count]) => ({
      label: prettySource(key),
      count,
      pct: sourcesSum > 0 ? (count / sourcesSum) * 100 : 0,
    }))

  // Cities
  const cities = curr.cities.slice(0, 10)

  // Top pages with readable labels
  const topPages = curr.topPages.slice(0, 8).map(p => ({
    path: p.path,
    label: prettifyPath(p.path),
    views: p.views,
  }))

  // Search insight
  const hasSearchData = curr.searchImpressions > 0 || curr.searchClicks > 0
  let searchInsight: string | null = null
  if (hasSearchData && curr.avgPosition != null && curr.topQuery) {
    const posRounded = Math.round(curr.avgPosition)
    if (curr.avgPosition <= 1.5) {
      searchInsight = `You rank first on Google for "${curr.topQuery}".`
    } else if (posRounded <= 3) {
      searchInsight = `You rank in the top 3 on Google for "${curr.topQuery}".`
    } else if (posRounded <= 10) {
      searchInsight = `You show up on Google's first page for "${curr.topQuery}" (position ${posRounded}).`
    } else {
      searchInsight = `Your top search term is "${curr.topQuery}" (position ${posRounded}).`
    }
  }

  // Build narrative + headline
  const { headline, narrative } = buildNarrative({
    uniqueVisitors,
    visitorTrend,
    actions: curr.conversionTotal,
    actionsTrend,
    sessions: curr.sessions,
    searchImpressions: curr.searchImpressions,
    searchClicks: curr.searchClicks,
    topQuery: curr.topQuery,
    topSources: sources.slice(0, 3).map(s => s.label),
    startDate,
    endDate,
  })

  return {
    headline,
    narrative,
    hero: {
      visitors: {
        value: uniqueVisitors,
        label: 'Visitors',
        sublabel: trendSublabel(visitorTrend),
        trendPct: visitorTrend,
        hasData: uniqueVisitors > 0,
      },
      actions: {
        value: curr.conversionTotal,
        label: 'Actions Taken',
        sublabel: curr.conversionTotal > 0 ? trendSublabel(actionsTrend) : null,
        trendPct: actionsTrend,
        hasData: curr.conversionTotal > 0,
      },
      searchVisibility: {
        value: curr.searchImpressions,
        label: 'Times Shown on Google',
        sublabel: curr.searchImpressions > 0 ? trendSublabel(searchTrend) : null,
        trendPct: searchTrend,
        hasData: curr.searchImpressions > 0,
      },
    },
    sources,
    cities,
    topPages,
    search: {
      hasData: hasSearchData,
      impressions: curr.searchImpressions,
      clicks: curr.searchClicks,
      topQuery: curr.topQuery,
      avgPosition: curr.avgPosition,
      insight: searchInsight,
    },
    advanced: {
      pageViews: curr.pageViews,
      sessions: curr.sessions,
      bounceRate: curr.bounceRate,
      avgSessionDuration: curr.avgSessionDuration,
      mobilePct: curr.mobilePct,
      newUsers: uniqueNewUsers,
      returningUsers: uniqueReturningUsers,
      landingPages: curr.landingPages.slice(0, 8),
      referrers: curr.referrers.slice(0, 8),
      conversionBreakdown: curr.conversionBreakdown,
    },
    meta: {
      daysWithData: curr.daysWithData,
      startDate,
      endDate,
      usingMonthlyAggregate: current.uniqueOverride?.unique_visitors != null,
    },
  }
}

// ---------------------------------------------------------------------------
// Shape adapters -- reshape a WebsiteInsight for specific consumers
// ---------------------------------------------------------------------------

/**
 * Shape a WebsiteInsight into the weekly_briefs DB row format.
 * Used by the generate-weekly-brief Edge Function to write a consistent row
 * that matches what the live traffic view shows.
 */
export function toWeeklyBriefRow(
  insight: WebsiteInsight,
  current: ComparisonWindow,
  previous: ComparisonWindow | null,
): {
  unique_visitors: number
  visitor_trend_pct: number | null
  sessions: number
  sessions_trend_pct: number | null
  page_views: number
  bounce_rate: number | null
  avg_session_duration: number | null
  search_impressions: number
  search_clicks: number
  search_trend_pct: number | null
  top_search_query: string | null
  conversion_total: number
  conversion_trend_pct: number | null
  headline: string
  narrative: string
  highlights: Array<{ label: string; value: string; insight: string | null }>
  top_sources: string[]
} {
  const curr = aggregate(current)
  const prev = previous ? aggregate(previous) : null

  const highlights: Array<{ label: string; value: string; insight: string | null }> = []
  if (insight.hero.visitors.hasData) {
    highlights.push({
      label: 'Unique Visitors',
      value: insight.hero.visitors.value.toLocaleString(),
      insight: insight.hero.visitors.sublabel,
    })
  }
  if (curr.sessions > 0) {
    highlights.push({
      label: 'Sessions',
      value: curr.sessions.toLocaleString(),
      insight: prev != null ? trendSublabelRaw(curr.sessions, prev.sessions) : null,
    })
  }
  if (insight.search.hasData) {
    highlights.push({
      label: 'Search Impressions',
      value: insight.search.impressions.toLocaleString(),
      insight: `${insight.search.clicks} clicks${insight.search.topQuery ? ` · top query: "${insight.search.topQuery}"` : ''}`,
    })
  }
  if (insight.hero.actions.hasData) {
    highlights.push({
      label: 'Conversions',
      value: insight.hero.actions.value.toLocaleString(),
      insight: insight.hero.actions.sublabel,
    })
  }

  return {
    unique_visitors: insight.hero.visitors.value,
    visitor_trend_pct: insight.hero.visitors.trendPct,
    sessions: curr.sessions,
    sessions_trend_pct: prev ? trendPct(curr.sessions, prev.sessions) : null,
    page_views: curr.pageViews,
    bounce_rate: curr.bounceRate,
    avg_session_duration: curr.avgSessionDuration,
    search_impressions: insight.search.impressions,
    search_clicks: insight.search.clicks,
    search_trend_pct: insight.hero.searchVisibility.trendPct,
    top_search_query: insight.search.topQuery,
    conversion_total: insight.hero.actions.value,
    conversion_trend_pct: insight.hero.actions.trendPct,
    headline: insight.headline,
    narrative: insight.narrative,
    highlights,
    top_sources: insight.sources.slice(0, 3).map(s => s.label),
  }
}

function trendSublabelRaw(current: number, previous: number): string | null {
  const t = trendPct(current, previous)
  if (t == null) return null
  if (t === 0) return 'No change from last period'
  return `${t > 0 ? 'Up' : 'Down'} ${Math.abs(t)}% from last period`
}

// ---------------------------------------------------------------------------
// Aggregate helpers
// ---------------------------------------------------------------------------

interface AggregatedWindow {
  visitors: number
  sessions: number
  pageViews: number
  newUsers: number
  returningUsers: number
  bounceRate: number | null                                    // 0-100 percentage
  avgSessionDuration: number | null
  mobilePct: number | null
  conversionTotal: number
  conversionBreakdown: ConversionEvents
  sourceTotals: Record<string, number>
  topPages: Array<{ path: string; views: number }>
  landingPages: Array<{ path: string; sessions: number }>
  cities: Array<{ city: string; sessions: number }>
  referrers: Array<{ source: string; sessions: number }>
  searchImpressions: number
  searchClicks: number
  avgPosition: number | null
  topQuery: string | null
  daysWithData: number
}

function aggregate(win: ComparisonWindow): AggregatedWindow {
  let visitors = 0, sessions = 0, pageViews = 0, newUsers = 0, returningUsers = 0
  let bounceNum = 0, bounceDen = 0
  let durNum = 0, durDen = 0
  let mobileNum = 0, mobileDen = 0
  let conversionTotal = 0
  const conversionBreakdown: ConversionEvents = {
    phone_clicks: 0, direction_clicks: 0, form_submits: 0, booking_clicks: 0, other: 0, total: 0,
  }
  const sourceTotals: Record<string, number> = {}
  const topPagesMap = new Map<string, number>()
  const landingMap = new Map<string, number>()
  const citiesMap = new Map<string, number>()
  const referrersMap = new Map<string, number>()
  let daysWithData = 0

  for (const d of win.daily) {
    visitors += d.visitors ?? 0
    sessions += d.sessions ?? 0
    pageViews += d.page_views ?? 0
    newUsers += d.new_users ?? 0
    returningUsers += d.returning_users ?? 0
    daysWithData += 1

    const s = d.sessions ?? 0
    if (d.bounce_rate != null && s > 0) { bounceNum += d.bounce_rate * s; bounceDen += s }
    if (d.avg_session_duration != null && s > 0) { durNum += d.avg_session_duration * s; durDen += s }
    if (d.mobile_pct != null && s > 0) { mobileNum += d.mobile_pct * s; mobileDen += s }

    if (d.conversion_events) {
      const ce = d.conversion_events
      conversionBreakdown.phone_clicks += ce.phone_clicks ?? 0
      conversionBreakdown.direction_clicks += ce.direction_clicks ?? 0
      conversionBreakdown.form_submits += ce.form_submits ?? 0
      conversionBreakdown.booking_clicks += ce.booking_clicks ?? 0
      conversionBreakdown.other += ce.other ?? 0
      conversionBreakdown.total += ce.total ?? 0
      conversionTotal += ce.total ?? 0
    }

    if (d.traffic_sources) {
      for (const [k, v] of Object.entries(d.traffic_sources)) {
        if (typeof v === 'number') sourceTotals[k] = (sourceTotals[k] ?? 0) + v
      }
    }

    for (const p of d.top_pages ?? []) {
      topPagesMap.set(p.path, (topPagesMap.get(p.path) ?? 0) + (p.views ?? 0))
    }
    for (const p of d.landing_pages ?? []) {
      landingMap.set(p.path, (landingMap.get(p.path) ?? 0) + (p.sessions ?? 0))
    }
    for (const c of d.top_cities ?? []) {
      citiesMap.set(c.city, (citiesMap.get(c.city) ?? 0) + (c.sessions ?? 0))
    }
    for (const r of d.top_referrers ?? []) {
      const domain = cleanReferrerDomain(r.source)
      referrersMap.set(domain, (referrersMap.get(domain) ?? 0) + (r.sessions ?? 0))
    }
  }

  // Search aggregates
  let searchImpressions = 0, searchClicks = 0
  let positionNum = 0, positionCount = 0
  const queryMap = new Map<string, number>()
  for (const s of win.search) {
    const imp = s.total_impressions ?? 0
    searchImpressions += imp
    searchClicks += s.total_clicks ?? 0
    if (imp > 0 && s.avg_position != null) {
      positionNum += s.avg_position * imp
      positionCount += imp
    }
    for (const q of s.top_queries ?? []) {
      queryMap.set(q.query, (queryMap.get(q.query) ?? 0) + (q.impressions ?? 0))
    }
  }
  const avgPosition = positionCount > 0 ? Math.round((positionNum / positionCount) * 10) / 10 : null
  const queries = [...queryMap.entries()].sort((a, b) => b[1] - a[1])
  const topQuery = queries.length > 0 ? queries[0][0] : null

  return {
    visitors, sessions, pageViews, newUsers, returningUsers,
    bounceRate: bounceDen > 0 ? Math.round((bounceNum / bounceDen) * 1000) / 10 : null,
    avgSessionDuration: durDen > 0 ? Math.round(durNum / durDen) : null,
    mobilePct: mobileDen > 0 ? Math.round((mobileNum / mobileDen) * 10) / 10 : null,
    conversionTotal,
    conversionBreakdown,
    sourceTotals,
    topPages: [...topPagesMap.entries()]
      .map(([path, views]) => ({ path, views }))
      .sort((a, b) => b.views - a.views),
    landingPages: [...landingMap.entries()]
      .map(([path, sessions]) => ({ path, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    cities: [...citiesMap.entries()]
      .map(([city, sessions]) => ({ city, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    referrers: [...referrersMap.entries()]
      .map(([source, sessions]) => ({ source, sessions }))
      .sort((a, b) => b.sessions - a.sessions),
    searchImpressions, searchClicks, avgPosition, topQuery,
    daysWithData,
  }
}

function cleanReferrerDomain(s: string): string {
  return s.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
}

function prettifyPath(path: string): string {
  if (path === '/' || path === '') return 'Homepage'
  const parts = path.replace(/^\//, '').replace(/\/$/, '').split('/').filter(Boolean)
  if (parts.length === 0) return 'Homepage'
  // Take last segment, de-kebab, title-case
  const last = parts[parts.length - 1]
  return last
    .replace(/^service-/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function trendPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null  // skip "100% up from zero" which isn't meaningful
  return Math.round(((current - previous) / previous) * 1000) / 10
}

function trendSublabel(trend: number | null): string | null {
  if (trend == null) return null
  if (trend === 0) return 'No change from last period'
  const arrow = trend > 0 ? 'Up' : 'Down'
  return `${arrow} ${Math.abs(trend)}% from last period`
}

// ---------------------------------------------------------------------------
// Narrative
// ---------------------------------------------------------------------------

function buildNarrative(d: {
  uniqueVisitors: number
  visitorTrend: number | null
  actions: number
  actionsTrend: number | null
  sessions: number
  searchImpressions: number
  searchClicks: number
  topQuery: string | null
  topSources: string[]
  startDate: string
  endDate: string
}): { headline: string; narrative: string } {
  // Headline: pick the most important signal
  let headline: string
  if (d.uniqueVisitors === 0) {
    headline = "No visitors tracked yet this period"
  } else if (d.actions > 0 && d.actionsTrend != null && d.actionsTrend >= 25) {
    headline = `People are taking action ${d.actionsTrend}% more`
  } else if (d.visitorTrend != null && d.visitorTrend >= 25) {
    headline = `${Math.round(d.visitorTrend)}% more people visited`
  } else if (d.visitorTrend != null && d.visitorTrend <= -25) {
    headline = `Visitors dipped ${Math.abs(Math.round(d.visitorTrend))}%`
  } else if (d.actions > 0) {
    headline = `${d.actions} ${d.actions === 1 ? 'person' : 'people'} took action`
  } else if (d.uniqueVisitors > 0) {
    headline = `${d.uniqueVisitors.toLocaleString()} ${d.uniqueVisitors === 1 ? 'person visited' : 'people visited'}`
  } else {
    headline = `Your website in this period`
  }

  // Narrative: 2-3 short sentences
  const parts: string[] = []

  if (d.uniqueVisitors > 0) {
    parts.push(`${d.uniqueVisitors.toLocaleString()} ${d.uniqueVisitors === 1 ? 'person' : 'people'} came to your website.`)
  } else {
    parts.push(`No visitors showed up in this period.`)
  }

  if (d.topSources.length > 0 && d.uniqueVisitors > 0) {
    if (d.topSources.length === 1) {
      parts.push(`Most came from ${d.topSources[0].toLowerCase()}.`)
    } else {
      parts.push(`They mostly came from ${d.topSources[0].toLowerCase()} and ${d.topSources[1].toLowerCase()}.`)
    }
  }

  if (d.actions > 0) {
    parts.push(`${d.actions} direct ${d.actions === 1 ? 'action was' : 'actions were'} taken (calls, directions, forms, or bookings).`)
  } else if (d.uniqueVisitors > 10) {
    parts.push(`No direct actions tracked yet -- ask your account manager to set up conversion tracking if you want to count calls and direction clicks.`)
  }

  if (d.searchImpressions > 0 && d.topQuery) {
    parts.push(`On Google, you showed up ${d.searchImpressions.toLocaleString()} ${d.searchImpressions === 1 ? 'time' : 'times'}. The top search was "${d.topQuery}".`)
  }

  return { headline, narrative: parts.join(' ') }
}
