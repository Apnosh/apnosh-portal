/**
 * SERVER-ONLY per-client status resolver.
 * =========================================
 * Reads the client's channel_connections (status / sync_error / last_sync_at
 * per channel) and resolves every registry source to its live status for that
 * client. Read-only and best-effort — it NEVER throws. A failed read resolves
 * every connection-dependent source to AVAILABLE_NOT_CONNECTED (honest: we
 * couldn't prove the connection, so we don't claim it).
 *
 * The actual resolution rules live in the PURE resolveSourceStatusesFrom in
 * source-registry.ts so they can be unit-tested offline; this file only does
 * the I/O.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import {
  resolveSourceStatusesFrom,
  type ConnectionsByChannel,
  type ResolvedSourceMap,
} from './source-registry'

/** Load the client's connections keyed by channel (last-synced row wins per channel). */
export async function loadClientConnections(clientId: string): Promise<ConnectionsByChannel> {
  const byChannel: ConnectionsByChannel = {}
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('channel_connections')
      .select('channel, status, sync_error, last_sync_at')
      .eq('client_id', clientId)
      .order('last_sync_at', { ascending: false, nullsFirst: false })

    if (error || !data) return byChannel

    for (const row of data as Array<{
      channel: string
      status: string | null
      sync_error: string | null
      last_sync_at: string | null
    }>) {
      // First (most-recently-synced) row per channel wins; skip later dupes.
      if (byChannel[row.channel]) continue
      byChannel[row.channel] = {
        status: row.status ?? 'disconnected',
        sync_error: row.sync_error ?? null,
        last_sync_at: row.last_sync_at ?? null,
      }
    }
  } catch {
    // best-effort: fall through with whatever we gathered (possibly empty)
  }
  return byChannel
}

/** Resolve every source's live status for one client. Never throws. */
export async function resolveSourceStatuses(clientId: string): Promise<ResolvedSourceMap> {
  const connections = await loadClientConnections(clientId)
  return resolveSourceStatusesFrom(connections)
}
