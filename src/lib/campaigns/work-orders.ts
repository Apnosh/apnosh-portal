/**
 * Creator work orders — the supply-side spine. On ship, each creative discipline
 * with a chosen creator becomes an order that creator receives, accepts, and
 * delivers. Server-only (admin client); the creator portal + owner detail read
 * through here.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorById } from './creators'
import { buildWorkOrderRows, validateTransition, IllegalTransition, type WorkOrderStatus } from './work-orders-core'
import type { SavedCampaign } from './view'

export type { WorkOrderStatus }
export { IllegalTransition } from './work-orders-core'

export interface WorkOrder {
  id: string
  campaignId: string
  campaignName?: string
  clientId: string
  creatorId: string
  creatorName: string
  discipline: string
  title: string
  brief: string | null
  dueDate: string | null
  status: WorkOrderStatus
  deliveredUrl: string | null
  note: string | null
  createdAt: string
  updatedAt: string
}

function rowToWO(r: Record<string, unknown>): WorkOrder {
  const creatorId = (r.creator_id as string) ?? ''
  return {
    id: r.id as string,
    campaignId: (r.campaign_id as string) ?? '',
    clientId: (r.client_id as string) ?? '',
    creatorId,
    creatorName: creatorById(creatorId)?.name ?? creatorId,
    discipline: (r.discipline as string) ?? '',
    title: (r.title as string) ?? '',
    brief: (r.brief as string) ?? null,
    dueDate: (r.due_date as string) ?? null,
    status: ((r.status as WorkOrderStatus) ?? 'offered'),
    deliveredUrl: (r.delivered_url as string) ?? null,
    note: (r.note as string) ?? null,
    createdAt: r.created_at as string,
    updatedAt: r.updated_at as string,
  }
}

/**
 * On ship, mint one work order per creative discipline + its chosen creator.
 * Idempotent: skips if orders already exist for the campaign. Best-effort like
 * materializeCampaignDrafts — degrades to 0 if the table is not present yet.
 */
export async function mintWorkOrders(campaign: SavedCampaign, shipISO: string): Promise<number> {
  const rows = buildWorkOrderRows(campaign, shipISO)
  if (!rows.length) return 0

  const admin = createAdminClient()
  const { data: existing, error: existErr } = await admin
    .from('creator_work_orders')
    .select('id')
    .eq('campaign_id', campaign.draft.id)
    .limit(1)
  if (existErr) return 0
  if (existing && existing.length) return 0

  const { error } = await admin.from('creator_work_orders').insert(rows)
  if (error) return 0
  return rows.length
}

/** A creator's inbox: every order assigned to them, newest first. */
export async function listWorkOrdersForCreator(creatorId: string): Promise<WorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_work_orders')
    .select('*, campaigns(name)')
    .eq('creator_id', creatorId)
    .order('created_at', { ascending: false })
  if (error || !data) return []
  return data.map((r) => ({ ...rowToWO(r), campaignName: ((r as { campaigns?: { name?: string } }).campaigns?.name) ?? undefined }))
}

/** The pool creator id this auth user signs in as (test-creator login), or null. */
export async function getCreatorIdForUser(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_logins').select('creator_id').eq('person_id', userId).maybeSingle()
  if (error || !data) return null
  return (data.creator_id as string) ?? null
}

/** One order by id (for authorization scoping at the route). */
export async function getWorkOrder(id: string): Promise<WorkOrder | null> {
  const admin = createAdminClient()
  const { data, error } = await admin.from('creator_work_orders').select('*').eq('id', id).single()
  if (error || !data) return null
  return rowToWO(data)
}

/** Owner/team view: the orders for one campaign. */
export async function listWorkOrdersForCampaign(campaignId: string): Promise<WorkOrder[]> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('creator_work_orders')
    .select('*')
    .eq('campaign_id', campaignId)
    .order('discipline')
  if (error || !data) return []
  return data.map(rowToWO)
}

/** Move an order along its status machine (accept / deliver / approve / revise).
 *  Enforces the legal-transition set + the deliver-needs-a-link rule at this
 *  single write chokepoint, so the API cannot hijack an order (offered→approved)
 *  or resurrect a terminal one. Throws IllegalTransition on a bad move. */
export async function updateWorkOrder(id: string, patch: { status?: WorkOrderStatus; delivered_url?: string; note?: string }): Promise<void> {
  const admin = createAdminClient()
  if (patch.status) {
    const { data: cur, error: readErr } = await admin
      .from('creator_work_orders')
      .select('status, delivered_url')
      .eq('id', id)
      .single()
    if (readErr || !cur) throw new IllegalTransition('work order not found')
    const effectiveUrl = patch.delivered_url ?? (cur.delivered_url as string | null)
    const v = validateTransition(cur.status as WorkOrderStatus, patch.status, effectiveUrl)
    if (!v.ok) throw new IllegalTransition(v.reason)
  }
  const { error } = await admin
    .from('creator_work_orders')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) throw new Error(`update work order: ${error.message}`)
}
