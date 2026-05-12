/**
 * Local SEO manager's review queue: unanswered + recently-replied
 * reviews across the buyer's book, scoped via RLS in migration 115.
 *
 * Triage prioritizes 1-2 star unanswered reviews first (those rot
 * the GBP rating fastest); then everything else oldest-first.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type ReviewStatus = 'open' | 'replied' | 'dismissed'
export type ReviewSource = 'gbp' | 'yelp' | 'tripadvisor' | 'apple_maps'

export interface ReviewRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  source: ReviewSource
  externalId: string
  externalUrl: string | null
  reviewerName: string | null
  reviewerAvatarUrl: string | null
  reviewerIsLocalGuide: boolean
  rating: number
  text: string | null
  language: string | null
  createdAtPlatform: string
  status: ReviewStatus
  replyText: string | null
  replyAt: string | null
  aiAssisted: boolean
}

interface RawReview {
  id: string
  client_id: string
  source: ReviewSource
  external_id: string
  external_url: string | null
  reviewer_name: string | null
  reviewer_avatar_url: string | null
  reviewer_is_local_guide: boolean
  rating: number
  text: string | null
  language: string | null
  created_at_platform: string
  status: ReviewStatus
  reply_text: string | null
  reply_at: string | null
  ai_assisted: boolean
}

export interface ReviewBuckets {
  urgent: ReviewRow[]   // open + rating <= 2
  open: ReviewRow[]     // open + rating >= 3
  replied: ReviewRow[]
}

const SELECT =
  'id, client_id, source, external_id, external_url, reviewer_name, reviewer_avatar_url, reviewer_is_local_guide, rating, text, language, created_at_platform, status, reply_text, reply_at, ai_assisted'

export async function getReviewsQueue(): Promise<ReviewBuckets> {
  const supabase = await createServerClient()

  const [openRes, repliedRes] = await Promise.all([
    supabase
      .from('local_reviews')
      .select(SELECT)
      .eq('status', 'open')
      .order('created_at_platform', { ascending: true })
      .limit(150),
    supabase
      .from('local_reviews')
      .select(SELECT)
      .eq('status', 'replied')
      .order('reply_at', { ascending: false })
      .limit(30),
  ])

  const all = [
    ...((openRes.data ?? []) as RawReview[]),
    ...((repliedRes.data ?? []) as RawReview[]),
  ]
  const clientIds = Array.from(new Set(all.map(r => r.client_id)))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', clientIds)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  const toRow = (r: RawReview): ReviewRow => {
    const c = clientMap.get(r.client_id) ?? { name: null, slug: null }
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: c.name,
      clientSlug: c.slug,
      source: r.source,
      externalId: r.external_id,
      externalUrl: r.external_url,
      reviewerName: r.reviewer_name,
      reviewerAvatarUrl: r.reviewer_avatar_url,
      reviewerIsLocalGuide: r.reviewer_is_local_guide,
      rating: r.rating,
      text: r.text,
      language: r.language,
      createdAtPlatform: r.created_at_platform,
      status: r.status,
      replyText: r.reply_text,
      replyAt: r.reply_at,
      aiAssisted: r.ai_assisted,
    }
  }

  const openRows = ((openRes.data ?? []) as RawReview[]).map(toRow)
  const repliedRows = ((repliedRes.data ?? []) as RawReview[]).map(toRow)

  return {
    urgent: openRows.filter(r => r.rating <= 2),
    open: openRows.filter(r => r.rating >= 3),
    replied: repliedRows,
  }
}
