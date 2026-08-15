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
  type ResolverClientConfig,
} from './source-registry'
import { loadClientAnalyticsConfig } from './client-analytics-config'

/** Social vendor channels: ONE connection row carries every linked platform in
 *  metadata.platforms, so the row expands into per-platform entries below. */
const SOCIAL_VENDOR_CHANNELS = ['zernio', 'ayrshare']

/** Load the client's connections keyed by channel (last-synced row wins per channel). */
export async function loadClientConnections(clientId: string): Promise<ConnectionsByChannel> {
  const byChannel: ConnectionsByChannel = {}
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('channel_connections')
      .select('id, channel, status, sync_error, last_sync_at, platform_account_id, metadata')
      .eq('client_id', clientId)
      .order('last_sync_at', { ascending: false, nullsFirst: false })

    if (error || !data) return byChannel

    for (const row of data as Array<{
      id: string
      channel: string
      status: string | null
      sync_error: string | null
      last_sync_at: string | null
      platform_account_id: string | null
      metadata: { platforms?: unknown } | null
    }>) {
      const snap = {
        status: row.status ?? 'disconnected',
        sync_error: row.sync_error ?? null,
        last_sync_at: row.last_sync_at ?? null,
      }
      if (SOCIAL_VENDOR_CHANNELS.includes(row.channel)) {
        // the vendor row proves exactly the platforms it carries — no more, no less
        let platforms = Array.isArray(row.metadata?.platforms)
          ? row.metadata.platforms.filter((p): p is string => typeof p === 'string')
          : []
        /* metadata.platforms is a SYNC-written cache: empty between connect and
         * first sync. The other two connect-state readers (connections hub,
         * onboarding) already ask the vendor live in that window — without the
         * same read here, insights says "not connected" for a connection that
         * exists. Heal the cache on the way through; the vendor being
         * unreachable falls back to the (empty) cache, which stays honest. */
        if (platforms.length === 0 && row.channel === 'zernio' && row.platform_account_id) {
          try {
            const { liveLinkedPlatforms } = await import('@/lib/channels/adapters/zernio')
            const live = await liveLinkedPlatforms(row.platform_account_id)
            if (live && live.platforms.length > 0) {
              platforms = live.platforms
              const md = (row.metadata ?? {}) as Record<string, unknown>
              await admin.from('channel_connections')
                .update({ metadata: { ...md, platforms } })
                .eq('id', row.id)
            }
          } catch { /* vendor unreachable: cache stays the answer */ }
        }
        for (const p of platforms) {
          if (!byChannel[p]) byChannel[p] = snap
        }
        continue
      }
      // First (most-recently-synced) row per channel wins; skip later dupes.
      if (byChannel[row.channel]) continue
      byChannel[row.channel] = snap
    }
  } catch {
    // best-effort: fall through with whatever we gathered (possibly empty)
  }
  return byChannel
}

/** Resolve every source's live status for one client. Never throws. Also reads
 *  the client's owner-set analytics config so config-gated GA4 event sources
 *  resolve CONNECTED only when their exact value is present. */
export async function resolveSourceStatuses(clientId: string): Promise<ResolvedSourceMap> {
  const [connections, cfg] = await Promise.all([
    loadClientConnections(clientId),
    loadClientAnalyticsConfig(clientId),
  ])
  const config: ResolverClientConfig = {
    ga4_menu_path: cfg.menuPath,
    ga4_order_domain: cfg.orderDomain,
  }
  return resolveSourceStatusesFrom(connections, config)
}
