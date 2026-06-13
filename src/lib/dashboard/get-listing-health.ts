/**
 * Listing health score for a client's Google Business Profile.
 *
 * Scores how complete + active the listing is across the signals Google
 * (and customers) reward, and returns a "fix these" checklist. Combines a
 * live read of the listing (description, website, phone, hours, category)
 * with our synced data (rating, review volume, reply rate, menu).
 *
 * Each check is pass / fail / unknown. The score is the share of *passed*
 * weight over the *determinable* weight, so a check we can't read (e.g. the
 * live listing call failed) never unfairly drags the score down.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getClientListing } from '@/lib/gbp-listing'

export type CheckStatus = 'pass' | 'fail' | 'unknown'

export interface HealthCheck {
  key: string
  label: string
  status: CheckStatus
  weight: number
  /** On fail: the action to take + where. */
  detail?: string
  fixLabel?: string
  fixHref?: string
}

export interface ListingHealth {
  connected: boolean
  score: number              // 0-100 over determinable checks
  grade: 'great' | 'good' | 'needs-work'
  passed: number
  total: number              // determinable checks
  checks: HealthCheck[]
}

export async function getListingHealth(clientId: string): Promise<ListingHealth> {
  const admin = createAdminClient()

  const [listingRes, locRes, reviewsRes, menuRes] = await Promise.all([
    getClientListing(clientId).catch(() => ({ ok: false as const, error: 'read failed' })),
    admin.from('gbp_locations').select('place_rating, place_rating_count, is_primary').eq('client_id', clientId),
    admin.from('reviews').select('response_text').eq('client_id', clientId),
    admin.from('menu_items').select('id', { count: 'exact', head: true }).eq('client_id', clientId),
  ])

  const fields = listingRes.ok ? listingRes.fields : null
  const listingReadable = listingRes.ok

  const locs = (locRes.data ?? []) as { place_rating: number | null; place_rating_count: number | null; is_primary?: boolean }[]
  const loc = locs.find(l => l.is_primary) ?? locs[0]
  const placeRating = loc?.place_rating ?? null
  const placeCount = loc?.place_rating_count ?? null

  const reviewRows = (reviewsRes.data ?? []) as { response_text: string | null }[]
  const totalReviews = reviewRows.length
  const repliedReviews = reviewRows.filter(r => !!r.response_text).length
  const replyRate = totalReviews > 0 ? repliedReviews / totalReviews : null

  const menuCount = menuRes.count ?? 0

  const connected = listingReadable || placeCount != null

  // live = can only be judged when the listing read succeeded
  const live = (ok: boolean): CheckStatus => (listingReadable ? (ok ? 'pass' : 'fail') : 'unknown')

  const hasHours = !!fields?.regularHours && Object.values(fields.regularHours).some(d => Array.isArray(d) && d.length > 0)
  const hasCategory = !!fields?.categories?.primary
  const hasDescription = !!(fields?.description && fields.description.trim().length >= 20)
  const hasWebsite = !!fields?.websiteUri
  const hasPhone = !!fields?.primaryPhone

  const checks: HealthCheck[] = [
    {
      key: 'hours', label: 'Business hours are set', weight: 15, status: live(hasHours),
      detail: 'Add your weekly hours so customers know when you’re open.',
      fixLabel: 'Set hours', fixHref: '/dashboard/business-info/hours',
    },
    {
      key: 'category', label: 'Primary category chosen', weight: 10, status: live(hasCategory),
      detail: 'Pick the category that best fits (e.g. Korean restaurant) so Google ranks you for the right searches.',
      fixLabel: 'Set category', fixHref: '/dashboard/local-seo/listing',
    },
    {
      key: 'description', label: 'Business description written', weight: 10, status: live(hasDescription),
      detail: 'Write a short, keyword-rich description of your restaurant.',
      fixLabel: 'Add description', fixHref: '/dashboard/business-info/contact',
    },
    {
      key: 'website', label: 'Website link added', weight: 10, status: live(hasWebsite),
      detail: 'Add your website so customers can view your full site.',
      fixLabel: 'Add website', fixHref: '/dashboard/business-info/contact',
    },
    {
      key: 'phone', label: 'Phone number added', weight: 10, status: live(hasPhone),
      detail: 'Add a phone number so customers can call to order or book.',
      fixLabel: 'Add phone', fixHref: '/dashboard/business-info/contact',
    },
    {
      key: 'menu', label: 'Menu added to your listing', weight: 10, status: menuCount > 0 ? 'pass' : 'fail',
      detail: 'Add your menu so it shows on the Menu tab of your Google listing.',
      fixLabel: 'Add menu', fixHref: '/dashboard/local-seo/menu',
    },
    {
      key: 'has-reviews', label: 'You have Google reviews', weight: 10,
      status: placeCount == null ? 'unknown' : placeCount > 0 ? 'pass' : 'fail',
      detail: 'Start collecting reviews with your review link and QR code.',
      fixLabel: 'Get reviews', fixHref: '/dashboard/local-seo/reviews/get',
    },
    {
      key: 'rating', label: 'Rating is 4.0 or higher', weight: 10,
      status: placeRating == null ? 'unknown' : placeRating >= 4.0 ? 'pass' : 'fail',
      detail: 'Earn more positive reviews from happy customers to lift your average.',
      fixLabel: 'Get reviews', fixHref: '/dashboard/local-seo/reviews/get',
    },
    {
      key: 'replies', label: 'Replying to your reviews', weight: 15,
      status: replyRate == null ? 'unknown' : replyRate >= 0.5 ? 'pass' : 'fail',
      detail: 'Reply to your reviews — especially the critical ones. Google and customers both reward it.',
      fixLabel: 'Reply to reviews', fixHref: '/dashboard/local-seo/reviews',
    },
  ]

  const determinable = checks.filter(c => c.status !== 'unknown')
  const passedChecks = determinable.filter(c => c.status === 'pass')
  const passWeight = passedChecks.reduce((s, c) => s + c.weight, 0)
  const totalWeight = determinable.reduce((s, c) => s + c.weight, 0)
  const score = totalWeight > 0 ? Math.round((passWeight / totalWeight) * 100) : 0
  const grade: ListingHealth['grade'] = score >= 85 ? 'great' : score >= 60 ? 'good' : 'needs-work'

  return { connected, score, grade, passed: passedChecks.length, total: determinable.length, checks }
}
