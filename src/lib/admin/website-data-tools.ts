'use server'

/**
 * Admin/strategist tools for managing client website data pipelines.
 *
 * Surfaced at /admin/website-tools. Lets the AM team:
 *   - See every client's GA + GSC connection status, last-sync time,
 *     row counts, and any sync errors at a glance.
 *   - Trigger a 16-month GSC backfill per client (~60-90s, one-shot).
 *   - Trigger a 90-day GA sync per client.
 *
 * Gated by `profiles.role = 'admin'`; clients never see these tools.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

export interface ClientWebsiteRow {
  clientId: string
  clientName: string
  websiteUrl: string | null
  ga: {
    connected: boolean
    accountName: string | null
    lastSyncAt: string | null
    syncError: string | null
    rowsInDb: number
  }
  gsc: {
    connected: boolean
    siteUrl: string | null
    lastSyncAt: string | null
    syncError: string | null
    rowsInDb: number
    earliestRow: string | null
    latestRow: string | null
  }
}

export async function listClientsWebsiteData(): Promise<ClientWebsiteRow[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()

  const [clientsRes, channelsRes, gaRowsRes, gscRowsRes] = await Promise.all([
    admin.from('clients').select('id, name, website').order('name', { ascending: true }),
    admin.from('channel_connections')
      .select('client_id, channel, status, access_token, platform_account_name, platform_url, last_sync_at, sync_error')
      .in('channel', ['google_analytics', 'google_search_console']),
    admin.from('website_metrics').select('client_id'),
    admin.from('search_metrics').select('client_id, date'),
  ])

  // Aggregate counts in-memory. Cheap enough for our scale (≤100 clients ×
  // ≤480 rows each) and avoids requiring a PG RPC.
  const gaCounts: Record<string, number> = {}
  const gscCounts: Record<string, { count: number; earliest: string | null; latest: string | null }> = {}
  for (const r of ((gaRowsRes.data ?? []) as Array<{ client_id: string }>)) {
    gaCounts[r.client_id] = (gaCounts[r.client_id] ?? 0) + 1
  }
  for (const r of ((gscRowsRes.data ?? []) as Array<{ client_id: string; date: string }>)) {
    const ex = gscCounts[r.client_id]
    if (!ex) {
      gscCounts[r.client_id] = { count: 1, earliest: r.date, latest: r.date }
    } else {
      ex.count += 1
      if (r.date < (ex.earliest ?? r.date)) ex.earliest = r.date
      if (r.date > (ex.latest ?? r.date)) ex.latest = r.date
    }
  }

  const channels = (channelsRes.data ?? []) as Array<{
    client_id: string; channel: string; status: string; access_token: string | null;
    platform_account_name: string | null; platform_url: string | null;
    last_sync_at: string | null; sync_error: string | null;
  }>
  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string; website: string | null }>

  const rows: ClientWebsiteRow[] = clients.map(c => {
    const gaConn = channels.find(ch => ch.client_id === c.id && ch.channel === 'google_analytics' && ch.access_token && ch.status === 'active')
    const gscConn = channels.find(ch => ch.client_id === c.id && ch.channel === 'google_search_console' && ch.access_token && ch.status === 'active')
    const gscMeta = gscCounts[c.id]
    return {
      clientId: c.id,
      clientName: c.name,
      websiteUrl: c.website,
      ga: {
        connected: !!gaConn,
        accountName: gaConn?.platform_account_name ?? null,
        lastSyncAt: gaConn?.last_sync_at ?? null,
        syncError: gaConn?.sync_error ?? null,
        rowsInDb: gaCounts[c.id] ?? 0,
      },
      gsc: {
        connected: !!gscConn,
        siteUrl: gscConn?.platform_url ?? null,
        lastSyncAt: gscConn?.last_sync_at ?? null,
        syncError: gscConn?.sync_error ?? null,
        rowsInDb: gscMeta?.count ?? 0,
        earliestRow: gscMeta?.earliest ?? null,
        latestRow: gscMeta?.latest ?? null,
      },
    }
  })

  return rows
}

export async function adminBackfillSearchHistory(
  clientId: string,
  daysBack: number = 480,
): Promise<{ success: true; daysWritten: number } | { success: false; error: string }> {
  /* Strategist-triggered: pulls up to the full 16 months Google
     Search Console retains for a single client. ~60-90s for 480
     days. Each day's upsert is durable, so partial progress sticks
     even if Vercel times us out. */
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  try {
    const { syncSearchConsoleForClient } = await import('@/lib/web-analytics-sync')
    const r = await syncSearchConsoleForClient(clientId, Math.max(1, Math.min(480, daysBack)))
    if (r.error && r.daysWritten === 0) return { success: false, error: r.error }
    revalidatePath('/admin/website-tools')
    return { success: true, daysWritten: r.daysWritten }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}

export async function adminBackfillAnalytics(
  clientId: string,
  daysBack: number = 90,
): Promise<{ success: true; daysWritten: number } | { success: false; error: string }> {
  /* Strategist-triggered: re-runs GA sync for a single client. Useful
     when the daily cron missed a day or a sync error needs retrying. */
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  try {
    const { syncGoogleAnalyticsForClient } = await import('@/lib/web-analytics-sync')
    const r = await syncGoogleAnalyticsForClient(clientId, Math.max(1, Math.min(365, daysBack)))
    if (r.error && r.daysWritten === 0) return { success: false, error: r.error }
    revalidatePath('/admin/website-tools')
    return { success: true, daysWritten: r.daysWritten }
  } catch (err) {
    return { success: false, error: (err as Error).message }
  }
}
