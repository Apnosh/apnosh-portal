// @ts-nocheck — Deno runtime, not Node
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

/**
 * sync-gsc-metrics Edge Function
 *
 * Pulls daily Search Console metrics for each active client connection
 * and writes to search_metrics. One row per day per site.
 *
 * NOTE: GSC data has a ~2 day delay. Default sync pulls (today - 3).
 * For backfill, pass days=30 to pull the last 30 days.
 *
 * Input:  { client_id?: string, days?: number } -- days defaults to 1 (just
 *         yesterday-ish); pass e.g. 30 to backfill last 30 days
 * Output: { synced: number, results: [...] }
 */

interface Connection {
  id: string
  client_id: string
  platform_account_id: string  // siteUrl
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
      .select('id, client_id, platform_account_id, access_token, refresh_token, token_expires_at')
      .eq('channel', 'google_search_console')
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

        // GSC has ~2 day latency. Start N days ago and pull that many days.
        // Default (days=1): just yesterday-ish (today-3). Backfill (days=30): last 30 days.
        const daysSynced: string[] = []
        for (let offset = 3; offset < 3 + daysToSync; offset++) {
          const date = getDaysAgo(offset)
          const metrics = await runDailyQuery(conn.platform_account_id, freshToken, date)

          const { error: upsertErr } = await supabase
            .from('search_metrics')
            .upsert({
              client_id: conn.client_id,
              site_url: conn.platform_account_id,
              date,
              total_impressions: metrics.totalImpressions,
              total_clicks: metrics.totalClicks,
              avg_ctr: metrics.avgCtr,
              avg_position: metrics.avgPosition,
              top_queries: metrics.topQueries,
              top_pages: metrics.topPages,
            }, { onConflict: 'client_id,site_url,date' })

          if (upsertErr) throw new Error(upsertErr.message)
          daysSynced.push(date)
        }

        await supabase
          .from('channel_connections')
          .update({ last_sync_at: new Date().toISOString(), sync_error: null })
          .eq('id', conn.id)

        synced++
        results.push({ client_id: conn.client_id, site: conn.platform_account_id, status: 'ok', days: daysSynced.length })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        await supabase
          .from('channel_connections')
          .update({ sync_error: msg, status: 'error' })
          .eq('id', conn.id)
        results.push({ client_id: conn.client_id, site: conn.platform_account_id, status: 'error', error: msg })
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
// Token refresh (same logic as sync-ga4-metrics)
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
// GSC Search Analytics API
// ---------------------------------------------------------------------------

async function runDailyQuery(siteUrl: string, accessToken: string, date: string) {
  const encodedSite = encodeURIComponent(siteUrl)
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  }

  const [queriesRes, pagesRes, totalsRes] = await Promise.all([
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
        dimensions: ['query'],
        rowLimit: 25,
      }),
    }),
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
        dimensions: ['page'],
        rowLimit: 25,
      }),
    }),
    fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodedSite}/searchAnalytics/query`, {
      method: 'POST', headers,
      body: JSON.stringify({
        startDate: date, endDate: date,
      }),
    }),
  ])

  const [queries, pages, totals] = await Promise.all([
    queriesRes.json(), pagesRes.json(), totalsRes.json(),
  ])

  if (totals.error) throw new Error(totals.error.message)

  const totalsRow = (totals.rows && totals.rows[0]) || { clicks: 0, impressions: 0, ctr: 0, position: 0 }

  const topQueries = (queries.rows || []).map((row) => ({
    query: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))

  const topPages = (pages.rows || []).map((row) => ({
    page: row.keys?.[0] || '',
    impressions: row.impressions || 0,
    clicks: row.clicks || 0,
    ctr: row.ctr || 0,
    position: row.position || 0,
  }))

  return {
    totalImpressions: totalsRow.impressions || 0,
    totalClicks: totalsRow.clicks || 0,
    avgCtr: totalsRow.ctr || 0,
    avgPosition: totalsRow.position || 0,
    topQueries,
    topPages,
  }
}

function getDaysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().split('T')[0]
}
