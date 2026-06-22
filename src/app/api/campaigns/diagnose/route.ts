/**
 * POST /api/campaigns/diagnose — Part 1 of the AI Marketing Plan Builder.
 *
 * Body: { clientId, goalKey?, occasion?, targetDate?, intent?, budgetMonthly? }
 * Assembles the live PlanningContext and runs the Strategist (Diagnose): one
 * Opus call → a binding constraint + a bet + what to skip, with a deterministic
 * rules fallback so a diagnosis always renders (tagged in `source`). The model
 * never emits a price or a serviceId here — budget enters at Part 2 (Select).
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { assemblePlanningContext, fallbackPlanningContext } from '@/lib/campaigns/planning/context'
import { diagnose, rulesDiagnosis } from '@/lib/campaigns/planning/diagnose'
import type { PlanRequest } from '@/lib/campaigns/planning/types'

export const maxDuration = 30

const INTENTS: PlanRequest['intent'][] = ['full-plan', 'one-off', 'ongoing', 'single-item']
const GOAL_KEYS = ['regulars', 'new-customers', 'slow-nights', 'reviews']

export async function POST(req: NextRequest) {
  let body: Record<string, unknown> = {}
  try { body = (await req.json()) as Record<string, unknown> } catch { /* empty body is fine */ }

  const clientId = typeof body.clientId === 'string' ? body.clientId : null
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  const request: PlanRequest = {
    intent: INTENTS.includes(body.intent as PlanRequest['intent']) ? (body.intent as PlanRequest['intent']) : 'full-plan',
    budgetMonthly: typeof body.budgetMonthly === 'number' ? body.budgetMonthly : 0,
    goalKey: GOAL_KEYS.includes(body.goalKey as string) ? (body.goalKey as PlanRequest['goalKey']) : undefined,
    occasion: typeof body.occasion === 'string' ? body.occasion : undefined,
    targetDate: typeof body.targetDate === 'string' ? body.targetDate : undefined,
    spec: body.spec && typeof body.spec === 'object' ? (body.spec as Record<string, string>) : {},
  }

  try {
    const ctx = await assemblePlanningContext(clientId, request)
    const result = await diagnose(ctx)
    return NextResponse.json(result) // { diagnosis, source }
  } catch {
    // Never dead-end: a diagnosis must always render (spec §1). Even if assembly
    // itself threw, return a minimal deterministic diagnosis rather than a 500.
    const diagnosis = rulesDiagnosis(fallbackPlanningContext(clientId, request))
    return NextResponse.json({ diagnosis, source: 'rules' })
  }
}
