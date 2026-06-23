/**
 * GET /api/campaigns/recommend-items?clientId=… — AI recommendations for the
 * CREATE page's own campaign catalog (the items in the builder). Runs the same
 * planning brain (signals + goal) and ranks the catalog items best-first with a
 * grounded reason. Goal-anchored rules ranker is the fallback. Returns ordered
 * { id, reason }; the builder maps them onto its catalog ("Suggested for you").
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getMarketingCalendar, daysUntil } from '@/lib/dashboard/marketing-calendar'
import { assemblePlanningContext, fallbackPlanningContext } from '@/lib/campaigns/planning/context'
import { recommendCreateItems, rulesRecommend } from '@/lib/campaigns/planning/recommend-create-items'
import type { UpcomingMoment } from '@/lib/campaigns/planning/recommend-plays'
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

  const mt = getMarketingCalendar(new Date(), 35).find((x) => daysUntil(x.date) >= 0 && daysUntil(x.date) <= 28 && x.weight >= 3)
  const moment: UpcomingMoment | undefined = mt ? { label: mt.label, daysLabel: planLabel(daysUntil(mt.date)) } : undefined

  const request: PlanRequest = { intent: 'full-plan', budgetMonthly: 0, spec: {} }
  try {
    const ctx = await assemblePlanningContext(clientId, request)
    const { recommended, source } = await recommendCreateItems(ctx, moment)
    return NextResponse.json({ recommended, source })
  } catch {
    return NextResponse.json({ recommended: rulesRecommend(fallbackPlanningContext(clientId, request), moment), source: 'rules' })
  }
}
