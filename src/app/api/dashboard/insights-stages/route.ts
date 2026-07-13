/**
 * /api/dashboard/insights-stages — just the honest funnel stages for a window.
 *
 * A LIGHT sibling of insights-detail: the Insights range chips (Last 7 days /
 * 30 days / Last year) hit this so the "Views by source" cards re-scope to the
 * picked window without refetching the whole heavy detail payload. Same honest
 * numbers (computeStages), best-effort, never throws.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { computeStages, type InsightsWindow } from '@/lib/insights/compute-stages'

export const maxDuration = 15

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const rp = req.nextUrl.searchParams.get('window')
  const window: InsightsWindow = rp === '7d' || rp === '90d' || rp === '12m' ? rp : '30d'

  try {
    const stages = await computeStages(clientId, window)
    return NextResponse.json({ window, stages })
  } catch {
    return NextResponse.json({ window, stages: [] })
  }
}
