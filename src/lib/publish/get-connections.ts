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
  /** GBP only. accounts/{accountId}/locations/{locationId}. */
  gbp_resource_name?: string | null
  /** LinkedIn only. Either urn:li:person:<sub> or urn:li:organization:<id>,
   *  or the raw ID — publish helper normalizes. */
  linkedin_urn?: string | null
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

  const [socialRes, channelRes] = await Promise.all([
    admin
      .from('social_connections')
      .select('platform, access_token, platform_account_id, platform_account_name, token_expires_at, sync_status')
      .eq('client_id', clientId)
      .in('platform', ['instagram', 'facebook', 'linkedin'])
      .eq('sync_status', 'active'),
    admin
      .from('channel_connections')
      .select('channel, access_token, platform_account_id, platform_account_name, token_expires_at, status')
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('status', 'active'),
  ])

  const now = Date.now()
  const out: PublishConnection[] = []

  for (const r of socialRes.data ?? []) {
    if (!r.access_token) continue
    if (r.token_expires_at && new Date(r.token_expires_at as string).getTime() <= now) continue

    const platform = r.platform as string
    const pid = r.platform_account_id as string | null
    // platform_account_id semantics:
    //   instagram → the IG business account ID
    //   facebook  → the FB page ID
    //   linkedin  → the LinkedIn org URN (or person ID for personal pages)
    out.push({
      platform,
      access_token: r.access_token as string,
      page_id: platform === 'facebook' ? pid : null,
      ig_account_id: platform === 'instagram' ? pid : null,
      linkedin_urn: platform === 'linkedin' ? pid : null,
      accountName: (r.platform_account_name as string) ?? null,
      expiresAt: (r.token_expires_at as string) ?? null,
    })
  }

  for (const r of channelRes.data ?? []) {
    if (!r.access_token) continue
    if (r.token_expires_at && new Date(r.token_expires_at as string).getTime() <= now) continue

    const resourceName = (r.platform_account_id as string) ?? ''
    // 'pending' means the client connected OAuth but never picked a
    // location during onboarding — skip rather than fail publish later.
    if (!resourceName || resourceName === 'pending') continue

    out.push({
      platform: 'gbp',
      access_token: r.access_token as string,
      page_id: null,
      ig_account_id: null,
      gbp_resource_name: resourceName,
      accountName: (r.platform_account_name as string) ?? null,
      expiresAt: (r.token_expires_at as string) ?? null,
    })
  }

  return out
}
