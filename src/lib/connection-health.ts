/**
 * Daily connection health probe.
 *
 * For each Google channel_connection we have, hit a cheap list endpoint
 * (the same endpoints used during onboarding to populate the site picker)
 * and check whether the originally-connected property is still in the
 * returned list. This is a more precise + faster failure detector than
 * waiting for the daily analytics sync to fail.
 *
 * Outcomes:
 *   - probe ok + status was 'error' → mark active, clear sync_error, notify "recovered"
 *   - probe ok + property still in list → no change
 *   - probe ok + property MISSING from list → mark error with permission_denied
 *   - probe 401 → refresh token, retry once; if still failing, mark error
 *   - probe 403/permission → mark error with classified message + notify connected_by
 *
 * The "notify connected_by" path writes to the existing notifications
 * table so the affected user sees the alert next time they open the app.
 */

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { listGSCSites, listGA4Properties, listGBPAccounts, refreshGoogleToken } from './google'
import { serviceAccountEnabled, getServiceAccountToken, getServiceAccountEmail, GSC_SCOPE, GA_SCOPE } from './google-service-account'

interface Connection {
  id: string
  client_id: string
  channel: string
  platform_account_id: string
  platform_account_name: string
  platform_url: string | null
  access_token: string
  refresh_token: string | null
  token_expires_at: string | null
  status: string
  sync_error: string | null
  connected_by: string | null
}

export interface HealthReport {
  scanned: number
  recovered: number
  newlyErrored: number
  stillErrored: number
  notificationsCreated: number
  staleFeeds: number
  failures: Array<{ id: string; channel: string; clientId: string; message: string }>
}

/* A connection can probe 'active' (Google access is fine) yet stop delivering
   data — a sync that errors internally but returns 200, a paused job, an API
   that quietly returns nothing. That is the "numbers got stuck" case, and a
   pure access probe misses it. So after the access probe we also watch the
   FRESHNESS of what actually landed: if no new metric rows have been WRITTEN
   for an active client in this many days, flag it (deduped) so the owner gets
   an honest, actionable nudge instead of silently frozen numbers. */
const STALE_FEED_DAYS = 3

function getAdminClient() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

export async function runConnectionHealthProbe(): Promise<HealthReport> {
  const admin = getAdminClient()
  const { data } = await admin
    .from('channel_connections')
    .select('id, client_id, channel, platform_account_id, platform_account_name, platform_url, access_token, refresh_token, token_expires_at, status, sync_error, connected_by')
    .in('channel', ['google_search_console', 'google_analytics', 'google_business_profile'])
    .neq('status', 'pending')

  const conns = (data ?? []) as Connection[]
  const report: HealthReport = {
    scanned: conns.length,
    recovered: 0,
    newlyErrored: 0,
    stillErrored: 0,
    notificationsCreated: 0,
    staleFeeds: 0,
    failures: [],
  }

  for (const conn of conns) {
    try {
      const result = await probeOne(admin, conn)
      if (result.newState === 'active' && conn.status === 'error') {
        await markActive(admin, conn)
        await notifyConnectionRecovered(admin, conn)
        report.recovered += 1
        report.notificationsCreated += 1
      } else if (result.newState === 'error' && conn.status !== 'error') {
        await markError(admin, conn, result.errorMessage!)
        await notifyConnectionBroken(admin, conn, result.errorMessage!)
        report.newlyErrored += 1
        report.notificationsCreated += 1
      } else if (result.newState === 'error') {
        report.stillErrored += 1
      }
    } catch (err) {
      report.failures.push({
        id: conn.id,
        channel: conn.channel,
        clientId: conn.client_id,
        message: (err as Error).message,
      })
    }
  }

  // Freshness watchdog: for every GBP connection that still looks active, make
  // sure data is actually still flowing. This catches the silent-stall case a
  // pure access probe cannot see.
  const gbpConns = conns.filter((c) => c.channel === 'google_business_profile' && c.status !== 'error')
  await checkFeedFreshness(admin, gbpConns, report)

  return report
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function checkFeedFreshness(admin: any, gbpConns: Connection[], report: HealthReport) {
  const cutoff = new Date(Date.now() - STALE_FEED_DAYS * 86_400_000).toISOString()
  for (const conn of gbpConns) {
    try {
      // The newest gbp_metrics row WRITTEN for this client. On a healthy client
      // the daily sync writes a row every day, so created_at advances daily even
      // on a zero-activity day; if it stops advancing the sync itself stalled.
      const { data: latest } = await admin
        .from('gbp_metrics')
        .select('created_at')
        .eq('client_id', conn.client_id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const lastWrite = (latest?.created_at as string | undefined) ?? null
      if (!lastWrite) continue                 // never synced → a setup concern, not a stall
      if (lastWrite >= cutoff) continue        // fresh: data is still landing

      report.staleFeeds += 1
      // Notify at most once per stall window (don't nag daily).
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('client_id', conn.client_id)
        .eq('type', 'feed_stalled')
        .gte('created_at', cutoff)
        .limit(1)
      if (recent && recent.length) continue

      await admin.from('notifications').insert({
        user_id: conn.connected_by,
        client_id: conn.client_id,
        type: 'feed_stalled',
        title: 'Your Google numbers stopped updating',
        body: `No new Google Business Profile data has come in for over ${STALE_FEED_DAYS} days. Your connection may need a quick reconnect to start the numbers flowing again.`,
        link: '/dashboard/connected-accounts',
      })
      report.notificationsCreated += 1
    } catch {
      /* a freshness read failing must never break the health probe */
    }
  }
}

interface ProbeResult {
  newState: 'active' | 'error'
  errorMessage?: string
}

async function probeOne(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  conn: Connection,
): Promise<ProbeResult> {
  let accessToken = conn.access_token

  /* Service-account path for Search Console + GA4: no refresh, no expiry,
     no reconnect. (GBP still uses OAuth — service accounts aren't supported
     there.) */
  if (serviceAccountEnabled() && (conn.channel === 'google_search_console' || conn.channel === 'google_analytics')) {
    const saToken = await getServiceAccountToken(conn.channel === 'google_search_console' ? GSC_SCOPE : GA_SCOPE)
    if (!saToken) {
      return { newState: 'error', errorMessage: 'service_account_unavailable: GOOGLE_SERVICE_ACCOUNT_JSON is missing or invalid.' }
    }
    accessToken = saToken
  } else if (!conn.token_expires_at || new Date(conn.token_expires_at).getTime() - Date.now() < 5 * 60 * 1000) {
    /* Refresh the OAuth token if needed (within 5 min of expiry). */
    if (!conn.refresh_token) {
      return { newState: 'error', errorMessage: 'token_expired: no refresh token on file. Reconnect required.' }
    }
    try {
      const fresh = await refreshGoogleToken(conn.refresh_token)
      accessToken = fresh.access_token
      const newExpiry = new Date(Date.now() + fresh.expires_in * 1000).toISOString()
      /* Google sometimes rotates the refresh_token on refresh. If we
         don't store the new one, the OLD one keeps being valid for a
         while but eventually gets revoked — and then we're locked out
         with no recovery. Persist the rotated value when present.
         (The same fix is needed in 5 other refreshGoogleToken callers:
         reviews reply route, gbp-menu, gbp-backfill, gbp-listing, and
         the GA4/GSC edge functions. Tracked as a follow-up.) */
      const update: Record<string, unknown> = {
        access_token: fresh.access_token,
        token_expires_at: newExpiry,
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rotatedRefresh = (fresh as any).refresh_token as string | undefined
      if (rotatedRefresh && rotatedRefresh !== conn.refresh_token) {
        update.refresh_token = rotatedRefresh
      }
      await admin.from('channel_connections').update(update).eq('id', conn.id)
    } catch (err) {
      const msg = (err as Error).message
      return { newState: 'error', errorMessage: `token_refresh_failed: ${msg}. Reconnect required.` }
    }
  }

  /* Probe the channel's list endpoint and check if our stored
     platform_account_id is still in the response. */
  if (conn.channel === 'google_search_console') {
    try {
      const sites = await listGSCSites(accessToken)
      const stillThere = sites.some(s => s.siteUrl === conn.platform_account_id || s.siteUrl === conn.platform_url)
      if (stillThere) return { newState: 'active' }
      return {
        newState: 'error',
        errorMessage: serviceAccountEnabled()
          ? `permission_denied: ${getServiceAccountEmail()} is not a user on ${conn.platform_url ?? conn.platform_account_id} yet. In Search Console → Settings → Users and permissions, add that email as a Full user. It will then sync automatically, no reconnect needed.`
          : `permission_denied: connected Google account no longer has access to ${conn.platform_url ?? conn.platform_account_id} in Search Console. The owner needs to reconnect with an account that's a verified property user.`,
      }
    } catch (err) {
      return classifyProbeError(err as Error, conn)
    }
  }

  if (conn.channel === 'google_analytics') {
    try {
      const properties = await listGA4Properties(accessToken)
      const stillThere = properties.some(p => p.propertyId === conn.platform_account_id)
      if (stillThere) return { newState: 'active' }
      return {
        newState: 'error',
        errorMessage: serviceAccountEnabled()
          ? `permission_denied: add ${getServiceAccountEmail()} as a Viewer on GA4 property ${conn.platform_account_id} (Admin → Property access management). It will then sync automatically, no reconnect needed.`
          : `permission_denied: connected Google account no longer has access to GA4 property ${conn.platform_account_id}. Reconnect with an account that has property access.`,
      }
    } catch (err) {
      return classifyProbeError(err as Error, conn)
    }
  }

  if (conn.channel === 'google_business_profile') {
    try {
      const accounts = await listGBPAccounts(accessToken)
      if (accounts.length > 0) return { newState: 'active' }
      return {
        newState: 'error',
        errorMessage: `permission_denied: no Business Profile accounts visible to the connected Google account. Reconnect.`,
      }
    } catch (err) {
      return classifyProbeError(err as Error, conn)
    }
  }

  return { newState: 'active' }
}

function classifyProbeError(err: Error, conn: Connection): ProbeResult {
  const msg = err.message
  const lower = msg.toLowerCase()
  if (lower.includes('401') || lower.includes('unauthenticated')) {
    return { newState: 'error', errorMessage: `unauthenticated: ${msg}` }
  }
  if (lower.includes('403') || lower.includes('permission')) {
    return { newState: 'error', errorMessage: `permission_denied: ${msg} (channel: ${conn.channel})` }
  }
  return { newState: 'error', errorMessage: msg }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markActive(admin: any, conn: Connection) {
  await admin
    .from('channel_connections')
    .update({ status: 'active', sync_error: null })
    .eq('id', conn.id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function markError(admin: any, conn: Connection, message: string) {
  await admin
    .from('channel_connections')
    .update({ status: 'error', sync_error: message })
    .eq('id', conn.id)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyConnectionBroken(admin: any, conn: Connection, message: string) {
  /* In-app notification. If connected_by is set, target that user;
     otherwise leave user_id null so any client_users member sees it. */
  const channelLabel = labelFor(conn.channel)
  await admin.from('notifications').insert({
    user_id: conn.connected_by,
    client_id: conn.client_id,
    type: 'connection_broken',
    title: `${channelLabel} connection needs attention`,
    body: message,
    link: '/dashboard/connected-accounts',
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyConnectionRecovered(admin: any, conn: Connection) {
  const channelLabel = labelFor(conn.channel)
  await admin.from('notifications').insert({
    user_id: conn.connected_by,
    client_id: conn.client_id,
    type: 'connection_recovered',
    title: `${channelLabel} connection is back online`,
    body: `Sync resumed successfully.`,
    link: '/dashboard/connected-accounts',
  })
}

function labelFor(channel: string): string {
  switch (channel) {
    case 'google_search_console': return 'Google Search Console'
    case 'google_analytics': return 'Google Analytics'
    case 'google_business_profile': return 'Google Business Profile'
    default: return channel
  }
}
