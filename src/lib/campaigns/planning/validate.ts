import 'server-only'
/**
 * Part 5 — Validate (spec §5). Prove the plan before it ships: every line is a
 * real catalog service, prices are sane, the displayed bill computes, and there
 * is at least one chargeable line. Compliance notes are surfaced for the team;
 * hard compliance gating is a later refinement. The orchestrator falls back to
 * planForBudget when a plan fails for any reason other than the honest core gap.
 */
import { serviceById } from '@/lib/campaigns/catalog'
import { summarize, type LineItem } from '@/lib/campaigns/types'

export interface PlanIssue { code: string; detail: string }

export function validatePlan(items: LineItem[], budgetMonthly: number): { ok: boolean; issues: PlanIssue[] } {
  const issues: PlanIssue[] = []
  for (const it of items) {
    // content-* lines are minted à la carte (not in the service catalog); every
    // other line must resolve to a real PricedService.
    if (!it.serviceId.startsWith('content-') && !serviceById(it.serviceId)) {
      issues.push({ code: 'unknown-service', detail: it.serviceId })
    }
    if (typeof it.price !== 'number' || !Number.isFinite(it.price) || it.price < 0) {
      issues.push({ code: 'bad-price', detail: `${it.serviceId}: ${it.price}` })
    }
  }
  const bill = summarize(items)
  if (budgetMonthly > 0 && bill.perMonth > budgetMonthly + 1) {
    issues.push({ code: 'over-budget', detail: `$${bill.perMonth}/mo recurring exceeds $${budgetMonthly}` })
  }
  if (!items.some((i) => i.included && !i.optOut)) {
    issues.push({ code: 'empty', detail: 'no chargeable included lines' })
  }
  return { ok: issues.length === 0, issues }
}
