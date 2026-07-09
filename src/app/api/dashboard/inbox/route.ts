/**
 * GET /api/dashboard/inbox?clientId=… — data for the redesigned owner Inbox.
 *
 * IA: two segments — "All" (everything that needs you, in Today / This week /
 * Good-to-know bands, with type filter chips) and "History" (handled items) —
 * plus the owner↔team chat thread (a header sheet, not a tab).
 *
 * Wired to real portal data:
 *   items   ← getInbox() (approvals, posts, tasks, fix-its) + campaign reviews
 *   reviews ← reviews table (unreplied = action rows with reply; replied = history)
 *   wins    ← notifications (a curated allowlist) — the calm "good to know" lane
 *   history ← replied reviews + shipped campaigns + signed-off drafts
 *   thread  ← message_threads/messages (the strategist chat)
 */
import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInbox } from '@/lib/dashboard/get-inbox'
import { listCampaigns } from '@/lib/campaigns/server'
import { listForCurrentUser } from '@/lib/notifications'

type Chip = 'approvals' | 'reviews' | 'fix' | 'todos'
type Band = 'today' | 'week'

function timeAgo(iso?: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const min = Math.floor(ms / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const d = Math.floor(hr / 24)
  if (d < 7) return `${d}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
function dayBucket(iso?: string | null): 'Today' | 'Yesterday' | 'Earlier' {
  if (!iso) return 'Earlier'
  const d = new Date(iso), now = new Date()
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const t = d.getTime()
  if (t >= startToday) return 'Today'
  if (t >= startToday - 86400000) return 'Yesterday'
  return 'Earlier'
}

const ICON: Record<string, string> = { approval: '🎨', post_review: '📝', campaign: '🚀', review: '⭐', connection: '🔌', task: '✅', win: '🎉' }
const CHIP_BY_KIND: Record<string, Chip> = { approval: 'approvals', post_review: 'approvals', campaign: 'approvals', review: 'reviews', connection: 'fix', task: 'todos' }
// Owner-relevant notification types for the quiet "good to know" lane.
const WIN_TYPES = new Set(['draft_published', 'draft_approved', 'client_signoff', 'payment', 'holiday_hours_reminder', 'traffic_anomaly', 'site_audit', 'awaiting_you_digest', 'campaign_wrapped'])
const WIN_ICON: Record<string, string> = { draft_published: '🎬', draft_approved: '✅', client_signoff: '👍', payment: '💳', holiday_hours_reminder: '🗓️', traffic_anomaly: '📈', site_audit: '🔍', awaiting_you_digest: '⏳', campaign_wrapped: '🏁' }

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  const userId = access.userId
  const admin = createAdminClient()

  const [inbox, reviewRes, campaigns, notifs, signedOffRes] = await Promise.all([
    getInbox(clientId, userId),
    admin.from('reviews').select('id, author_name, rating, review_text, source, posted_at, response_text, responded_at').eq('client_id', clientId).order('posted_at', { ascending: false }).limit(40),
    listCampaigns(clientId).catch(() => []),
    listForCurrentUser(15).catch(() => []),
    admin.from('content_drafts').select('id, idea, client_signed_off_at').eq('client_id', clientId).not('client_signed_off_at', 'is', null).order('client_signed_off_at', { ascending: false }).limit(15),
  ])

  type Row = { id: string; kind: string; chip: Chip; band: Band; icon: string; title: string; subtitle: string; time: string; whenIso: string; href: string; status?: string; unread: boolean; review?: { reviewId: string; rating: number; author: string; source: string; text: string; suggestedReply: string } }
  const items: Row[] = []

  // getInbox action items (skip 'review' — built richly below from the reviews table)
  for (const i of inbox) {
    if (i.kind === 'review') continue
    items.push({
      id: i.id, kind: i.kind, chip: CHIP_BY_KIND[i.kind] ?? 'todos',
      band: i.urgency === 'high' ? 'today' : 'week',
      icon: ICON[i.kind] ?? '•', title: i.title, subtitle: i.detail ?? (i.senderName ?? ''),
      time: timeAgo(i.whenIso), whenIso: i.whenIso, href: i.href, status: i.status, unread: i.unread ?? true,
    })
  }

  // Campaign approvals — strategist plans held in review, awaiting the owner's OK.
  for (const c of campaigns) {
    if (c.status !== 'shipped' && c.phase === 'review') {
      items.push({
        id: `campaign-${c.draft.id}`, kind: 'campaign', chip: 'approvals', band: 'today',
        icon: ICON.campaign, title: c.draft.name, subtitle: 'Apnosh built your plan — approve to ship it',
        time: timeAgo(c.updatedAt), whenIso: c.updatedAt, href: `/dashboard/campaigns/${c.draft.id}`, status: 'Ready for your OK', unread: true,
      })
    }
  }

  // Reviews — unreplied become action rows (with an inline reply); replied go to history.
  const reviews = reviewRes.data ?? []
  const history: { id: string; icon: string; chip: Chip | 'wins'; title: string; subtitle: string; outcome: string; day: string; whenIso: string; href?: string }[] = []
  for (const r of reviews) {
    const author = (r.author_name as string) || 'A guest'
    const first = author.split(' ')[0]
    const rating = Number(r.rating ?? 0)
    const source = ((r.source as string) ?? 'google').toLowerCase()
    const replied = !!r.response_text
    if (!replied) {
      items.push({
        id: `review-${r.id}`, kind: 'review', chip: 'reviews', band: rating <= 3 ? 'today' : 'week',
        icon: ICON.review, title: `${author} · ${rating}★`, subtitle: (r.review_text as string)?.slice(0, 90) || 'No comment left',
        time: timeAgo(r.posted_at as string), whenIso: r.posted_at as string, href: '/dashboard/insights/reviews', status: `${rating}★`, unread: true,
        review: {
          reviewId: r.id as string, rating, author, source, text: (r.review_text as string) ?? '',
          suggestedReply: rating >= 4
            ? `Thank you so much, ${first}! We're thrilled you enjoyed it and can't wait to welcome you back. 🙏`
            : `Thank you for the honest feedback, ${first}. We're sorry it wasn't perfect and we'd love to make it right next time. Please reach out to us directly.`,
        },
      })
    } else {
      history.push({ id: `review-${r.id}`, icon: ICON.review, chip: 'reviews', title: `Replied to ${author}`, subtitle: `${rating}★ on ${source === 'instagram' ? 'Instagram' : source === 'yelp' ? 'Yelp' : 'Google'}`, outcome: 'Reply sent', day: dayBucket((r.responded_at as string) ?? null), whenIso: (r.responded_at as string) ?? (r.posted_at as string), href: '/dashboard/insights/reviews' })
    }
  }

  // History — shipped campaigns + signed-off drafts.
  for (const c of campaigns) {
    if (c.status === 'shipped') history.push({ id: `campaign-${c.draft.id}`, icon: ICON.campaign, chip: 'approvals', title: c.draft.name, subtitle: 'Campaign', outcome: 'Shipped', day: dayBucket(c.shippedAt ?? c.updatedAt), whenIso: c.shippedAt ?? c.updatedAt, href: `/dashboard/campaigns/${c.draft.id}` })
  }
  for (const d of signedOffRes.data ?? []) {
    history.push({ id: `draft-${d.id}`, icon: ICON.approval, chip: 'approvals', title: (d.idea as string) || 'Content', subtitle: 'Sign-off', outcome: 'Approved', day: dayBucket(d.client_signed_off_at as string), whenIso: d.client_signed_off_at as string, href: `/dashboard/preview/${d.id}` })
  }
  history.sort((a, b) => new Date(b.whenIso).getTime() - new Date(a.whenIso).getTime())

  // Wins — the calm "good to know" lane (no red badges; not counted as needs-you).
  const wins = (notifs ?? [])
    .filter((n) => WIN_TYPES.has(n.type))
    .map((n) => ({ id: n.id, icon: WIN_ICON[n.type] ?? '🎉', title: n.title, body: n.body ?? '', time: timeAgo(n.created_at), link: n.link, read: !!n.read_at }))

  // Strategist thread.
  let thread: { threadId: string | null; messages: { id: string; from: 'owner' | 'team'; text: string; createdAt: string }[] } = { threadId: null, messages: [] }
  const { data: biz } = await admin.from('businesses').select('id').eq('owner_id', userId).maybeSingle()
  if (biz?.id) {
    const { data: threadRow } = await admin.from('message_threads').select('id').eq('business_id', biz.id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
    if (threadRow?.id) {
      const { data: msgs } = await admin.from('messages').select('id, sender_role, content, created_at').eq('thread_id', threadRow.id).order('created_at', { ascending: true })
      thread = { threadId: threadRow.id as string, messages: (msgs ?? []).map((m) => ({ id: m.id as string, from: (m.sender_role as string) === 'client' ? 'owner' : 'team', text: (m.content as string) ?? '', createdAt: m.created_at as string })) }
    }
  }

  // Read state — an item stays "unread" (highlighted) until the owner opens it
  // (the row's onNav writes user_inbox_read via markInboxRead). getInbox already
  // applies this to its own items; apply it to the campaign + review items too
  // so they clear once opened instead of staying highlighted forever.
  const itemIds = items.map((i) => i.id)
  if (itemIds.length) {
    const { data: readRows } = await admin.from('user_inbox_read').select('item_id').eq('user_id', userId).in('item_id', itemIds)
    const readSet = new Set((readRows ?? []).map((r) => r.item_id as string))
    for (const it of items) it.unread = !readSet.has(it.id)
  }

  items.sort((a, b) => {
    const band = (a.band === 'today' ? 0 : 1) - (b.band === 'today' ? 0 : 1)
    if (band !== 0) return band
    return new Date(b.whenIso).getTime() - new Date(a.whenIso).getTime()
  })

  const unreadThread = thread.messages.some((m) => m.from === 'team') // simple: any team message → show chat dot
  return NextResponse.json({
    items, wins, history, thread,
    counts: { needsYou: items.length, today: items.filter((i) => i.band === 'today').length, chatUnread: unreadThread && thread.messages.length > 0 },
  })
}
