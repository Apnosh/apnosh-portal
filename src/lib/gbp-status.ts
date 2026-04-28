/**
 * Per-client GBP connection status.
 *
 * Derived (not stored) from existing tables:
 *   - 'never'     -- no invite sent yet, no gbp_connections row
 *   - 'pending'   -- invite sent, but no gbp_connections row yet
 *                   (client hasn't accepted the Manager invite)
 *   - 'connected' -- gbp_connections row exists with sync_status='active'
 *                   AND a gbp_metrics row in the last 14 days
 *   - 'lost'      -- gbp_connections existed but no recent metrics
 *                   (client revoked Manager access, or sync broke)
 *
 * Used to drive the UI badge on the client list and the per-client
 * onboarding banner that prompts the admin to send a Manager invite
 * email or follow up.
 */

import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as AdminDb
}

export type GbpStatus = 'never' | 'pending' | 'connected' | 'lost'

export interface ClientGbpStatus {
  clientId: string
  status: GbpStatus
  inviteSentAt: string | null
  lastSyncAt: string | null
  lastMetricDate: string | null
  locationName: string | null
}

const RECENT_METRIC_DAYS = 14

/**
 * Get GBP connection status for every client in one batch query.
 * Returns a Map keyed by client_id for easy lookup.
 */
export async function getAllClientGbpStatuses(): Promise<Map<string, ClientGbpStatus>> {
  const db = adminDb()

  const [clientsRes, connectionsRes, metricsRes] = await Promise.all([
    db.from('clients').select('id, gbp_invite_sent_at'),
    db.from('gbp_connections').select('client_id, location_name, last_sync_at, sync_status'),
    db.from('gbp_metrics')
      .select('client_id, date')
      .order('date', { ascending: false }),
  ])

  const clients = (clientsRes.data ?? []) as Array<{
    id: string; gbp_invite_sent_at: string | null
  }>
  const connections = (connectionsRes.data ?? []) as Array<{
    client_id: string
    location_name: string | null
    last_sync_at: string | null
    sync_status: string | null
  }>
  const metrics = (metricsRes.data ?? []) as Array<{ client_id: string; date: string }>

  // Build lookup: latest connection per client
  const latestConn = new Map<string, typeof connections[number]>()
  for (const c of connections) {
    const existing = latestConn.get(c.client_id)
    if (!existing) {
      latestConn.set(c.client_id, c)
    } else {
      const a = existing.last_sync_at ?? ''
      const b = c.last_sync_at ?? ''
      if (b > a) latestConn.set(c.client_id, c)
    }
  }

  // Latest metric date per client (metrics are pre-sorted desc by date)
  const latestMetric = new Map<string, string>()
  for (const m of metrics) {
    if (!latestMetric.has(m.client_id)) {
      latestMetric.set(m.client_id, m.date)
    }
  }

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - RECENT_METRIC_DAYS)
  const cutoffIso = cutoff.toISOString().slice(0, 10)

  const out = new Map<string, ClientGbpStatus>()
  for (const cl of clients) {
    const conn = latestConn.get(cl.id)
    const lastMetric = latestMetric.get(cl.id) ?? null

    let status: GbpStatus
    if (!conn) {
      status = cl.gbp_invite_sent_at ? 'pending' : 'never'
    } else if (lastMetric && lastMetric >= cutoffIso) {
      status = 'connected'
    } else {
      status = 'lost'
    }

    out.set(cl.id, {
      clientId: cl.id,
      status,
      inviteSentAt: cl.gbp_invite_sent_at ?? null,
      lastSyncAt: conn?.last_sync_at ?? null,
      lastMetricDate: lastMetric,
      locationName: conn?.location_name ?? null,
    })
  }

  return out
}

/**
 * Single-client convenience wrapper.
 */
export async function getClientGbpStatus(clientId: string): Promise<ClientGbpStatus | null> {
  const all = await getAllClientGbpStatuses()
  return all.get(clientId) ?? null
}
