/**
 * GET /api/campaigns/recommend?clientId=… — AI-ranked campaign recommendations
 * for the discovery feed. Runs the same planning brain as the plan builder:
 * assembles the restaurant's live signals + goal, then an Opus call ranks the
 * prebuilt plays (best first) with a grounded "why this fits you" reason. The
 * deterministic goal-anchored ranker is the fallback, so the feed always has
 * recommendations. Returns ordered { id, reason }; the client maps them onto the
 * local CAMPAIGN_TEMPLATES catalog.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'
import { assemblePlanningContext, fallbackPlanningContext } from '@/lib/campaigns/planning/context'
import { recommendPlays, rulesRecommend, type UpcomingMoment } from '@/lib/campaigns/planning/recommend-plays'
import type { PlanRequest } from '@/lib/campaigns/planning/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

function planLabel(days: number): string {
  if (days <= 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days < 7) return `in ${days} days`
  if (days < 14) return 'next week'
  return `in ${Math.round(days / 7)} weeks`
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  // Next high-weight marketing moment (announcements like Independence Day).
  const mt = getMarketingCalendar(new Date(), 35).find((x) => daysUntil(x.date) >= 0 && daysUntil(x.date) <= 28 && x.weight >= 3)
  const moment: UpcomingMoment | undefined = mt ? { label: mt.label, daysLabel: planLabel(daysUntil(mt.date)) } : undefined

  const request: PlanRequest = { intent: 'full-plan', budgetMonthly: 0, spec: {} }
  try {
    const ctx = await assemblePlanningContext(clientId, request)
    const { recommended, source } = await recommendPlays(ctx, moment)
    return NextResponse.json({ recommended, source })
  } catch {
    // Never empty: rank deterministically off a minimal context.
    const recommended = rulesRecommend(fallbackPlanningContext(clientId, request), moment)
    return NextResponse.json({ recommended, source: 'rules' })
  }
}
