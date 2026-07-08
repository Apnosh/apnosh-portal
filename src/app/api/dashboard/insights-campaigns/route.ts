/**
 * /api/dashboard/insights-campaigns — the active (shipped) campaigns that work on
 * each funnel stage, so the Insights page can show "campaigns working on this"
 * under each stage's graph. Client-keyed and lazy-fetched, mirroring insights-detail.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getStageCampaigns } from '@/lib/dashboard/get-stage-campaigns'

export const maxDuration = 15

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const stages = await getStageCampaigns(clientId)
  return NextResponse.json({ stages })
}
