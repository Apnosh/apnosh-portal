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
  /** Identifies ONE piece of content posted to several platforms on the same
   *  day. Null when the row has no caption to match on. See crossPostKey. */
  crossKey: string | null
}

/**
 * The type chip. Reel ONLY when the platform's own reel-only metric is present (their spec:
 * "Instagram Reels only, 0 for non-Reels media"), never inferred from anything else. A row
 * with no usable type stays "Post" rather than being guessed into a category.
 *
 * THE PERMALINK IS ALSO EVIDENCE, and better evidence than the metric for three
 * of the five networks. The vendor leaves media_product_type empty on every row
 * we hold, and the reel-only watch-time metric exists on Instagram alone -- so a
 * Facebook reel came through as a plain "Video" while its own URL said
 * facebook.com/reel/. That is the platform's word for what the thing is, not a
 * guess from a duration or an aspect ratio. YouTube Shorts are NOT inferred:
 * their links arrive as ordinary /watch?v= URLs and nothing else in the payload
 * separates one from a landscape upload, so they stay "Video" until something
 * real says otherwise.
 */
export function postType(mediaType: string | null, product: string | null, isReel = false, permalink?: string | null): string {
  const p = (product ?? '').toUpperCase()
  const m = (mediaType ?? '').toUpperCase()
  const url = (permalink ?? '').toLowerCase()
  if (/\/(reel|reels)\//.test(url)) return 'Reel'
  if (/\/shorts\//.test(url)) return 'Short'
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
  caption?: string | null
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
    type: postType(p.media_type ?? null, p.media_product_type ?? null, isReel, p.permalink ?? null),
    reach: value,
    pending: value === 0 && state !== 'synced',
    unreported: value === 0 && state === 'synced' && !measured,
    likes: p.likes ?? 0,
    saves: p.saves ?? 0,
    postedAt: p.posted_at ?? null,
    crossKey: crossPostKey(p.caption ?? null, p.posted_at ?? null),
  }
}

/**
 * THE ONE THING NO FREE TOOL CAN SHOW THEM.
 * ==========================================
 * A restaurant posts the same thing to four platforms on the same day and gets
 * four wildly different results. Every platform's own dashboard sees only
 * itself, so nobody can put those four numbers side by side. This product holds
 * all four and has never known they were related -- they sit in the list as
 * separate rows, ordered by time, and the connection is invisible.
 *
 * The key is the posting DAY plus a normalised caption. Platforms rarely carry
 * a shared id, and captions are edited per platform (hashtags moved, a mention
 * added, an emoji swapped), so this strips what varies and keeps the words:
 * lowercase, hashtags and mentions and urls removed, punctuation and emoji
 * dropped, whitespace collapsed, then the first sixty characters.
 *
 * Deliberately conservative. Too short a caption is not evidence of anything --
 * "New today" posted twice in a week is not one piece of content -- so anything
 * under twenty characters of real words returns null and stays an ordinary row.
 * A missed grouping is invisible; a wrong one tells the owner two different
 * posts are the same, and that is the kind of error this codebase keeps finding.
 */
export function crossPostKey(caption: string | null, postedAt: string | null): string | null {
  if (!caption || !postedAt) return null
  const day = String(postedAt).slice(0, 10)
  if (day.length !== 10) return null
  const words = caption
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, ' ')      // links differ per platform
    .replace(/[#@][\p{L}\p{N}_]+/gu, ' ')  // hashtags and mentions are platform habits
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')    // punctuation and emoji
    .replace(/\s+/g, ' ')
    .trim()
  if (words.length < 20) return null
  return `${day}:${words.slice(0, 60)}`
}

/** Newest first. Shared so the summary's five are literally the first five of the full list. */
export function newestFirst<T extends { posted_at?: string | null }>(rows: T[]): T[] {
  return rows.slice().sort((x, y) => new Date(y.posted_at ?? 0).getTime() - new Date(x.posted_at ?? 0).getTime())
}
