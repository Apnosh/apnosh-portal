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
  const [unansweredReviews, pendingApprovals] = await Promise.all([
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
  ])

  return NextResponse.json(
    {
      counts: {
        unansweredReviews: unansweredReviews.count ?? 0,
        pendingApprovals: pendingApprovals.count ?? 0,
      },
    },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
