/**
 * Connection lookup for the publish layer.
 *
 * Historical context: the codebase has TWO connection tables —
 *  - platform_connections  (older, no client_id on some rows)
 *  - social_connections    (newer, properly client-scoped, what the
 *                           OAuth callbacks write to today)
 *
 * The publish library reads PlatformConnection-shaped objects with
 * { platform, access_token, page_id, ig_account_id }. We adapt
 * social_connections rows into that shape so callers don't care
 * which table is the source.
 *
 * Returns ONLY active, unexpired Meta/LinkedIn rows. GBP and
 * Google services live in channel_connections and are surfaced
 * separately for the Phase 1B (GBP posts) work.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface PublishConnection {
  platform: string
  access_token: string | null
  page_id: string | null
  ig_account_id: string | null
  /** Display info for UI / preflight messaging. */
  accountName: string | null
  /** ISO timestamp. Null if non-expiring. */
  expiresAt: string | null
}

/**
 * Get all publishable Meta/LinkedIn connections for a client.
 *
 * Filters out expired and inactive rows. Caller still validates
 * permission scopes and reachability before publishing.
 */
export async function getPublishConnectionsForClient(
  clientId: string,
): Promise<PublishConnection[]> {
  const admin = createAdminClient()

  const { data } = await admin
    .from('social_connections')
    .select('platform, access_token, platform_account_id, platform_account_name, token_expires_at, sync_status')
    .eq('client_id', clientId)
    .in('platform', ['instagram', 'facebook', 'linkedin'])
    .eq('sync_status', 'active')

  const now = Date.now()
  const rows = (data ?? []).filter(r => {
    if (!r.access_token) return false
    if (!r.token_expires_at) return true
    return new Date(r.token_expires_at as string).getTime() > now
  })

  return rows.map(r => {
    const platform = r.platform as string
    const pid = r.platform_account_id as string | null

    // platform_account_id semantics:
    //   instagram → the IG business account ID
    //   facebook  → the FB page ID
    //   linkedin  → the LinkedIn org URN (or person ID for personal pages)
    return {
      platform,
      access_token: r.access_token as string,
      page_id: platform === 'facebook' ? pid : null,
      ig_account_id: platform === 'instagram' ? pid : null,
      accountName: (r.platform_account_name as string) ?? null,
      expiresAt: (r.token_expires_at as string) ?? null,
    }
  })
}
