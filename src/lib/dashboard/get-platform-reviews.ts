'use server'

/**
 * Cross-platform review snapshot for the connected client.
 *
 * Reads `review_metrics` (per-platform daily aggregates that the
 * Yelp + future sync jobs populate) and returns the latest rating +
 * count + new-this-period for each platform we know about. Surfaces
 * Yelp performance even when we can't fetch individual reviews
 * (Yelp Fusion free tier doesn't expose review text).
 *
 * Also folds in Google from the `reviews` table since that's where
 * individual Google reviews live.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface PlatformSnapshot {
  platform: 'google' | 'yelp' | 'facebook' | 'tripadvisor' | 'other'
  ratingAvg: number | null
  reviewCount: number
  newReviewsThisMonth: number
  /** True if there's a connection on file for this platform. */
  connected: boolean
  /** True if we can show individual reviews (Google yes, Yelp no on free tier). */
  hasIndividualReviews: boolean
}

const PLATFORMS_TO_REPORT: PlatformSnapshot['platform'][] = ['google', 'yelp']

export async function getPlatformReviewSnapshots(clientId: string): Promise<PlatformSnapshot[]> {
  const admin = createAdminClient()
  const now = new Date()
  const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate()).toISOString().slice(0, 10)

  const [reviewMetricsRes, googleReviewsRes, connectionsRes] = await Promise.all([
    admin
      .from('review_metrics')
      .select('platform, date, rating_avg, review_count, new_reviews')
      .eq('client_id', clientId)
      .gte('date', monthAgo)
      .order('date', { ascending: false }),
    admin
      .from('reviews')
      .select('rating, posted_at')
      .eq('client_id', clientId)
      .eq('source', 'google'),
    admin
      .from('channel_connections')
      .select('channel, status')
      .eq('client_id', clientId)
      .in('channel', ['google_business_profile', 'yelp']),
  ])

  const reviewMetrics = (reviewMetricsRes.data ?? []) as Array<{
    platform: string
    date: string
    rating_avg: number | null
    review_count: number | null
    new_reviews: number | null
  }>
  const googleReviews = (googleReviewsRes.data ?? []) as Array<{ rating: number; posted_at: string }>
  const connections = (connectionsRes.data ?? []) as Array<{ channel: string; status: string }>

  const connByChannel = new Map(connections.map(c => [c.channel, c.status === 'active']))

  /* Pick the most-recent snapshot for each platform. */
  const latestByPlatform = new Map<string, typeof reviewMetrics[number]>()
  for (const m of reviewMetrics) {
    if (!latestByPlatform.has(m.platform)) latestByPlatform.set(m.platform, m)
  }

  /* Sum new_reviews over the last 30 days per platform. */
  const newReviewsByPlatform = new Map<string, number>()
  for (const m of reviewMetrics) {
    newReviewsByPlatform.set(
      m.platform,
      (newReviewsByPlatform.get(m.platform) ?? 0) + (m.new_reviews ?? 0)
    )
  }

  const snapshots: PlatformSnapshot[] = []
  for (const platform of PLATFORMS_TO_REPORT) {
    /* Google's individual-review pipeline writes to the reviews table,
       so for Google we compute from there directly. Yelp + others come
       from review_metrics aggregates. */
    if (platform === 'google') {
      const ratingAvg = googleReviews.length > 0
        ? googleReviews.reduce((a, b) => a + b.rating, 0) / googleReviews.length
        : null
      const newThisMonth = googleReviews.filter(r =>
        new Date(r.posted_at).getTime() > new Date(monthAgo).getTime()
      ).length
      snapshots.push({
        platform,
        ratingAvg,
        reviewCount: googleReviews.length,
        newReviewsThisMonth: newThisMonth,
        connected: connByChannel.get('google_business_profile') ?? false,
        hasIndividualReviews: true,
      })
    } else {
      const latest = latestByPlatform.get(platform)
      snapshots.push({
        platform,
        ratingAvg: latest?.rating_avg ?? null,
        reviewCount: latest?.review_count ?? 0,
        newReviewsThisMonth: newReviewsByPlatform.get(platform) ?? 0,
        connected: connByChannel.get(platform) ?? false,
        hasIndividualReviews: false,
      })
    }
  }

  return snapshots
}
