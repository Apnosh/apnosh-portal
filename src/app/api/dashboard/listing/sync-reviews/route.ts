/**
 * /api/dashboard/listing/sync-reviews — on-demand review refresh for the
 * signed-in owner's own client. Same work the nightly cron does, but gated
 * by the user session instead of CRON_SECRET so the owner can trigger it
 * from the dashboard. Reads from Google + Places and writes to our DB; does
 * NOT write anything to the live Google listing.
 */

import { NextResponse } from 'next/server'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { syncClientGbp } from '@/lib/gbp-client-sync'
import { syncPlacesReviewsForClient } from '@/lib/places-reviews'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

export async function POST() {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  let reviewsImported = 0
  let metricsImported = 0
  let gbpError: string | null = null
  try {
    const r = await syncClientGbp(clientId)
    reviewsImported = r.reviewsImported
    metricsImported = r.metricsImported
    if (!r.ok) gbpError = r.message ?? 'Sync failed'
  } catch (err) {
    gbpError = (err as Error).message
  }

  // Places fallback (overall rating + recent reviews). Never throws.
  const places = await syncPlacesReviewsForClient(clientId)

  return NextResponse.json({
    ok: true,
    reviewsImported,
    metricsImported,
    placesRating: places?.rating ?? null,
    placesReviews: places?.reviewsUpserted ?? 0,
    // Surface the v4 error (e.g. token/permission) without failing the call,
    // since the Places fallback may still have populated a rating.
    warning: gbpError,
  })
}
