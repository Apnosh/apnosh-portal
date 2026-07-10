/**
 * /api/dashboard/why-signals — the SMALL bundle of real signals the campaign store's
 * product page uses to personalize its "why this, for you" line.
 *
 * Sources are the EXISTING readers, never new math:
 *  - views/actions: getGbpAnalytics over gbp_metrics (same read as insights-detail)
 *  - rating: gbp_locations.place_rating / place_rating_count from the Places sync
 *    (the authoritative rating source)
 *  - unreplied reviews: the reviews table's response_text state (the inbox's definition)
 *  - listingGaps: getListingHealth's failed profile-field checks, phrased as plain nouns
 *
 * HONESTY: a field with no data is OMITTED, never zero-filled — the UI must not be able
 * to read an absent measurement as a real one. Every sub-read is best-effort and parallel;
 * one failing just leaves its fields out.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getGbpAnalytics } from '@/lib/dashboard/get-gbp-analytics'
import { getListingHealth } from '@/lib/dashboard/get-listing-health'
import { createAdminClient } from '@/lib/supabase/admin'
import type { WhySignals } from '@/lib/campaigns/data/why-for'

export const maxDuration = 15

/** Failed profile-field checks -> the plain nouns the why line can name. Review-side
 *  checks (rating, replies) are deliberately excluded — those signals ride separately. */
const GAP_NOUN: Record<string, string> = {
  hours: 'hours',
  category: 'a category',
  description: 'a description',
  website: 'a website link',
  phone: 'a phone number',
  menu: 'a menu',
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  const [gbp, locs, unreplied, health] = await Promise.allSettled([
    getGbpAnalytics(clientId, '30d'),
    admin.from('gbp_locations').select('place_rating, place_rating_count, is_primary').eq('client_id', clientId),
    admin.from('reviews').select('id', { count: 'exact', head: true }).eq('client_id', clientId).is('response_text', null),
    getListingHealth(clientId),
  ])

  const signals: WhySignals = {}

  if (gbp.status === 'fulfilled' && gbp.value) {
    const t = gbp.value.totals
    // Zero impressions across 30 days = no data flowing (a dead or unconnected listing),
    // not a real measurement — omit both fields rather than personalize on a hollow zero.
    if (t.impressions > 0) {
      signals.views30d = t.impressions
      signals.actions30d = { directions: t.directions ?? 0, calls: t.calls ?? 0, websiteClicks: t.websiteClicks ?? 0 }
    }
  }

  if (locs.status === 'fulfilled') {
    const rows = (locs.value.data ?? []) as { place_rating: number | null; place_rating_count: number | null; is_primary?: boolean }[]
    const loc = rows.find((l) => l.is_primary) ?? rows[0]
    if (loc?.place_rating != null && loc.place_rating > 0) signals.rating = loc.place_rating
    if (loc?.place_rating_count != null && loc.place_rating_count > 0) signals.ratingCount = loc.place_rating_count
  }

  // Only meaningful when reviews are actually synced (ratingCount present says they exist);
  // a count of 0 unreplied is a real, useful measurement then.
  if (unreplied.status === 'fulfilled' && typeof unreplied.value.count === 'number' && signals.ratingCount != null) {
    signals.unrepliedReviews = unreplied.value.count
  }

  if (health.status === 'fulfilled' && health.value.connected) {
    const gaps = health.value.checks
      .filter((c) => c.status === 'fail' && GAP_NOUN[c.key])
      .map((c) => GAP_NOUN[c.key])
    if (gaps.length) signals.listingGaps = gaps
  }

  return NextResponse.json(signals)
}
