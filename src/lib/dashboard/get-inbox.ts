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

export type InboxItemKind = 'approval' | 'post_review' | 'review' | 'task'

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

  const [delivsRow, postsRow, reviewsRow, tasksRow] = await Promise.all([
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
      .select('id, title, status, due_at, created_at')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
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
    items.push({
      id: `task-${t.id}`,
      kind: 'task',
      title: t.title as string,
      detail: undefined,
      urgency: dueUrgency,
      href: '/dashboard/inbox',
      whenIso: (t.created_at as string) ?? new Date().toISOString(),
      status: dueLabel,
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
