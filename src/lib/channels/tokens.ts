/**
 * TOKEN PERSISTENCE — refreshed vendor tokens land back in channel_connections
 * immediately (CHANNELS-PLAN P4b).
 *
 * Both POS vendors hand out expiring access tokens (Clover's live ~30 minutes, so
 * refresh is the COMMON path there, not the edge). Clover also ROTATES the refresh
 * token on every refresh; failing to persist the new one strands the connection at
 * the next sync. This helper is the single write path so that rule lives once.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export async function persistTokens(
  connectionId: string,
  tokens: { accessToken: string; refreshToken?: string | null }
): Promise<void> {
  const update: Record<string, unknown> = { access_token: tokens.accessToken }
  /* Only overwrite the refresh token when the vendor issued a new one — Square
   * usually echoes nothing back on refresh, and nulling ours would strand us. */
  if (tokens.refreshToken) update.refresh_token = tokens.refreshToken
  const { error } = await createAdminClient()
    .from('channel_connections')
    .update(update)
    .eq('id', connectionId)
  if (error) console.error('[channels] failed to persist refreshed tokens', error.message)
}
