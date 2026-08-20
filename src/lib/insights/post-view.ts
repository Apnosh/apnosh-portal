import 'server-only'

/**
 * ONE place that turns a stored social_posts row into what the owner sees.
 *
 * Extracted when the full "all posts" page was added (2026-08-13). The five-post summary and
 * the full list must never disagree about what a post reached or what kind of post it is, and
 * the honesty rules below are exactly the ones that took a whole evening to get right:
 *
 *   · a post whose numbers have not synced says so, instead of showing a false 0
 *   · a post kind that never reports reach (a Story) says so, instead of looking like a flop
 *   · the type chip is read from real fields, never guessed
 *
 * A second copy of this logic on the list page would be the next place one of those regresses.
 */

export interface PostView {
  id: string
  platform: string
  permalink: string | null
  thumbnailUrl: string | null
  type: string
  reach: number
  /** the vendor has not finished syncing this post's numbers — show that, never a false 0 */
  pending: boolean
  /** this post kind never reports reach at all — an absence, not a zero */
  unreported: boolean
  likes: number
  saves: number
  postedAt: string | null
}

/**
 * The type chip. Reel ONLY when the platform's own reel-only metric is present (their spec:
 * "Instagram Reels only, 0 for non-Reels media"), never inferred from anything else. A row
 * with no usable type stays "Post" rather than being guessed into a category.
 */
export function postType(mediaType: string | null, product: string | null, isReel = false): string {
  const p = (product ?? '').toUpperCase()
  const m = (mediaType ?? '').toUpperCase()
  if (p === 'REELS' || isReel) return 'Reel'
  if (p === 'STORY') return 'Story'
  if (m === 'VIDEO') return 'Video'
  if (m === 'CAROUSEL_ALBUM' || m === 'CAROUSEL') return 'Carousel'
  if (m === 'IMAGE') return 'Photo'
  if (m === 'GIF') return 'GIF'
  if (m === 'TEXT') return 'Text post'
  if (m === 'DOCUMENT') return 'Document'
  return 'Post'
}

/** Keys any platform might use for "how many saw it". Absence of ALL of them means unmeasured. */
const VIEW_KEYS = ['reach', 'impressions', 'views', 'viewCount', 'playCount', 'videoViews']

type Row = {
  id: string
  platform: string
  permalink?: string | null
  thumbnail_url?: string | null
  media_type?: string | null
  media_product_type?: string | null
  reach?: number | null
  video_views?: number | null
  likes?: number | null
  saves?: number | null
  posted_at?: string | null
  raw_data?: unknown
}

export function toPostView(p: Row): PostView {
  const raw = (p.raw_data ?? {}) as Record<string, unknown>
  const a = (raw.analytics ?? {}) as Record<string, unknown>
  const isReel = Number(a.igReelsAvgWatchTime ?? 0) > 0 || Number(a.igReelsVideoViewTotalTime ?? 0) > 0
  const state = String(raw.sync_state ?? 'synced')
  /* VIEWS first (owner call 2026-08-20): views is the number owners recognize —
   * it's what Instagram/TikTok lead with in-app. Posts that report no view
   * count (some photo formats) fall back to reach so a real number still shows. */
  const value = (p.video_views ?? 0) > 0 ? (p.video_views ?? 0) : (p.reach ?? 0)
  const measured = VIEW_KEYS.some((k) => a[k] != null)
  return {
    id: p.id,
    platform: p.platform,
    permalink: p.permalink || null,
    thumbnailUrl: p.thumbnail_url ?? null,
    type: postType(p.media_type ?? null, p.media_product_type ?? null, isReel),
    reach: value,
    pending: value === 0 && state !== 'synced',
    unreported: value === 0 && state === 'synced' && !measured,
    likes: p.likes ?? 0,
    saves: p.saves ?? 0,
    postedAt: p.posted_at ?? null,
  }
}

/** Newest first. Shared so the summary's five are literally the first five of the full list. */
export function newestFirst<T extends { posted_at?: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((x, y) => new Date(y.posted_at ?? 0).getTime() - new Date(x.posted_at ?? 0).getTime())
}
