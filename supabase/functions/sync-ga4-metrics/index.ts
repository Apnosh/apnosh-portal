// @ts-nocheck — Deno runtime, not Node
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * sync-ga4-metrics Edge Function
 *
 * Reads active channel_connections where channel = 'google_analytics',
 * refreshes OAuth token if expired, pulls yesterday's metrics from the
 * GA4 Data API, upserts rows into website_metrics.
 *
 * Pulls these GA4 dimensions per day:
 *   - Core totals: activeUsers, sessions, screenPageViews, bounceRate,
 *     averageSessionDuration
 *   - Traffic sources: sessions by sessionDefaultChannelGroup
 *   - Top pages: screenPageViews by pagePath (top 10)
 *   - Device mix: sessions by deviceCategory
 *   - Conversion events: eventCount by eventName (all conversion events)
 *   - Top cities: sessions by city (top 10)
 *   - Landing pages: sessions by landingPage (top 10)
 *   - New vs returning: activeUsers by newVsReturning
 *   - Top referrers: sessions by sessionSource where medium = referral (top 10)
 *
 * Input:  { client_id?: string, days?: number } — if client_id omitted, syncs
 *         all active clients. days defaults to 1 (just yesterday); pass e.g.
 *         30 to backfill last 30 days.
 * Output: { synced: number, results: [...] }
 */

interface Connection {
  id: string
  client_id: string
  platform_account_id: string      // "properties/123456"
  platform_account_name: string
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
}

const CLIENT_ID = Deno.env.get('GOOGLE_CLIENT_ID')
const CLIENT_SECRET = Deno.env.get('GOOGLE_CLIENT_SECRET')

Deno.serve(async (req) => {
  try {
    const body = await req.json().catch(() => ({}))
    const targetClientId: string | undefined = body.client_id
    const daysToSync: number = Math.max(1, Math.min(Number(body.days ?? 1), 90))

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    let query = supabase
      .from('channel_connections')
      .select('id, client_id, platform_account_id, platform_account_name, access_token, refresh_token, token_expires_at')
      .eq('channel', 'google_analytics')
      .eq('status', 'active')
      .not('access_token', 'is', null)

    if (targetClientId) query = query.eq('client_id', targetClientId)

    const { data: conns, error: connErr } = await query
    if (connErr) {
      return new Response(JSON.stringify({ error: connErr.message }), { status: 500 })
    }

    const results = []
    let synced = 0

    for (const conn of (conns ?? []) as Connection[]) {
      try {
        const freshToken = await ensureFreshToken(supabase, conn)

        // Loop through N days (default 1 = just yesterday; backfill = up to 90)
        const daysSynced: string[] = []
        for (let offset = 1; offset <= daysToSync; offset++) {
          const date = getDaysAgo(offset)
          const metrics = await runDailyReport(conn.platform_account_id, freshToken, date)

          const { error: upsertErr } = await supabase
            .from('website_metrics')
            .upsert({
              client_id: conn.client_id,
              date,
              visitors: metrics.visitors,
              page_views: metrics.pageViews,
              sessions: metrics.sessions,
              bounce_rate: metrics.bounceRate,
              avg_session_duration: metrics.avgSessionDuration,
              mobile_pct: metrics.mobilePct,
              traffic_sources: metrics.trafficSources,
              top_pages: metrics.topPages,
              conversion_events: metrics.conversionEvents,
              top_cities: metrics.topCities,
              landing_pages: metrics.landingPages,
              new_users: metrics.newUsers,
              returning_users: metrics.returningUsers,
              top_referrers: metrics.topReferrers,
              raw_data: metrics.raw,
            }, { onConflict: 'client_id,date' })

          if (upsertErr) throw new Error(upsertErr.message)
          daysSynced.push(date)
        }

        await supabase
          .from('channel_connections')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', conn.id)

        synced++
        results.push({ client_id: conn.client_id, status: 'ok', days: daysSynced.length })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await supabase
          .from('channel_connections')
          .update({ sync_error: msg, status: 'error' })
          .eq('id', conn.id)
        results.push({ client_id: conn.client_id, status: 'error', error: msg })
      }
    }

    return new Response(
      JSON.stringify({ synced, results }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})

// ---------------------------------------------------------------------------
// Token refresh
// ---------------------------------------------------------------------------

async function ensureFreshToken(supabase, conn: Connection): Promise<string> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null
  const needsRefresh = !expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000

  if (!needsRefresh) return conn.access_token

  if (!conn.refresh_token) {
    throw new Error('Access token expired and no refresh token available')
  }

  if (!CLIENT_ID || !CLIENT_SECRET) {
    throw new Error('GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET not configured')
  }

  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: conn.refresh_token,
    grant_type: 'refresh_token',
  })

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const data = await res.json()
  if (!res.ok) {
    throw new Error(data.error_description || data.error || 'Failed to refresh token')
  }

  const newExpiry = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString()
  await supabase
    .from('channel_connections')
    .update({ access_token: data.access_token, token_expires_at: newExpiry })
    .eq('id', conn.id)

  return data.access_token as string
}

// ---------------------------------------------------------------------------
// GA4 Data API -- expanded report set
// ---------------------------------------------------------------------------

async function runDailyReport(propertyId: string, accessToken: string, date: string) {
  const url = `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }
  const dateRange = { startDate: date, endDate: date }

  // Fire all reports in parallel. Any single failure is caught below; core must succeed.
  const reports = await Promise.allSettled([
    // 0: core totals
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      metrics: [
        { name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' },
        { name: 'bounceRate' }, { name: 'averageSessionDuration' },
      ],
    }),
    // 1: traffic sources by channel
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'sessionDefaultChannelGroup' }],
      metrics: [{ name: 'sessions' }],
    }),
    // 2: top pages by views
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'pagePath' }],
      metrics: [{ name: 'screenPageViews' }],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 10,
    }),
    // 3: device mix
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'deviceCategory' }],
      metrics: [{ name: 'sessions' }],
    }),
    // 4: conversion events by eventName
    // GA4 returns ALL events; we bucket recognized conversion types below
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'eventName' }],
      metrics: [{ name: 'eventCount' }],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 50,
    }),
    // 5: top cities by sessions
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'city' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    // 6: landing pages by sessions
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'landingPage' }],
      metrics: [{ name: 'sessions' }],
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
    // 7: new vs returning
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'newVsReturning' }],
      metrics: [{ name: 'activeUsers' }],
    }),
    // 8: top referrer sources (filtered to medium = referral)
    fetchJson(url, headers, {
      dateRanges: [dateRange],
      dimensions: [{ name: 'sessionSource' }, { name: 'sessionMedium' }],
      metrics: [{ name: 'sessions' }],
      dimensionFilter: {
        filter: {
          fieldName: 'sessionMedium',
          stringFilter: { matchType: 'EXACT', value: 'referral' },
        },
      },
      orderBys: [{ metric: { metricName: 'sessions' }, desc: true }],
      limit: 10,
    }),
  ])

  // Core must succeed
  if (reports[0].status !== 'fulfilled') {
    throw new Error(`GA4 core report failed: ${reports[0].reason?.message || 'unknown'}`)
  }
  const core = reports[0].value
  if (core.error) throw new Error(core.error.message)

  // Unwrap the rest, tolerate per-report failures
  const unwrap = (i: number) => reports[i].status === 'fulfilled' ? reports[i].value : null
  const sources = unwrap(1)
  const pages = unwrap(2)
  const devices = unwrap(3)
  const events = unwrap(4)
  const cities = unwrap(5)
  const landings = unwrap(6)
  const newReturning = unwrap(7)
  const referrers = unwrap(8)

  // --- Parse core
  const coreRow = core.rows?.[0]?.metricValues || []
  const visitors = Number(coreRow[0]?.value || 0)
  const sessions = Number(coreRow[1]?.value || 0)
  const pageViews = Number(coreRow[2]?.value || 0)
  const bounceRate = Number(coreRow[3]?.value || 0)
  const avgSessionDuration = Math.round(Number(coreRow[4]?.value || 0))

  // --- Parse traffic sources (channel groups)
  const trafficSources: Record<string, number> = {}
  for (const row of sources?.rows || []) {
    const channel = row.dimensionValues?.[0]?.value || 'unknown'
    trafficSources[channel.toLowerCase()] = Number(row.metricValues?.[0]?.value || 0)
  }

  // --- Parse top pages
  const topPages = (pages?.rows || []).map((row: any) => ({
    path: row.dimensionValues?.[0]?.value || '/',
    views: Number(row.metricValues?.[0]?.value || 0),
  }))

  // --- Parse device mix
  let mobileSessions = 0
  let totalDeviceSessions = 0
  for (const row of devices?.rows || []) {
    const device = row.dimensionValues?.[0]?.value || ''
    const s = Number(row.metricValues?.[0]?.value || 0)
    totalDeviceSessions += s
    if (device === 'mobile') mobileSessions = s
  }
  const mobilePct = totalDeviceSessions > 0 ? (mobileSessions / totalDeviceSessions) * 100 : 0

  // --- Parse conversion events: bucket by intent type
  // GA4 event names: click, phone_click, call, directions_click, get_directions,
  //   form_submit, submit, generate_lead, reservation, book_now, etc.
  // Strategy: pattern-match event names into intent buckets. Anything that looks
  // like a conversion but doesn't match a known bucket goes to 'other'.
  const conversionEvents = {
    phone_clicks: 0,
    direction_clicks: 0,
    form_submits: 0,
    booking_clicks: 0,
    other: 0,
    total: 0,
  }
  for (const row of events?.rows || []) {
    const name = (row.dimensionValues?.[0]?.value || '').toLowerCase()
    const count = Number(row.metricValues?.[0]?.value || 0)
    if (count === 0) continue
    if (name.includes('phone') || name.includes('call') || name === 'click_to_call') {
      conversionEvents.phone_clicks += count
      conversionEvents.total += count
    } else if (name.includes('direction') || name.includes('map_click')) {
      conversionEvents.direction_clicks += count
      conversionEvents.total += count
    } else if (name === 'form_submit' || name === 'submit' || name === 'generate_lead' || name.includes('form_')) {
      conversionEvents.form_submits += count
      conversionEvents.total += count
    } else if (name.includes('book') || name.includes('reservation') || name.includes('appointment')) {
      conversionEvents.booking_clicks += count
      conversionEvents.total += count
    } else if (
      // Exclude GA4 auto-collected noise from "other conversions"
      name !== 'page_view' && name !== 'session_start' && name !== 'first_visit' &&
      name !== 'user_engagement' && name !== 'scroll' && name !== 'click' &&
      name !== 'file_download' && !name.startsWith('view_') &&
      // Positive signal: looks conversion-like
      (name.includes('convert') || name.includes('purchase') || name.includes('checkout') ||
       name.includes('signup') || name.includes('sign_up') || name.includes('subscribe'))
    ) {
      conversionEvents.other += count
      conversionEvents.total += count
    }
  }

  // --- Parse top cities
  const topCities = (cities?.rows || []).map((row: any) => ({
    city: row.dimensionValues?.[0]?.value || '(not set)',
    sessions: Number(row.metricValues?.[0]?.value || 0),
  })).filter((c: any) => c.city && c.city !== '(not set)' && c.sessions > 0)

  // --- Parse landing pages
  const landingPages = (landings?.rows || []).map((row: any) => ({
    path: row.dimensionValues?.[0]?.value || '/',
    sessions: Number(row.metricValues?.[0]?.value || 0),
  })).filter((p: any) => p.sessions > 0)

  // --- Parse new vs returning
  let newUsers = 0
  let returningUsers = 0
  for (const row of newReturning?.rows || []) {
    const label = (row.dimensionValues?.[0]?.value || '').toLowerCase()
    const count = Number(row.metricValues?.[0]?.value || 0)
    if (label === 'new') newUsers = count
    else if (label === 'returning') returningUsers = count
  }

  // --- Parse top referrers
  const topReferrers = (referrers?.rows || []).map((row: any) => ({
    source: row.dimensionValues?.[0]?.value || 'unknown',
    sessions: Number(row.metricValues?.[0]?.value || 0),
  })).filter((r: any) => r.sessions > 0)

  return {
    visitors, sessions, pageViews, bounceRate, avgSessionDuration, mobilePct,
    trafficSources, topPages,
    conversionEvents,
    topCities, landingPages,
    newUsers, returningUsers,
    topReferrers,
    raw: { core, sources, pages, devices, events, cities, landings, newReturning, referrers },
  }
}

async function fetchJson(url: string, headers: Record<string, string>, body: unknown) {
  const res = await fetch(url, {
    method: 'POST', headers,
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`GA4 API ${res.status}: ${text.slice(0, 200)}`)
  }
  return res.json()
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
