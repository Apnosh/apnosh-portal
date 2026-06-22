import 'server-only'
/**
 * Part 2 — Select (spec §4). The strategist's bet becomes a priced set: the LLM
 * re-ranks the closed catalog to serve the diagnosis, then CODE validates ids,
 * dedupes owned capabilities, packs to the budget, and prices every line. The
 * model never emits a price — it only names serviceIds + reasons. Fallback: the
 * existing deterministic planForBudget (its static per-goal ranking).
 */
import { serviceById, serviceToLine } from '@/lib/campaigns/catalog'
import { planForBudget, nextUnlock, HAS_MAP } from '@/lib/campaigns/plan-engine'
import type { LineItem } from '@/lib/campaigns/types'
import type { PricedService } from '@/lib/campaigns/data/priced-catalog'
import type { PlanningContext, Diagnosis } from './types'
import { callStructuredOutput } from './anthropic'

/** The model's proposal (spec §4 output): two buckets + honest exclusions. */
export interface Selection {
  core: { serviceId: string; reason: string; signalAnswered: string }[]
  fill: { serviceId: string; reason: string; signalAnswered: string }[]
  excluded: { serviceId?: string; what: string; why: string }[]
}

export interface PricedPlan {
  items: LineItem[]
  source: 'ai' | 'rules'
  /** core costs more than the owner's monthly ceiling — surfaced, never truncated. */
  budgetGap?: { needed: number; set: number }
  /** the next service a bit more budget would unlock */
  unlock: { name: string; addlMonthly: number } | null
  excluded: { what: string; why: string }[]
}

/** Monthly-equivalent load (recurring at face, one-time over 6) — mirrors plan-engine. */
function monthlyLoad(id: string): number {
  const s = serviceById(id)
  if (!s) return 0
  const p = s.prices[0]
  return p.kind === 'monthly' ? p.amount : p.amount / 6
}

/** Service ids the owner already has (capabilities + previously dropped). */
function ownedIds(ctx: PlanningContext): Set<string> {
  return new Set([
    ...ctx.business.has.flatMap((h) => HAS_MAP[h] ?? []),
    ...ctx.history.droppedServiceIds,
  ])
}

const ITEM = {
  type: 'object', additionalProperties: false, required: ['serviceId', 'reason', 'signalAnswered'],
  properties: { serviceId: { type: 'string' }, reason: { type: 'string' }, signalAnswered: { type: 'string' } },
}
const SELECTION_SCHEMA = {
  type: 'object', additionalProperties: false, required: ['core', 'fill', 'excluded'],
  properties: {
    core: { type: 'array', description: 'The bet, a small protected set. Catalog serviceIds only.', items: ITEM },
    fill: { type: 'array', description: 'Ranked extras, cut first when budget is tight. Catalog serviceIds.', items: ITEM },
    excluded: {
      type: 'array', description: 'What to deliberately leave out (honors the diagnosis skip).',
      items: { type: 'object', additionalProperties: false, required: ['what', 'why'], properties: { serviceId: { type: 'string' }, what: { type: 'string' }, why: { type: 'string' } } },
    },
  },
}

const SYSTEM = `You are a restaurant marketing strategist turning a diagnosis into a concrete plan.
You pick services from a fixed catalog to serve the bet. You never invent a service or a price;
you only choose by serviceId and explain why. Plain language. No jargon. No em dashes.

You receive the diagnosis (binding constraint + bet + what to skip), the owner's monthly budget,
the services they already have (never pick these), and the catalog with each service's
monthly-equivalent cost. Rules:
- core = the bet, as a small protected set: the few services that MUST run together to fix the
  binding constraint. Keep core within the budget where you can.
- fill = ranked nice-to-haves in priority order, added only if budget allows.
- excluded = honor the diagnosis "skip": name what you leave out and why.
- Use serviceIds from the catalog only. Serve the bet; do not re-diagnose.`

function catalogForPrompt(catalog: PricedService[], owned: Set<string>): string {
  return catalog
    .filter((s) => !owned.has(s.id))
    .map((s) => {
      const load = Math.round(monthlyLoad(s.id))
      const comp = s.compliance ? ` [compliance: ${s.compliance}]` : ''
      return `- ${s.id} (${s.section}${s.essential ? ', foundation' : ''}): ${s.name} ~$${load}/mo. ${s.desc}${comp}`
    })
    .join('\n')
}

function buildSelectUser(ctx: PlanningContext, d: Diagnosis, owned: Set<string>): string {
  const L: string[] = []
  L.push('DIAGNOSIS')
  L.push(`Binding constraint: ${d.bindingConstraint}`)
  L.push(`Bet: ${d.bet}`)
  if (d.skip.length) L.push(`Skip: ${d.skip.map((s) => `${s.what} (${s.why})`).join('; ')}`)
  L.push('')
  L.push(`Monthly budget: $${ctx.request.budgetMonthly}`)
  const ownedList = [...owned]
  if (ownedList.length) L.push(`Already have (do NOT pick): ${ownedList.join(', ')}`)
  L.push('')
  L.push('CATALOG (choose serviceIds from here only):')
  L.push(catalogForPrompt(ctx.catalog, owned))
  L.push('')
  L.push('Return core, fill, and excluded. Serve the bet.')
  return L.join('\n')
}

async function llmSelect(ctx: PlanningContext, d: Diagnosis): Promise<Selection | null> {
  const owned = ownedIds(ctx)
  const parsed = await callStructuredOutput<Selection>({ system: SYSTEM, user: buildSelectUser(ctx, d, owned), schema: SELECTION_SCHEMA, maxTokens: 1800 })
  if (!parsed || !Array.isArray(parsed.core)) return null
  return {
    core: (parsed.core ?? []).filter((c) => c && typeof c.serviceId === 'string'),
    fill: (parsed.fill ?? []).filter((c) => c && typeof c.serviceId === 'string'),
    excluded: (parsed.excluded ?? []).filter((e) => e && e.what && e.why),
  }
}

/** Code disposal: a validated Selection -> priced LineItem[], packed to budget. */
function dispose(ctx: PlanningContext, sel: Selection): PricedPlan {
  const owned = ownedIds(ctx)
  const budget = ctx.request.budgetMonthly
  const items: LineItem[] = []
  const used = new Set<string>()
  let coreLoad = 0
  let load = 0
  let idx = 0

  const add = (id: string, included: boolean): boolean => {
    if (used.has(id)) return false
    const s = serviceById(id) // validate against the closed catalog
    if (!s) return false
    used.add(id)
    const li = serviceToLine(s, `pl-${id}-${idx++}`)
    if (owned.has(id)) { li.optOut = 'have-it'; li.included = true } // shown, never charged
    else li.included = included
    items.push(li)
    return true
  }

  // core = protected atomic set: always included; if it overruns the budget we
  // surface the gap rather than split the bet.
  for (const c of sel.core) {
    const added = add(c.serviceId, true)
    if (added && !owned.has(c.serviceId)) coreLoad += monthlyLoad(c.serviceId)
  }
  load = coreLoad

  // fill = greedily into remaining headroom in the model's order; over-budget
  // fill is kept as a recommendation (included:false) under "go further".
  for (const f of sel.fill) {
    if (used.has(f.serviceId) || owned.has(f.serviceId)) { add(f.serviceId, true); continue }
    const l = monthlyLoad(f.serviceId)
    if (load + l <= budget) { add(f.serviceId, true); load += l }
    else add(f.serviceId, false)
  }

  const budgetGap = coreLoad > budget ? { needed: Math.round(coreLoad), set: budget } : undefined
  return { items, source: 'ai', budgetGap, unlock: null, excluded: sel.excluded.map((e) => ({ what: e.what, why: e.why })) }
}

export async function selectAndPrice(ctx: PlanningContext, d: Diagnosis): Promise<PricedPlan> {
  const goal = ctx.request.goalKey ?? ctx.business.goalKey
  const sel = await llmSelect(ctx, d)
  if (sel && (sel.core.length || sel.fill.length)) {
    const disposed = dispose(ctx, sel)
    if (disposed.items.some((i) => i.included)) {
      disposed.unlock = nextUnlock(ctx.request.budgetMonthly, ctx.business.has, goal)
      return disposed
    }
  }
  // Fallback: the deterministic engine (static per-goal ranking) — always a plan.
  const res = planForBudget(ctx.request.budgetMonthly, ctx.business.has, goal)
  return {
    items: res.items,
    source: 'rules',
    unlock: nextUnlock(ctx.request.budgetMonthly, ctx.business.has, goal),
    excluded: d.skip.map((s) => ({ what: s.what, why: s.why })),
  }
}
