import 'server-only'
/**
 * The planner orchestrator (spec §1 pipeline): assemble context → diagnose →
 * select & price → validate → a real CampaignDraft. Every stage degrades to a
 * deterministic fallback, so buildPlan never throws and a plan always renders.
 */
import type { CampaignBrief, CampaignDraft, LineItem } from '@/lib/campaigns/types'
import { planForBudget, nextUnlock } from '@/lib/campaigns/plan-engine'
import { assemblePlanningContext, fallbackPlanningContext } from './context'
import { diagnose } from './diagnose'
import { selectAndPrice } from './select'
import { sequencePlan } from './sequence'
import { validatePlan, type PlanIssue } from './validate'
import type { Diagnosis, PlanRequest, PlanningContext } from './types'

export interface BuiltPlan {
  diagnosis: Diagnosis
  diagnosisSource: 'ai' | 'rules'
  selectionSource: 'ai' | 'rules'
  draft: CampaignDraft
  budgetGap?: { needed: number; set: number }
  unlock: { name: string; addlMonthly: number } | null
  excluded: { what: string; why: string }[]
  issues: PlanIssue[]
}

function toDraft(ctx: PlanningContext, d: Diagnosis, items: LineItem[], brief: CampaignBrief): CampaignDraft {
  return {
    id: 'new',
    name: `Plan: ${ctx.business.goal}`,
    intent: 'full-plan',
    path: 'strategist',
    phase: 'review',
    // The owner's chosen monthly ceiling (their pick), per the field's contract —
    // not the recurring subtotal, which would discard a real input.
    budgetMonthly: ctx.request.budgetMonthly,
    items,
    planned: true,
    goalKey: ctx.request.goalKey ?? ctx.business.goalKey,
    targetDate: new Date().toISOString().slice(0, 10), // start anchor for the calendar view
    context: `${d.bindingConstraint} ${d.bet}`.slice(0, 280),
    brief,
  }
}

export async function buildPlan(clientId: string, request: PlanRequest): Promise<BuiltPlan> {
  let ctx: PlanningContext
  try {
    ctx = await assemblePlanningContext(clientId, request)
  } catch {
    ctx = fallbackPlanningContext(clientId, request)
  }

  const { diagnosis, source: diagnosisSource } = await diagnose(ctx)
  let plan = await selectAndPrice(ctx, diagnosis)

  // Validate; if invalid for any reason OTHER than the intentional core budget
  // gap, fall back to the deterministic engine (spec §5: repair → fallback).
  let { ok, issues } = validatePlan(plan.items, request.budgetMonthly)
  if (!ok && !plan.budgetGap) {
    const goal = ctx.request.goalKey ?? ctx.business.goalKey
    const res = planForBudget(request.budgetMonthly, ctx.business.has, goal)
    plan = {
      items: res.items,
      source: 'rules',
      unlock: nextUnlock(request.budgetMonthly, ctx.business.has, goal),
      excluded: diagnosis.skip.map((s) => ({ what: s.what, why: s.why })),
    }
    issues = validatePlan(plan.items, request.budgetMonthly).issues
  }

  // Part 3 — phase the lines + lay out the content calendar (code owns weeks; the
  // model only themes the labels). Falls back to code labels, so it never blocks.
  const sequenced = await sequencePlan(ctx, diagnosis, plan.items)

  return {
    diagnosis,
    diagnosisSource,
    selectionSource: plan.source,
    draft: toDraft(ctx, diagnosis, sequenced.items, sequenced.brief),
    budgetGap: plan.budgetGap,
    unlock: plan.unlock,
    excluded: plan.excluded,
    issues,
  }
}
