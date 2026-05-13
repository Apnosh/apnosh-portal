'use server'

/**
 * Inbox threads — unified attention surface.
 *
 * Restaurant owners don't think of "approvals" and "customer reviews"
 * as separate concepts — they're all just "stuff I need to look at."
 * This lib merges every kind of thread that might need an owner's
 * attention into one feed, with a stable Thread shape so the UI
 * renders one list.
 *
 * Sources:
 *   - reviews                    → kind='review'   (Google, Yelp, ...)
 *   - social_interactions        → kind='dm'|'comment'|'mention'
 *                                  (IG DMs, IG comments, mentions)
 *   - content_drafts             → kind='approval' (client_request drafts
 *                                  approved internally, awaiting your sign-off)
 *   - deliverables               → kind='approval' (legacy approvals path)
 *
 * Severity is derived per-kind; sorting is by recency across all kinds.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type ThreadKind = 'review' | 'dm' | 'comment' | 'mention' | 'approval'
export type ThreadSeverity = 'urgent' | 'soon' | 'none' | 'handled'

export interface InboxThread {
  id: string
  kind: ThreadKind
  /** Display source — 'google' / 'yelp' / 'instagram' / etc., or 'content' for approvals. */
  platform: string
  authorName: string
  authorHandle: string | null
  rating: number | null
  text: string
  postedAt: string
  /** Comment context: caption of the post they're on. */
  postCaption: string | null
  severity: ThreadSeverity
  tags: string[]
  draftReply: string | null
  replied: boolean
  repliedAt: string | null
  unread: boolean
  refKind: ThreadKind
  refId: string
  /** Approval-only: caption preview the owner is approving. */
  approvalCaption?: string | null
  /** Approval-only: media thumbnails. */
  approvalMediaUrls?: string[]
  /** Approval-only: planned publish date. */
  approvalScheduledFor?: string | null
  /** Approval-only: deep link to the preview / detail page. */
  approvalHref?: string
}

export async function getInboxThreads(clientId: string, limit = 50): Promise<InboxThread[]> {
  const admin = createAdminClient()

  const [reviewsRes, interactionsRes, draftApprovalsRes, deliverableApprovalsRes] = await Promise.all([
    admin
      .from('reviews')
      .select('id, source, rating, author_name, review_text, posted_at, response_text, responded_at, sentiment')
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false })
      .limit(limit),
    admin
      .from('social_interactions')
      .select('id, platform, kind, author_name, author_handle, text, post_caption_snippet, created_at_platform, status, reply_text, reply_at, ai_assisted, sentiment, requires_attention')
      .eq('client_id', clientId)
      .order('created_at_platform', { ascending: false })
      .limit(limit),
    /* Content drafts that originated from a client request, were
       approved internally by staff, and are now waiting on the
       owner's final sign-off. The "Ready for your review" loop. */
    admin
      .from('content_drafts')
      .select('id, idea, caption, media_urls, status, proposed_via, approved_at, target_publish_date, target_platforms, client_signed_off_at')
      .eq('client_id', clientId)
      .eq('proposed_via', 'client_request')
      .eq('status', 'approved')
      .is('client_signed_off_at', null)
      .order('approved_at', { ascending: false })
      .limit(20),
    /* Legacy deliverables awaiting client review (pre-content-engine). */
    admin
      .from('deliverables')
      .select('id, title, type, status, created_at, scheduled_for')
      .eq('business_id', clientId)
      .eq('status', 'client_review')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const threads: InboxThread[] = []

  for (const r of reviewsRes.data ?? []) {
    const rating = Number(r.rating ?? 0)
    const replied = !!r.response_text
    const severity: ThreadSeverity =
      replied ? 'handled'
      : rating > 0 && rating <= 2 ? 'urgent'
      : rating > 0 && rating <= 3 ? 'soon'
      : 'none'
    threads.push({
      id: `review-${r.id}`,
      kind: 'review',
      platform: ((r.source as string) ?? 'google').toLowerCase(),
      authorName: (r.author_name as string) || 'A customer',
      authorHandle: null,
      rating: rating > 0 ? rating : null,
      text: (r.review_text as string) ?? '',
      postedAt: r.posted_at as string,
      postCaption: null,
      severity,
      tags: [],
      draftReply: null,
      replied,
      repliedAt: (r.responded_at as string) ?? null,
      unread: !replied,
      refKind: 'review',
      refId: r.id as string,
    })
  }

  for (const s of interactionsRes.data ?? []) {
    const replied = !!s.reply_text
    const requires = !!s.requires_attention
    const sentiment = (s.sentiment as string) ?? null
    const severity: ThreadSeverity =
      replied ? 'handled'
      : requires ? 'urgent'
      : sentiment === 'negative' ? 'soon'
      : 'none'
    const kind: ThreadKind = s.kind === 'dm' ? 'dm' : s.kind === 'comment' ? 'comment' : 'mention'
    threads.push({
      id: `interaction-${s.id}`,
      kind,
      platform: ((s.platform as string) ?? 'instagram').toLowerCase(),
      authorName: (s.author_name as string) || (s.author_handle as string) || 'Customer',
      authorHandle: (s.author_handle as string) ?? null,
      rating: null,
      text: (s.text as string) ?? '',
      postedAt: (s.created_at_platform as string) ?? new Date().toISOString(),
      postCaption: (s.post_caption_snippet as string) ?? null,
      severity,
      tags: sentiment ? [sentiment] : [],
      draftReply: null,
      replied,
      repliedAt: (s.reply_at as string) ?? null,
      unread: !replied,
      refKind: kind,
      refId: s.id as string,
    })
  }

  /* Approvals — content drafts awaiting sign-off. Urgency rises as
     the planned publish date approaches; 'urgent' if within 24h. */
  const nowMs = Date.now()
  for (const d of draftApprovalsRes.data ?? []) {
    const scheduled = (d.target_publish_date as string) ?? null
    const hoursLeft = scheduled ? (new Date(scheduled).getTime() - nowMs) / 3_600_000 : null
    const severity: ThreadSeverity =
      hoursLeft !== null && hoursLeft < 0 ? 'urgent'
      : hoursLeft !== null && hoursLeft < 24 ? 'urgent'
      : hoursLeft !== null && hoursLeft < 72 ? 'soon'
      : 'none'
    const media = Array.isArray(d.media_urls) ? (d.media_urls as string[]) : []
    threads.push({
      id: `draft-${d.id}`,
      kind: 'approval',
      platform: 'content',
      authorName: (d.idea as string) || 'Content ready for review',
      authorHandle: null,
      rating: null,
      text: ((d.caption as string) ?? '').slice(0, 240),
      postedAt: (d.approved_at as string) ?? new Date().toISOString(),
      postCaption: null,
      severity,
      tags: Array.isArray(d.target_platforms) ? (d.target_platforms as string[]) : [],
      draftReply: null,
      replied: false,
      repliedAt: null,
      unread: true,
      refKind: 'approval',
      refId: d.id as string,
      approvalCaption: (d.caption as string) ?? null,
      approvalMediaUrls: media,
      approvalScheduledFor: scheduled,
      approvalHref: `/dashboard/preview/${d.id}`,
    })
  }

  for (const dl of deliverableApprovalsRes.data ?? []) {
    const scheduled = (dl.scheduled_for as string) ?? null
    const hoursLeft = scheduled ? (new Date(scheduled).getTime() - nowMs) / 3_600_000 : null
    const severity: ThreadSeverity =
      hoursLeft !== null && hoursLeft < 24 ? 'urgent'
      : hoursLeft !== null && hoursLeft < 72 ? 'soon'
      : 'none'
    threads.push({
      id: `deliverable-${dl.id}`,
      kind: 'approval',
      platform: 'content',
      authorName: (dl.title as string) || 'Content awaiting your review',
      authorHandle: null,
      rating: null,
      text: humanizeType(dl.type as string),
      postedAt: (dl.created_at as string) ?? new Date().toISOString(),
      postCaption: null,
      severity,
      tags: [(dl.type as string) ?? ''].filter(Boolean),
      draftReply: null,
      replied: false,
      repliedAt: null,
      unread: true,
      refKind: 'approval',
      refId: dl.id as string,
      approvalScheduledFor: scheduled,
      approvalHref: `/dashboard/approvals/${dl.id}`,
    })
  }

  threads.sort((a, b) => {
    /* Urgent first, then soon, then by recency. Handled threads sink
       below open ones at the same urgency. */
    const sevRank: Record<ThreadSeverity, number> = { urgent: 0, soon: 1, none: 2, handled: 3 }
    const sr = sevRank[a.severity] - sevRank[b.severity]
    if (sr !== 0) return sr
    return new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime()
  })
  return threads.slice(0, limit)
}

function humanizeType(s: string | null | undefined): string {
  if (!s) return ''
  return s.replace(/[_-]+/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}
