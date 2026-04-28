'use server'

import { createClient } from '@/lib/supabase/server'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'

export type { ClientLocation } from '@/lib/dashboard/location-helpers'

/**
 * Returns the active locations for a client, ordered with the primary first.
 * Used by the LocationSelector and the Locations scoreboard page.
 *
 * For pure helpers like locationLabel() see src/lib/dashboard/location-helpers.ts.
 */
export async function getClientLocations(clientId: string): Promise<ClientLocation[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('client_locations')
    .select('id, location_name, city, state, full_address, is_primary, is_active, gbp_location_id')
    .eq('client_id', clientId)
    .order('is_primary', { ascending: false })
    .order('location_name', { ascending: true })

  const fromClient = (data ?? []).filter(l => l.is_active !== false) as ClientLocation[]
  if (fromClient.length > 0) return fromClient

  // Fallback: derive locations from gbp_locations when client_locations is
  // empty. Many clients are GBP-only and never had separate client_locations
  // rows backfilled. Without this fallback the Locations page shows "No
  // locations" even though we have a fully assigned GBP listing.
  const { data: gbp } = await supabase
    .from('gbp_locations')
    .select('id, location_name, address, gbp_location_id')
    .eq('client_id', clientId)
    .eq('status', 'assigned')
    .order('created_at', { ascending: true })

  return (gbp ?? []).map((l, idx) => ({
    id: l.id as string,
    location_name: (l.location_name as string) ?? 'Primary location',
    city: null,
    state: null,
    full_address: (l.address as string | null) ?? null,
    is_primary: idx === 0,
    is_active: true,
    gbp_location_id: (l.gbp_location_id as string | null) ?? null,
  }))
}
