// @ts-nocheck — Deno runtime
import 'jsr:@supabase/functions-js/edge-runtime.d.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import {
  buildWebsiteInsight, toWeeklyBriefRow,
  type DailyWebsiteRow, type DailySearchRow,
} from '../_shared/website-insights.ts'

/**
 * generate-weekly-brief Edge Function
 *
 * Generates a weekly_briefs row for a client covering a 7-day window.
 * Uses the shared website-insights library (same one the live traffic page
 * uses), so the brief text and numbers match what clients see in the portal.
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

    // Previous week (for trend comparison)
    const prevStart = new Date(weekStart); prevStart.setDate(prevStart.getDate() - 7)
    const prevEnd = new Date(weekEnd); prevEnd.setDate(prevEnd.getDate() - 7)
    const prevStartStr = toDateStr(prevStart)
    const prevEndStr = toDateStr(prevEnd)

    // Get active GA4 connections
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

        // Query daily website metrics for both weeks
        const { data: currDaily } = await supabase
          .from('website_metrics')
          .select('date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages, conversion_events, top_cities, landing_pages, new_users, returning_users, top_referrers')
          .eq('client_id', conn.client_id)
          .gte('date', weekStartStr).lte('date', weekEndStr)
        const { data: prevDaily } = await supabase
          .from('website_metrics')
          .select('date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages, conversion_events, top_cities, landing_pages, new_users, returning_users, top_referrers')
          .eq('client_id', conn.client_id)
          .gte('date', prevStartStr).lte('date', prevEndStr)

        // Query search metrics for both weeks
        const { data: currSearch } = await supabase
          .from('search_metrics')
          .select('date, total_impressions, total_clicks, avg_ctr, avg_position, top_queries')
          .eq('client_id', conn.client_id)
          .gte('date', weekStartStr).lte('date', weekEndStr)
        const { data: prevSearch } = await supabase
          .from('search_metrics')
          .select('date, total_impressions, total_clicks, avg_ctr, avg_position, top_queries')
          .eq('client_id', conn.client_id)
          .gte('date', prevStartStr).lte('date', prevEndStr)

        // Get authoritative weekly unique-visitor totals from GA4 (accurate vs sum-of-daily)
        const currWeekTotals = await runWeekTotals(conn.platform_account_id, freshToken, weekStartStr, weekEndStr)
        const prevWeekTotals = await runWeekTotals(conn.platform_account_id, freshToken, prevStartStr, prevEndStr)

        // Assemble comparison windows for the insight engine
        const currWindow = {
          daily: (currDaily ?? []) as DailyWebsiteRow[],
          search: (currSearch ?? []) as DailySearchRow[],
          uniqueOverride: {
            unique_visitors: currWeekTotals.uniqueVisitors,
            unique_new_users: currWeekTotals.uniqueNewUsers,
          },
        }
        const prevWindow = {
          daily: (prevDaily ?? []) as DailyWebsiteRow[],
          search: (prevSearch ?? []) as DailySearchRow[],
          uniqueOverride: {
            unique_visitors: prevWeekTotals.uniqueVisitors,
            unique_new_users: prevWeekTotals.uniqueNewUsers,
          },
        }

        // Single call to the shared insight engine
        const insight = buildWebsiteInsight(currWindow, prevWindow, weekStartStr, weekEndStr)

        // Shape into the weekly_briefs DB row
        const briefFields = toWeeklyBriefRow(insight, currWindow, prevWindow)

        const briefRow = {
          client_id: conn.client_id,
          week_starting: weekStartStr,
          week_ending: weekEndStr,
          ...briefFields,
          next_week_preview: "We'll keep syncing your analytics daily and watching for patterns. Your next brief lands this coming Monday.",
          status: 'published',
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
// GA4 helpers (week-specific totals + token refresh)
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
// Date helpers
// ---------------------------------------------------------------------------

function getLastMonday(): Date {
  const today = new Date()
  const dow = today.getUTCDay()
  const daysBack = dow === 1 ? 7 : dow === 0 ? 6 : dow - 1 + 7
  const monday = new Date(today)
  monday.setUTCDate(today.getUTCDate() - daysBack)
  monday.setUTCHours(0, 0, 0, 0)
  return monday
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}
