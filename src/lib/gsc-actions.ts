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

  // Delete any existing row for this exact site (handles reconnects),
  // then insert. Avoids the expression-index ON CONFLICT mismatch.
  await supabase
    .from('channel_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('channel', 'google_search_console')
    .eq('platform_account_id', site.siteUrl)

  const { error: insertErr } = await supabase
    .from('channel_connections')
    .insert({
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
    })

  if (insertErr) {
    return { success: false, error: insertErr.message }
  }

  // Delete pending placeholder
  await supabase
    .from('channel_connections')
    .delete()
    .eq('id', pending.id)

  /* Auto-backfill 90 days. Fire-and-forget; GSC has a 2-3 day
     reporting lag so we anchor end at today-3 inside the lib. */
  void (async () => {
    try {
      const { syncSearchConsoleForClient } = await import('@/lib/web-analytics-sync')
      await syncSearchConsoleForClient(clientId, 90)
    } catch (err) {
      console.error('[finalizeGSCConnection] auto-backfill failed:', (err as Error).message)
    }
  })()

  return { success: true }
}
