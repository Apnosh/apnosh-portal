/**
 * gbp-apply/piles — the pure classifier behind the "Your Turn" work-order inbox. Sorts every playbook
 * step into one of four piles by WHO can act on it right now:
 *   your-turn       the operator can move it this second (review a draft, do the manual work, send
 *                   the sign-off, deliver)
 *   waiting-client  only the owner can move it (grant access, hand over facts/photos, approve)
 *   waiting-google  an external gate we can only check on (verification)
 *   done            finished, with its receipt
 * Pile membership is DERIVED from the step jsonb, never hand-set, so the screen always tells the
 * truth about where the work stands. The final QA/deliver step stays locked until every other step
 * is done.
 */
import type { WorkOrderStep } from '@/lib/campaigns/data/service-playbooks'
import { actionFor, type StepAction } from './bindings'

export type Pile = 'your-turn' | 'waiting-client' | 'waiting-google' | 'done'

export interface PiledStep {
  step: WorkOrderStep
  pile: Pile
  action?: StepAction
  /** true for the final deliver step while other steps remain open */
  locked?: boolean
  /** true when this client-actor step has been sent/asked and we are now waiting on the owner */
  sentToClient?: boolean
}

type StepExtra = WorkOrderStep & {
  applied?: { verified?: boolean; summary?: string; proofUrl?: string | null }
  prepared?: { proposed: string; at: string }
  sentAt?: string
  checked?: { at: string; summary: string; kind: string }
}

const DELIVER_STEP_IDS = new Set(['qa-deliver'])

export function classifySteps(serviceId: string, steps: WorkOrderStep[]): PiledStep[] {
  const others = steps.filter((s) => !DELIVER_STEP_IDS.has(s.id))
  const allOthersDone = others.length > 0 && others.every((s) => s.status === 'done')

  return steps.map((raw) => {
    const s = raw as StepExtra
    const action = actionFor(serviceId, s.id)

    if (s.status === 'done') return { step: raw, pile: 'done' as const, action }

    // The deliver step is locked until everything above it is finished.
    if (DELIVER_STEP_IDS.has(s.id)) {
      return { step: raw, pile: 'your-turn' as const, action, locked: !allOthersDone }
    }

    // Client-actor steps: an un-sent ask is the operator's turn (send it); a sent one waits on the owner.
    if (s.actor === 'client') {
      const sent = !!s.sentAt
      return { step: raw, pile: (sent ? 'waiting-client' : s.id === 'intake' ? 'waiting-client' : 'your-turn') as Pile, action, sentToClient: sent }
    }

    // Gated steps (Google verification): once the operator's own bullets are done, or once a status
    // check says we are mid-verification, the step waits on Google. Until then it is workable.
    if (s.gateKind) {
      const ownWorkDone = s.actions.length > 0 && s.actions.every((a) => a.done)
      if (ownWorkDone) return { step: raw, pile: 'waiting-google' as const, action }
      return { step: raw, pile: 'your-turn' as const, action }
    }

    return { step: raw, pile: 'your-turn' as const, action }
  })
}

export function pileCounts(piled: PiledStep[]): { yourTurn: number; waiting: number; done: number } {
  let yourTurn = 0, waiting = 0, done = 0
  for (const p of piled) {
    if (p.pile === 'done') done++
    else if (p.pile === 'your-turn') { if (!p.locked) yourTurn++ }
    else waiting++
  }
  return { yourTurn, waiting, done }
}
