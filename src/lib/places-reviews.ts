/**
 * Google Places API reviews stopgap.
 *
 * The legacy Google My Business API (v4) — the only Google API that serves
 * review *management* — is disabled for our project (Google has it locked
 * behind a manual grant we've requested). Until that lands, the Places API
 * (already enabled) gives a read-only view: a place's overall star rating,
 * total rating count, and up to ~5 recent reviews.
 *
 * Flow per client: resolve the Places place id from the GBP listing's
 * name + address (cached on gbp_locations.place_id after the first lookup),
 * fetch the place's rating + recent reviews, store the headline rating on
 * gbp_locations, and upsert the reviews into local_reviews.
 *
 * Limits vs. the real API: read-only (no replying), ~5 reviews max, and the
 * rating is Google's overall number (not sliceable by period).
 */

import { createAdminClient } from '@/lib/supabase/admin'

const PLACES_KEY = process.env.GOOGLE_PLACES_API_KEY || process.env.NEXT_PUBLIC_GOOGLE_PLACES_KEY

interface PlaceReviewRow {
  external_id: string
  external_url: string | null
  reviewer_name: string | null
  reviewer_avatar_url: string | null
  reviewer_is_local_guide: boolean
  rating: number
  text: string | null
  language: string | null
  created_at_platform: string
}

interface PlaceData {
  rating: number | null
  count: number | null
  address: string | null
  reviews: PlaceReviewRow[]
}

/** Resolve a place id from a free-text "name address" query. Returns the id
 *  plus headline rating so callers can verify the match before trusting it. */
export async function resolvePlaceId(
  name: string, address?: string | null,
): Promise<{ id: string; rating: number | null; count: number | null; address: string | null } | null> {
  if (!PLACES_KEY) return null
  const textQuery = [name, address].filter(Boolean).join(' ').trim()
  if (!textQuery) return null
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'places.id,places.displayName,places.rating,places.userRatingCount,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery, maxResultCount: 1 }),
  })
  if (!res.ok) return null
  const body = await res.json().catch(() => ({})) as {
    places?: Array<{ id?: string; rating?: number; userRatingCount?: number; formattedAddress?: string }>
  }
  const p = body.places?.[0]
  if (!p?.id) return null
  return { id: p.id, rating: p.rating ?? null, count: p.userRatingCount ?? null, address: p.formattedAddress ?? null }
}

/** Fetch a place's overall rating + up to ~5 recent reviews. */
export async function fetchPlaceData(placeId: string): Promise<PlaceData | null> {
  if (!PLACES_KEY) return null
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: {
      'X-Goog-Api-Key': PLACES_KEY,
      'X-Goog-FieldMask': 'rating,userRatingCount,formattedAddress,reviews',
    },
  })
  if (!res.ok) return null
  const b = await res.json().catch(() => ({})) as {
    rating?: number; userRatingCount?: number; formattedAddress?: string
    reviews?: Array<{
      name?: string; rating?: number; publishTime?: string; googleMapsUri?: string
      text?: { text?: string; languageCode?: string }
      originalText?: { text?: string }
      authorAttribution?: { displayName?: string; photoUri?: string }
    }>
  }
  const reviews: PlaceReviewRow[] = (b.reviews ?? [])
    .map((r): PlaceReviewRow => ({
      external_id: r.name || `${placeId}:${r.publishTime ?? ''}`,
      external_url: r.googleMapsUri ?? null,
      reviewer_name: r.authorAttribution?.displayName ?? null,
      reviewer_avatar_url: r.authorAttribution?.photoUri ?? null,
      reviewer_is_local_guide: false,
      rating: Math.round(r.rating ?? 0),
      text: r.text?.text ?? r.originalText?.text ?? null,
      language: r.text?.languageCode ?? null,
      created_at_platform: r.publishTime ?? new Date().toISOString(),
    }))
    .filter(r => r.rating >= 1 && r.rating <= 5 && !!r.external_id)
  return { rating: b.rating ?? null, count: b.userRatingCount ?? null, address: b.formattedAddress ?? null, reviews }
}

/**
 * Refresh Places rating + recent reviews for one client. Resolves and caches
 * the place id on first run. Returns null when there's nothing to sync (no
 * GBP location, no key, or no public listing). Never throws — callers fold it
 * into a larger sync.
 */
export async function syncPlacesReviewsForClient(
  clientId: string,
): Promise<{ placeId: string; rating: number | null; ratingCount: number | null; reviewsUpserted: number } | null> {
  if (!PLACES_KEY) return null
  try {
    const admin = createAdminClient()
    /* Every location (not just the primary), so multi-location clients get a
       Google rating on each location tab. Skip deliberately-excluded rows. */
    const { data: locs } = await admin
      .from('gbp_locations')
      .select('id, location_name, address, place_id, is_primary')
      .eq('client_id', clientId)
      .neq('status', 'skipped')
      .order('is_primary', { ascending: false })
    const list = (locs ?? []) as Array<{ id: string; location_name: string; address: string | null; place_id: string | null; is_primary: boolean | null }>
    if (!list.length) return null

    let primary: { placeId: string; rating: number | null; ratingCount: number | null } | null = null
    let reviewsUpserted = 0

    for (const loc of list) {
      let placeId = loc.place_id
      if (!placeId) {
        const found = await resolvePlaceId(loc.location_name, loc.address)
        if (!found) continue
        placeId = found.id
      }
      const place = await fetchPlaceData(placeId)
      if (!place) continue

      await admin
        .from('gbp_locations')
        .update({
          place_id: placeId,
          place_rating: place.rating,
          place_rating_count: place.count,
          places_synced_at: new Date().toISOString(),
        })
        .eq('id', loc.id)

      /* Reviews are stored client-level, so pull them once from the primary
         (first) listing only. */
      if (!primary && place.reviews.length) {
        const rows = place.reviews.map(r => ({ client_id: clientId, source: 'gbp', ...r }))
        const { error } = await admin
          .from('local_reviews')
          .upsert(rows, { onConflict: 'client_id,source,external_id', ignoreDuplicates: false })
        if (!error) reviewsUpserted = rows.length
      }
      if (!primary) primary = { placeId, rating: place.rating, ratingCount: place.count }
    }

    return primary ? { ...primary, reviewsUpserted } : null
  } catch (err) {
    console.error('[places-reviews] sync failed for client', clientId, (err as Error).message)
    return null
  }
}
