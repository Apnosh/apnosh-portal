/**
 * Pure helpers and types for client locations. Importable from client and
 * server code alike (no 'use server' directive, no Next.js server-only APIs).
 *
 * The server action that actually loads locations lives in get-client-locations.ts.
 */

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
 * Human-friendly display string for a location.
 */
export function locationLabel(loc: ClientLocation): string {
  if (loc.location_name) return loc.location_name
  if (loc.city && loc.state) return `${loc.city}, ${loc.state}`
  if (loc.city) return loc.city
  if (loc.full_address) return loc.full_address
  return 'Unnamed location'
}
