/**
 * Publish a Local Post to a Google Business Profile location.
 *
 * Uses the v4 mybusiness API which is still the only path for
 * localPosts. Endpoint:
 *   POST https://mybusiness.googleapis.com/v4/{resourceName}/localPosts
 *
 * resourceName is `accounts/{accountId}/locations/{locationId}` and
 * is stored as `channel_connections.platform_account_id` once the
 * client picks a location during onboarding.
 *
 * Body shape (minimum viable post):
 *   {
 *     "languageCode": "en",
 *     "summary": "<caption>",
 *     "media": [{ "mediaFormat": "PHOTO", "sourceUrl": "<url>" }],
 *     "topicType": "STANDARD"
 *   }
 *
 * GBP's local posts have a 1500-char hard limit on summary. We trim.
 *
 * Local posts also accept callToAction (LEARN_MORE/CALL/etc.) and
 * event/offer types, but we ship STANDARD posts in v1 — those need
 * a UI surface for the staffer to pick, which is Phase 1B v2.
 */

const GBP_V4 = 'https://mybusiness.googleapis.com/v4'

export interface GbpPublishResult {
  success: boolean
  postName?: string  // GBP's `name` field, e.g. accounts/123/locations/456/localPosts/789
  searchUrl?: string // public URL to the post on Google
  error?: string
}

interface GbpPublishInput {
  /** accounts/{accountId}/locations/{locationId} */
  resourceName: string
  /** Google OAuth access token with business.manage scope. */
  accessToken: string
  text: string
  mediaUrls: string[]
  /** Optional button. CALL needs no url (uses the listing phone); the
      others (ORDER, LEARN_MORE, BOOK, SHOP, SIGN_UP) require a url. */
  callToAction?: { actionType: string; url?: string } | null
  /** Post type. OFFER and EVENT both require `event` (title + dates). */
  postType?: 'STANDARD' | 'OFFER' | 'EVENT'
  /** Required for OFFER/EVENT. Dates as 'YYYY-MM-DD'. */
  event?: { title: string; startDate: string; endDate: string } | null
  /** OFFER only — all fields optional. */
  offer?: { couponCode?: string; redeemUrl?: string; terms?: string } | null
}

function toGbpDate(s: string): { year: number; month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  return { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) }
}

const SUMMARY_LIMIT = 1500

export async function publishToGbp(input: GbpPublishInput): Promise<GbpPublishResult> {
  const { resourceName, accessToken, text, mediaUrls } = input

  if (!resourceName || resourceName === 'pending') {
    return { success: false, error: 'GBP location not selected for this client.' }
  }
  if (!accessToken) {
    return { success: false, error: 'GBP access token missing.' }
  }

  const summary = (text ?? '').slice(0, SUMMARY_LIMIT).trim()
  if (!summary) {
    return { success: false, error: 'Post summary is empty after trim.' }
  }

  // GBP local posts accept one photo via media[]. Carousels are not
  // supported on this API as of v4 — we just use the first URL.
  const media = mediaUrls.length > 0
    ? [{ mediaFormat: 'PHOTO', sourceUrl: mediaUrls[0] }]
    : undefined

  const topicType = input.postType ?? 'STANDARD'

  const cta = input.callToAction?.actionType
    ? { actionType: input.callToAction.actionType, ...(input.callToAction.url ? { url: input.callToAction.url } : {}) }
    : undefined

  // OFFER and EVENT require an `event` with a title and a start/end date.
  let eventObj: { title: string; schedule: Record<string, unknown> } | undefined
  if ((topicType === 'OFFER' || topicType === 'EVENT') && input.event?.title) {
    const start = toGbpDate(input.event.startDate)
    const end = toGbpDate(input.event.endDate)
    if (!start || !end) {
      return { success: false, error: 'Offer/event needs a valid start and end date.' }
    }
    eventObj = { title: input.event.title.slice(0, 58), schedule: { startDate: start, endDate: end } }
  }
  if ((topicType === 'OFFER' || topicType === 'EVENT') && !eventObj) {
    return { success: false, error: 'Offer/event needs a title and dates.' }
  }

  const offerObj = topicType === 'OFFER' && input.offer
    ? {
        ...(input.offer.couponCode ? { couponCode: input.offer.couponCode } : {}),
        ...(input.offer.redeemUrl ? { redeemOnlineUrl: input.offer.redeemUrl } : {}),
        ...(input.offer.terms ? { termsConditions: input.offer.terms } : {}),
      }
    : undefined

  const body = {
    languageCode: 'en',
    summary,
    topicType,
    ...(media ? { media } : {}),
    // Offers carry their own redeem button, so CTA only applies to the others.
    ...(cta && topicType !== 'OFFER' ? { callToAction: cta } : {}),
    ...(eventObj ? { event: eventObj } : {}),
    ...(offerObj ? { offer: offerObj } : {}),
  }

  let res: Response
  try {
    res = await fetch(`${GBP_V4}/${resourceName}/localPosts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(body),
    })
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'fetch failed' }
  }

  let json: unknown
  try {
    json = await res.json()
  } catch {
    json = {}
  }

  if (!res.ok) {
    const err = json as { error?: { message?: string; status?: string } }
    return {
      success: false,
      error: err.error?.message ?? `HTTP ${res.status}`,
    }
  }

  const post = json as { name?: string; searchUrl?: string }
  return {
    success: true,
    postName: post.name,
    searchUrl: post.searchUrl,
  }
}
