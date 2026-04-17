'use server'

import { createClient } from '@/lib/supabase/server'

export interface ClientLocation {
  id: string
  location_name: string | null
  city: string | null
  state: string | null
  full_address: string | null
  is_primary: boolean | null
  is_active: boolean | null
  gbp_location_id: string | null
}

/**
 * Returns the active locations for a client, ordered with the primary first.
 * Used by the LocationSelector and the Locations scoreboard page.
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

/**
 * Human-friendly display string for a location.
 */
export function locationLabel(loc: ClientLocation): string {
  if (loc.location_name) return loc.location_name
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`
  if (loc.city) return loc.city
  if (loc.full_address) return loc.full_address
  return 'Unnamed location'
}
