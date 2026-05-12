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
 *
 * Sorted by urgency, then by recency. Each item carries an href to
 * the right detail page so the inbox is fast to triage.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type InboxItemKind = 'approval' | 'post_review' | 'review' | 'task' | 'connection'

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
}

const URGENCY_RANK: Record<InboxItem['urgency'], number> = { high: 0, medium: 1, low: 2 }

export async function getInbox(clientId: string): Promise<InboxItem[]> {
  const admin = createAdminClient()

  const [delivsRow, postsRow, reviewsRow, tasksRow, draftApprovalsRow, connectionsRow] = await Promise.all([
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
      .select('id, author_name, rating, posted_at, review_text')
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
    // Approved drafts that originated from a client_request — these
    // are waiting for the client's final sign-off / review.
    admin
      .from('content_drafts')
      .select('id, idea, caption, status, proposed_via, updated_at, approved_at, client_signed_off_at')
      .eq('client_id', clientId)
      .eq('proposed_via', 'client_request')
      .eq('status', 'approved')
      .is('client_signed_off_at', null)
      .order('approved_at', { ascending: false })
      .limit(20),
    // Broken integrations — surfaced here too so the sidebar badge
    // (which counts the agenda) and the inbox page agree. Previously
    // the badge counted these but the inbox page didn't render them,
    // producing "1 notification but nothing's there" confusion.
    admin
      .from('channel_connections')
      .select('id, channel, status, updated_at')
      .eq('client_id', clientId)
      .in('status', ['error', 'expired', 'disconnected'])
      .limit(10),
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
    })
  }

  for (const r of reviewsRow.data ?? []) {
    const rating = Number(r.rating ?? 0)
    const urgency: InboxItem['urgency'] = rating <= 3 ? 'high' : rating <= 4 ? 'medium' : 'low'
    const excerpt = (r.review_text as string) ?? ''
    items.push({
      id: `review-${r.id}`,
      kind: 'review',
      title: `${r.author_name ?? 'A customer'} left a ${rating}-star review`,
      detail: excerpt ? excerpt.slice(0, 120) + (excerpt.length > 120 ? '...' : '') : undefined,
      urgency,
      href: '/dashboard/local-seo/reviews',
      whenIso: r.posted_at as string,
      status: `${rating}★`,
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
    })
  }

  // Approved drafts awaiting client sign-off — the natural next step
  // after staff hits "approve" on a draft originated from a client
  // request. Click-through goes to the preview page where the owner
  // can read the caption and approve in one tap.
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
      whenIso: (c.updated_at as string) ?? new Date().toISOString(),
      status: status === 'expired' ? 'Expired' : status === 'disconnected' ? 'Disconnected' : 'Needs attention',
    })
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
