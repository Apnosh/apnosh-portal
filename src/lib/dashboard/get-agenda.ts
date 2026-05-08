'use server'

/**
 * Build the unified Agenda for the dashboard — every item that needs
 * the owner's attention, prioritized.
 *
 * Pulls from existing tables only (no new schema):
 *   - reviews                  → unanswered reviews, low-star first
 *   - deliverables             → pending approvals (status='client_review')
 *   - channel_connections      → broken / expired integrations
 *   - scheduled_posts          → drafts not yet scheduled
 *   - client_tasks             → manual to-dos visible to client
 *
 * One sortable list, urgency-ranked. The dashboard renders this as a
 * single card; everything actionable lives here.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type AgendaUrgency = 'high' | 'medium' | 'low'
export type AgendaType = 'review' | 'approval' | 'connection' | 'draft' | 'task' | 'suggestion'

export interface AgendaItem {
  id: string
  type: AgendaType
  urgency: AgendaUrgency
  label: string
  detail?: string  // optional second-line preview, e.g. AI draft
  href: string
  actionLabel: string
}

const URGENCY_RANK: Record<AgendaUrgency, number> = { high: 0, medium: 1, low: 2 }

export async function getAgenda(clientId: string): Promise<AgendaItem[]> {
  const admin = createAdminClient()

  const [reviewsRow, approvalsRow, connectionsRow, draftsRow, tasksRow] = await Promise.all([
    admin
      .from('reviews')
      .select('id, rating, author_name, review_text, posted_at')
      .eq('client_id', clientId)
      .is('response_text', null)
      .order('rating', { ascending: true })
      .order('posted_at', { ascending: false })
      .limit(5),
    admin
      .from('deliverables')
      .select('id, title, type, scheduled_for')
      .eq('business_id', clientId)
      .eq('status', 'client_review')
      .order('scheduled_for', { ascending: true, nullsFirst: false })
      .limit(5),
    admin
      .from('channel_connections')
      .select('id, channel, status')
      .eq('client_id', clientId)
      .in('status', ['error', 'expired', 'disconnected'])
      .limit(5),
    admin
      .from('scheduled_posts')
      .select('id, text, status')
      .eq('client_id', clientId)
      .eq('status', 'draft')
      .is('scheduled_for', null)
      .order('created_at', { ascending: false })
      .limit(3),
    admin
      .from('client_tasks')
      .select('id, title, due_at, status, snoozed_until')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(5),
  ])

  const items: AgendaItem[] = []

  // ── Reviews
  for (const r of reviewsRow.data ?? []) {
    const lowStar = (r.rating ?? 5) <= 3
    const author = r.author_name || 'A customer'
    const snippet = r.review_text ? `"${(r.review_text as string).trim().slice(0, 60)}${(r.review_text as string).length > 60 ? '…' : ''}"` : undefined
    items.push({
      id: `review-${r.id}`,
      type: 'review',
      urgency: lowStar ? 'high' : 'medium',
      label: lowStar
        ? `${r.rating}★ review from ${author} needs reply`
        : `New ${r.rating}★ review from ${author} — reply ready`,
      detail: snippet,
      href: '/dashboard/local-seo/reviews',
      actionLabel: 'Reply',
    })
  }

  // ── Approvals
  for (const a of approvalsRow.data ?? []) {
    const dueLabel = a.scheduled_for
      ? `· goes live ${new Date(a.scheduled_for).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      : ''
    items.push({
      id: `approval-${a.id}`,
      type: 'approval',
      urgency: a.scheduled_for && new Date(a.scheduled_for).getTime() - Date.now() < 48 * 3600 * 1000 ? 'high' : 'medium',
      label: `Approve: ${a.title || a.type || 'Content'} ${dueLabel}`.trim(),
      href: '/dashboard/approvals',
      actionLabel: 'Review',
    })
  }

  // ── Broken connections
  const PLATFORM_LABEL: Record<string, string> = {
    instagram: 'Instagram', facebook: 'Facebook', tiktok: 'TikTok',
    linkedin: 'LinkedIn', google: 'Google Business', yelp: 'Yelp',
    google_analytics: 'Google Analytics', search_console: 'Search Console',
  }
  for (const c of connectionsRow.data ?? []) {
    const channel = PLATFORM_LABEL[c.channel as string] ?? (c.channel as string)
    items.push({
      id: `conn-${c.id}`,
      type: 'connection',
      urgency: 'high',  // broken integrations block everything else
      label: `Reconnect ${channel}`,
      detail: c.status === 'expired' ? 'Token expired' : 'Connection broken',
      href: '/dashboard/connected-accounts',
      actionLabel: 'Reconnect',
    })
  }

  // ── Drafts
  for (const d of draftsRow.data ?? []) {
    const text = (d.text as string | null) ?? ''
    const snippet = text.trim().replace(/\s+/g, ' ').slice(0, 60)
    items.push({
      id: `draft-${d.id}`,
      type: 'draft',
      urgency: 'low',
      label: 'Draft post — not scheduled',
      detail: snippet ? `"${snippet}${text.length > 60 ? '…' : ''}"` : undefined,
      href: '/dashboard/social',
      actionLabel: 'Schedule',
    })
  }

  // ── Manual tasks
  const nowMs = Date.now()
  for (const t of tasksRow.data ?? []) {
    if (t.snoozed_until && new Date(t.snoozed_until as string).getTime() > nowMs) continue
    const overdue = t.due_at ? new Date(t.due_at as string).getTime() < nowMs : false
    items.push({
      id: `task-${t.id}`,
      type: 'task',
      urgency: overdue ? 'high' : 'medium',
      label: (t.title as string) || 'Task to complete',
      href: '/dashboard',
      actionLabel: 'Open',
    })
  }

  // ── AI suggestion (always last, low-priority unless empty)
  if (items.length === 0) {
    items.push({
      id: 'suggestion-empty',
      type: 'suggestion',
      urgency: 'low',
      label: "You're caught up — want me to draft your next post?",
      href: '/dashboard/social/new?ai=1',
      actionLabel: 'Draft',
    })
  }

  return items.sort((a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency])
}
