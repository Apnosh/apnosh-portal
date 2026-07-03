import 'server-only'
/**
 * service-work-orders — the execution spine for purchased SERVICES (the sibling of work-orders.ts,
 * which does this for content pieces). On ship, every included, non-opted-out, non-content service
 * line becomes a service_work_orders row seeded with its authored playbook checklist, a due date from
 * the turnaround window, and any external gate. (AI-handled services still mint — they carry the human
 * QA/oversight steps in their playbook.) mint is guarded + idempotent (upsert on campaign_id +
 * line_item_id), so a re-ship or a best-effort retry never double-mints.
 *
 * This is the FOUNDATION phase: mint + read. The operator checklist UI, the derived-lock rollup, and
 * the delivered proof pack build on top of these rows next.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { turnaroundFor } from './data/service-turnaround'
import { seedSteps, type WorkOrderStep } from './data/service-playbooks'
import type { SavedCampaign } from './view'

export type ServiceWorkOrderStatus = 'queued' | 'claimed' | 'in_progress' | 'blocked_client' | 'blocked_gate' | 'ready_for_client' | 'delivered'

export interface ServiceWorkOrder {
  id: string
  campaignId: string
  clientId: string
  lineItemId: string | null
  serviceId: string
  title: string
  status: ServiceWorkOrderStatus
  assigneeId: string | null
  dueDate: string | null
  gateKind: string | null
  gateStartedAt: string | null
  blockedReason: string | null
  steps: WorkOrderStep[]
  proofUrl: string | null
  proofNote: string | null
  startedAt: string | null
  deliveredAt: string | null
}

/** A service line is anything the plan sells that is NOT a content piece (those go through the content
 *  spine, work-orders.ts). Content pieces carry a serviceId prefixed 'content-'. */
function isServiceLine(serviceId: string): boolean {
  return !serviceId.startsWith('content-')
}

/** Add N business days (skip weekends) for the due-date estimate. */
function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from); let added = 0
  while (added < days) { d.setDate(d.getDate() + 1); const wd = d.getDay(); if (wd !== 0 && wd !== 6) added++ }
  return d
}

function rowToSWO(r: Record<string, unknown>): ServiceWorkOrder {
  return {
    id: r.id as string,
    campaignId: (r.campaign_id as string) ?? '',
    clientId: (r.client_id as string) ?? '',
    lineItemId: (r.line_item_id as string | null) ?? null,
    serviceId: (r.service_id as string) ?? '',
    title: (r.title as string) ?? '',
    status: ((r.status as string) ?? 'queued') as ServiceWorkOrderStatus,
    assigneeId: (r.assignee_id as string | null) ?? null,
    dueDate: (r.due_date as string | null) ?? null,
    gateKind: (r.gate_kind as string | null) ?? null,
    gateStartedAt: (r.gate_started_at as string | null) ?? null,
    blockedReason: (r.blocked_reason as string | null) ?? null,
    steps: Array.isArray(r.steps) ? (r.steps as WorkOrderStep[]) : [],
    proofUrl: (r.proof_url as string | null) ?? null,
    proofNote: (r.proof_note as string | null) ?? null,
    startedAt: (r.started_at as string | null) ?? null,
    deliveredAt: (r.delivered_at as string | null) ?? null,
  }
}

/**
 * Mint a service work order for every included, non-opted-out service line. Idempotent (upsert on
 * campaign_id + line_item_id, ignoreDuplicates), so a re-ship never double-mints or overwrites an
 * operator's progress. Returns { minted, expected, error } so the ship hook can dead-letter a silent
 * strand. Best-effort at the call site: a failure here must never break the ship.
 */
export async function mintServiceWorkOrders(campaign: SavedCampaign, shipISO: string): Promise<{ minted: number; expected: number; error?: string }> {
  // Same honest-bill filter every other consumer uses: included, NOT opted out (owner already has it /
  // does it themselves), and a real service (not a content piece). An opted-out line is not billed, so
  // it must never mint phantom work.
  const items = (campaign.draft.items ?? []).filter((it) => it.included && !it.optOut && isServiceLine(it.serviceId))
  if (!items.length) return { minted: 0, expected: 0 }

  const rows = items.map((it) => {
    const t = turnaroundFor(it.serviceId)
    // Due date honors the turnaround CLASS: a recurring service starts within a few days (no finish
    // gate); a setup/creative service has a work window plus any external gate. Falls back to 5 days
    // only when a service has no authored turnaround at all.
    const gate = t && 'business' in t && 'gate' in t && t.gate ? t.gate : undefined
    const dueDays = t?.class === 'recurring'
      ? t.startsWithin.max
      : (t && 'business' in t ? t.business.max + (gate?.addDays.max ?? 0) : 5)
    const due = addBusinessDays(new Date(shipISO), dueDays)
    return {
      campaign_id: campaign.draft.id,
      client_id: campaign.clientId,
      line_item_id: it.id,
      service_id: it.serviceId,
      title: it.plain || it.name,
      status: 'queued' as const,
      due_date: isNaN(due.getTime()) ? null : due.toISOString().slice(0, 10),
      gate_kind: gate?.kind ?? null,
      steps: seedSteps(it.serviceId),
    }
  })

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('service_work_orders')
    .upsert(rows, { onConflict: 'campaign_id,line_item_id', ignoreDuplicates: true })
    .select('id')
  if (error) return { minted: 0, expected: rows.length, error: error.message }
  return { minted: data?.length ?? 0, expected: rows.length }
}

/** All service work orders for a campaign (admin cockpit + owner rollups read this). */
export async function getServiceWorkOrders(campaignId: string): Promise<ServiceWorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('service_work_orders').select('*').eq('campaign_id', campaignId)
  if (error || !data) return []
  return data.map(rowToSWO)
}

/** One work order by id (the focused "Your Turn" inbox page reads this). */
export async function getServiceWorkOrder(id: string): Promise<ServiceWorkOrder | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('service_work_orders').select('*').eq('id', id).maybeSingle()
  if (error || !data) return null
  return rowToSWO(data)
}
