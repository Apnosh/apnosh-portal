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

  return (data ?? []).filter(l => l.is_active !== false) as ClientLocation[]
}
