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
 * Input: { client_id?: string } -- if omitted, syncs all active clients
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
        const date = getYesterday()
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
            raw_data: metrics.raw,
          }, { onConflict: 'client_id,date' })

        if (upsertErr) throw new Error(upsertErr.message)

        await supabase
          .from('channel_connections')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', conn.id)

        synced++
        results.push({ client_id: conn.client_id, status: 'ok' })
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
// GA4 Data API
// ---------------------------------------------------------------------------

async function runDailyReport(propertyId: string, accessToken: string, date: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const [coreRes, sourceRes, pagesRes, deviceRes] = await Promise.all([
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST', headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        metrics: [
          { name: 'activeUsers' }, { name: 'sessions' }, { name: 'screenPageViews' },
          { name: 'bounceRate' }, { name: 'averageSessionDuration' },
        ],
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST', headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'sessionDefaultChannelGroup' }],
        metrics: [{ name: 'sessions' }],
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST', headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'pagePath' }],
        metrics: [{ name: 'screenPageViews' }],
        orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
        limit: 10,
      }),
    }),
    fetch(`https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`, {
      method: 'POST', headers,
      body: JSON.stringify({
        dateRanges: [{ startDate: date, endDate: date }],
        dimensions: [{ name: 'deviceCategory' }],
        metrics: [{ name: 'sessions' }],
      }),
    }),
  ])

  const [core, sources, pages, devices] = await Promise.all([
    coreRes.json(), sourceRes.json(), pagesRes.json(), deviceRes.json(),
  ])

  if (core.error) throw new Error(core.error.message)

  const coreRow = core.rows?.[0]?.metricValues || []
  const visitors = Number(coreRow[0]?.value || 0)
  const sessions = Number(coreRow[1]?.value || 0)
  const pageViews = Number(coreRow[2]?.value || 0)
  const bounceRate = Number(coreRow[3]?.value || 0)
  const avgSessionDuration = Math.round(Number(coreRow[4]?.value || 0))

  const trafficSources: Record<string, number> = {}
  for (const row of sources.rows || []) {
    const channel = row.dimensionValues?.[0]?.value || 'unknown'
    trafficSources[channel.toLowerCase()] = Number(row.metricValues?.[0]?.value || 0)
  }

  const topPages = (pages.rows || []).map((row) => ({
    path: row.dimensionValues?.[0]?.value || '/',
    views: Number(row.metricValues?.[0]?.value || 0),
  }))

  let mobileSessions = 0
  let totalSessions = 0
  for (const row of devices.rows || []) {
    const device = row.dimensionValues?.[0]?.value || ''
    const s = Number(row.metricValues?.[0]?.value || 0)
    totalSessions += s
    if (device === 'mobile') mobileSessions = s
  }
  const mobilePct = totalSessions > 0 ? (mobileSessions / totalSessions) * 100 : 0

  return {
    visitors, sessions, pageViews, bounceRate, avgSessionDuration, mobilePct,
    trafficSources, topPages,
    raw: { core, sources, pages, devices },
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getYesterday(): string {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}
