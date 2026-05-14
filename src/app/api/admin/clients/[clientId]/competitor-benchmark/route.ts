/**
 * Competitor benchmark: nearby restaurants in the same primary
 * category as the client, with rating + review count side-by-side.
 *
 * Uses Google Places API (New) Nearby Search when PLACES_API_KEY is
 * configured. Returns requiresSetup=true when it isn't, so the UI
 * surfaces a self-serve "enable + paste key" prompt instead of an
 * opaque error. Strategist-only.
 */

import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { getClientListing } from '@/lib/gbp-listing'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

interface PlaceResult {
  displayName?: { text: string }
  rating?: number
  userRatingCount?: number
  location?: { latitude: number; longitude: number }
  formattedAddress?: string
  primaryType?: string
}

export async function GET(_req: Request, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params

  const server = await createServerClient()
  const { data: { user } } = await server.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (!profile || !['admin', 'super_admin', 'team_member'].includes(profile.role as string)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const apiKey = process.env.PLACES_API_KEY
  if (!apiKey) {
    return NextResponse.json({
      rows: [],
      requiresSetup: true,
      projectId: process.env.GCP_PROJECT_ID ?? 'apnosh-portal',
    })
  }

  /* Pull the client's listing for category + location. */
  const listingRes = await getClientListing(clientId).catch(() => null)
  if (!listingRes?.ok) {
    return NextResponse.json({ error: 'Could not read client listing' }, { status: 502 })
  }
  const fields = listingRes.fields
  const primaryCategory = fields.categories?.primary?.displayName ?? 'Restaurant'

  /* Read lat/lng from channel_connections metadata. The OAuth
     finalize stores the address; we need coords. Try gbp_locations
     first (often has lat/lng), then fall back to geocoding the
     address via Places. */
  const { data: gbpLoc } = await admin
    .from('gbp_locations')
    .select('latitude, longitude, location_name, address')
    .eq('client_id', clientId)
    .limit(1)
    .maybeSingle()

  let lat = (gbpLoc?.latitude as number | null) ?? null
  let lng = (gbpLoc?.longitude as number | null) ?? null

  if (!lat || !lng) {
    /* Best-effort geocode via Places Text Search. */
    const addressGuess = (gbpLoc?.address as string | undefined) ?? ''
    if (addressGuess) {
      try {
        const geo = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'places.location',
          },
          body: JSON.stringify({ textQuery: addressGuess }),
        })
        const body = await geo.json() as { places?: PlaceResult[] }
        const loc = body.places?.[0]?.location
        if (loc) { lat = loc.latitude; lng = loc.longitude }
      } catch { /* swallow — handled by null check below */ }
    }
  }

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Could not determine client location coordinates' }, { status: 502 })
  }

  /* Nearby search for restaurants in the same primary category. */
  const searchRes = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': apiKey,
      'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.location,places.formattedAddress,places.primaryType',
    },
    body: JSON.stringify({
      includedTypes: ['restaurant'],
      maxResultCount: 10,
      locationRestriction: {
        circle: { center: { latitude: lat, longitude: lng }, radius: 2500 },
      },
    }),
  })
  const searchBody = await searchRes.json() as { places?: PlaceResult[]; error?: { message: string } }
  if (!searchRes.ok) {
    return NextResponse.json({ error: searchBody.error?.message || `Places API HTTP ${searchRes.status}` }, { status: 502 })
  }

  const places = searchBody.places ?? []
  const clientName = (gbpLoc?.location_name as string | undefined) ?? ''
  const rows = places.map(p => {
    const name = p.displayName?.text ?? 'Unknown'
    const isClient = clientName && name.toLowerCase().includes(clientName.toLowerCase().slice(0, 12))
    const placeLat = p.location?.latitude ?? 0
    const placeLng = p.location?.longitude ?? 0
    const distanceM = haversine(lat!, lng!, placeLat, placeLng)
    return {
      name,
      rating: p.rating ?? null,
      reviewCount: p.userRatingCount ?? null,
      distance: distanceM < 1000 ? `${Math.round(distanceM)} m` : `${(distanceM / 1000).toFixed(1)} km`,
      isClient,
      notes: isClient ? `Primary category: ${primaryCategory}` : '',
    }
  })

  /* Sort: client first, then by rating × reviewCount log-scaled. */
  rows.sort((a, b) => {
    if (a.isClient) return -1
    if (b.isClient) return 1
    const scoreA = (a.rating ?? 0) * Math.log10((a.reviewCount ?? 0) + 1)
    const scoreB = (b.rating ?? 0) * Math.log10((b.reviewCount ?? 0) + 1)
    return scoreB - scoreA
  })

  return NextResponse.json({ rows: rows.slice(0, 10) })
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}
