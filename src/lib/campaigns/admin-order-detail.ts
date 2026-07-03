import 'server-only'
/**
 * getAdminOrderDetail — everything an admin needs to look INTO one shipped campaign order from
 * /admin/campaign-orders/[id]: the plan they bought, where every piece actually went (team lane +
 * creator lane, with live stage), the owner's setup answers + what they still owe, the support
 * threads for that client, and the activity feed. Reuses the same readers that power the owner's own
 * campaign page (all admin-client, so no RLS gate blocks an admin from any client). Read-only.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign, getCampaignProgress } from './server'
import { getCampaignPieces } from './tracker/pieces'
import { getCampaignActivity } from './tracker/activity'
import { getCampaignReadiness } from './readiness'
import { getServiceWorkOrders, mintServiceWorkOrders, type ServiceWorkOrder } from './service-work-orders'
import type { SavedCampaign, CampaignProgress } from './view'
import type { TrackerPiece } from './tracker/types'
import type { ActivityEvent } from './tracker/types'
import type { ReadinessReport } from './readiness-types'

export interface SupportThreadRow {
  id: string
  subject: string
  lastMessageAt: string | null
  lastPreview: string | null
  lastSenderRole: string | null
}

export interface AdminOrderDetail {
  campaign: SavedCampaign
  clientName: string
  businessId: string | null
  progress: CampaignProgress | null
  pieces: TrackerPiece[]
  activity: ActivityEvent[]
  readiness: ReadinessReport | null
  threads: SupportThreadRow[]
  serviceWorkOrders: ServiceWorkOrder[]
}

/** Returns null when the campaign does not exist. Each secondary read is best-effort so one failure
 *  (a pre-migration column, an empty table) never blanks the whole admin view. */
export async function getAdminOrderDetail(campaignId: string): Promise<AdminOrderDetail | null> {
  const campaign = await getCampaign(campaignId)
  if (!campaign) return null
  const admin = createAdminClient()

  const [clientRow, bizRow, progress, pieces, activity, readiness] = await Promise.all([
    admin.from('clients').select('name').eq('id', campaign.clientId).maybeSingle().then((r) => r.data),
    admin.from('businesses').select('id').eq('client_id', campaign.clientId).maybeSingle().then((r) => r.data),
    getCampaignProgress(campaignId).catch(() => null),
    getCampaignPieces(campaignId).catch(() => [] as TrackerPiece[]),
    getCampaignActivity(campaignId).catch(() => [] as ActivityEvent[]),
    getCampaignReadiness(campaignId).catch(() => null),
  ])

  // Service work orders. Orders shipped before the service spine existed have none, so for an
  // already-shipped campaign with service lines but no work orders, backfill once (idempotent
  // upsert). Best-effort: a failure just leaves the section empty, never blanks the page.
  let serviceWorkOrders = await getServiceWorkOrders(campaignId).catch(() => [] as ServiceWorkOrder[])
  // Same honest-bill filter the mint uses (included, not opted out, non-content) so the backfill gate
  // matches what mint would actually produce.
  const hasServiceLines = (campaign.draft.items ?? []).some((it) => it.included && !it.optOut && !it.serviceId.startsWith('content-'))
  if (campaign.status === 'shipped' && hasServiceLines && serviceWorkOrders.length === 0) {
    // Anchor due dates to the real ship time, not the first-admin-view time.
    const shipISO = campaign.shippedAt ?? campaign.draft.targetDate ?? campaign.updatedAt ?? new Date().toISOString()
    const res = await mintServiceWorkOrders(campaign, shipISO).catch(() => ({ minted: 0, expected: 0 }))
    if (res.minted > 0) serviceWorkOrders = await getServiceWorkOrders(campaignId).catch(() => serviceWorkOrders)
  }

  const businessId = (bizRow?.id as string) ?? null
  let threads: SupportThreadRow[] = []
  if (businessId) {
    const { data: threadRows } = await admin
      .from('message_threads')
      .select('id, subject, last_message_at')
      .eq('business_id', businessId)
      .order('last_message_at', { ascending: false })
      .limit(10)
    const ids = (threadRows ?? []).map((t) => t.id as string)
    // One query for the newest message across these threads; first-seen per thread is the latest.
    const preview = new Map<string, { content: string; role: string }>()
    if (ids.length) {
      const { data: msgs } = await admin
        .from('messages')
        .select('thread_id, content, sender_role, created_at')
        .in('thread_id', ids)
        .order('created_at', { ascending: false })
      for (const m of msgs ?? []) {
        const tid = m.thread_id as string
        if (!preview.has(tid)) preview.set(tid, { content: (m.content as string) ?? '', role: (m.sender_role as string) ?? '' })
      }
    }
    threads = (threadRows ?? []).map((t) => ({
      id: t.id as string,
      subject: (t.subject as string) ?? 'Conversation',
      lastMessageAt: (t.last_message_at as string) ?? null,
      lastPreview: preview.get(t.id as string)?.content ?? null,
      lastSenderRole: preview.get(t.id as string)?.role ?? null,
    }))
  }

  return {
    campaign,
    clientName: (clientRow?.name as string) ?? 'Unknown client',
    businessId,
    progress,
    pieces,
    activity,
    readiness,
    threads,
    serviceWorkOrders,
  }
}
