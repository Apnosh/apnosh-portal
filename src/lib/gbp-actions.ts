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
    .eq('platform_account_id', `${accountName}/${location.name}`)

  /* Store the full resource name "accounts/{a}/locations/{l}". The
     publish pipeline (publishToGbp), reviews reply endpoint, and
     listing editor all expect that shape — older code stored just
     "locations/{l}" which 404s on every v4 endpoint and on the
     listing-edit PATCH. */
  const fullResourceName = `${accountName}/${location.name}`

  const { error: insertErr } = await supabase
    .from('channel_connections')
    .insert({
      client_id: clientId,
      channel: 'google_business_profile',
      connection_type: 'oauth',
      platform_account_id: fullResourceName,
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

  /* Also stamp the linked location into gbp_locations so the daily
     sync and backfill both pick it up immediately. Otherwise the
     client_locations entry exists but gbp_locations is empty until
     the first sync runs. */
  const storeCode = location.name.replace('locations/', '')
  await supabase
    .from('gbp_locations')
    .upsert({
      store_code: storeCode,
      location_name: location.title,
      client_id: clientId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'store_code' })

  /* Kick off the 18-month historical backfill in the background so a
     brand-new client sees a full trend chart on their first visit to
     the Overview / Full analytics pages instead of just the 7 days the
     daily sync would catch. Fire-and-forget — we don't block the
     redirect on it (takes 30-90 seconds for 18 months × N locations). */
  void (async () => {
    try {
      const { backfillClientGbpMetrics } = await import('@/lib/gbp-backfill')
      await backfillClientGbpMetrics(clientId, 18)
    } catch (err) {
      console.error('[finalizeGBPConnection] auto-backfill failed:', (err as Error).message)
    }
  })()

  return { success: true }
}

/**
 * List the titles of every GBP location currently linked for this client.
 * Used by the picker to pre-mark already-connected locations.
 */
export async function getLinkedGBPLocationTitles(clientId: string): Promise<string[]> {
  const supabase = createAdminClient()
  const { data } = await supabase
    .from('channel_connections')
    .select('platform_account_name')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .neq('platform_account_id', 'pending')
  return (data ?? []).map(r => r.platform_account_name).filter((s): s is string => !!s)
}

/**
 * Finalize the GBP connection across MULTIPLE selected locations.
 *
 * Shares one pending OAuth row across every pick (same tokens, same
 * connected_by), inserts one channel_connections row per location,
 * upserts gbp_connections + gbp_locations rows, then deletes the
 * pending placeholder and kicks off a single backfill that covers
 * every newly-linked location.
 */
export async function finalizeGBPConnections(
  clientId: string,
  picks: Array<{ accountName: string; location: GBPLocation }>,
): Promise<{ success: true; linked: number } | { success: false; error: string }> {
  if (picks.length === 0) {
    return { success: false, error: 'No locations selected' }
  }
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

  let linked = 0
  const errors: string[] = []
  for (const { accountName, location } of picks) {
    const address = [
      location.addressLines?.join(', '),
      location.locality,
      location.regionCode,
      location.postalCode,
    ].filter(Boolean).join(', ')
    const fullResourceName = `${accountName}/${location.name}`

    /* Same delete-then-insert dance as the single-pick path to avoid
       the expression-index ON CONFLICT mismatch on reconnects. */
    await supabase
      .from('channel_connections')
      .delete()
      .eq('client_id', clientId)
      .eq('channel', 'google_business_profile')
      .eq('platform_account_id', fullResourceName)

    const { error: insertErr } = await supabase
      .from('channel_connections')
      .insert({
        client_id: clientId,
        channel: 'google_business_profile',
        connection_type: 'oauth',
        platform_account_id: fullResourceName,
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
      errors.push(`${location.title}: ${insertErr.message}`)
      continue
    }

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

    const storeCode = location.name.replace('locations/', '')
    await supabase
      .from('gbp_locations')
      .upsert({
        store_code: storeCode,
        location_name: location.title,
        client_id: clientId,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'store_code' })

    linked++
  }

  await supabase.from('channel_connections').delete().eq('id', pending.id)

  if (linked === 0) {
    return { success: false, error: `Failed to link any locations. ${errors.join('; ')}` }
  }

  /* Single backfill covers every location we just linked. */
  void (async () => {
    try {
      const { backfillClientGbpMetrics } = await import('@/lib/gbp-backfill')
      await backfillClientGbpMetrics(clientId, 18)
    } catch (err) {
      console.error('[finalizeGBPConnections] auto-backfill failed:', (err as Error).message)
    }
  })()

  return { success: true, linked }
}
