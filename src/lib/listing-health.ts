'use server'

/**
 * Listing health score — a single 0-100 number plus a prioritized
 * punch list of what's missing or weak on the client's Google
 * Business Profile.
 *
 * Computed on demand by reading the live GBP listing (we already
 * have the fetcher) and the live attributes. No caching needed —
 * the fetch is fast enough and the data needs to be fresh for the
 * owner to trust it.
 *
 * Each check carries a weight (importance × user impact) and a
 * deep-link to the section that fixes it.
 */

import { getClientListing, getClientAttributes } from '@/lib/gbp-listing'
import { getClientMenuLink } from '@/lib/gbp-menu'
import { upcomingHolidayDates } from '@/lib/us-holidays'

export interface HealthCheck {
  id: string
  label: string
  status: 'pass' | 'warn' | 'fail'
  weight: number
  message: string
  /** Hash of the listing page section, or a separate route. */
  fixLink: string
}

export interface ListingHealth {
  score: number
  status: 'great' | 'good' | 'needs_work'
  checks: HealthCheck[]
  topFixes: HealthCheck[]
}

export async function getListingHealth(
  clientId: string,
  locationId?: string | null,
): Promise<ListingHealth | null> {
  const [listingRes, attrsRes, menuRes] = await Promise.all([
    getClientListing(clientId, locationId),
    getClientAttributes(clientId, locationId),
    getClientMenuLink(clientId, locationId),
  ])
  if (!listingRes.ok) return null

  const fields = listingRes.fields
  const attrs = attrsRes.ok ? attrsRes.values : {}
  const menuUrl = menuRes.ok ? menuRes.url : ''

  const checks: HealthCheck[] = []

  /* Description — heavy weight; the most-skipped field that impacts
     SEO directly. */
  const desc = (fields.description ?? '').trim()
  checks.push({
    id: 'description',
    label: 'Business description',
    weight: 15,
    status: desc.length >= 200 ? 'pass' : desc.length > 0 ? 'warn' : 'fail',
    message: desc.length === 0
      ? 'No description set. This is one of the strongest SEO signals on your listing.'
      : desc.length < 200
        ? `Description is ${desc.length} characters. Aim for 200+ to cover what makes you different.`
        : `${desc.length} characters — looks good.`,
    fixLink: '/dashboard/local-seo/listing#description',
  })

  /* Primary category. Lower-weight because it's almost always set,
     but a wrong primary is catastrophic so we still check. */
  const primaryCategory = fields.categories?.primary
  checks.push({
    id: 'primary_category',
    label: 'Primary category',
    weight: 12,
    status: primaryCategory ? 'pass' : 'fail',
    message: primaryCategory
      ? `Set to "${primaryCategory.displayName}".`
      : 'No primary category. Google needs this to know what kind of business you are.',
    fixLink: '/dashboard/local-seo/listing#categories',
  })

  /* Additional categories — 2 to 9 is the sweet spot. */
  const additionalCount = fields.categories?.additional?.length ?? 0
  checks.push({
    id: 'additional_categories',
    label: 'Additional categories',
    weight: 6,
    status: additionalCount >= 2 ? 'pass' : additionalCount >= 1 ? 'warn' : 'fail',
    message: additionalCount === 0
      ? 'No additional categories. Add 2-5 to surface in more searches.'
      : additionalCount < 2
        ? `${additionalCount} additional category. Add a couple more to expand reach.`
        : `${additionalCount} additional categories.`,
    fixLink: '/dashboard/local-seo/listing#categories',
  })

  /* Phone number. */
  const phone = (fields.primaryPhone ?? '').trim()
  checks.push({
    id: 'phone',
    label: 'Phone number',
    weight: 8,
    status: phone ? 'pass' : 'fail',
    message: phone ? 'Set.' : 'No primary phone. Customers can\'t tap-to-call.',
    fixLink: '/dashboard/local-seo/listing#phone',
  })

  /* Website. */
  const website = (fields.websiteUri ?? '').trim()
  checks.push({
    id: 'website',
    label: 'Website',
    weight: 8,
    status: website ? 'pass' : 'fail',
    message: website ? 'Set.' : 'No website URL. Customers can\'t click through.',
    fixLink: '/dashboard/local-seo/listing#website',
  })

  /* Regular hours — every day should have something. */
  const hours = fields.regularHours ?? { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] }
  const daysWithHours = (['mon','tue','wed','thu','fri','sat','sun'] as const)
    .filter(d => (hours[d] ?? []).length > 0).length
  checks.push({
    id: 'hours',
    label: 'Regular hours',
    weight: 10,
    status: daysWithHours >= 5 ? 'pass' : daysWithHours > 0 ? 'warn' : 'fail',
    message: daysWithHours === 7
      ? 'Set for every day.'
      : daysWithHours > 0
        ? `Hours set for ${daysWithHours} of 7 days. Set the rest (or mark them closed).`
        : 'No regular hours set. Listing shows as "Hours not available".',
    fixLink: '/dashboard/local-seo/listing#hours',
  })

  /* Holiday / special hours — checked for upcoming dates. */
  const upcoming = upcomingHolidayDates(60)
  const specialDates = new Set((fields.specialHours ?? []).map(s => s.date))
  const coveredHolidays = upcoming.filter(h => specialDates.has(h.date))
  checks.push({
    id: 'holiday_hours',
    label: 'Holiday hours',
    weight: 8,
    status: coveredHolidays.length === upcoming.length
      ? 'pass'
      : coveredHolidays.length > 0 ? 'warn' : 'fail',
    message: upcoming.length === 0
      ? 'No upcoming holidays in the next 60 days.'
      : coveredHolidays.length === upcoming.length
        ? `${upcoming.length} upcoming holiday${upcoming.length === 1 ? '' : 's'} covered.`
        : `${upcoming.length - coveredHolidays.length} upcoming holiday${upcoming.length - coveredHolidays.length === 1 ? ' is' : 's are'} missing custom hours: ${upcoming.filter(h => !specialDates.has(h.date)).map(h => h.label).join(', ')}.`,
    fixLink: '/dashboard/local-seo/listing#special-hours',
  })

  /* Attributes — count of toggled-on attributes. Restaurants
     benefit massively from these for filtered search. */
  const attrCount = Object.values(attrs).filter(v => v === true).length
  checks.push({
    id: 'attributes',
    label: 'Attributes set',
    weight: 10,
    status: attrCount >= 8 ? 'pass' : attrCount >= 3 ? 'warn' : 'fail',
    message: attrCount === 0
      ? 'No attributes set. Toggling things like Takeout, Outdoor seating, and Accepts reservations massively expands when you show up in "near me" filters.'
      : attrCount < 3
        ? `${attrCount} attribute${attrCount === 1 ? '' : 's'} on. Aim for 8+ across service, amenities, and offerings.`
        : attrCount < 8
          ? `${attrCount} attributes on. A few more would help (especially payments + offerings).`
          : `${attrCount} attributes on.`,
    fixLink: '/dashboard/local-seo/listing#attributes',
  })

  /* Menu link. */
  checks.push({
    id: 'menu_link',
    label: 'Menu link',
    weight: 10,
    status: menuUrl ? 'pass' : 'fail',
    message: menuUrl
      ? 'Menu link set.'
      : 'No menu link. The "Menu" button on your Google listing will be missing.',
    fixLink: '/dashboard/local-seo/menu',
  })

  /* Final score: weighted sum where pass = 1.0, warn = 0.5, fail = 0. */
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0)
  const earned = checks.reduce((s, c) => {
    const m = c.status === 'pass' ? 1 : c.status === 'warn' ? 0.5 : 0
    return s + c.weight * m
  }, 0)
  const score = Math.round((earned / totalWeight) * 100)

  const status: ListingHealth['status'] = score >= 85 ? 'great' : score >= 60 ? 'good' : 'needs_work'

  /* Top 3 fixes by weight × (1 - multiplier) — i.e. biggest gaps first. */
  const topFixes = checks
    .filter(c => c.status !== 'pass')
    .sort((a, b) => {
      const am = a.status === 'warn' ? 0.5 : 0
      const bm = b.status === 'warn' ? 0.5 : 0
      return (b.weight * (1 - bm)) - (a.weight * (1 - am))
    })
    .slice(0, 3)

  return { score, status, checks, topFixes }
}

