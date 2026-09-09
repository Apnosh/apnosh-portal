/**
 * WHAT EACH PLATFORM WILL TAKE — one file, quoted from the vendor.
 * ================================================================
 * OWNER DECISION, 2026-09-09: Zernio's numbers are the rule. Where Zernio and a
 * platform's own documentation disagree (Facebook Reels are 3-60s here and 3-90s
 * in Meta's Graph API docs), we follow Zernio, because Zernio is what we actually
 * post through. The cost of being stricter than the platform is that we
 * occasionally tell someone to post a video themselves that would have gone
 * through. That is a small, honest cost. The cost of being looser is a post that
 * silently fails after they walked away.
 *
 * EVERY RULE CARRIES ITS SOURCE. A previous version of this table was written
 * from memory and got three numbers wrong and invented a fourth capability
 * outright. So each rule quotes the schema sentence it came from, and anything
 * that is our judgement rather than the vendor's is marked `ours`. If
 * `npm run zernio:diff` reports a platform description changed, the quotes below
 * are what to check it against.
 *
 * Pinned schema: vendor/zernio-openapi.json, info.version 1.0.4.
 *
 * SELECTABLE VERSUS DERIVED, which the first version of this got backwards.
 * A caller cannot ask for a Reel or a Short. Instagram's contentType enum is
 * ['story'] and nothing else; Facebook's is ['story','reel']; YouTube has no
 * content-type field at all. Everything else is decided by the vendor from the
 * media you send. So the composer's job is to PREDICT and SHOW what a file will
 * become, not to offer a menu.
 */

export type Platform = 'instagram' | 'facebook' | 'tiktok' | 'youtube' | 'linkedin' | 'googlebusiness'

export interface MediaFacts {
  isVideo: boolean
  /** pixels; 0 when unknown */
  width: number
  height: number
  /** seconds; 0 when unknown or not a video */
  duration: number
  /** bytes */
  size: number
}

export interface PlatformRules {
  name: string
  /** Formats the CALLER may ask for. Everything else the vendor derives. */
  selectable: string[]
  /** Formats the vendor decides from the media, shown but never chosen. */
  derived: string[]
  /** Will not accept a post with no photo or video. */
  needsMedia: boolean
  /** Will not accept a photo. */
  videoOnly: boolean
  /** Most images in one post. 1 means no carousel. */
  maxImages: number
  /** Characters of caption. From POST /v1/tools/validate/post-length, live. */
  captionLimit: number
  /** Where each rule above came from, quoted. */
  source: Record<string, string>
}

const OURS = 'ours, not the vendor'

export const RULES: Record<Platform, PlatformRules> = {
  instagram: {
    name: 'Instagram',
    selectable: ['Story'],
    derived: ['Feed post', 'Carousel', 'Reel'],
    needsMedia: true,
    videoOnly: false,
    maxImages: 10,
    captionLimit: 2200,
    source: {
      selectable: "InstagramPlatformData.contentType enum is ['story']",
      derived: '"Default posts become Reels or feed depending on media."',
      maxImages: '"carousels up to 10 items"',
      needsMedia: '"stories require media (no captions)" and Instagram accepts no text-only post',
      aspect: '"Feed aspect ratio 0.5625-1.91"',
      captionLimit: 'POST /v1/tools/validate/post-length, instagram: 2200',
    },
  },
  facebook: {
    name: 'Facebook',
    selectable: ['Story', 'Reel'],
    derived: ['Feed post', 'Carousel'],
    needsMedia: false,
    videoOnly: false,
    maxImages: 10,
    captionLimit: 63206,
    source: {
      selectable: "FacebookPlatformData.contentType enum is ['story','reel']",
      derived: '"Draft, carousel, and colored-background text options live under facebookSettings"',
      maxImages: '"Feed posts support up to 10 images (no mixed video+image)"',
      reel: '"Reels require single vertical video (9:16, 3-60s)"',
      story: '"Stories require single media (24h, no captions)"',
      captionLimit: 'POST /v1/tools/validate/post-length, facebook: 63206',
    },
  },
  tiktok: {
    name: 'TikTok',
    selectable: ['Draft to Creator Inbox'],
    derived: ['Video', 'Photo carousel'],
    needsMedia: true,
    videoOnly: false,
    maxImages: 35,
    captionLimit: 2200,
    source: {
      selectable: 'TikTokPlatformData.draft — "sends the post to the TikTok Creator Inbox as a draft"',
      derived: "TikTokPlatformData.mediaType is an 'Optional override. Defaults based on provided media items.'",
      maxImages: '"Photo carousels up to 35 images"',
      needsMedia: 'TikTok accepts no text-only post',
      captionLimit: 'POST /v1/tools/validate/post-length, tiktok: 2200. "photo titles truncated to 90 chars"',
    },
  },
  youtube: {
    name: 'YouTube',
    selectable: [],
    derived: ['Video', 'Short'],
    needsMedia: true,
    videoOnly: true,
    maxImages: 0,
    captionLimit: 5000,
    source: {
      selectable: 'YouTubePlatformData has no content-type field. There is no Short target.',
      derived: '"Videos under 3 min auto-detected as Shorts."',
      videoOnly: `${OURS}: YouTubePlatformData is title, visibility, madeForKids, firstComment, containsSyntheticMedia, categoryId, playlistId. Every field is video, and the schema documents no photo path.`,
      captionLimit: '"the video description comes from the post content ... truncated to 5000 characters". Title is a separate field, max 100.',
    },
  },
  linkedin: {
    name: 'LinkedIn',
    selectable: [],
    derived: ['Feed post', 'Multi-image', 'Document'],
    needsMedia: false,
    videoOnly: false,
    maxImages: 20,
    captionLimit: 3000,
    source: {
      selectable: 'LinkedInPlatformData has no content-type field.',
      maxImages: '"Up to 20 images, no multi-video."',
      captionLimit: 'POST /v1/tools/validate/post-length, linkedin: 3000',
    },
  },
  googlebusiness: {
    name: 'Google Business',
    selectable: ['Update', 'Event', 'Offer'],
    derived: [],
    needsMedia: false,
    videoOnly: false,
    maxImages: 1,
    captionLimit: 1500,
    source: {
      selectable: "GoogleBusinessPlatformData.topicType enum is ['STANDARD','EVENT','OFFER']",
      captionLimit: 'POST /v1/tools/validate/post-length, googlebusiness: 1500',
    },
  },
}

/** A reason a platform will not take this post, in words an owner can act on. */
export interface Blocker {
  platform: Platform
  /** what is wrong */
  reason: string
  /** whether posting it by hand in the app would work */
  appLaneHelps: boolean
}

const VERTICAL = 9 / 16
/** Facebook Reels want 9:16. A little tolerance, because a phone video is rarely exact. */
const VERTICAL_SLACK = 0.06

/**
 * Which of these platforms will refuse this post, and why.
 *
 * Deliberately conservative in one direction only: when we cannot measure
 * something (a browser that would not read a video's duration, a file we never
 * probed) we do NOT block. A false stop is worse than a real failure here,
 * because a real failure now arrives as a post.failed webhook and a false stop
 * is a feature that looks broken.
 */
export function blockersFor(
  platforms: Platform[],
  media: MediaFacts | null,
  opts: { imageCount?: number; wantsStory?: boolean; wantsReel?: boolean } = {},
): Blocker[] {
  const out: Blocker[] = []
  const images = opts.imageCount ?? (media && !media.isVideo ? 1 : 0)

  for (const p of platforms) {
    const r = RULES[p]
    if (!r) continue

    if (!media && r.needsMedia) {
      out.push({ platform: p, reason: `${r.name} needs a photo or video.`, appLaneHelps: false })
      continue
    }
    if (!media) continue

    if (r.videoOnly && !media.isVideo) {
      out.push({ platform: p, reason: `${r.name} only takes video, not photos.`, appLaneHelps: false })
      continue
    }
    if (images > r.maxImages && r.maxImages > 0) {
      out.push({ platform: p, reason: `${r.name} takes ${r.maxImages} photos at most, and this has ${images}.`, appLaneHelps: false })
      continue
    }

    /* A Facebook Reel is the one place the vendor states a hard shape and
       length, so it is the one place we can check before sending. */
    if (p === 'facebook' && opts.wantsReel && media.isVideo) {
      if (media.duration > 0 && (media.duration < 3 || media.duration > 60)) {
        out.push({
          platform: p,
          reason: `A Facebook Reel has to be between 3 and 60 seconds. This one is ${Math.round(media.duration)}.`,
          appLaneHelps: true,
        })
        continue
      }
      if (media.width > 0 && media.height > 0) {
        const ratio = media.width / media.height
        if (Math.abs(ratio - VERTICAL) > VERTICAL_SLACK) {
          out.push({
            platform: p,
            reason: 'A Facebook Reel has to be a vertical video, and this one is not.',
            appLaneHelps: true,
          })
          continue
        }
      }
    }
  }
  return out
}

/** Plain sentence for what a file will BECOME on a platform, since nobody picks. */
export function willBecome(p: Platform, media: MediaFacts | null, opts: { story?: boolean } = {}): string {
  const r = RULES[p]
  if (!r) return ''
  if (opts.story) return 'a Story'
  if (!media) return p === 'facebook' || p === 'linkedin' || p === 'googlebusiness' ? 'a text post' : ''
  if (media.isVideo) {
    if (p === 'instagram') return 'a Reel'
    if (p === 'youtube') return media.duration > 0 && media.duration < 180 ? 'a Short' : 'a video'
    if (p === 'tiktok') return 'a video'
    return 'a video post'
  }
  if (p === 'tiktok') return 'a photo post'
  return 'a feed post'
}

/** Where to send someone who has to do it by hand. Opens the app on a phone. */
export const APP_LINK: Record<Platform, string> = {
  instagram: 'https://www.instagram.com/',
  facebook: 'https://www.facebook.com/',
  tiktok: 'https://www.tiktok.com/upload',
  youtube: 'https://studio.youtube.com/',
  linkedin: 'https://www.linkedin.com/feed/',
  googlebusiness: 'https://business.google.com/posts',
}
