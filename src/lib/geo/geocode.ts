/**
 * WHERE THE RESTAURANT ACTUALLY IS.
 * =================================
 * Everything about the boost screen's location was city-shaped: search a city,
 * draw a radius from its centre, target `cities` with a radius. For a restaurant
 * in West Seattle that is wrong twice over. The circle is centred on downtown,
 * about five miles from their door, and the picture we drew of it said "Seattle"
 * with no way to see whether their own street was even inside it.
 *
 * Meta can target a POINT: `customLocations` is a lat/lng plus a radius, and the
 * schema says it is honoured on Meta. So the fix was never a better drawing, it
 * was better coordinates.
 *
 * NOMINATIM, CACHED FOREVER. OpenStreetMap's geocoder, no key required, and
 * their usage policy asks for a real User-Agent and light traffic -- so this
 * runs once per client and the answer is written to client_locations, which has
 * had latitude and longitude columns and no rows in it since 2024.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface Coords { lat: number; lng: number; label: string }

const UA = 'Apnosh/1.0 (portal.apnosh.com; restaurant marketing portal)'

/** Ask OpenStreetMap once. Null rather than a throw: no boost may depend on it. */
async function askNominatim(query: string): Promise<Coords | null> {
  try {
    const u = new URL('https://nominatim.openstreetmap.org/search')
    u.searchParams.set('q', query)
    u.searchParams.set('format', 'jsonv2')
    u.searchParams.set('limit', '1')
    u.searchParams.set('addressdetails', '0')
    const r = await fetch(u, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    if (!r.ok) return null
    const rows = (await r.json()) as Array<{ lat?: string; lon?: string; display_name?: string }>
    const hit = rows?.[0]
    const lat = Number(hit?.lat), lng = Number(hit?.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, label: String(hit?.display_name ?? query) }
  } catch { return null }
}

/**
 * The client's own coordinates: stored if we have them, looked up once if not.
 *
 * Prefers the full street address, because the point of this is the door and not
 * the city hall. Falls back to whatever address-shaped text exists, which for one
 * of these two clients is the bare word "Seattle" sitting in the address column.
 */
export async function coordsForClient(clientId: string): Promise<Coords | null> {
  const admin = createAdminClient()

  const { data: loc } = await admin.from('client_locations')
    .select('id, latitude, longitude, full_address, street, city, state, zip')
    .eq('client_id', clientId).order('is_primary', { ascending: false }).limit(1).maybeSingle()

  if (loc?.latitude != null && loc?.longitude != null) {
    return { lat: Number(loc.latitude), lng: Number(loc.longitude), label: String(loc.full_address ?? loc.city ?? '') }
  }

  const { data: biz } = await admin.from('businesses')
    .select('name, address, city, state, zip').eq('client_id', clientId).maybeSingle()

  const parts = [
    String(loc?.street ?? '') || String(biz?.address ?? ''),
    String(loc?.city ?? '') || String(biz?.city ?? ''),
    String(loc?.state ?? '') || String(biz?.state ?? ''),
    String(loc?.zip ?? '') || String(biz?.zip ?? ''),
  ].map((p) => p.trim()).filter(Boolean)
  if (!parts.length) return null

  const found = await askNominatim(parts.join(', '))
  if (!found) return null

  /* Written back, so this is one lookup per client for the life of the account.
     That is what OpenStreetMap asks of anyone using it for free, and it also
     means the map draws instantly on every visit after the first. */
  try {
    if (loc?.id) {
      await admin.from('client_locations').update({ latitude: found.lat, longitude: found.lng }).eq('id', loc.id)
    } else {
      await admin.from('client_locations').insert({
        client_id: clientId,
        full_address: parts.join(', '),
        street: parts[0] || null,
        city: String(loc?.city ?? biz?.city ?? '') || null,
        state: String(loc?.state ?? biz?.state ?? '') || null,
        zip: String(loc?.zip ?? biz?.zip ?? '') || null,
        latitude: found.lat, longitude: found.lng,
      })
    }
  } catch { /* the coordinates are still usable for this request */ }

  return found
}
