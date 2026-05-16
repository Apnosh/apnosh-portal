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
  failures: Array<{ id: string; channel: string; clientId: string; message: string }>
}

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

  return report
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
  /* Refresh the token if needed (within 5 min of expiry). */
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at) : null
  let accessToken = conn.access_token
  if (!expiresAt || expiresAt.getTime() - Date.now() < 5 * 60 * 1000) {
    if (!conn.refresh_token) {
      return { newState: 'error', errorMessage: 'token_expired: no refresh token on file. Reconnect required.' }
    }
    try {
      const fresh = await refreshGoogleToken(conn.refresh_token)
      accessToken = fresh.access_token
      const newExpiry = new Date(Date.now() + fresh.expires_in * 1000).toISOString()
      await admin
        .from('channel_connections')
        .update({ access_token: fresh.access_token, token_expires_at: newExpiry })
        .eq('id', conn.id)
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
        errorMessage: `permission_denied: connected Google account no longer has access to ${conn.platform_url ?? conn.platform_account_id} in Search Console. The owner needs to reconnect with an account that's a verified property user.`,
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
        errorMessage: `permission_denied: connected Google account no longer has access to GA4 property ${conn.platform_account_id}. Reconnect with an account that has property access.`,
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
