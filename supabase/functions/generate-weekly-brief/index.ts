// @ts-nocheck — Deno runtime
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * generate-weekly-brief Edge Function
 *
 * Generates a weekly_briefs row for a client covering a 7-day window.
 * Pulls from website_metrics (daily), search_metrics, and GA4 directly
 * (for accurate weekly unique-users). Produces template-based narrative.
 *
 * Input:
 *   { client_id?: string,     // if omitted, generates for all active clients
 *     week_starting?: string  // "YYYY-MM-DD" Monday; defaults to last Monday
 *   }
 * Output:
 *   { generated: number, results: [...] }
 */

interface GA4Connection {
  client_id: string
  platform_account_id: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  id: string
}

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const targetClientId: string | undefined = body.client_id
    const weekStartingInput: string | undefined = body.week_starting

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Default to last Monday (the most recently completed Mon-Sun week)
    const weekStart = weekStartingInput ? new Date(weekStartingInput) : getLastMonday()
    const weekEnd = new Date(weekStart)
    weekEnd.setDate(weekEnd.getDate() + 6)
    const weekStartStr = toDateStr(weekStart)
    const weekEndStr = toDateStr(weekEnd)

    // Previous week for trend
    const prevStart = new Date(weekStart); prevStart.setDate(prevStart.getDate() - 7)
    const prevEnd = new Date(weekEnd); prevEnd.setDate(prevEnd.getDate() - 7)
    const prevStartStr = toDateStr(prevStart)
    const prevEndStr = toDateStr(prevEnd)

    // Get active GA4 connections (brief uses analytics data as primary signal)
    let connQuery = supabase
      .from('channel_connections')
      .select('id, client_id, platform_account_id, access_token, refresh_token, token_expires_at')
      .eq('channel', 'google_analytics')
      .eq('status', 'active')
      .not('access_token', 'is', null)
    if (targetClientId) connQuery = connQuery.eq('client_id', targetClientId)

    const { data: conns, error: connErr } = await connQuery
    if (connErr) {
      return new Response(JSON.stringify({ error: connErr.message }), { status: 500 })
    }

    const results = []
    let generated = 0

    for (const conn of (conns ?? []) as GA4Connection[]) {
      try {
        const freshToken = await ensureFreshToken(supabase, conn)

        // Weekly unique users direct from GA4 (accurate vs sum-of-daily)
        const weekTotals = await runWeekTotals(conn.platform_account_id, freshToken, weekStartStr, weekEndStr)
        const prevTotals = await runWeekTotals(conn.platform_account_id, freshToken, prevStartStr, prevEndStr)

        // Sum daily website_metrics for session-based fields + conversions
        const { data: dailyGa } = await supabase
          .from('website_metrics')
          .select('date, sessions, page_views, bounce_rate, avg_session_duration, traffic_sources, conversion_events')
          .eq('client_id', conn.client_id)
          .gte('date', weekStartStr).lte('date', weekEndStr)
        const { data: prevDailyGa } = await supabase
          .from('website_metrics')
          .select('sessions, conversion_events')
          .eq('client_id', conn.client_id)
          .gte('date', prevStartStr).lte('date', prevEndStr)

        const weekAgg = aggregateDaily(dailyGa ?? [])
        const prevAgg = aggregateDaily(prevDailyGa ?? [])

        // Search metrics for the week
        const { data: dailyGsc } = await supabase
          .from('search_metrics')
          .select('date, total_impressions, total_clicks, top_queries')
          .eq('client_id', conn.client_id)
          .gte('date', weekStartStr).lte('date', weekEndStr)
        const { data: prevDailyGsc } = await supabase
          .from('search_metrics')
          .select('total_impressions, total_clicks')
          .eq('client_id', conn.client_id)
          .gte('date', prevStartStr).lte('date', prevEndStr)

        const searchAgg = aggregateSearch(dailyGsc ?? [])
        const prevSearchAgg = aggregateSearch(prevDailyGsc ?? [])

        // Build narrative
        const narrative = buildNarrative({
          weekStart: weekStartStr, weekEnd: weekEndStr,
          uniqueVisitors: weekTotals.uniqueVisitors,
          prevUniqueVisitors: prevTotals.uniqueVisitors,
          sessions: weekAgg.sessions,
          prevSessions: prevAgg.sessions,
          searchImpressions: searchAgg.impressions,
          searchClicks: searchAgg.clicks,
          prevSearchImpressions: prevSearchAgg.impressions,
          topQuery: searchAgg.topQuery,
          conversionTotal: weekAgg.conversionTotal,
          prevConversionTotal: prevAgg.conversionTotal,
          topSources: weekAgg.topSources,
          pageViews: weekAgg.pageViews,
          bounceRate: weekAgg.bounceRate,
          avgSessionDuration: weekAgg.avgSessionDuration,
        })

        // Upsert the brief
        const briefRow = {
          client_id: conn.client_id,
          week_starting: weekStartStr,
          week_ending: weekEndStr,
          unique_visitors: weekTotals.uniqueVisitors,
          visitor_trend_pct: trendPct(weekTotals.uniqueVisitors, prevTotals.uniqueVisitors),
          sessions: weekAgg.sessions,
          sessions_trend_pct: trendPct(weekAgg.sessions, prevAgg.sessions),
          page_views: weekAgg.pageViews,
          bounce_rate: weekAgg.bounceRate,
          avg_session_duration: weekAgg.avgSessionDuration,
          search_impressions: searchAgg.impressions,
          search_clicks: searchAgg.clicks,
          search_trend_pct: trendPct(searchAgg.impressions, prevSearchAgg.impressions),
          top_search_query: searchAgg.topQuery,
          conversion_total: weekAgg.conversionTotal,
          conversion_trend_pct: trendPct(weekAgg.conversionTotal, prevAgg.conversionTotal),
          headline: narrative.headline,
          narrative: narrative.body,
          highlights: narrative.highlights,
          top_sources: weekAgg.topSources,
          next_week_preview: narrative.nextWeek,
          status: 'published',              // MVP: auto-publish
          generated_at: new Date().toISOString(),
          published_at: new Date().toISOString(),
        }

        const { error: upsertErr } = await supabase
          .from('weekly_briefs')
          .upsert(briefRow, { onConflict: 'client_id,week_starting' })

        if (upsertErr) throw new Error(upsertErr.message)

        generated++
        results.push({ client_id: conn.client_id, week_starting: weekStartStr, status: 'ok' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown'
        results.push({ client_id: conn.client_id, status: 'error', error: msg })
      }
    }

    return new Response(JSON.stringify({ generated, results }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})

// ---------------------------------------------------------------------------
// Aggregation helpers
// ---------------------------------------------------------------------------

function aggregateDaily(rows: any[]) {
  let sessions = 0, pageViews = 0
  let bounceNum = 0, bounceDen = 0
  let durNum = 0, durDen = 0
  let conversionTotal = 0
  const sourceTotals: Record<string, number> = {}

  for (const r of rows) {
    const s = r.sessions ?? 0
    sessions += s
    pageViews += r.page_views ?? 0
    if (r.bounce_rate != null && s > 0) { bounceNum += r.bounce_rate * s; bounceDen += s }
    if (r.avg_session_duration != null && s > 0) { durNum += r.avg_session_duration * s; durDen += s }
    conversionTotal += r.conversion_events?.total ?? 0
    if (r.traffic_sources) {
      for (const [k, v] of Object.entries(r.traffic_sources)) {
        if (typeof v === 'number') sourceTotals[k] = (sourceTotals[k] ?? 0) + v
      }
    }
  }

  const bounceRate = bounceDen > 0 ? Math.round((bounceNum / bounceDen) * 1000) / 10 : null
  const avgSessionDuration = durDen > 0 ? Math.round(durNum / durDen) : null
  const topSources = Object.entries(sourceTotals)
    .sort(([,a],[,b]) => (b as number) - (a as number))
    .slice(0, 3)
    .map(([k]) => k)

  return { sessions, pageViews, bounceRate, avgSessionDuration, conversionTotal, topSources }
}

function aggregateSearch(rows: any[]) {
  let impressions = 0, clicks = 0
  const queryMap = new Map<string, number>()

  for (const r of rows) {
    impressions += r.total_impressions ?? 0
    clicks += r.total_clicks ?? 0
    for (const q of r.top_queries ?? []) {
      queryMap.set(q.query, (queryMap.get(q.query) ?? 0) + (q.impressions ?? 0))
    }
  }

  const topQuery = queryMap.size === 0 ? null
    : [...queryMap.entries()].sort((a,b) => b[1] - a[1])[0][0]

  return { impressions, clicks, topQuery }
}

function trendPct(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null) return null
  if (previous === 0) return current === 0 ? 0 : 100
  return Math.round(((current - previous) / previous) * 1000) / 10
}

// ---------------------------------------------------------------------------
// Narrative template (non-AI for MVP)
// ---------------------------------------------------------------------------

function buildNarrative(d: {
  weekStart: string; weekEnd: string
  uniqueVisitors: number; prevUniqueVisitors: number
  sessions: number; prevSessions: number
  searchImpressions: number; searchClicks: number; prevSearchImpressions: number
  topQuery: string | null
  conversionTotal: number; prevConversionTotal: number
  topSources: string[]
  pageViews: number; bounceRate: number | null; avgSessionDuration: number | null
}) {
  const vTrend = trendPct(d.uniqueVisitors, d.prevUniqueVisitors)
  const sTrend = trendPct(d.sessions, d.prevSessions)
  const cTrend = trendPct(d.conversionTotal, d.prevConversionTotal)

  // Pick a headline based on biggest signal
  let headline = `Your week at a glance: ${d.uniqueVisitors} unique visitors`
  if (vTrend != null && vTrend >= 20) {
    headline = `Big week. Visitors up ${vTrend}%`
  } else if (vTrend != null && vTrend <= -20) {
    headline = `Visitors dipped this week (${vTrend}%). Here's what's next.`
  } else if (d.conversionTotal > 0 && cTrend != null && cTrend >= 20) {
    headline = `Conversions up ${cTrend}% from last week`
  } else if (d.uniqueVisitors === 0 && d.sessions === 0) {
    headline = `We're watching. Data picks up once traffic flows.`
  } else {
    headline = `${d.uniqueVisitors} unique visitors this week`
  }

  // Narrative body (2-3 sentences, plain English)
  const sentences: string[] = []
  sentences.push(`Between ${fmtDate(d.weekStart)} and ${fmtDate(d.weekEnd)}, ${d.uniqueVisitors.toLocaleString()} unique visitors came to your site, generating ${d.sessions.toLocaleString()} sessions and ${d.pageViews.toLocaleString()} pageviews.`)
  if (vTrend != null && Math.abs(vTrend) >= 5) {
    sentences.push(`That's ${vTrend > 0 ? 'up' : 'down'} ${Math.abs(vTrend)}% from the week before.`)
  }
  if (d.topSources.length > 0) {
    sentences.push(`Most visits came from ${prettyList(d.topSources.map(prettySource))}.`)
  }
  if (d.searchImpressions > 0 && d.topQuery) {
    sentences.push(`On Google, you showed up in ${d.searchImpressions.toLocaleString()} searches and got ${d.searchClicks.toLocaleString()} clicks. The top query people used to find you was "${d.topQuery}".`)
  }
  if (d.conversionTotal > 0) {
    sentences.push(`Visitors took ${d.conversionTotal.toLocaleString()} direct actions (phone calls, direction clicks, form submits, or bookings)${cTrend != null ? `, ${cTrend > 0 ? 'up' : 'down'} ${Math.abs(cTrend)}% from last week` : ''}.`)
  }

  // Highlights (bullet cards)
  const highlights: any[] = []
  if (d.uniqueVisitors > 0) {
    highlights.push({
      label: 'Unique Visitors',
      value: d.uniqueVisitors.toLocaleString(),
      insight: vTrend != null ? `${vTrend > 0 ? '+' : ''}${vTrend}% vs last week` : 'First week of data',
    })
  }
  if (d.sessions > 0) {
    highlights.push({
      label: 'Sessions',
      value: d.sessions.toLocaleString(),
      insight: sTrend != null ? `${sTrend > 0 ? '+' : ''}${sTrend}% vs last week` : null,
    })
  }
  if (d.searchImpressions > 0) {
    highlights.push({
      label: 'Search Impressions',
      value: d.searchImpressions.toLocaleString(),
      insight: `${d.searchClicks} clicks${d.topQuery ? ` · top query: "${d.topQuery}"` : ''}`,
    })
  }
  if (d.conversionTotal > 0) {
    highlights.push({
      label: 'Conversions',
      value: d.conversionTotal.toLocaleString(),
      insight: cTrend != null ? `${cTrend > 0 ? '+' : ''}${cTrend}% vs last week` : null,
    })
  }

  const nextWeek = `We'll keep syncing your analytics daily and watching for patterns. Your next brief lands this coming Monday.`

  return { headline, body: sentences.join(' '), highlights, nextWeek }
}

function prettySource(s: string): string {
  const map: Record<string, string> = {
    direct: 'direct traffic',
    'organic search': 'Google search',
    search: 'Google search',
    'organic social': 'social media',
    social: 'social media',
    referral: 'other websites',
    email: 'email',
    unassigned: 'miscellaneous sources',
  }
  return map[s] ?? s
}

function prettyList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`
}

function fmtDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z')
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
}

// ---------------------------------------------------------------------------
// GA4 week-totals direct (accurate unique users for the week)
// ---------------------------------------------------------------------------

async function runWeekTotals(propertyId: string, accessToken: string, startDate: string, endDate: string) {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate, endDate }],
      metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error?.message ?? 'GA4 weekly totals failed')
  const row = data.rows?.[0]?.metricValues || []
  return {
    uniqueVisitors: Number(row[0]?.value || 0),
    uniqueNewUsers: Number(row[1]?.value || 0),
  }
}

// ---------------------------------------------------------------------------
// Token refresh (same as sync functions)
// ---------------------------------------------------------------------------

async function ensureFreshToken(supabase, conn: GA4Connection): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000
  if (!needsRefresh) return conn.access_token
  if (!conn.refresh_token) throw new Error('No refresh token available')
  if (!CLIENT_ID || !CLIENT_SECRET) throw new Error('Google OAuth env not configured')

  const params = new URLSearchParams({
    client_id: CLIENT_ID, client_secret: CLIENT_SECRET,
    refresh_token: conn.refresh_token, grant_type: 'refresh_token',
  })
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error_description || data.error || 'Refresh failed')

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  await supabase.from('channel_connections')
    .update({ access_token: data.access_token, token_expires_at: newExpiry })
    .eq('id', conn.id)
  return data.access_token as string
}

// ---------------------------------------------------------------------------
// Date helpers -- weeks are Mon-Sun
// ---------------------------------------------------------------------------

function getLastMonday(): Date {
  const today = new Date()
  const dow = today.getUTCDay()            // 0=Sun, 1=Mon, ...6=Sat
  // Days to subtract to get to most recently completed Monday
  // If today is Monday, we want last Monday (7 days ago)
  // If today is Sunday, we want this past Monday (6 days ago)
  const daysBack = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1 + 7
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - daysBack)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}
