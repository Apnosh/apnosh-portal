'use server'

/**
 * Recent reviews with text for the dashboard's "Latest reviews" rail.
 *
 * Distinct from getAgenda's review items, which only return labels.
 * The dashboard needs the actual quote + flag status to render the
 * Direction D card design.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface RecentReviewItem {
  id: string
  authorName: string
  rating: number
  text: string | null
  source: string
  postedAt: string
  replied: boolean
  needsReply: boolean
}

export interface RecentReviewsResult {
  items: RecentReviewItem[]
  avgRating: number | null
  total: number
}

export async function getRecentReviews(
  clientId: string,
  limit = 3,
): Promise<RecentReviewsResult> {
  const admin = createAdminClient()

  const [recentRes, statsRes] = await Promise.all([
    admin
      .from('reviews')
      .select('id, author_name, rating, review_text, source, posted_at, response_text')
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false })
      .limit(limit),
    admin
      .from('reviews')
      .select('rating', { count: 'exact' })
      .eq('client_id', clientId),
  ])

  const items: RecentReviewItem[] = (recentRes.data ?? []).map(r => {
    const rating = Number(r.rating ?? 0)
    return {
      id: r.id as string,
      authorName: (r.author_name as string) || 'A customer',
      rating,
      text: (r.review_text as string) ?? null,
      source: ((r.source as string) ?? 'google').toLowerCase(),
      postedAt: r.posted_at as string,
      replied: !!r.response_text,
      /* Lower-star reviews need a reply prompt regardless of state. */
      needsReply: !r.response_text && rating <= 3,
    }
  })

  /* Average rating across all reviews — cheap roll-up since we need
     the count anyway for the "★ 4.7 · 312 total" header line. */
  const ratings = (statsRes.data ?? []).map(r => Number(r.rating ?? 0)).filter(n => n > 0)
  const avgRating = ratings.length > 0
    ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
    : null

  return {
    items,
    avgRating,
    total: statsRes.count ?? ratings.length,
  }
}
