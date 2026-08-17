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
import { listGSCSites, listGA4Properties, listGBPAccounts, refreshGoogleToken, runGA4DailyReport, runGSCDailyQuery } from './google'
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

  /* Google is probed above; social is judged on whether numbers actually arrived. */

  await probeSocialSilence(admin, report).catch(() => {})

  /* Two more fleet-wide silences, both learned from Do Si (2026-08-14):
   * a connection on a client nobody is linked to, and a GBP connect parked in pending. */
  await probeOrphanTenants(admin, report).catch(() => {})
  await probeStuckPendingGbp(admin, report).catch(() => {})

  /* THE NUMBER SENTRY (2026-08-17). Every wrong number this month was found by
   * the OWNER's eyes on a screen — the code checks passed while the data lied.
   * These rules check the data itself, nightly, for every client, so we find a
   * wrong number before a client does. Team-facing only: rule breaks land in
   * this report, never as client notifications. */
  await probeNumberSanity(admin, report).catch(() => {})

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

/**
 * SOCIAL CONNECTED, BUT SILENT.
 *
 * The probe above covers Google only. A social connection could link successfully and then
 * produce nothing at all — bad field mapping, an analytics add-on the client does not have, a
 * vendor profile with no accounts on it — and no one would find out until the owner noticed a
 * dashboard of zeros and said so. That is exactly how a whole evening got spent (2026-08-13),
 * and it is the failure mode that scales worst: every client we onboard is one more account
 * that can go quiet without telling anybody.
 *
 * So: any social connection old enough to have synced at least once, that has written NO
 * metrics rows at all, raises a notification naming what is missing. This checks the thing the
 * owner actually cares about — did numbers arrive — rather than whether a token is valid, which
 * was true the whole time this was broken.
 */
const SOCIAL_GRACE_HOURS = 26 // one nightly cron plus a margin

export async function probeSocialSilence(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  report: HealthReport,
): Promise<void> {
  const { data } = await admin
    .from('channel_connections')
    .select('id, client_id, channel, status, connected_at, last_sync_at, connected_by, sync_error')
    .eq('channel', 'zernio')
    .in('status', ['active', 'pending', 'error'])

  const conns = (data ?? []) as {
    id: string; client_id: string; status: string
    connected_at: string | null; last_sync_at: string | null
    connected_by: string | null; sync_error: string | null
  }[]

  const graceCutoff = new Date(Date.now() - SOCIAL_GRACE_HOURS * 3600_000).toISOString()

  for (const conn of conns) {
    try {
      /* Brand new connections are not broken, they are new. Only judge one that has had a
       * nightly cron pass since it was connected. */
      const connectedAt = conn.connected_at ?? conn.last_sync_at
      if (!connectedAt || connectedAt > graceCutoff) continue

      const { count } = await admin
        .from('social_metrics')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', conn.client_id)
      if ((count ?? 0) > 0) continue

      report.staleFeeds += 1

      /* Once per stall window, not daily — a nagged owner stops reading these. */
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('client_id', conn.client_id)
        .eq('type', 'social_silent')
        .gte('created_at', graceCutoff)
        .limit(1)
      if (recent && recent.length) continue

      await admin.from('notifications').insert({
        user_id: conn.connected_by,
        client_id: conn.client_id,
        type: 'social_silent',
        title: 'Your social accounts are connected but no numbers have arrived',
        body: conn.sync_error
          ? `We connected, but the last sync reported: ${String(conn.sync_error).slice(0, 160)}`
          : 'The accounts are linked and the sync is running, but nothing has come back yet. Our team has been alerted.',
        link: '/dashboard/connected-accounts',
      })
      report.notificationsCreated += 1
      report.failures.push({ id: conn.id, channel: 'zernio', clientId: conn.client_id, message: 'connected but wrote no metrics' })
    } catch {
      /* one bad row must never cost the others their check */
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
     there.)

     The probe here is a ONE-DAY DATA READ — the exact same call the daily
     sync makes — not a list endpoint. The list endpoints (sites.list /
     accountSummaries) can reject an impersonated token even while data
     reads work fine, which painted false "error" badges and sent false
     reconnect alerts on pipes that were delivering data every day. The
     product's truth is the data path, so the probe reads the data path. */
  if (serviceAccountEnabled() && (conn.channel === 'google_search_console' || conn.channel === 'google_analytics')) {
    const isGSC = conn.channel === 'google_search_console'
    const saToken = await getServiceAccountToken(isGSC ? GSC_SCOPE : GA_SCOPE)
    if (!saToken) {
      return { newState: 'error', errorMessage: 'service_account_unavailable: keyless service-account auth could not mint a token (check the WIF env vars / Vercel OIDC, or GOOGLE_SERVICE_ACCOUNT_JSON).' }
    }
    try {
      /* Probe a settled date (GSC lags 2-3 days). An empty result is still
         a healthy 200 — the probe checks access, not data volume. */
      const probeDate = isoDaysAgo(isGSC ? 4 : 2)
      if (isGSC) await runGSCDailyQuery(conn.platform_account_id, saToken, probeDate)
      else await runGA4DailyReport(conn.platform_account_id, saToken, probeDate)
      return { newState: 'active' }
    } catch (err) {
      /* The read failed — but if rows landed recently the pipe is
         demonstrably delivering (e.g. via the OAuth fallback), and
         "connected" is the honest state. */
      if (await dataLandedRecently(admin, conn)) return { newState: 'active' }
      const msg = (err as Error).message
      const grantHint = isGSC
        ? `add ${getServiceAccountEmail()} as a Full user on ${conn.platform_url ?? conn.platform_account_id} in Search Console (Settings → Users and permissions)`
        : `add ${getServiceAccountEmail()} as a Viewer on GA4 property ${conn.platform_account_id} (Admin → Property access management)`
      return {
        newState: 'error',
        errorMessage: `data_read_failed: ${msg}. If this is a permissions problem, ${grantHint}; it then syncs automatically, no reconnect needed.`,
      }
    }
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

function isoDaysAgo(n: number): string {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - n)
  return d.toISOString().slice(0, 10)
}

/* Has a metric row landed inside the channel's healthy window? GSC data
   lags 2-3 days by design, so its window is wider. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function dataLandedRecently(admin: any, conn: Connection): Promise<boolean> {
  const isGSC = conn.channel === 'google_search_console'
  const table = isGSC ? 'search_metrics' : 'website_metrics'
  try {
    const { data } = await admin
      .from(table)
      .select('date')
      .eq('client_id', conn.client_id)
      .gte('date', isoDaysAgo(isGSC ? 7 : 3))
      .limit(1)
    return !!(data && data.length)
  } catch {
    return false
  }
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


/**
 * A CONNECTION ON A CLIENT NOBODY CAN SEE.
 *
 * The tenant fork (ensureClientForBusiness's old exact-name match) created clients that hold
 * real connections but have no client_users row — so no dashboard ever resolves them and every
 * number they collect is invisible. Do Si lived this: connected in onboarding, dark everywhere
 * else, and nothing anywhere said so. The fork is closed in code, but any client can still end
 * up orphaned by a future bug, and the failure is silent by construction. The nightly probe now
 * asks the one question that catches it: does every client that HOLDS connections have at least
 * one login that can see it?
 */
export async function probeOrphanTenants(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  report: HealthReport,
): Promise<void> {
  const { data: conns } = await admin
    .from('channel_connections')
    .select('client_id, channel, connected_by')
    .in('status', ['active', 'pending'])
  const byClient = new Map<string, { channels: string[]; connectedBy: string | null }>()
  for (const c of (conns ?? []) as { client_id: string; channel: string; connected_by: string | null }[]) {
    const e = byClient.get(c.client_id) ?? { channels: [], connectedBy: null }
    e.channels.push(c.channel)
    e.connectedBy = e.connectedBy ?? c.connected_by
    byClient.set(c.client_id, e)
  }
  if (byClient.size === 0) return

  /* A client is resolvable by EITHER path the app's resolvers use: a client_users
   * link OR a business whose owner logs in (the fallback every read/write shares).
   * Mid-onboarding owners have only the second — client_users arrives at finish —
   * and flagging them here was a nightly false alarm. */
  const [{ data: links }, { data: bizLinks }] = await Promise.all([
    admin.from('client_users').select('client_id').in('client_id', [...byClient.keys()]),
    admin.from('businesses').select('client_id').in('client_id', [...byClient.keys()]).not('owner_id', 'is', null),
  ])
  const linked = new Set(((links ?? []) as { client_id: string }[]).map((l) => l.client_id))
  for (const b of (bizLinks ?? []) as { client_id: string }[]) linked.add(b.client_id)

  for (const [clientId, info] of byClient) {
    if (linked.has(clientId)) continue
    report.staleFeeds += 1
    report.failures.push({
      id: clientId,
      channel: info.channels.join(','),
      clientId,
      message: 'ORPHAN TENANT: holds connections but no login resolves it — its data is invisible to everyone',
    })
    if (info.connectedBy) {
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('client_id', clientId)
        .eq('type', 'orphan_tenant')
        .gte('created_at', new Date(Date.now() - 26 * 3600_000).toISOString())
        .limit(1)
      if (!recent || recent.length === 0) {
        await admin.from('notifications').insert({
          user_id: info.connectedBy,
          client_id: clientId,
          type: 'orphan_tenant',
          title: 'Your connected accounts may not be showing',
          body: 'An account connection finished but is not attached to your workspace. Our team has been alerted; nothing needs reconnecting.',
          link: '/dashboard/connected-accounts',
        })
        report.notificationsCreated += 1
      }
    }
  }
}

/**
 * A GOOGLE CONNECT PARKED IN PENDING.
 *
 * The GBP OAuth writes a pending row awaiting a location pick. Onboarding now auto-finishes
 * the single-listing case, but any path can still strand a pending row (picker abandoned,
 * listing fetch failed), and a stranded pending row means no location, no sync and no data —
 * while the connect step says Connected. More than a day in pending is not "in progress"; it
 * is stuck, and someone should hear about it.
 */
export async function probeStuckPendingGbp(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  report: HealthReport,
): Promise<void> {
  const cutoff = new Date(Date.now() - 26 * 3600_000).toISOString()
  const { data } = await admin
    .from('channel_connections')
    .select('id, client_id, connected_by, connected_at')
    .eq('channel', 'google_business_profile')
    .eq('status', 'pending')
    .lt('connected_at', cutoff)
  for (const row of (data ?? []) as { id: string; client_id: string; connected_by: string | null; connected_at: string }[]) {
    report.staleFeeds += 1
    report.failures.push({
      id: row.id,
      channel: 'google_business_profile',
      clientId: row.client_id,
      message: `GBP stuck in pending since ${row.connected_at}: connected but no location chosen, so no data will ever arrive`,
    })
    if (row.connected_by) {
      const { data: recent } = await admin
        .from('notifications')
        .select('id')
        .eq('client_id', row.client_id)
        .eq('type', 'gbp_pending_stuck')
        .gte('created_at', cutoff)
        .limit(1)
      if (!recent || recent.length === 0) {
        await admin.from('notifications').insert({
          user_id: row.connected_by,
          client_id: row.client_id,
          type: 'gbp_pending_stuck',
          title: 'One more tap to finish connecting Google',
          body: 'Your Google sign-in worked, but a business location still needs to be chosen before data can flow. It takes a few seconds.',
          link: '/dashboard/connect-accounts/google-business-location?clientId=' + row.client_id,
        })
        report.notificationsCreated += 1
      }
    }
  }
}

/**
 * THE NUMBER SENTRY — data rules checked nightly for every client (2026-08-17).
 *
 * Every wrong number this month passed every code check and was caught by the
 * owner's eyes: lifetime totals written as single days, windows sliding into
 * the past, connections landing on invisible tenants. Code checks test logic;
 * these rules test the DATA. A broken rule lands in the health report for the
 * TEAM — never as a client notification — so we find a wrong number before a
 * client does.
 *
 * Rules:
 *  1. No negative daily values (social + Google).
 *  2. A delta-mode social row must never hold near-lifetime totals — the
 *     "250k Wednesday" rule: a daily-growth row holding ≥60% of the platform's
 *     lifetime ledger (and ≥10k) means a lifetime dump leaked into a day.
 *  3. Follower counts must not crash: latest < 50% of the 14-day peak (peaks
 *     under 50 followers are ignored — noise, not audiences).
 *  4. Google must not double-count: a brand-level row and per-location rows
 *     with impressions on the SAME day is the double-count mechanism from the
 *     multi-location audit, live.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function probeNumberSanity(admin: any, report: HealthReport): Promise<void> {
  const n = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v) || 0)
  const day = (d: number) => new Date(Date.now() - d * 86_400_000).toISOString().slice(0, 10)
  const since30 = day(30)
  const since14 = day(14)
  const flag = (clientId: string, rule: string, message: string) => {
    report.staleFeeds += 1
    report.failures.push({ id: `${clientId}:${rule}`, channel: 'numbers', clientId, message })
  }

  /* lifetime ledgers per client+platform (written by the zernio delta model) */
  const { data: vconns } = await admin
    .from('channel_connections')
    .select('client_id, metadata')
    .in('channel', ['zernio', 'ayrshare'])
  const ledgers = new Map<string, Record<string, { impressions?: number }>>()
  for (const c of (vconns ?? []) as { client_id: string; metadata: { lifetime_totals?: Record<string, { impressions?: number }> } | null }[]) {
    if (c.metadata?.lifetime_totals) ledgers.set(c.client_id, c.metadata.lifetime_totals)
  }

  // ── social rules ────────────────────────────────────────────────────────────
  const { data: soc } = await admin
    .from('social_metrics')
    .select('client_id, platform, date, reach, impressions, engagement, followers_total, followers_gained, raw_data')
    .gte('date', since30)
    .limit(10000)
  const socRows = (soc ?? []) as Array<{
    client_id: string; platform: string; date: string
    reach: unknown; impressions: unknown; engagement: unknown
    followers_total: unknown; followers_gained: unknown
    raw_data: { note?: string } | null
  }>

  const flaggedNeg = new Set<string>()
  const followers = new Map<string, { date: string; total: number }[]>()
  for (const r of socRows) {
    // rule 1: negatives
    if ([r.reach, r.impressions, r.engagement, r.followers_gained].some((v) => n(v) < 0)) {
      const k = `${r.client_id}:${r.platform}`
      if (!flaggedNeg.has(k)) {
        flaggedNeg.add(k)
        flag(r.client_id, 'negative', `NUMBER RULE: negative daily value on ${r.platform} ${r.date}`)
      }
    }
    // rule 2: a daily-growth row holding near-lifetime totals
    const isDelta = typeof r.raw_data?.note === 'string' && r.raw_data.note.startsWith('daily growth')
    if (isDelta) {
      const lifetime = n(ledgers.get(r.client_id)?.[r.platform]?.impressions)
      const impr = n(r.impressions)
      if (lifetime > 0 && impr >= 10_000 && impr >= lifetime * 0.6) {
        flag(r.client_id, 'lifetime-dump', `NUMBER RULE: ${r.platform} ${r.date} holds ${impr.toLocaleString()} impressions in ONE delta day (${Math.round((impr / lifetime) * 100)}% of lifetime) — looks like a lifetime total written as a day`)
      }
    }
    // collect follower series (rule 3, judged after the loop)
    const ft = n(r.followers_total)
    if (ft > 0 && r.date >= since14) {
      const k = `${r.client_id}:${r.platform}`
      const list = followers.get(k) ?? []
      list.push({ date: r.date, total: ft })
      followers.set(k, list)
    }
  }
  for (const [k, list] of followers) {
    list.sort((a, b) => a.date.localeCompare(b.date))
    const peak = Math.max(...list.map((x) => x.total))
    const latest = list[list.length - 1].total
    if (peak >= 50 && latest < peak * 0.5) {
      const [clientId, platform] = k.split(':')
      flag(clientId, 'follower-crash', `NUMBER RULE: ${platform} followers fell from ${peak} to ${latest} within 14 days with no recorded reason`)
    }
  }

  // ── Google rules ────────────────────────────────────────────────────────────
  const { data: g } = await admin
    .from('gbp_metrics')
    .select('client_id, date, location_id, impressions_total, search_views, calls, direction_requests, website_clicks')
    .gte('date', since14)
    .limit(10000)
  const gRows = (g ?? []) as Array<{
    client_id: string; date: string; location_id: string | null
    impressions_total: unknown; search_views: unknown; calls: unknown
    direction_requests: unknown; website_clicks: unknown
  }>
  const gNegFlagged = new Set<string>()
  const byClientDay = new Map<string, { brand: number; locs: number }>()
  for (const r of gRows) {
    if ([r.impressions_total, r.search_views, r.calls, r.direction_requests, r.website_clicks].some((v) => n(v) < 0)) {
      if (!gNegFlagged.has(r.client_id)) {
        gNegFlagged.add(r.client_id)
        flag(r.client_id, 'gbp-negative', `NUMBER RULE: negative Google value on ${r.date}`)
      }
    }
    const impr = Math.max(n(r.impressions_total), n(r.search_views))
    if (impr > 0) {
      const k = `${r.client_id}:${r.date}`
      const e = byClientDay.get(k) ?? { brand: 0, locs: 0 }
      if (r.location_id) e.locs += impr
      else e.brand += impr
      byClientDay.set(k, e)
    }
  }
  const dblFlagged = new Set<string>()
  for (const [k, e] of byClientDay) {
    const clientId = k.split(':')[0]
    if (e.brand > 0 && e.locs > 0 && !dblFlagged.has(clientId)) {
      dblFlagged.add(clientId)
      flag(clientId, 'gbp-double', `NUMBER RULE: Google brand-level AND per-location rows both carry impressions on ${k.split(':')[1]} — totals may double-count`)
    }
  }
}
