'use server'

/**
 * Marketplace data for /dashboard/marketplace.
 *
 * Two surfaces live here:
 *   1. getMarketplaceCreators — legacy creator-only flow (food influencers,
 *      photographers, videographers as people). Powers the existing
 *      influencer booking UI.
 *   2. getMarketplaceVendors — new multi-category vendor flow that
 *      includes Apnosh's own bundles, third-party companies, and
 *      individual creators. Powers /dashboard/marketplace v2 and the
 *      public /marketplace/[slug] vendor pages.
 *
 * Geographic scope is Washington-only for v1 — broaden by adding
 * states to creator_profiles.service_area or vendors.service_area.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getFeaturedPortfolio, getVendorPortfolio } from '@/lib/marketplace/portfolio'

/* Expanded category list (matches migration 146 vendor_listings check). */
export type VendorCategory =
  | 'food_influencer'
  | 'photographer'
  | 'videographer'
  | 'graphic_designer'
  | 'web_designer'
  | 'social_manager'
  | 'local_seo'
  | 'email_marketer'
  | 'pr_specialist'
  | 'strategist'
  | 'full_service_agency'
  | 'other'

/* Legacy alias kept for backwards compatibility with existing call sites
   that import CreatorCategory. */
export type CreatorCategory = 'food_influencer' | 'photographer' | 'videographer' | 'other'

export interface MarketplaceCreator {
  personId: string
  displayName: string
  avatarUrl: string | null
  bio: string | null
  category: CreatorCategory
  socialHandle: string | null
  socialPlatform: string | null
  followerCount: number | null
  contentStyle: string[]
  serviceArea: string[]
  typicalRate: string | null
  sampleWorkUrls: string[]
  /** Cached count of past bookings — trust signal. Computed at read time. */
  pastBookings: number
}

interface FilterOpts {
  category?: CreatorCategory
  state?: string  // 'WA' etc.
  contentStyle?: string[]
  search?: string
}

export async function getMarketplaceCreators(
  filters: FilterOpts = {},
): Promise<MarketplaceCreator[]> {
  const admin = createAdminClient()

  /* Pull bookable creator profiles, optionally filtered by category
     and state. We do the content_style + search filters in memory
     since both are small-cardinality and matter for UX (substring
     match for search). */
  let q = admin
    .from('creator_profiles')
    .select('person_id, category, social_handle, social_platform, follower_count, content_style, service_area, typical_rate, sample_work_urls')
    .eq('bookable', true)
  if (filters.category) q = q.eq('category', filters.category)
  if (filters.state) q = q.contains('service_area', [filters.state])

  const { data: creators } = await q
  if (!creators?.length) return []

  const personIds = creators.map(c => c.person_id as string)

  /* Profile + past-bookings count in parallel. Past bookings are a
     decent trust signal — "Maya has done 4 collabs through Apnosh." */
  const [profilesRes, completedRes] = await Promise.all([
    admin.from('profiles').select('id, full_name, avatar_url, bio').in('id', personIds),
    admin
      .from('booking_requests')
      .select('creator_id, status')
      .in('creator_id', personIds)
      .in('status', ['completed', 'confirmed']),
  ])

  const profileMap = new Map((profilesRes.data ?? []).map(p => [p.id as string, p]))
  const completedByCreator = new Map<string, number>()
  for (const b of completedRes.data ?? []) {
    const cid = b.creator_id as string
    completedByCreator.set(cid, (completedByCreator.get(cid) ?? 0) + 1)
  }

  const search = filters.search?.trim().toLowerCase() ?? ''
  const styleFilters = filters.contentStyle ?? []

  const out: MarketplaceCreator[] = []
  for (const c of creators) {
    const profile = profileMap.get(c.person_id as string)
    if (!profile) continue  // creator row without a profile — skip silently

    const contentStyle = Array.isArray(c.content_style) ? (c.content_style as string[]) : []
    const serviceArea = Array.isArray(c.service_area) ? (c.service_area as string[]) : []

    if (styleFilters.length > 0) {
      const hit = styleFilters.some(s => contentStyle.includes(s))
      if (!hit) continue
    }

    if (search) {
      const haystack = [
        (profile.full_name as string) ?? '',
        (c.social_handle as string) ?? '',
        ...contentStyle,
        (profile.bio as string) ?? '',
      ].join(' ').toLowerCase()
      if (!haystack.includes(search)) continue
    }

    out.push({
      personId: c.person_id as string,
      displayName: (profile.full_name as string) || 'Creator',
      avatarUrl: (profile.avatar_url as string) ?? null,
      bio: (profile.bio as string) ?? null,
      category: c.category as CreatorCategory,
      socialHandle: (c.social_handle as string) ?? null,
      socialPlatform: (c.social_platform as string) ?? null,
      followerCount: (c.follower_count as number) ?? null,
      contentStyle,
      serviceArea,
      typicalRate: (c.typical_rate as string) ?? null,
      sampleWorkUrls: Array.isArray(c.sample_work_urls) ? (c.sample_work_urls as string[]) : [],
      pastBookings: completedByCreator.get(c.person_id as string) ?? 0,
    })
  }

  /* Sort: more past bookings first (social proof), then higher
     follower count, then alphabetical. Cheap server-side sort. */
  out.sort((a, b) => {
    if (a.pastBookings !== b.pastBookings) return b.pastBookings - a.pastBookings
    const af = a.followerCount ?? 0
    const bf = b.followerCount ?? 0
    if (af !== bf) return bf - af
    return a.displayName.localeCompare(b.displayName)
  })

  return out
}

// ─────────────────────────────────────────────────────────────────────
// Marketplace v2: vendors + listings
// ─────────────────────────────────────────────────────────────────────

export interface MarketplaceListing {
  id: string
  slug: string
  title: string
  category: VendorCategory
  listingType: 'subscription' | 'one_off' | 'package' | 'quote'
  description: string | null
  priceCents: number | null
  billingPeriod: 'monthly' | 'annual' | 'one_time' | null
  details: Record<string, unknown> | null
  displayOrder: number
  featured: boolean
}

export interface PortfolioPreview {
  id: string
  url: string
  thumbnailUrl: string | null
  caption: string | null
}

export interface MarketplaceVendor {
  id: string
  slug: string
  name: string
  vendorType: 'individual' | 'company' | 'apnosh'
  description: string | null
  logoUrl: string | null
  coverUrl: string | null
  serviceArea: string[]
  tier: 'free' | 'pro' | 'verified' | 'apnosh'
  isApnosh: boolean
  verified: boolean
  avgRating: number | null
  totalBookings: number
  /* Listings under this vendor, ordered by display_order. */
  listings: MarketplaceListing[]
  /* Starting price in cents across listings, for card display.
     NULL if all listings are quote-based. */
  startingPriceCents: number | null
  /* Up to 3 portfolio items for the card hero carousel. Empty array
     if the vendor hasn't uploaded any yet. */
  portfolio: PortfolioPreview[]
}

interface VendorFilterOpts {
  category?: VendorCategory
  state?: string                // 'WA' etc.
  verifiedOnly?: boolean
  search?: string
  /* Filter by listing offering type:
       'packages' = subscription or package listings (multi-service bundles)
       'services' = one_off or quote listings (individual deliverables)
     Undefined returns all. */
  offeringType?: 'packages' | 'services'
  /* If true, prefer Apnosh-or-verified vendors in the sort order
     without giving Apnosh a separate visual treatment. The UI no
     longer "features" Apnosh as a hero; this is purely sort weight. */
  featureApnosh?: boolean
}

interface VendorRow {
  id: string
  slug: string
  name: string
  vendor_type: 'individual' | 'company' | 'apnosh'
  description: string | null
  logo_url: string | null
  cover_url: string | null
  service_area: string[] | null
  tier: 'free' | 'pro' | 'verified' | 'apnosh'
  is_apnosh: boolean
  verified: boolean
  avg_rating: number | null
  total_bookings: number
}

interface ListingRow {
  id: string
  vendor_id: string
  slug: string
  title: string
  category: VendorCategory
  listing_type: 'subscription' | 'one_off' | 'package' | 'quote'
  description: string | null
  price_cents: number | null
  billing_period: 'monthly' | 'annual' | 'one_time' | null
  details: Record<string, unknown> | null
  display_order: number
  featured: boolean
}

function rowsToVendor(
  v: VendorRow,
  listings: ListingRow[],
  portfolio: PortfolioPreview[] = [],
): MarketplaceVendor {
  const sorted = [...listings].sort((a, b) => a.display_order - b.display_order)
  const priced = sorted
    .map(l => l.price_cents)
    .filter((p): p is number => p !== null && p > 0)
  const startingPriceCents = priced.length > 0 ? Math.min(...priced) : null

  return {
    id: v.id,
    slug: v.slug,
    name: v.name,
    vendorType: v.vendor_type,
    description: v.description,
    logoUrl: v.logo_url,
    coverUrl: v.cover_url,
    serviceArea: v.service_area ?? [],
    tier: v.tier,
    isApnosh: v.is_apnosh,
    verified: v.verified,
    avgRating: v.avg_rating,
    totalBookings: v.total_bookings,
    listings: sorted.map(l => ({
      id: l.id,
      slug: l.slug,
      title: l.title,
      category: l.category,
      listingType: l.listing_type,
      description: l.description,
      priceCents: l.price_cents,
      billingPeriod: l.billing_period,
      details: l.details,
      displayOrder: l.display_order,
      featured: l.featured,
    })),
    startingPriceCents,
    portfolio,
  }
}

/**
 * Pull marketplace vendors with their listings. Apnosh is always
 * surfaced first when featureApnosh is true (default behavior on the
 * landing view). Category filter narrows to vendors that have at
 * least one listing in that category — Apnosh's bundles surface in
 * every category because they span photography, social, design, etc.
 */
export async function getMarketplaceVendors(
  filters: VendorFilterOpts = {},
): Promise<MarketplaceVendor[]> {
  const admin = createAdminClient()

  let vendorQ = admin
    .from('vendors')
    .select('id, slug, name, vendor_type, description, logo_url, cover_url, service_area, tier, is_apnosh, verified, avg_rating, total_bookings')
    .eq('bookable', true)
  if (filters.state) vendorQ = vendorQ.contains('service_area', [filters.state])
  if (filters.verifiedOnly) vendorQ = vendorQ.eq('verified', true)

  const { data: vendorRows } = await vendorQ as { data: VendorRow[] | null }
  if (!vendorRows?.length) return []

  const vendorIds = vendorRows.map(v => v.id)

  /* Pull active listings under those vendors. */
  let listingQ = admin
    .from('vendor_listings')
    .select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, display_order, featured')
    .in('vendor_id', vendorIds)
    .eq('active', true)
  if (filters.category) {
    /* For category filter: include listings in that exact category
       OR listings under Apnosh (because Apnosh bundles span all
       categories). The "via [bundle] →" cross-sell happens in the UI. */
    listingQ = listingQ.or(
      `category.eq.${filters.category},vendor_id.eq.${vendorRows.find(v => v.is_apnosh)?.id ?? ''}`,
    )
  }
  const { data: listingRows } = await listingQ as { data: ListingRow[] | null }
  const listingsByVendor = new Map<string, ListingRow[]>()
  for (const l of listingRows ?? []) {
    const arr = listingsByVendor.get(l.vendor_id) ?? []
    arr.push(l)
    listingsByVendor.set(l.vendor_id, arr)
  }

  /* Featured portfolio previews (up to 3 each) for hero carousels. */
  const portfolioByVendor = await getFeaturedPortfolio(vendorIds)

  const search = filters.search?.trim().toLowerCase() ?? ''

  let vendors = vendorRows
    .map(v => rowsToVendor(
      v,
      listingsByVendor.get(v.id) ?? [],
      (portfolioByVendor.get(v.id) ?? []).map(p => ({
        id: p.id,
        url: p.url,
        thumbnailUrl: p.thumbnailUrl,
        caption: p.caption,
      })),
    ))
    /* Drop vendors that have no matching listings when a category
       filter is active (except Apnosh, which is always shown). */
    .filter(v => {
      if (filters.category && v.listings.length === 0 && !v.isApnosh) return false
      return true
    })

  if (search) {
    vendors = vendors.filter(v => {
      const haystack = [
        v.name,
        v.description ?? '',
        ...v.listings.map(l => l.title),
        ...v.listings.map(l => l.description ?? ''),
      ].join(' ').toLowerCase()
      return haystack.includes(search)
    })
  }

  /* Sort: Apnosh first (featureApnosh), then verified, then by avg_rating,
     then by total_bookings, then alphabetical. */
  vendors.sort((a, b) => {
    if (filters.featureApnosh !== false) {
      if (a.isApnosh && !b.isApnosh) return -1
      if (!a.isApnosh && b.isApnosh) return 1
    }
    if (a.verified !== b.verified) return a.verified ? -1 : 1
    const ar = a.avgRating ?? 0
    const br = b.avgRating ?? 0
    if (ar !== br) return br - ar
    if (a.totalBookings !== b.totalBookings) return b.totalBookings - a.totalBookings
    return a.name.localeCompare(b.name)
  })

  return vendors
}

/**
 * Single vendor lookup for the public profile page
 * (/marketplace/[slug]). Returns null if not found or not bookable.
 */
export async function getVendorBySlug(slug: string): Promise<MarketplaceVendor | null> {
  const admin = createAdminClient()

  const { data: v } = await admin
    .from('vendors')
    .select('id, slug, name, vendor_type, description, logo_url, cover_url, service_area, tier, is_apnosh, verified, avg_rating, total_bookings')
    .eq('slug', slug)
    .eq('bookable', true)
    .maybeSingle() as { data: VendorRow | null }
  if (!v) return null

  const [listingsRes, portfolio] = await Promise.all([
    admin
      .from('vendor_listings')
      .select('id, vendor_id, slug, title, category, listing_type, description, price_cents, billing_period, details, display_order, featured')
      .eq('vendor_id', v.id)
      .eq('active', true),
    getVendorPortfolio(v.id),
  ])

  const listings = (listingsRes.data ?? []) as unknown as ListingRow[]
  return rowsToVendor(
    v,
    listings,
    portfolio.map(p => ({ id: p.id, url: p.url, thumbnailUrl: p.thumbnailUrl, caption: p.caption })),
  )
}

/**
 * Counts per category for the category-browse chips on the marketplace
 * landing. Excludes the Apnosh agency listings from per-category counts
 * (Apnosh is shown as its own featured row, not folded into "Photographers
 * (1)" etc.).
 */
export async function getMarketplaceCategoryCounts(state = 'WA'): Promise<Record<VendorCategory, number>> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('vendor_listings')
    .select('category, vendors!inner(is_apnosh, service_area, bookable)')
    .eq('active', true) as { data: Array<{ category: VendorCategory; vendors: { is_apnosh: boolean; service_area: string[] | null; bookable: boolean } }> | null }

  const counts: Record<string, number> = {}
  for (const row of data ?? []) {
    if (!row.vendors.bookable) continue
    if (row.vendors.is_apnosh) continue
    if (state && !(row.vendors.service_area ?? []).includes(state)) continue
    counts[row.category] = (counts[row.category] ?? 0) + 1
  }
  return counts as Record<VendorCategory, number>
}
