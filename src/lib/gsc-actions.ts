'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { listGSCSites, type GSCSite } from '@/lib/google'

/**
 * Fetch GSC sites for a client using the stored pending access token.
 */
export async function fetchGSCSitesForClient(
  clientId: string
): Promise<{ success: true; sites: GSCSite[] } | { success: false; error: string }> {
  const supabase = createAdminClient()

  const { data: conn } = await supabase
    .from('channel_connections')
    .select('access_token')
    .eq('client_id', clientId)
    .eq('channel', 'google_search_console')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!conn?.access_token) {
    return { success: false, error: 'No pending Search Console connection found' }
  }

  try {
    const sites = await listGSCSites(conn.access_token)
    return { success: true, sites }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to list sites' }
  }
}

/**
 * Finalize the GSC connection by picking a site.
 */
export async function finalizeGSCConnection(
  clientId: string,
  site: GSCSite
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = createAdminClient()

  const { data: pending } = await supabase
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at, scopes, connected_by')
    .eq('client_id', clientId)
    .eq('channel', 'google_search_console')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!pending) {
    return { success: false, error: 'No pending connection to finalize' }
  }

  const { error: upsertErr } = await supabase
    .from('channel_connections')
    .upsert({
      client_id: clientId,
      channel: 'google_search_console',
      connection_type: 'oauth',
      platform_account_id: site.siteUrl,
      platform_account_name: site.siteUrl,
      platform_url: site.siteUrl.startsWith('sc-domain:') ? `https://${site.siteUrl.slice(10)}` : site.siteUrl,
      access_token: pending.access_token,
      refresh_token: pending.refresh_token,
      token_expires_at: pending.token_expires_at,
      scopes: pending.scopes,
      status: 'active',
      connected_by: pending.connected_by,
      connected_at: new Date().toISOString(),
      metadata: {
        site_url: site.siteUrl,
        permission_level: site.permissionLevel,
      },
    }, { onConflict: 'client_id,channel,platform_account_id' })

  if (upsertErr) {
    return { success: false, error: upsertErr.message }
  }

  // Delete pending placeholder
  await supabase
    .from('channel_connections')
    .delete()
    .eq('id', pending.id)

  return { success: true }
}
