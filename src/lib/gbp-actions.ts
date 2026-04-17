'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { listGBPAccounts, listGBPLocations, type GBPAccount, type GBPLocation } from '@/lib/google'

export interface GBPAccountWithLocations {
  account: GBPAccount
  locations: GBPLocation[]
}

/**
 * Fetch GBP accounts and their locations for a client using the pending access token.
 */
export async function fetchGBPLocationsForClient(
  clientId: string
): Promise<{ success: true; data: GBPAccountWithLocations[] } | { success: false; error: string }> {
  const supabase = createAdminClient()

  const { data: conn } = await supabase
    .from('channel_connections')
    .select('access_token')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!conn?.access_token) {
    return { success: false, error: 'No pending Google Business Profile connection found' }
  }

  try {
    const accounts = await listGBPAccounts(conn.access_token)
    const result: GBPAccountWithLocations[] = []
    for (const account of accounts) {
      try {
        const locations = await listGBPLocations(conn.access_token, account.name)
        result.push({ account, locations })
      } catch (err) {
        // If one account fails, skip it but keep going
        console.error('[gbp] Failed to list locations for account', account.name, err)
        result.push({ account, locations: [] })
      }
    }
    return { success: true, data: result }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Failed to list accounts' }
  }
}

/**
 * Finalize the GBP connection by picking a location.
 */
export async function finalizeGBPConnection(
  clientId: string,
  accountName: string,
  location: GBPLocation
): Promise<{ success: true } | { success: false; error: string }> {
  const supabase = createAdminClient()

  const { data: pending } = await supabase
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at, scopes, connected_by')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('platform_account_id', 'pending')
    .maybeSingle()

  if (!pending) {
    return { success: false, error: 'No pending connection to finalize' }
  }

  const address = [
    location.addressLines?.join(', '),
    location.locality,
    location.regionCode,
    location.postalCode,
  ].filter(Boolean).join(', ')

  // Delete any existing row for this exact location (handles reconnects),
  // then insert. Avoids the expression-index ON CONFLICT mismatch.
  await supabase
    .from('channel_connections')
    .delete()
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('platform_account_id', location.name)

  const { error: insertErr } = await supabase
    .from('channel_connections')
    .insert({
      client_id: clientId,
      channel: 'google_business_profile',
      connection_type: 'oauth',
      platform_account_id: location.name, // "locations/123456"
      platform_account_name: location.title,
      access_token: pending.access_token,
      refresh_token: pending.refresh_token,
      token_expires_at: pending.token_expires_at,
      scopes: pending.scopes,
      status: 'active',
      connected_by: pending.connected_by,
      connected_at: new Date().toISOString(),
      metadata: {
        account_name: accountName,
        location_id: location.name,
        location_title: location.title,
        store_code: location.storeCode,
        address,
        primary_phone: location.primaryPhone,
        website: location.websiteUri,
        category: location.primaryCategory,
      },
    })

  if (insertErr) {
    return { success: false, error: insertErr.message }
  }

  // Also write a row to gbp_connections so existing dashboard queries see it
  await supabase
    .from('gbp_connections')
    .upsert({
      client_id: clientId,
      location_id: location.name,
      location_name: location.title,
      address,
      connection_type: 'api',
      access_token: pending.access_token,
      last_sync_at: null,
      sync_status: 'pending',
    }, { onConflict: 'client_id,location_id' })

  // Delete pending placeholder
  await supabase.from('channel_connections').delete().eq('id', pending.id)

  return { success: true }
}
