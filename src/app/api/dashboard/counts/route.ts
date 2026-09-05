/**
 * GET /api/dashboard/counts?clientId=...
 *
 * Tiny sibling of /api/dashboard/load that returns ONLY the sidebar /
 * tab-bar badge counts. The dashboard layout polls badge counts on every
 * page and on a 60s interval; pointing that at the full 20-query load
 * endpoint made every navigation pay for the whole dashboard payload.
 * This endpoint runs two count-only queries instead.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const admin = createAdminClient()
  /* The More hub's three numbers ride along (portal redesign 2026-09-04): what is
     connected, what is live, and the Google rating. All count-only or one tiny row. */
  const [unansweredReviews, pendingApprovals, channels, socials, liveCampaigns, ratingRow, googleReviews] = await Promise.all([
    admin
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('response_text', null),
    admin
      .from('deliverables')
      .select('id', { count: 'exact', head: true })
      .eq('business_id', clientId)
      .eq('status', 'client_review'),
    admin.from('channel_connections').select('id', { count: 'exact', head: true }).eq('client_id', clientId).in('status', ['active', 'connected']),
    admin.from('social_connections').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
    admin.from('campaigns').select('id', { count: 'exact', head: true }).eq('client_id', clientId).eq('status', 'shipped'),
    admin.from('review_metrics').select('rating_avg').eq('client_id', clientId).eq('platform', 'google').not('rating_avg', 'is', null).order('date', { ascending: false }).limit(1).maybeSingle(),
    admin.from('reviews').select('rating').eq('client_id', clientId).eq('source', 'google').not('rating', 'is', null).limit(500),
  ])
  const ratings = (googleReviews.data ?? []).map((r) => Number(r.rating)).filter((n) => Number.isFinite(n) && n > 0)
  const rating = typeof ratingRow.data?.rating_avg === 'number' ? ratingRow.data.rating_avg : ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null

  return NextResponse.json(
    {
      counts: {
        unansweredReviews: unansweredReviews.count ?? 0,
        pendingApprovals: pendingApprovals.count ?? 0,
        connected: (channels.count ?? 0) + (socials.count ?? 0),
        liveCampaigns: liveCampaigns.count ?? 0,
        rating,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
