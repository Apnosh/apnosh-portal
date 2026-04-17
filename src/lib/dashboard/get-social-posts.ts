'use server'

import { createClient } from '@/lib/supabase/server'

export interface SocialPost {
  id: string
  platform: string
  external_id: string
  permalink: string | null
  media_type: string | null          // IMAGE / VIDEO / CAROUSEL_ALBUM
  media_product_type: string | null  // FEED / REELS / STORY
  caption: string | null
  thumbnail_url: string | null
  posted_at: string
  reach: number | null
  likes: number | null
  comments: number | null
  saves: number | null
  shares: number | null
  video_views: number | null
  total_interactions: number | null
}

/**
 * Returns all synced social posts for a client, ordered by most recent first.
 * The performance page filters/sorts this list for different sections
 * (top posts by reach, content breakdown, posting cadence, etc).
 */
export async function getSocialPosts(clientId: string, limit: number = 90): Promise<SocialPost[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('social_posts')
    .select('id, platform, external_id, permalink, media_type, media_product_type, caption, thumbnail_url, posted_at, reach, likes, comments, saves, shares, video_views, total_interactions')
    .eq('client_id', clientId)
    .order('posted_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as SocialPost[]
}
