'use server'

/**
 * Reads everything the Library page surfaces:
 *   - Drafts awaiting review (scheduled_posts in draft / in_review)
 *   - Hashtag sets (admin-curated bundles)
 *   - Media library — distinct media URLs from the client's recent
 *     posts, so they can see what visuals are already in the bank
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface DraftPost {
  id: string
  text: string
  mediaUrl: string | null
  mediaType: 'image' | 'video' | 'carousel' | null
  platforms: string[]
  status: string
  updatedAt: string | null
}

export interface HashtagSet {
  id: string
  name: string
  category: string | null
  hashtags: string[]
}

export interface MediaItem {
  url: string
  mediaType: 'image' | 'video' | 'carousel' | null
  usedInPostId: string
  usedAt: string | null
  caption: string
}

export interface LibraryData {
  drafts: DraftPost[]
  hashtagSets: HashtagSet[]
  media: MediaItem[]
}

export async function getLibrary(clientId: string): Promise<LibraryData> {
  const admin = createAdminClient()

  const [draftsRow, hashtagsRow, mediaRow] = await Promise.all([
    admin
      .from('scheduled_posts')
      .select('id, text, media_urls, media_type, platforms, status, updated_at')
      .eq('client_id', clientId)
      .in('status', ['draft', 'in_review'])
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(40),
    admin
      .from('hashtag_sets')
      .select('id, name, category, hashtags')
      .eq('client_id', clientId)
      .order('category', { ascending: true, nullsFirst: true })
      .order('name', { ascending: true })
      .limit(50),
    admin
      .from('scheduled_posts')
      .select('id, text, media_urls, media_type, updated_at')
      .eq('client_id', clientId)
      .not('media_urls', 'is', null)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(80),
  ])

  const drafts: DraftPost[] = (draftsRow.data ?? []).map(d => ({
    id: d.id as string,
    text: ((d.text as string) ?? '').slice(0, 240),
    mediaUrl: ((d.media_urls as string[] | null) ?? [])[0] ?? null,
    mediaType: (d.media_type as DraftPost['mediaType']) ?? null,
    platforms: (d.platforms as string[] | null) ?? [],
    status: d.status as string,
    updatedAt: (d.updated_at as string | null) ?? null,
  }))

  const hashtagSets: HashtagSet[] = (hashtagsRow.data ?? []).map(h => ({
    id: h.id as string,
    name: (h.name as string) ?? 'Set',
    category: (h.category as string | null) ?? null,
    hashtags: (h.hashtags as string[] | null) ?? [],
  }))

  // De-dup media by URL across posts.
  const seen = new Set<string>()
  const media: MediaItem[] = []
  for (const r of mediaRow.data ?? []) {
    const urls = (r.media_urls as string[] | null) ?? []
    for (const u of urls) {
      if (!u || seen.has(u)) continue
      seen.add(u)
      media.push({
        url: u,
        mediaType: (r.media_type as MediaItem['mediaType']) ?? null,
        usedInPostId: r.id as string,
        usedAt: (r.updated_at as string | null) ?? null,
        caption: ((r.text as string) ?? '').slice(0, 120),
      })
      if (media.length >= 48) break
    }
    if (media.length >= 48) break
  }

  return { drafts, hashtagSets, media }
}
