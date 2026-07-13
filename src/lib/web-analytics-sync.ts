'use server'

/**
 * Daily ingestion for Google Analytics (GA4) and Google Search
 * Console. Walks every active channel_connections row, refreshes
 * the OAuth token if needed, pulls the requested date window, and
 * upserts into website_metrics / search_metrics.
 *
 * Used by:
 *   - Daily cron (last 7 days, every active connection)
 *   - On-connect backfill (last 90 days, single client)
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  refreshGoogleToken,
  runGA4DailyReport,
  runGA4EventReport,
  isMissingColumnError,
  runGSCDailyQuery,
  type GA4DailyMetrics,
  type GA4EventConfig,
  type GSCDailyMetrics,
} from '@/lib/google'
import { loadClientAnalyticsConfig } from '@/lib/insights/client-analytics-config'
import { serviceAccountEnabled, getServiceAccountToken, GSC_SCOPE, GA_SCOPE } from '@/lib/google-service-account'

type Channel = 'google_analytics' | 'google_search_console'

interface ConnRow {
  id: string
  client_id: string
  channel: Channel
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  /** GA4: "properties/123" — GSC: site URL like "https://example.com/" or "sc-domain:example.com". */
  platform_account_id: string | null
}

interface SyncReport {
  attempted: number
  succeeded: number
  failed: Array<{ clientId: string; channel: Channel; error: string }>
  daysWritten: number
}

const REFRESH_BUFFER_MS = 60_000

/* Returns a fresh access token, refreshing if the stored one is
   within the buffer of expiry. Updates the DB row on rotation. */
async function ensureToken(conn: ConnRow): Promise<string | null> {
  /* Prefer the service account when configured: it never expires and
     needs no reconnect. Falls back to the stored OAuth token otherwise. */
  if (serviceAccountEnabled()) {
    const scope = conn.channel === 'google_search_console' ? GSC_SCOPE : GA_SCOPE
    const saToken = await getServiceAccountToken(scope)
    if (saToken) return saToken
  }
  if (!conn.access_token) return null
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0
  if (expiresAt - Date.now() > REFRESH_BUFFER_MS) return conn.access_token
  if (!conn.refresh_token) return conn.access_token
  try {
    const refreshed = await refreshGoogleToken(conn.refresh_token)
    const admin = createAdminClient()
    const update: Record<string, unknown> = {
      access_token: refreshed.access_token,
      token_expires_at: new Date(Date.now() + refreshed.expires_in * 1000).toISOString(),
    }
    /* Google sometimes rotates the refresh token on refresh. If we keep
       using the old one it eventually gets revoked and the connection
       breaks with "Unauthorized" — persist the rotated value. */
    const rotated = (refreshed as { refresh_token?: string }).refresh_token
    if (rotated && rotated !== conn.refresh_token) update.refresh_token = rotated
    await admin.from('channel_connections').update(update).eq('id', conn.id)
    return refreshed.access_token
  } catch {
    return null
  }
}

function daysRange(start: Date, end: Date): string[] {
  const out: string[] = []
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10))
  }
  return out
}

/* ── GA4 ───────────────────────────────────────────────────────── */

async function ingestGA4DayForClient(
  clientId: string,
  propertyId: string,
  accessToken: string,
  date: string,
  eventConfig: GA4EventConfig,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const m: GA4DailyMetrics = await runGA4DailyReport(propertyId, accessToken, date)
    const admin = createAdminClient()
    const { error } = await admin.from('website_metrics').upsert({
      client_id: clientId,
      date,
      visitors: m.visitors,
      page_views: m.pageViews,
      sessions: m.sessions,
      bounce_rate: m.bounceRate,
      avg_session_duration: m.avgSessionDuration,
      mobile_pct: m.mobilePct,
      traffic_sources: m.trafficSources,
      top_pages: m.topPages,
    }, { onConflict: 'client_id,date' })
    if (error) return { ok: false, error: error.message }
    /* Phase 1.5 outcome-funnel event sources. Best-effort and isolated: it
       runs only after the main upsert succeeds, and its own failures never
       fail the day's core sync. */
    await ingestGA4EventsForDay(admin, clientId, propertyId, accessToken, date, eventConfig)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Ingest the two GA4 event sources (menu_views + order_clicks) for one day.
 * GRACEFUL by design:
 *   - No config for either metric → skip entirely. We NEVER write 0 for a
 *     metric we didn't actually query.
 *   - Only queries the metric whose exact config value is present; the other
 *     stays untouched (its column keeps whatever it had, null by default).
 *   - If the new columns don't exist yet (owner hasn't applied migration 206)
 *     the update returns 42703 / PGRST204 — we catch it and skip silently.
 *   - Any GA4 fetch error is swallowed so the main daily sync is unaffected.
 */
async function ingestGA4EventsForDay(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  propertyId: string,
  accessToken: string,
  date: string,
  config: GA4EventConfig,
): Promise<void> {
  // No config at all → nothing honest to write.
  if (!config.menuPath && !config.orderDomain) return
  try {
    const ev = await runGA4EventReport(propertyId, accessToken, date, config)
    const patch: Record<string, number> = {}
    // null = not queried; a real query (even 0) is written truthfully.
    if (ev.menuViews !== null) patch.menu_views = ev.menuViews
    if (ev.orderClicks !== null) patch.order_clicks = ev.orderClicks
    if (Object.keys(patch).length === 0) return
    const { error } = await admin
      .from('website_metrics')
      .update(patch)
      .eq('client_id', clientId)
      .eq('date', date)
    if (error && !isMissingColumnError(error)) {
      // A non-missing-column DB error: still best-effort, but leave a trace.
      console.warn(`[ga4-events] write failed for ${clientId} ${date}: ${error.message}`)
    }
  } catch (err) {
    console.warn(`[ga4-events] fetch failed for ${clientId} ${date}: ${(err as Error).message}`)
  }
}

export async function syncGoogleAnalyticsForClient(
  clientId: string,
  daysBack: number,
): Promise<{ daysWritten: number; error?: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('channel_connections')
    .select('id, client_id, channel, access_token, refresh_token, token_expires_at, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'google_analytics')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row) return { daysWritten: 0, error: 'no active connection' }
  const conn = row as ConnRow
  const token = await ensureToken(conn)
  if (!token || !conn.platform_account_id) return { daysWritten: 0, error: 'token refresh failed' }

  /* Owner-set per-client config for the two GA4 event sources. Absent config
     means those two writes are skipped (see ingestGA4EventsForDay). */
  const cfg = await loadClientAnalyticsConfig(clientId)
  const eventConfig: GA4EventConfig = { menuPath: cfg.menuPath, orderDomain: cfg.orderDomain }

  /* Anchor end at TODAY (not yesterday). GA's core reporting API
     returns partial today-data with a small (~1-4h) lag, but having
     a "0" sit there ALL DAY while traffic accumulates is worse than
     showing a fresh partial-today number that updates on Refresh. */
  const end = new Date()
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (daysBack - 1))

  let written = 0
  let lastError: string | null = null
  for (const date of daysRange(start, end)) {
    const r = await ingestGA4DayForClient(clientId, conn.platform_account_id, token, date, eventConfig)
    if (r.ok) written++
    else if (r.error) lastError = r.error
  }
  /* Only clear sync_error when we actually wrote something. If every
     day failed, surface the error on the connection row so the UI
     and admins can see what's wrong. */
  await admin.from('channel_connections').update({
    last_sync_at: new Date().toISOString(),
    sync_error: written > 0 ? null : lastError,
  }).eq('id', conn.id)
  return { daysWritten: written, error: written === 0 ? lastError ?? 'no days written' : undefined }
}

/* ── GSC ───────────────────────────────────────────────────────── */

async function ingestGSCDayForClient(
  clientId: string,
  siteUrl: string,
  accessToken: string,
  date: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const m: GSCDailyMetrics = await runGSCDailyQuery(siteUrl, accessToken, date)
    const admin = createAdminClient()
    const { error } = await admin.from('search_metrics').upsert({
      client_id: clientId,
      site_url: siteUrl,
      date,
      total_impressions: m.totalImpressions,
      total_clicks: m.totalClicks,
      avg_ctr: m.avgCtr,
      avg_position: m.avgPosition,
      top_queries: m.topQueries,
      top_pages: m.topPages,
    }, { onConflict: 'client_id,date' })
    if (error) return { ok: false, error: error.message }
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export async function syncSearchConsoleForClient(
  clientId: string,
  daysBack: number,
): Promise<{ daysWritten: number; error?: string }> {
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('channel_connections')
    .select('id, client_id, channel, access_token, refresh_token, token_expires_at, platform_account_id')
    .eq('client_id', clientId)
    .eq('channel', 'google_search_console')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
    .order('connected_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!row) return { daysWritten: 0, error: 'no active connection' }
  const conn = row as ConnRow
  const token = await ensureToken(conn)
  if (!token || !conn.platform_account_id) return { daysWritten: 0, error: 'token refresh failed' }

  /* GSC has a 2-3 day reporting lag — anchor end at today−3. */
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 3)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (daysBack - 1))

  let written = 0
  let lastError: string | null = null
  for (const date of daysRange(start, end)) {
    const r = await ingestGSCDayForClient(clientId, conn.platform_account_id, token, date)
    if (r.ok) written++
    else if (r.error) lastError = r.error
  }
  await admin.from('channel_connections').update({
    last_sync_at: new Date().toISOString(),
    sync_error: written > 0 ? null : lastError,
  }).eq('id', conn.id)
  return { daysWritten: written, error: written === 0 ? lastError ?? 'no days written' : undefined }
}

/* ── Walk all clients ──────────────────────────────────────────── */

export async function syncAllGoogleAnalytics(daysBack: number = 7): Promise<SyncReport> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('client_id')
    .eq('channel', 'google_analytics')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
  const clientIds = Array.from(new Set((rows ?? []).map(r => r.client_id as string)))
  return walkClients(clientIds, 'google_analytics', daysBack)
}

export async function syncAllSearchConsole(daysBack: number = 7): Promise<SyncReport> {
  const admin = createAdminClient()
  const { data: rows } = await admin
    .from('channel_connections')
    .select('client_id')
    .eq('channel', 'google_search_console')
    .eq('status', 'active')
    .neq('platform_account_id', 'pending')
  const clientIds = Array.from(new Set((rows ?? []).map(r => r.client_id as string)))
  return walkClients(clientIds, 'google_search_console', daysBack)
}

async function walkClients(clientIds: string[], channel: Channel, daysBack: number): Promise<SyncReport> {
  const report: SyncReport = { attempted: 0, succeeded: 0, failed: [], daysWritten: 0 }
  for (const clientId of clientIds) {
    report.attempted++
    const result = channel === 'google_analytics'
      ? await syncGoogleAnalyticsForClient(clientId, daysBack)
      : await syncSearchConsoleForClient(clientId, daysBack)
    if (result.error) {
      report.failed.push({ clientId, channel, error: result.error })
      /* Stamp the failure on the row so the connect UI can surface it. */
      const admin = createAdminClient()
      await admin.from('channel_connections')
        .update({ sync_error: result.error })
        .eq('client_id', clientId)
        .eq('channel', channel)
        .eq('status', 'active')
    } else {
      report.succeeded++
      report.daysWritten += result.daysWritten
    }
  }
  return report
}
