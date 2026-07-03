'use server'

/**
 * Unified inbox feed for /dashboard/inbox.
 *
 * Pulls everything that needs an owner's attention into a single
 * ordered list:
 *   - Deliverables awaiting their approval (client_review state)
 *   - Scheduled posts in in_review state
 *   - Unreplied reviews (≤3-star prioritized as high)
 *   - Open client_tasks visible to the owner
 *   - Delivered creator work waiting for their review (campaign pieces)
 *
 * Sorted by urgency, then by recency. Each item carries an href to
 * the right detail page so the inbox is fast to triage.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { creatorById } from '@/lib/campaigns/creators'

export type InboxItemKind = 'approval' | 'post_review' | 'review' | 'task' | 'connection'

/* Where the item originated. Drives the source badge on the row
   (Google "G", Yelp "Y", Instagram camera, etc.) and the
   per-source filter chips. */
export type InboxSource =
  | 'google'
  | 'yelp'
  | 'facebook'
  | 'instagram'
  | 'tripadvisor'
  | 'apple_maps'
  | 'tiktok'
  | 'apnosh'      // internal Apnosh-generated items (approvals, tasks)
  | 'system'      // platform / integration health

export interface InboxItem {
  id: string
  kind: InboxItemKind
  title: string
  /** Optional one-line context shown below the title */
  detail?: string
  /** Visual urgency tier */
  urgency: 'high' | 'medium' | 'low'
  /** Where to click through */
  href: string
  /** When this entered the inbox (ISO; drives sort + relative time) */
  whenIso: string
  /** Short status chip, e.g. "Awaiting review", "4★", "Due Tuesday" */
  status?: string
  /** Where the item came from (powers source filter chips + badges). */
  source: InboxSource
  /** Display name for the conversational style header (Sarah M, Vinason
   *  Pho Kitchen, etc). NULL for items where Apnosh itself is the sender. */
  senderName?: string | null
  /** Avatar URL if we have one (only set for reviewers / vendors that
   *  ship a profile photo). NULL falls back to initials. */
  avatarUrl?: string | null
  /** Has the owner seen this item yet (drives the unread dot). */
  unread?: boolean
}

const URGENCY_RANK: Record<InboxItem['urgency'], number> = { high: 0, medium: 1, low: 2 }

export async function getInbox(clientId: string, userId?: string): Promise<InboxItem[]> {
  const admin = createAdminClient()

  /* If we have a userId, fetch this user's read-state set in parallel
     with the other queries. Items whose composite id is in the set
     render with unread=false. Without userId (e.g. admin impersonation
     view) we just treat everything as unread. */
  const readSetPromise: Promise<Set<string>> = userId
    ? (async () => {
        const { data } = await admin
          .from('user_inbox_read')
          .select('item_id')
          .eq('user_id', userId)
        return new Set((data ?? []).map((r: { item_id: string }) => r.item_id))
      })()
    : Promise.resolve(new Set<string>())

  const [delivsRow, postsRow, reviewsRow, tasksRow, draftApprovalsRow, connectionsRow, creatorDeliveriesRow] = await Promise.all([
    admin
      .from('deliverables')
      .select('id, title, type, status, created_at')
      .eq('client_id', clientId)
      .eq('status', 'client_review')
      .order('created_at', { ascending: false })
      .limit(30),
    admin
      .from('scheduled_posts')
      .select('id, text, status, scheduled_for, created_at, updated_at')
      .eq('client_id', clientId)
      .eq('status', 'in_review')
      .order('updated_at', { ascending: false })
      .limit(20),
    admin
      .from('reviews')
      .select('id, author_name, rating, posted_at, review_text, source')
      .eq('client_id', clientId)
      .is('response_text', null)
      .order('posted_at', { ascending: false })
      .limit(30),
    admin
      .from('client_tasks')
      .select('id, title, status, source, draft_id, due_at, created_at')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20),
    // Approved drafts waiting for the client's final sign-off / review.
    // Two ways in: the draft originated from a client_request, OR it was
    // minted by a shipped campaign (proposed_via='strategist' with a
    // campaign_id) — the publish gate holds both until the owner signs off.
    admin
      .from('content_drafts')
      .select('id, idea, caption, status, proposed_via, campaign_id, updated_at, approved_at, client_signed_off_at')
      .eq('client_id', clientId)
      .or('proposed_via.eq.client_request,campaign_id.not.is.null')
      // 'scheduled' included: staff can schedule before the owner signs, and the
      // publish cron holds that slot until sign-off — still the owner's turn.
      .in('status', ['approved', 'scheduled'])
      .is('client_signed_off_at', null)
      .order('approved_at', { ascending: false })
      .limit(20),
    // Broken integrations — surfaced here too so the sidebar badge
    // (which counts the agenda) and the inbox page agree. Previously
    // the badge counted these but the inbox page didn't render them,
    // producing "1 notification but nothing's there" confusion.
    admin
      .from('channel_connections')
      .select('id, channel, status, last_sync_at, connected_at')
      .eq('client_id', clientId)
      .in('status', ['error', 'expired', 'disconnected'])
      .limit(10),
    // Delivered creator work — the owner's turn to approve or ask for changes.
    // Previously this state appeared NOWHERE in the inbox (the silent stall):
    // a bridged draft only exists after approval, so pre-approval deliveries
    // were invisible unless the owner happened to open the campaign page.
    admin
      .from('creator_work_orders')
      .select('id, title, discipline, creator_id, campaign_id, updated_at')
      .eq('client_id', clientId)
      .eq('status', 'delivered')
      .order('updated_at', { ascending: false })
      .limit(20),
  ])

  const items: InboxItem[] = []

  for (const d of delivsRow.data ?? []) {
    items.push({
      id: `deliverable-${d.id}`,
      kind: 'approval',
      title: (d.title as string) || 'Content waiting for approval',
      detail: humanize(d.type as string),
      urgency: 'high',
      href: `/dashboard/approvals/${d.id}`,
      whenIso: d.created_at as string,
      status: 'Awaiting your review',
      source: 'apnosh',
      senderName: 'Apnosh team',
      unread: true,
    })
  }

  for (const p of postsRow.data ?? []) {
    const preview = ((p.text as string) ?? '').slice(0, 80).replace(/\s+/g, ' ')
    items.push({
      id: `post-${p.id}`,
      kind: 'post_review',
      title: preview ? `"${preview}${(p.text as string).length > 80 ? '...' : ''}"` : 'Post awaiting review',
      detail: p.scheduled_for
        ? `Scheduled for ${new Date(p.scheduled_for as string).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`
        : undefined,
      urgency: 'medium',
      href: '/dashboard/social/calendar',
      whenIso: (p.updated_at as string) ?? (p.created_at as string),
      status: 'In review',
      source: 'apnosh',
      senderName: 'Apnosh team',
      unread: true,
    })
  }

  for (const r of reviewsRow.data ?? []) {
    const rating = Number(r.rating ?? 0)
    const urgency: InboxItem['urgency'] = rating <= 3 ? 'high' : rating <= 4 ? 'medium' : 'low'
    const excerpt = (r.review_text as string) ?? ''
    const reviewSource = ((r.source as string) ?? 'google') as InboxSource
    items.push({
      id: `review-${r.id}`,
      kind: 'review',
      title: `New ${rating}-star review`,
      detail: excerpt ? excerpt.slice(0, 120) + (excerpt.length > 120 ? '...' : '') : 'No comment left',
      urgency,
      href: '/dashboard/local-seo/reviews',
      whenIso: r.posted_at as string,
      status: `${rating}★`,
      source: reviewSource,
      senderName: (r.author_name as string) ?? 'A customer',
      unread: true,
    })
  }

  for (const t of tasksRow.data ?? []) {
    const dueAt = t.due_at ? new Date(t.due_at as string) : null
    const now = new Date()
    let dueUrgency: InboxItem['urgency'] = 'low'
    let dueLabel: string | undefined
    if (dueAt) {
      const hoursLeft = (dueAt.getTime() - now.getTime()) / 3600_000
      if (hoursLeft < 0) {
        dueUrgency = 'high'
        dueLabel = 'Overdue'
      } else if (hoursLeft < 24) {
        dueUrgency = 'high'
        dueLabel = 'Due today'
      } else if (hoursLeft < 72) {
        dueUrgency = 'medium'
        dueLabel = `Due ${dueAt.toLocaleString('en-US', { weekday: 'short' })}`
      } else {
        dueUrgency = 'low'
        dueLabel = `Due ${dueAt.toLocaleString('en-US', { month: 'short', day: 'numeric' })}`
      }
    }

    // For client-submitted requests, show the workflow stage label
    // ("Received" / "In progress") rather than only the due date.
    // This is the client-side echo of the staff inbox actions.
    const taskStatus = t.status as string
    const taskSource = t.source as string | null
    const isClientRequest = taskSource === 'client_request'
    let workflowLabel: string | undefined
    let workflowUrgency: InboxItem['urgency'] | undefined
    if (isClientRequest) {
      if (taskStatus === 'todo') {
        workflowLabel = 'Received'
        workflowUrgency = 'medium'
      } else if (taskStatus === 'doing') {
        workflowLabel = (t.draft_id as string | null)
          ? 'Drafting'
          : 'In progress'
        workflowUrgency = 'low'
      }
    }

    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      title: t.title as string,
      detail: undefined,
      urgency: workflowUrgency ?? dueUrgency,
      href: '/dashboard/inbox',
      whenIso: (t.created_at as string) ?? new Date().toISOString(),
      status: workflowLabel ?? dueLabel,
      source: 'apnosh',
      senderName: 'Your team',
      unread: true,
    })
  }

  // Approved drafts awaiting client sign-off — the natural next step
  // after staff hits "approve" on a client-request or campaign draft.
  // Click-through goes to the preview page where the owner can read
  // the caption and approve in one tap.
  for (const d of draftApprovalsRow.data ?? []) {
    const idea = (d.idea as string) ?? 'Approval ready'
    const caption = (d.caption as string) ?? ''
    items.push({
      id: `client-approval-${d.id}`,
      kind: 'approval',
      title: idea,
      detail: caption ? caption.slice(0, 120) + (caption.length > 120 ? '…' : '') : 'Tap to read the caption and approve',
      urgency: 'high',
      href: `/dashboard/preview/${d.id}`,
      whenIso: (d.approved_at as string) ?? (d.updated_at as string) ?? new Date().toISOString(),
      status: 'Ready for your review',
      source: 'apnosh',
      senderName: 'Apnosh team',
      unread: true,
    })
  }

  // Delivered creator pieces waiting on the owner's verdict. Reuses kind
  // 'approval' so chips/icons/read-state all work unchanged; the campaign
  // page carries the Approve / Ask-for-changes buttons.
  for (const o of creatorDeliveriesRow.data ?? []) {
    items.push({
      id: `creator-delivery-${o.id}`,
      kind: 'approval',
      title: (o.title as string) || 'Delivered work',
      detail: 'The finished piece is in. Approve it or ask for changes.',
      urgency: 'high',
      href: o.campaign_id ? `/dashboard/campaigns/${o.campaign_id}` : '/dashboard/campaigns',
      whenIso: (o.updated_at as string) ?? new Date().toISOString(),
      status: 'Ready for your review',
      source: 'apnosh',
      senderName: creatorById((o.creator_id as string) ?? '')?.name ?? 'Apnosh team',
      unread: true,
    })
  }

  // Broken integrations. Match the agenda's urgency='high' so the
  // sidebar badge and the inbox page stay in sync.
  const CHANNEL_LABEL: Record<string, string> = {
    instagram: 'Instagram',
    facebook: 'Facebook',
    tiktok: 'TikTok',
    linkedin: 'LinkedIn',
    google_analytics: 'Google Analytics',
    google_business_profile: 'Google Business Profile',
    google_search_console: 'Search Console',
    yelp: 'Yelp',
  }
  /* Map channel string to InboxSource. Anything we don't recognize
     falls back to 'system' so connection rows still render with a
     sensible badge. */
  const CHANNEL_TO_SOURCE: Record<string, InboxSource> = {
    instagram: 'instagram',
    facebook: 'facebook',
    tiktok: 'tiktok',
    google_business_profile: 'google',
    google_analytics: 'google',
    google_search_console: 'google',
    yelp: 'yelp',
  }
  for (const c of connectionsRow.data ?? []) {
    const channel = (c.channel as string) ?? 'integration'
    const label = CHANNEL_LABEL[channel] ?? channel
    const status = (c.status as string) ?? 'broken'
    items.push({
      id: `connection-${c.id}`,
      kind: 'connection',
      title: `Reconnect ${label}`,
      detail: status === 'expired'
        ? 'The connection token expired. One tap to refresh.'
        : status === 'disconnected'
        ? 'Disconnected. Reconnect to keep the data flowing.'
        : 'Something\'s off with this connection.',
      urgency: 'high',
      href: '/dashboard/connected-accounts',
      whenIso: ((c.last_sync_at as string) ?? (c.connected_at as string)) ?? new Date().toISOString(),
      status: status === 'expired' ? 'Expired' : status === 'disconnected' ? 'Disconnected' : 'Needs attention',
      source: CHANNEL_TO_SOURCE[channel] ?? 'system',
      senderName: label,
      unread: true,
    })
  }

  /* Apply read state — items whose id is in the user's read set get
     unread=false. Items default to unread=true at construction time. */
  const readSet = await readSetPromise
  for (const item of items) {
    if (readSet.has(item.id)) item.unread = false
  }

  items.sort((a, b) => {
    const r = URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency]
    if (r !== 0) return r
    return new Date(b.whenIso).getTime() - new Date(a.whenIso).getTime()
  })

  return items
}

function humanize(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
