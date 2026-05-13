'use server'

/**
 * Inbox threads — unified customer conversations from every channel.
 *
 * Merges:
 *   - reviews          (Google, Yelp, etc.)
 *   - social_interactions  (IG DMs, IG comments, mentions)
 *
 * Each row maps to the same Thread shape so the UI renders one list.
 * Severity is derived from rating / requires_attention / responded state.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type ThreadKind = 'review' | 'dm' | 'comment' | 'mention'
export type ThreadSeverity = 'urgent' | 'soon' | 'none' | 'handled'

export interface InboxThread {
  id: string
  kind: ThreadKind
  platform: string                 // 'google' | 'yelp' | 'instagram' | etc.
  authorName: string
  authorHandle: string | null
  /** For reviews. */
  rating: number | null
  text: string
  postedAt: string
  /** For comments — caption snippet of the post they're on. */
  postCaption: string | null
  severity: ThreadSeverity
  tags: string[]
  /** AI-drafted reply if one exists and isn't sent. */
  draftReply: string | null
  /** True when the row has been responded to. */
  replied: boolean
  repliedAt: string | null
  /** Best-effort "unread" — fresh + unanswered. */
  unread: boolean
  /** Stable URL params to deep-link to this thread. */
  refKind: ThreadKind
  refId: string
}

export async function getInboxThreads(clientId: string, limit = 50): Promise<InboxThread[]> {
  const admin = createAdminClient()

  const [reviewsRes, interactionsRes] = await Promise.all([
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
      draftReply: null,  // social_interactions doesn't store drafts yet — AI reply is a future hook
      replied,
      repliedAt: (s.reply_at as string) ?? null,
      unread: !replied,
      refKind: kind,
      refId: s.id as string,
    })
  }

  threads.sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
  return threads.slice(0, limit)
}
