'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { listGA4Properties, type GA4Property } from '@/lib/google'

/**
 * Fetch GA4 properties for a client using the stored access token.
 */
export async function fetchGA4PropertiesForClient(
  clientId: string
): Promise<{ success: true; properties: GA4Property[] } | { success: false; error: string }> {
  const supabase = createAdminClient()

  const { data: conn } = await supabase
    .from('channel_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('channel', 'google_analytics')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!conn?.access_token) {
    return { success: false, error: 'No pending Google Analytics connection found' }
  }

  try {
    const properties = await listGA4Properties(conn.access_token)
    return { success: true, properties }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to list properties' }
  }
}

/**
 * Finalize the GA4 connection by picking a property.
 */
export async function finalizeGA4Connection(
  clientId: string,
  property: GA4Property
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = createAdminClient()

  // Move the pending row to the actual property
  const { data: pending } = await supabase
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at, scopes, connected_by')
    .eq('client_id', clientId)
    .eq('channel', 'google_analytics')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!pending) {
    return { success: false, error: 'No pending connection to finalize' }
  }

  // Delete any existing row for this exact property (handles reconnects),
  // then insert. Avoids the expression-index ON CONFLICT mismatch.
  await supabase
    .from('channel_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('channel', 'google_analytics')
    .eq('platform_account_id', property.propertyId)

  const { error: insertErr } = await supabase
    .from('channel_connections')
    .insert({
      client_id: clientId,
      channel: 'google_analytics',
      connection_type: 'oauth',
      platform_account_id: property.propertyId,
      platform_account_name: property.propertyName,
      access_token: pending.access_token,
      refresh_token: pending.refresh_token,
      token_expires_at: pending.token_expires_at,
      scopes: pending.scopes,
      status: 'active',
      connected_by: pending.connected_by,
      connected_at: new Date().toISOString(),
      metadata: {
        property_id: property.propertyId,
        property_name: property.propertyName,
        account_name: property.accountName,
        time_zone: property.timeZone,
        currency_code: property.currencyCode,
      },
    })

  if (insertErr) {
    return { success: false, error: insertErr.message }
  }

  // Delete the pending placeholder
  await supabase
    .from('channel_connections')
    .delete()
    .eq('id', pending.id)

  /* Auto-backfill so the client sees a populated traffic chart on
     their first dashboard visit. Awaited (not fire-and-forget) --
     Vercel was killing the background promise before it finished,
     which left every new connection stuck at last_sync_at=null.
     We only backfill 14 days here to keep the wait under ~30s; a
     deeper backfill happens on the next daily cron tick. */
  try {
    const { syncGoogleAnalyticsForClient } = await import('@/lib/web-analytics-sync')
    await syncGoogleAnalyticsForClient(clientId, 14)
  } catch (err) {
    console.error('[finalizeGA4Connection] auto-backfill failed:', (err as Error).message)
    /* Non-fatal: connection is saved, daily cron will backfill. */
  }

  return { success: true }
}
