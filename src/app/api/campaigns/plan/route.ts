/**
 * POST /api/campaigns/plan — the full AI Marketing Plan Builder (Parts 1+2+5).
 *
 * Body: { clientId, budgetMonthly?, goalKey?, occasion? }
 * Diagnoses the binding constraint, selects + prices a real plan from the closed
 * catalog, validates it, and returns it as a CampaignDraft plus the strategy:
 *   { diagnosis, diagnosisSource, selectionSource, draft, budgetGap?, unlock, excluded, issues }
 * The model never prices (code owns every number). The owner saves the returned
 * draft via the existing POST /api/campaigns.
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { buildPlan } from '@/lib/campaigns/planning/build-plan'
import type { PlanRequest } from '@/lib/campaigns/planning/types'

export const maxDuration = 60

const GOAL_KEYS = ['regulars', 'new-customers', 'slow-nights', 'reviews']
const DEFAULT_BUDGET = 800

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = (await req.json()) as Record<string, unknown> } catch { /* empty body ok */ }

  const clientId = typeof body.clientId === 'string' ? body.clientId : null
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const budget = typeof body.budgetMonthly === 'number' && body.budgetMonthly > 0 ? Math.round(body.budgetMonthly) : DEFAULT_BUDGET
  const request: PlanRequest = {
    intent: 'full-plan',
    budgetMonthly: budget,
    goalKey: GOAL_KEYS.includes(body.goalKey as string) ? (body.goalKey as PlanRequest['goalKey']) : undefined,
    occasion: typeof body.occasion === 'string' ? body.occasion : undefined,
    spec: {},
  }

  try {
    const plan = await buildPlan(clientId, request)
    return NextResponse.json(plan)
  } catch {
    return NextResponse.json({ error: 'plan failed' }, { status: 500 })
  }
}
