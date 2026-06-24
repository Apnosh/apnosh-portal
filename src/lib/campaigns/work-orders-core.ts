/**
 * Pure (no server-only) core of the work-order spine: the row-building logic
 * that turns a shipped campaign into one order per creative discipline. Split
 * out of work-orders.ts so the simulator and unit tests can exercise the real
 * mint logic without pulling in the admin DB client.
 */
import type { SavedCampaign } from './view'
import { creativeRolesForCampaign, vibeForCampaign, disciplineForType } from './creators'
import { reconcileBeatsToLines } from './catalog'
import { deriveSchedule } from './schedule'

export type WorkOrderStatus = 'offered' | 'accepted' | 'in_progress' | 'delivered' | 'approved' | 'revision' | 'declined'

/**
 * The only legal status moves. Approved + declined are terminal. A delivery
 * requires a link (enforced separately). Keeps the order from being hijacked
 * (offered→approved) or a terminal order resurrected.
 */
export const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  offered: ['accepted', 'declined'],
  accepted: ['in_progress', 'declined'],
  in_progress: ['delivered'],
  revision: ['delivered'],
  delivered: ['approved', 'revision'],
  approved: [],
  declined: [],
}

/** Thrown when a status write violates the machine; surfaced as 409 by the route. */
export class IllegalTransition extends Error {
  constructor(message: string) { super(message); this.name = 'IllegalTransition' }
}

/** Validate a status move + the deliver-needs-a-link + concept-approved rules.
 *  Pure → unit-testable. conceptStatus gates production: a creator cannot begin
 *  (->in_progress) until the owner has approved the idea ('approved'); 'pending'
 *  and 'changes' both hold. */
export function validateTransition(from: WorkOrderStatus, to: WorkOrderStatus, effectiveUrl?: string | null, conceptStatus?: string | null): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: `order is already ${from}` }
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) return { ok: false, reason: `cannot move an order from ${from} to ${to}` }
  if (to === 'delivered' && !effectiveUrl?.trim()) return { ok: false, reason: 'a delivery link is required to deliver' }
  if (to === 'in_progress' && conceptStatus && conceptStatus !== 'approved') return { ok: false, reason: 'the owner needs to approve the concept before you start' }
  return { ok: true }
}

/** Return the url only if it is a safe http/https link, else null. Blocks
 *  javascript:/data:/schemeless payloads from ever becoming a clickable href. */
export function safeHref(url?: string | null): string | null {
  if (!url) return null
  try {
    const u = new URL(url.trim())
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : null
  } catch { return null }
}

/** The insert shape for one creator_work_orders row. */
export interface WorkOrderRow {
  campaign_id: string
  client_id: string
  creator_id: string
  discipline: string
  slot: number          // 0-based piece index within its discipline
  title: string
  brief: string
  due_date: string | null
  status: WorkOrderStatus
  concept_status: 'approved' | 'pending'  // 'pending' when the owner wants to OK the idea first
}

/**
 * Build the work-order rows a ship should mint: ONE PER CONTENT PIECE (dated
 * beat), each assigned to its discipline's chosen creator (creator_choices) or
 * the auto-matched best fit, with that piece's own due date. So two videos of
 * one campaign are two separately-tracked, separately-scheduled orders rather
 * than one slot that silently owns both. Returns [] when there is no creative
 * work. Pure — the DB write + idempotency check live in mintWorkOrders.
 */
export function buildWorkOrderRows(campaign: SavedCampaign, shipISO: string): WorkOrderRow[] {
  const items = (campaign.draft.items ?? []).filter((it) => it.included)
  const vibe = vibeForCampaign(campaign.draft.goalKey, campaign.draft.occasion)
  const roles = creativeRolesForCampaign(items, campaign.creatorChoices, vibe)
  if (!roles.length) return []
  const creatorByDiscipline = new Map(roles.map((r) => [r.discipline, r.creator]))

  // Same reconciled calendar materialize uses, so each order's due date agrees
  // with its content_draft's publish date.
  const beats = reconcileBeatsToLines(items, campaign.draft.brief?.contentBeats ?? [])
  const sched = deriveSchedule(
    { targetDate: campaign.draft.targetDate, occasion: campaign.draft.occasion, contentBeats: beats },
    shipISO,
  )
  const shipDay = (shipISO || '').slice(0, 10)
  const objective = campaign.draft.brief?.objective ?? ''
  const name = campaign.draft.name

  // approve_concept holds production until the owner OKs the idea.
  const conceptStatus: 'approved' | 'pending' = campaign.creativeControl === 'approve_concept' ? 'pending' : 'approved'
  const slotByDiscipline: Record<string, number> = {}
  const rows: WorkOrderRow[] = []
  for (const b of sched.beats) {
    const discipline = disciplineForType(b.type)
    const creator = discipline ? creatorByDiscipline.get(discipline) : undefined
    if (!discipline || !creator) continue
    const slot = (slotByDiscipline[discipline] = (slotByDiscipline[discipline] ?? -1) + 1)
    // Clamp each piece's due to the ship day so a backward-anchored (event) or
    // too-soon campaign never mints an order born overdue.
    const due = b.postISO && shipDay && b.postISO < shipDay ? shipDay : b.postISO
    rows.push({
      campaign_id: campaign.draft.id,
      client_id: campaign.clientId,
      creator_id: creator.id,
      discipline,
      slot,
      title: b.label?.trim() ? b.label.trim() : `${discipline} for ${name}`,
      brief: `Make this ${discipline.toLowerCase()} piece for "${name}".${objective ? ` Goal: ${objective}.` : ''} You approve nothing yet — deliver, then the owner reviews.`,
      due_date: due,
      status: 'offered' as const,
      concept_status: conceptStatus,
    })
  }
  return rows
}
