/**
 * WHAT EACH AD PLATFORM WILL DO, quoted from the vendor.
 * ======================================================
 * Same discipline as post-rules.ts and for the same reason: the last time a
 * table in this project was written from memory it got three numbers wrong and
 * invented a capability. Every line here carries the schema sentence it came
 * from, and anything that is our judgement says so.
 *
 * The reason this file exists at all is that the differences are not cosmetic.
 * A radius around a city is honoured on Meta and IGNORED on TikTok, so a screen
 * that shows "within 10 miles" on both is lying on one of them. TikTok's
 * minimum spend is twenty times Meta's. Meta can tell you the size of the
 * audience before you pay and TikTok cannot. Each of those changes what the
 * screen may honestly offer.
 *
 * Pinned schema: vendor/zernio-openapi.json, info.version 1.0.4.
 */

export type AdPlatform = 'meta' | 'tiktok'

export interface AdRules {
  name: string
  /** the posting platforms this ad platform promotes */
  posts: string[]
  /** smallest daily spend the platform will actually deliver on, in dollars */
  minDaily: number
  /** can we draw a radius around a place, or only name the place? */
  cityRadius: boolean
  /** can we say how many people are reachable before any money changes hands? */
  reachEstimate: boolean
  /** can the platform render the ad for us? */
  previews: boolean
  /** does connecting need its own login, or does a posting token carry it? */
  ownLogin: boolean
  /** one sentence an owner should read before their first one */
  note: string
  source: Record<string, string>
}

export const AD_RULES: Record<AdPlatform, AdRules> = {
  meta: {
    name: 'Facebook and Instagram',
    posts: ['facebook', 'instagram'],
    minDaily: 1,
    cityRadius: true,
    reachEstimate: true,
    previews: true,
    ownLogin: false,
    note: 'The ad keeps the likes and comments the post already has.',
    source: {
      minDaily: '"Minimum varies: TikTok=$20, Pinterest=$5, others=$1"',
      cityRadius: '"`radius` is only honoured on platforms whose capability map allows city radius (Meta)."',
      reachEstimate: '"Backed by each platform\'s native reach API (Meta `delivery_estimate` …)"',
      previews: '"Renders how a creative would look per placement … via Meta\'s `/generatepreviews`"',
      ownLogin: '"Same-token platforms (facebook, instagram, linkedin, pinterest). The ads SocialAccount … reuses the OAuth token of the parent posting account"',
    },
  },
  tiktok: {
    name: 'TikTok',
    posts: ['tiktok'],
    minDaily: 20,
    /* The one that matters most for a restaurant, and it is a no. */
    cityRadius: false,
    reachEstimate: false,
    previews: false,
    ownLogin: true,
    note: 'TikTok calls this a Spark Ad. It promotes your real video under your own account, so it keeps its views and comments.',
    source: {
      minDaily: '"Minimum varies: TikTok=$20, Pinterest=$5, others=$1"',
      cityRadius: 'Same sentence: radius is honoured on Meta only. TikTok gets the city, not a ring around it.',
      reachEstimate: '"Platforms without a usable pre-flight reach API (Google Search/Display, TikTok) return `available: false`"',
      previews: 'Ad previews go through Meta\'s /generatepreviews; there is no TikTok equivalent in the schema.',
      ownLogin: '"Separate-token platforms (tiktok, twitter). Starts the platform-specific marketing API OAuth flow"',
      spark: '"Spark Ads (POST /v1/ads/boost) always use `TT_USER` … because TikTok requires the original organic post\'s author identity for Spark."',
    },
  },
}

/** Which ad platform promotes a given posting platform. */
export function adPlatformFor(postPlatform: string): AdPlatform | null {
  for (const [k, r] of Object.entries(AD_RULES)) {
    if (r.posts.includes(postPlatform)) return k as AdPlatform
  }
  return null
}

/** The Zernio connect slug for turning this ad platform on. */
export const CONNECT_SLUG: Record<AdPlatform, string> = { meta: 'facebook', tiktok: 'tiktok' }
