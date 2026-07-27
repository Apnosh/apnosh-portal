/**
 * Build the immutable record of what an owner agreed to.
 *
 * Pure, so the exact object that gets written can be asserted in a test rather than trusted. The
 * one property that matters: the totals here are computed from the SAME lines the screen rendered,
 * by the same rule, so "what I agreed to" and "what I was shown" cannot drift apart. If those two
 * ever disagree, the snapshot is worthless as evidence and worse than not having one.
 *
 * Money is stored in CENTS. An audit record that keeps 249.99999999 is not an audit record.
 */

import type { MonthlyLine } from '@/lib/campaigns/data/monthly-plan'
import type { PlanInputs } from '@/lib/campaigns/data/plan-inputs'

export interface SnapshotLine {
  serviceId: string
  name: string
  /** what it does for this plan, in the words the owner saw */
  role: string
  priceCents: number
  cadence: 'one-time' | 'monthly' | 'per-unit'
  /** true when this line was part of the bill */
  billed: boolean
  /** why it was not billed, when it was not: the exact sentence the owner read */
  notBilledBecause?: string
}

export interface OrderSnapshot {
  agreementVersion: string
  lines: SnapshotLine[]
  bill: { onceCents: number; monthlyCents: number }
  inputs: Record<string, unknown>
  edits: { off: string[]; added: string[] }
}

const cents = (dollars: number) => Math.round(dollars * 100)

/**
 * Freeze what we believed about the business, and where each belief came from.
 *
 * Values AND sources, because a plan built off a `guessed` goal or a stale `onboarding` fact is
 * defensible-looking and wrong, and six months later the only way to explain it is to show what we
 * thought at the time. Channels are reduced to which were live, since that changes what the plan
 * could even include.
 */
function freezeInputs(inputs: PlanInputs): Record<string, unknown> {
  const f = (i: { value: unknown; source: string }) => ({ value: i.value, source: i.source })
  return {
    goal: f(inputs.goal),
    goalWords: f(inputs.goalWords),
    budget: f(inputs.budget),
    knownFor: f(inputs.knownFor),
    standsOut: f(inputs.standsOut),
    audience: f(inputs.audience),
    slowDays: f(inputs.slowDays),
    connectedChannels: inputs.channels.filter((c) => c.connected).map((c) => c.key),
  }
}

export function buildOrderSnapshot(args: {
  agreementVersion: string
  lines: MonthlyLine[]
  inputs: PlanInputs
  edits?: { off?: Iterable<string>; added?: Iterable<string> }
}): OrderSnapshot {
  const lines: SnapshotLine[] = args.lines.map((l) => {
    // A line is billed unless it is held (no rail) or the owner already has it. Same rule the
    // screen and the draft adapter use — deliberately not re-derived from a different field.
    const notBilledBecause = l.held ?? (l.have ? 'You told us you already have this.' : undefined)
    return {
      serviceId: l.id,
      name: l.name,
      role: l.role,
      priceCents: cents(l.amount),
      cadence: (l.kind === 'monthly' ? 'monthly' : l.kind === 'per-unit' ? 'per-unit' : 'one-time') as SnapshotLine['cadence'],
      billed: !notBilledBecause,
      ...(notBilledBecause ? { notBilledBecause } : {}),
    }
  })

  let onceCents = 0
  let monthlyCents = 0
  for (const l of lines) {
    if (!l.billed) continue
    if (l.cadence === 'monthly') monthlyCents += l.priceCents
    else onceCents += l.priceCents
  }

  return {
    agreementVersion: args.agreementVersion,
    lines,
    bill: { onceCents, monthlyCents },
    inputs: freezeInputs(args.inputs),
    edits: {
      off: [...(args.edits?.off ?? [])],
      added: [...(args.edits?.added ?? [])],
    },
  }
}
