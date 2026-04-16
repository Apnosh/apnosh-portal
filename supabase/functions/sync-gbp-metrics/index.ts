// @ts-nocheck — Deno runtime, not Node
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * sync-gbp-metrics Edge Function
 *
 * Pulls daily Google Business Profile Performance metrics for each active
 * client connection and writes to gbp_metrics.
 *
 * NOTE: The Performance API requires explicit access approval from Google.
 * Until approved, calls return 403 and we mark the connection with a
 * friendly pending message but keep status='active' so future runs retry.
 *
 * Input: { client_id?: string }
 * Output: { synced: number, pending: number, results: [...] }
 */

interface Connection {
  id: string
  client_id: string
  platform_account_id: string  // "locations/123456"
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
      .eq('channel', 'google_business_profile')
      .eq('status', 'active')
      .not('access_token', 'is', null)

    if (targetClientId) query = query.eq('client_id', targetClientId)

    const { data: conns, error: connErr } = await query
    if (connErr) {
      return new Response(JSON.stringify({ error: connErr.message }), { status: 500 })
    }

    const results = []
    let synced = 0
    let pending = 0

    for (const conn of (conns ?? []) as Connection[]) {
      try {
        const freshToken = await ensureFreshToken(supabase, conn)
        // GBP Performance API has ~1 day delay
        const date = getDaysAgo(1)
        const metrics = await runDailyMetrics(conn.platform_account_id, freshToken, date)

        // Map GBP metrics to our gbp_metrics schema
        const totalImpressionsMaps = metrics.businessImpressionsMobileMaps + metrics.businessImpressionsDesktopMaps
        const totalImpressionsSearch = metrics.businessImpressionsMobileSearch + metrics.businessImpressionsDesktopSearch
        const searchViews = totalImpressionsMaps + totalImpressionsSearch

        const { error: upsertErr } = await supabase
          .from('gbp_metrics')
          .upsert({
            client_id: conn.client_id,
            location_id: conn.platform_account_id,
            location_name: conn.platform_account_name,
            date,
            directions: metrics.businessDirectionRequests,
            calls: metrics.callClicks,
            website_clicks: metrics.websiteClicks,
            search_views: searchViews,
            search_views_maps: totalImpressionsMaps,
            search_views_search: totalImpressionsSearch,
          }, { onConflict: 'client_id,location_id,date' })

        if (upsertErr) throw new Error(upsertErr.message)

        await supabase
          .from('channel_connections')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', conn.id)

        synced++
        results.push({ client_id: conn.client_id, location: conn.platform_account_id, status: 'ok' })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'

        // If this is a 403 / permission denied, it's likely Performance API access
        // hasn't been approved yet. Mark with friendly message, keep status='active'
        // so next sync retries.
        const isPending = /permission|403|denied|not.*enabled|access/i.test(msg)
        const friendlyMsg = isPending
          ? 'Awaiting Google Business Profile Performance API approval'
          : msg

        await supabase
          .from('channel_connections')
          .update({
            sync_error: friendlyMsg,
            status: isPending ? 'active' : 'error',
          })
          .eq('id', conn.id)

        if (isPending) pending++
        results.push({
          client_id: conn.client_id,
          location: conn.platform_account_id,
          status: isPending ? 'pending_approval' : 'error',
          error: friendlyMsg,
        })
      }
    }

    return new Response(
      JSON.stringify({ synced, pending, results }),
      { headers: { 'Content-Type': 'application/json' } }
    )
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    return new Response(JSON.stringify({ error: msg }), { status: 500 })
  }
})

// ---------------------------------------------------------------------------
// Token refresh (same as GA4 / GSC)
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
// GBP Performance API
// ---------------------------------------------------------------------------

async function runDailyMetrics(locationName: string, accessToken: string, date: string) {
  const [year, month, day] = date.split('-')

  const metrics = [
    'BUSINESS_IMPRESSIONS_MOBILE_MAPS',
    'BUSINESS_IMPRESSIONS_MOBILE_SEARCH',
    'BUSINESS_IMPRESSIONS_DESKTOP_MAPS',
    'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH',
    'BUSINESS_DIRECTION_REQUESTS',
    'CALL_CLICKS',
    'WEBSITE_CLICKS',
  ]

  const params = new URLSearchParams()
  metrics.forEach((m) => params.append('dailyMetrics', m))
  params.set('dailyRange.startDate.year', year)
  params.set('dailyRange.startDate.month', String(parseInt(month, 10)))
  params.set('dailyRange.startDate.day', String(parseInt(day, 10)))
  params.set('dailyRange.endDate.year', year)
  params.set('dailyRange.endDate.month', String(parseInt(month, 10)))
  params.set('dailyRange.endDate.day', String(parseInt(day, 10)))

  const url = `https://businessprofileperformance.googleapis.com/v1/${locationName}:fetchMultiDailyMetricsTimeSeries?${params.toString()}`

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  const data = await res.json()

  if (!res.ok) {
    throw new Error(data.error?.message || 'Failed to fetch GBP metrics')
  }

  const result = {
    businessImpressionsMobileMaps: 0,
    businessImpressionsMobileSearch: 0,
    businessImpressionsDesktopMaps: 0,
    businessImpressionsDesktopSearch: 0,
    businessDirectionRequests: 0,
    callClicks: 0,
    websiteClicks: 0,
  }

  const series = (data.multiDailyMetricTimeSeries || []) as Array<{
    dailyMetricTimeSeries?: {
      dailyMetric?: string
      timeSeries?: { datedValues?: Array<{ value?: string }> }
    }
  }>

  for (const s of series) {
    const metric = s.dailyMetricTimeSeries?.dailyMetric
    const values = s.dailyMetricTimeSeries?.timeSeries?.datedValues || []
    const value = values.length > 0 ? Number(values[0].value || 0) : 0

    switch (metric) {
      case 'BUSINESS_IMPRESSIONS_MOBILE_MAPS': result.businessImpressionsMobileMaps = value; break
      case 'BUSINESS_IMPRESSIONS_MOBILE_SEARCH': result.businessImpressionsMobileSearch = value; break
      case 'BUSINESS_IMPRESSIONS_DESKTOP_MAPS': result.businessImpressionsDesktopMaps = value; break
      case 'BUSINESS_IMPRESSIONS_DESKTOP_SEARCH': result.businessImpressionsDesktopSearch = value; break
      case 'BUSINESS_DIRECTION_REQUESTS': result.businessDirectionRequests = value; break
      case 'CALL_CLICKS': result.callClicks = value; break
      case 'WEBSITE_CLICKS': result.websiteClicks = value; break
    }
  }

  return result
}

function getDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
