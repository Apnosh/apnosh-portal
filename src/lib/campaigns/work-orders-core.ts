/**
 * Pure (no server-only) core of the work-order spine: the row-building logic
 * that turns a shipped campaign into one order per creative discipline. Split
 * out of work-orders.ts so the simulator and unit tests can exercise the real
 * mint logic without pulling in the admin DB client.
 */
import type { SavedCampaign } from './view'
import { creativeRolesForCampaign, vibeForCampaign } from './creators'
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

/** Validate a status move + the deliver-needs-a-link rule. Pure → unit-testable. */
export function validateTransition(from: WorkOrderStatus, to: WorkOrderStatus, effectiveUrl?: string | null): { ok: true } | { ok: false; reason: string } {
  if (from === to) return { ok: false, reason: `order is already ${from}` }
  if (!ALLOWED_TRANSITIONS[from]?.includes(to)) return { ok: false, reason: `cannot move an order from ${from} to ${to}` }
  if (to === 'delivered' && !effectiveUrl?.trim()) return { ok: false, reason: 'a delivery link is required to deliver' }
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
  title: string
  brief: string
  due_date: string | null
  status: WorkOrderStatus
}

/**
 * Build the work-order rows a ship should mint: one per creative discipline
 * present in the included items, assigned to the owner's chosen creator
 * (creator_choices) or the auto-matched best fit. Returns [] when there is no
 * creative work. Pure — the DB write + idempotency check live in mintWorkOrders.
 */
export function buildWorkOrderRows(campaign: SavedCampaign, shipISO: string): WorkOrderRow[] {
  const items = (campaign.draft.items ?? []).filter((it) => it.included)
  const vibe = vibeForCampaign(campaign.draft.goalKey, campaign.draft.occasion)
  const roles = creativeRolesForCampaign(items, campaign.creatorChoices, vibe)
  if (!roles.length) return []

  // Same reconciled calendar materialize uses, so the order's due date agrees
  // with the matching content_draft's publish date.
  const beats = reconcileBeatsToLines(items, campaign.draft.brief?.contentBeats ?? [])
  const sched = deriveSchedule(
    { targetDate: campaign.draft.targetDate, occasion: campaign.draft.occasion, contentBeats: beats },
    shipISO,
  )
  // Clamp the due date to the ship day so a backward-anchored (event) or
  // too-soon campaign never mints an order that's born overdue — matching how
  // materializeCampaignDrafts clamps the content_draft publish date.
  const shipDay = (shipISO || '').slice(0, 10)
  const fp = sched.firstPostISO
  const due = fp && shipDay && fp < shipDay ? shipDay : fp
  const objective = campaign.draft.brief?.objective ?? ''

  return roles.map((r) => ({
    campaign_id: campaign.draft.id,
    client_id: campaign.clientId,
    creator_id: r.creator.id,
    discipline: r.discipline,
    title: `${r.discipline} for ${campaign.draft.name}`,
    brief: `Make the ${r.discipline.toLowerCase()} pieces for "${campaign.draft.name}".${objective ? ` Goal: ${objective}.` : ''} You approve nothing yet — deliver, then the owner reviews.`,
    due_date: due,
    status: 'offered' as const,
  }))
}
