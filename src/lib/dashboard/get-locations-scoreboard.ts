'use server'

import { createClient } from '@/lib/supabase/server'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'

export interface LocationScoreRow {
  location: ClientLocation
  directions: number
  calls: number
  website_clicks: number
  interactions: number
  new_reviews: number
  avg_rating: number | null
}

/**
 * Per-location scoreboard for multi-location clients.
 *
 * For each active location:
 *   - Sums GBP interactions (directions, calls, website clicks) for the current
 *     calendar month
 *   - Counts new reviews in the current calendar month
 *   - Computes the avg rating across those new reviews
 *
 * Locations with no data this month show zeros, which makes it easy to spot
 * underperformers without hiding them.
 */
export async function getLocationsScoreboard(
  clientId: string,
): Promise<LocationScoreRow[]> {
  const supabase = await createClient()
  const locations = await getClientLocations(clientId)
  if (locations.length === 0) return []

  const now = new Date()
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1)
  const startDateStr = formatDate(thisMonthStart)
  const endDateStr = formatDate(now)

  // One wide query per data source -- we'll bucket by location in memory
  const [gbpRes, reviewsRes] = await Promise.all([
    supabase
      .from('gbp_metrics')
      .select('location_id, directions, calls, website_clicks, date')
      .eq('client_id', clientId)
      .gte('date', startDateStr)
      .lte('date', endDateStr),
    supabase
      .from('reviews')
      .select('location_id, rating, created_at')
      .eq('client_id', clientId)
      .gte('created_at', startDateStr),
  ])

  const gbpRows = (gbpRes.data ?? []) as Array<{
    location_id: string | null
    directions: number | null
    calls: number | null
    website_clicks: number | null
  }>
  const reviewRows = (reviewsRes.data ?? []) as Array<{
    location_id: string | null
    rating: number
  }>

  // Bucket GBP rows by gbp_location_id → aggregate
  const gbpByLoc = new Map<string, { directions: number; calls: number; clicks: number }>()
  for (const row of gbpRows) {
    if (!row.location_id) continue
    const existing = gbpByLoc.get(row.location_id) ?? { directions: 0, calls: 0, clicks: 0 }
    existing.directions += row.directions ?? 0
    existing.calls += row.calls ?? 0
    existing.clicks += row.website_clicks ?? 0
    gbpByLoc.set(row.location_id, existing)
  }

  // Bucket reviews by client_locations.id (already the FK)
  const reviewsByLoc = new Map<string, { count: number; ratingSum: number }>()
  for (const r of reviewRows) {
    if (!r.location_id) continue
    const existing = reviewsByLoc.get(r.location_id) ?? { count: 0, ratingSum: 0 }
    existing.count += 1
    existing.ratingSum += Number(r.rating)
    reviewsByLoc.set(r.location_id, existing)
  }

  return locations.map(loc => {
    const gbpKey = loc.gbp_location_id ?? ''
    const gbp = gbpByLoc.get(gbpKey) ?? { directions: 0, calls: 0, clicks: 0 }
    const reviews = reviewsByLoc.get(loc.id) ?? { count: 0, ratingSum: 0 }
    const avgRating = reviews.count > 0 ? reviews.ratingSum / reviews.count : null

    return {
      location: loc,
      directions: gbp.directions,
      calls: gbp.calls,
      website_clicks: gbp.clicks,
      interactions: gbp.directions + gbp.calls + gbp.clicks,
      new_reviews: reviews.count,
      avg_rating: avgRating,
    }
  }).sort((a, b) => b.interactions - a.interactions)
}

function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}
