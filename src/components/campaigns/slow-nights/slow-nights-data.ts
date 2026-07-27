/**
 * The slow-nights plan, as data. No UI, so the builder, the chain and the tests all read one source.
 *
 * HONESTY RULES, in order of how badly breaking them would hurt:
 *   1. A held line stays VISIBLE and is never billed. service-availability decides; this module only
 *      reports. Hiding it would sell a plan whose shape the owner cannot see.
 *   2. Money splits the way it is actually charged (once, then monthly). The night is weekly, the
 *      bill is not, so nothing here ever says "a week".
 *   3. Nothing predicts people. Every number is a price or a count of things we will make.
 */

import { composePlanForGoal } from '@/lib/campaigns/builder/compose-plan'
import { SEND_DEPS } from '@/lib/campaigns/builder/build-from-atoms'
import { heldServices } from '@/lib/campaigns/data/service-availability'
import { GENERATED_CATALOG } from '@/lib/campaigns/data/catalog.generated'
import type { PricedService } from '@/lib/campaigns/data/priced-catalog'

/**
 * The four steps, in the order a stranger meets them. `stage` ties each to the real plan stage that
 * compose-plan already authors for `nights` (lock / draw / activate / habit), re-said in the owner's
 * words. The strategy is the portal's; only the language moved.
 *
 * `gives` and `breaks` are what the chain connector says when the step has something to hand down,
 * and when it does not.
 */
export const STEPS = [
  {
    stage: 'lock',
    n: 1,
    name: 'Pick the night, and count it',
    does: 'Nothing a stranger sees yet. This is you deciding which night, and setting up the count so you can tell later whether any of it worked.',
    col: '#5FA8D3',
    gives: 'Gives the next step a night to build around, and a number to judge it by.',
    breaks: 'With no night picked and nothing counting, everything below runs blind. You will not be able to tell whether any of it worked.',
  },
  {
    stage: 'draw',
    n: 2,
    name: 'Give them a reason',
    does: 'The thing that makes someone pick your night over staying home. Without this, everything after it is telling people about nothing.',
    col: '#7B77D6',
    gives: 'Gives the next step something worth saying.',
    breaks: 'Nothing here means the step below is telling people about nothing. Posts still go out, but there is no reason to come.',
  },
  {
    stage: 'activate',
    n: 3,
    name: 'Tell people it is on',
    does: 'How anyone finds out. This is the only step that reaches someone who is not already thinking about you.',
    col: '#C86FBF',
    gives: 'Gives the next step people who have actually been once.',
    breaks: 'Nothing here means nobody finds out. The reason above stays a secret, and the step below has nobody to bring back.',
  },
  {
    stage: 'habit',
    n: 4,
    name: 'Make them come back',
    does: 'One good night is a fluke. This is what turns it into a night people just know about.',
    col: '#34C08E',
    gives: '',
    breaks: 'Nothing here means every week starts from zero. You buy the same strangers twice.',
  },
] as const

export type Step = (typeof STEPS)[number]

export interface PlanLine {
  id: string
  name: string
  role: string
  desc: string
  stage: string
  amount: number
  kind: string
  unit?: string
  held: string | null
  /** True when the owner added this by hand rather than the budget pulling it in. */
  extra?: boolean
}

const svc = (id: string): PricedService | undefined =>
  (GENERATED_CATALOG as PricedService[]).find((s) => s.id === id)

export const usd = (n: number) => '$' + n.toLocaleString('en-US')

export function priceLabel(l: { amount: number; kind: string; unit?: string }) {
  if (l.kind === 'monthly') return usd(l.amount) + ' a month'
  if (l.kind === 'per-unit') return usd(l.amount) + (l.unit ? ' each ' + l.unit : ' each')
  return usd(l.amount)
}

/** Everything the catalog tags for this goal, at any tier: the builder's whole palette. */
export function nightsCatalog(): { id: string; stage: string; role: string; minTier: string }[] {
  const out: { id: string; stage: string; role: string; minTier: string }[] = []
  for (const s of GENERATED_CATALOG as PricedService[]) {
    for (const p of s.goalPlays ?? []) {
      if (p.goal === 'nights') out.push({ id: s.id, stage: p.stage, role: p.role, minTier: p.minTier })
    }
  }
  return out
}

/** What the owner changed by hand: taken out, and added beyond what the budget pulled in. */
export interface PlanEdits {
  off?: ReadonlySet<string>
  added?: ReadonlySet<string>
}

function toLine(x: { id: string; stage: string; role: string; extra?: boolean }, heldMap: Map<string, string>): PlanLine {
  const s = svc(x.id)
  const p = s?.prices?.[0]
  return {
    id: x.id,
    name: s?.name ?? x.id,
    role: x.role,
    desc: s?.desc ?? '',
    stage: x.stage,
    amount: p?.amount ?? 0,
    kind: p?.kind ?? 'one-time',
    unit: p?.unit,
    held: heldMap.get(x.id) ?? null,
    extra: x.extra,
  }
}

/**
 * The plan for a spec, with the owner's edits applied.
 *
 * Held is recomputed AFTER the edits, not before, and that matters: the orphan rule depends on which
 * services are present, so taking out the last send by hand should also hold the guest list that fed
 * it, exactly as if the plan had never included it. Computing held on the base plan would leave a
 * $395 setup billed for nothing the moment anyone edited.
 */
export function buildSlowNightsLines(spec: Record<string, string>, edits: PlanEdits = {}): PlanLine[] {
  const out = composePlanForGoal('nights', spec) as { moves: { serviceId: string; stage: string; role: string }[] }
  const off = edits.off ?? new Set<string>()
  const added = edits.added ?? new Set<string>()

  const base = out.moves
    .filter((m) => !off.has(m.serviceId))
    .map((m) => ({ id: m.serviceId, stage: m.stage, role: m.role }))
  const baseIds = new Set(base.map((x) => x.id))
  const extra = nightsCatalog()
    .filter((c) => added.has(c.id) && !baseIds.has(c.id))
    .map((c) => ({ id: c.id, stage: c.stage, role: c.role, extra: true }))

  const all = [...base, ...extra]
  const heldMap = new Map(heldServices(all.map((x) => x.id), SEND_DEPS).map((h) => [h.id, h.reason]))

  const order = STEPS.map((s) => s.stage) as readonly string[]
  return all.sort((a, b) => order.indexOf(a.stage) - order.indexOf(b.stage)).map((x) => toLine(x, heldMap))
}

/** What we actually charge, split the way it is actually charged. Held lines are never counted. */
export function billOf(lines: PlanLine[]) {
  let once = 0
  let monthly = 0
  for (const l of lines) {
    if (l.held) continue
    if (l.kind === 'monthly') monthly += l.amount
    else once += l.amount // per-unit lines are charged once each, at the quantity in the plan
  }
  return { once, monthly }
}

/** What the owner could still add to a step: tagged for this goal, not already in the plan. */
export function addablesFor(stage: string, lines: PlanLine[]): PlanLine[] {
  const inPlan = new Set(lines.map((l) => l.id))
  const heldMap = new Map<string, string>()
  const cands = nightsCatalog().filter((c) => c.stage === stage && !inPlan.has(c.id))
  const held = heldServices(cands.map((c) => c.id), SEND_DEPS)
  for (const h of held) heldMap.set(h.id, h.reason)
  return cands.map((c) => toLine({ id: c.id, stage: c.stage, role: c.role }, heldMap))
}
