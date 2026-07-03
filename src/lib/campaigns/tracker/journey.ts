/**
 * Pure, client-safe helpers for the unified campaign journey. Classify each service line item into an
 * honest status word + a REAL ETA (from the turnaround model, never the placeholder line-item eta), and
 * tell setup (foundation) from the rest. No I/O.
 */
import { turnaroundFor, etaLabelFor } from '@/lib/campaigns/data/service-turnaround'
import type { LineItem } from '@/lib/campaigns/types'

export interface ServiceView {
  id: string
  name: string
  does: string
  /** real per-service estimate, e.g. "7-12 days" / "starts in 5-7 days" — never the placeholder. */
  etaLabel: string
  /** honest status word — services have no execution timestamps, so only these are ever shown. */
  statusWord: 'Being set up' | 'Being made' | 'Running'
  /** an external dependency note (Google verification, POS vendor...) when the turnaround has a gate. */
  gateNote: string | null
}

/** A foundation-stage line item is the setup work that comes first. */
export function isFoundation(it: LineItem): boolean {
  return it.stage === 'foundation'
}

export function serviceView(it: LineItem): ServiceView {
  const sid = it.serviceId
  const t = sid ? turnaroundFor(sid) : undefined
  const statusWord: ServiceView['statusWord'] = t?.class === 'recurring' ? 'Running' : t?.class === 'creative' ? 'Being made' : 'Being set up'
  const gateNote = t && t.class === 'setup' && t.gate ? t.gate.note : null
  return { id: it.id, name: it.plain || it.name, does: it.does, etaLabel: sid ? etaLabelFor(sid) : '~1 week', statusWord, gateNote }
}
