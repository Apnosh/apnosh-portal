import 'server-only'
/**
 * getCampaignActivity — the "Latest" feed: every REAL, timestamped production event, newest first.
 * There is no events table, so each event is derived from a real column. Precise columns
 * (created_at / approved_at / scheduled_for / published_at) are exact; updated_at is approximate, so
 * for an order we emit AT MOST ONE current-status event marked precise=false. Never invents a time.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { creatorById } from '@/lib/campaigns/creators'
import { PLAN_REMOVED_NOTE } from '@/lib/campaigns/work-orders-core'
import type { ActivityEvent } from './types'

const DEAD = new Set(['rejected', 'failed', 'archived'])

function shortLabel(caption: unknown, fallback: string): string {
  const c = typeof caption === 'string' ? caption.trim() : ''
  if (!c) return fallback
  return c.length > 42 ? `${c.slice(0, 41)}…` : c
}

export async function getCampaignActivity(campaignId: string): Promise<ActivityEvent[]> {
  const admin = createAdminClient()
  const [draftsRes, ordersRes] = await Promise.all([
    admin.from('content_drafts').select('id, caption, status, created_at, approved_at, scheduled_for, published_at, campaign_piece_key').eq('campaign_id', campaignId),
    admin.from('creator_work_orders').select('id, creator_id, discipline, title, status, delivered_url, note, content_draft_id, created_at, updated_at').eq('campaign_id', campaignId),
  ])
  const drafts = (draftsRes.data ?? []) as Record<string, unknown>[]
  const orders = (ordersRes.data ?? []) as Record<string, unknown>[]
  const aliveIds = new Set(drafts.filter((d) => !DEAD.has((d.status as string) ?? '')).map((d) => d.id as string))
  const bridgedDraftIds = new Set(orders.map((o) => o.content_draft_id as string | null).filter(Boolean) as string[])

  const ev: ActivityEvent[] = []
  const push = (id: string, atISO: unknown, precise: boolean, kind: ActivityEvent['kind'], text: string, piece: string | null, link: string | null = null) => {
    const at = typeof atISO === 'string' ? atISO : ''
    if (!at) return   // never invent a timestamp
    ev.push({ id, atISO: at, precise, kind, text, piece, link })
  }

  // Creator lane: "sent" (precise created_at) + the current status (approximate updated_at, one only).
  // An owner plan-removal (PLAN_REMOVED_NOTE) leaves the feed entirely; a creator's own decline stays
  // as a visible event — the piece still needs a maker and its history must not vanish.
  for (const o of orders) {
    const status = (o.status as string) ?? ''
    if (status === 'declined' && (o.note as string | null) === PLAN_REMOVED_NOTE) continue
    const who = creatorById(o.creator_id as string)?.name ?? (o.creator_id as string)
    const piece = shortLabel(o.title, `${(o.discipline as string) || 'A piece'}`)
    const cd = o.content_draft_id as string | null
    const bridged = !!cd && aliveIds.has(cd)
    push(`${o.id}-sent`, o.created_at, true, 'sent', `Sent to ${who}`, piece)
    if (status === 'delivered') push(`${o.id}-del`, o.updated_at, false, 'delivered', `${who} delivered it. Ready for your OK.`, piece, o.delivered_url as string | null)
    else if (status === 'revision') push(`${o.id}-rev`, o.updated_at, false, 'revision', `You asked ${who} for changes`, piece)
    else if (status === 'accepted' || status === 'in_progress') push(`${o.id}-mk`, o.updated_at, false, 'making', `${who} is on it`, piece)
    else if (status === 'approved' && !bridged) push(`${o.id}-appr`, o.updated_at, false, 'approved', `You approved ${who}'s work`, piece)
    else if (status === 'declined') push(`${o.id}-dec`, o.updated_at, false, 'dropped', `${who} could not take this on. It needs a new maker.`, piece)
  }

  // Team lane: precise draft milestones. "started" only for un-bridged drafts (a bridged piece's start
  // is the order's "sent"). approved/scheduled/posted are precise columns.
  for (const d of drafts) {
    if (DEAD.has((d.status as string) ?? '')) continue
    const did = d.id as string
    const piece = shortLabel(d.caption, 'A piece')
    if (!bridgedDraftIds.has(did)) push(`${did}-start`, d.created_at, true, 'started', 'Piece started', piece)
    push(`${did}-appr`, d.approved_at, true, 'approved', 'Approved to go out', piece)
    push(`${did}-sch`, d.scheduled_for, true, 'scheduled', 'Set to post', piece)
    push(`${did}-post`, d.published_at, true, 'posted', 'Posted', piece)
  }

  ev.sort((a, b) => b.atISO.localeCompare(a.atISO))
  return ev
}
