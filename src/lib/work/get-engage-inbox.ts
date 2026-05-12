/**
 * Community manager's unified inbox: open comments / DMs / mentions
 * across the entire assigned book of clients, scoped by RLS.
 *
 * Reads from social_interactions, NOT the live Meta API. The webhook
 * (or a sync job) populates the table; this query stays fast even at
 * 50+ clients.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type InteractionKind = 'comment' | 'dm' | 'mention'
export type InteractionStatus = 'open' | 'replied' | 'dismissed' | 'spam'
export type InteractionSentiment = 'positive' | 'negative' | 'neutral' | 'question' | null

export interface InteractionRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  platform: string
  externalId: string
  kind: InteractionKind
  authorName: string | null
  authorHandle: string | null
  text: string
  postCaptionSnippet: string | null
  createdAtPlatform: string
  status: InteractionStatus
  replyText: string | null
  replyAt: string | null
  aiAssisted: boolean
  sentiment: InteractionSentiment
  requiresAttention: boolean
}

const SELECT =
  'id, client_id, platform, external_id, kind, author_name, author_handle, text, post_caption_snippet, created_at_platform, status, reply_text, reply_at, ai_assisted, sentiment, requires_attention'

interface RawInteraction {
  id: string
  client_id: string
  platform: string
  external_id: string
  kind: InteractionKind
  author_name: string | null
  author_handle: string | null
  text: string
  post_caption_snippet: string | null
  created_at_platform: string
  status: InteractionStatus
  reply_text: string | null
  reply_at: string | null
  ai_assisted: boolean
  sentiment: InteractionSentiment
  requires_attention: boolean
}

export interface InboxBuckets {
  open: InteractionRow[]
  attention: InteractionRow[]
  replied: InteractionRow[]
}

export async function getEngageInbox(): Promise<InboxBuckets> {
  const supabase = await createServerClient()

  const [openRes, repliedRes] = await Promise.all([
    supabase
      .from('social_interactions')
      .select(SELECT)
      .eq('status', 'open')
      .order('created_at_platform', { ascending: false })
      .limit(150),
    supabase
      .from('social_interactions')
      .select(SELECT)
      .eq('status', 'replied')
      .order('reply_at', { ascending: false })
      .limit(30),
  ])

  const all = [
    ...((openRes.data ?? []) as RawInteraction[]),
    ...((repliedRes.data ?? []) as RawInteraction[]),
  ]

  const clientIds = Array.from(new Set(all.map(i => i.client_id)))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', clientIds)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  const toRow = (r: RawInteraction): InteractionRow => {
    const c = clientMap.get(r.client_id) ?? { name: null, slug: null }
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: c.name,
      clientSlug: c.slug,
      platform: r.platform,
      externalId: r.external_id,
      kind: r.kind,
      authorName: r.author_name,
      authorHandle: r.author_handle,
      text: r.text,
      postCaptionSnippet: r.post_caption_snippet,
      createdAtPlatform: r.created_at_platform,
      status: r.status,
      replyText: r.reply_text,
      replyAt: r.reply_at,
      aiAssisted: r.ai_assisted,
      sentiment: r.sentiment,
      requiresAttention: r.requires_attention,
    }
  }

  const openRows = ((openRes.data ?? []) as RawInteraction[]).map(toRow)
  const repliedRows = ((repliedRes.data ?? []) as RawInteraction[]).map(toRow)

  return {
    open: openRows.filter(r => !r.requiresAttention),
    attention: openRows.filter(r => r.requiresAttention),
    replied: repliedRows,
  }
}
