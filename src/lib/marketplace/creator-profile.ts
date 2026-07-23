import 'server-only'

/**
 * CREATOR PROFILE — everything a restaurant sees on a creator's full profile: who they are, their
 * work, what they offer, and what other restaurants said. A creative sale is a decision (you trust
 * a person, not a brand), so this is the trust surface, and it is built ONLY from real data. Empty
 * sections show an honest empty state rather than a fabricated number.
 *
 * Grounded in tables that already exist: vendors (identity + rating), vendor_portfolio_items (the
 * work), work_ratings (reviews), creator_profiles.follower_count (an influencer's audience), and
 * the shared store-card model for their offerings. No new tables.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getVendorPortfolio } from './portfolio'
import { getCreatorStoreCards, type CreatorStoreCard } from './store-cards'

export interface CreatorReview {
  stars: number
  comment: string | null
  when: string
  restaurant: string | null
}

export interface CreatorProfile {
  slug: string
  name: string
  craft: string | null
  bio: string | null
  avatarUrl: string | null
  verified: boolean
  tier: string
  isApnosh: boolean
  avgRating: number | null
  totalBookings: number
  reviewCount: number
  serviceArea: string[]
  styleTags: string[]
  followerCount: number | null
  portfolio: { id: string; url: string; caption: string | null }[]
  offerings: CreatorStoreCard[]
  reviews: CreatorReview[]
}

/** A couple of honest, derived tags per craft, so "About" has some texture without inventing facts. */
const CRAFT_TAGS: Record<string, string[]> = {
  photographer: ['Food photography', 'Works with restaurants'],
  videographer: ['Short-form video', 'Shot on location'],
  food_influencer: ['Local audience', 'Honest tastings'],
  graphic_designer: ['Menus + brand', 'On-brand design'],
  social_manager: ['Runs social', 'Month to month'],
}

/**
 * Assemble a creator's full profile by slug. Returns null when the vendor is not a bookable,
 * non-Apnosh creator. Never throws: any sub-read failure degrades that section to empty.
 */
export async function getCreatorProfile(slug: string): Promise<CreatorProfile | null> {
  try {
    const admin = createAdminClient()
    const { data: v } = await admin
      .from('vendors')
      .select('id, slug, name, description, logo_url, service_area, tier, is_apnosh, verified, avg_rating, total_bookings, craft')
      .eq('slug', slug)
      .eq('bookable', true)
      .neq('vendor_type', 'apnosh')
      .maybeSingle()
    if (!v) return null
    const vendorId = v.id as string

    // The work — real portfolio items (images resolve to Storage URLs; a broken one falls back to a
    // gradient tile in the UI). Empty for a brand-new creator, and the UI says so.
    const portfolioItems = await getVendorPortfolio(vendorId).catch(() => [])

    // Their offerings — the same store cards the shelf renders, filtered to this creator.
    const offerings = (await getCreatorStoreCards().catch(() => [])).filter((c) => c.vendorSlug === slug)

    // Craft = the real LISTING category (photographer, videographer, …). vendors.craft is only the
    // coarse dispatch key (Photo/Video/Social/Design), so we read it off their offerings instead.
    const craft = (offerings[0]?.category as string | undefined) ?? (typeof v.craft === 'string' ? v.craft : null)

    // Reviews — real ratings from restaurants they've worked with (restaurant name via the client fk).
    const { data: rr } = await admin
      .from('work_ratings')
      .select('stars, comment, created_at, client:clients(name)')
      .eq('creator_id', vendorId)
      .order('created_at', { ascending: false })
      .limit(20)
    const reviews: CreatorReview[] = ((rr ?? []) as Array<Record<string, unknown>>).map((r) => ({
      stars: Number(r.stars) || 0,
      comment: (r.comment as string | null) ?? null,
      when: (r.created_at as string) ?? '',
      restaurant: ((r.client as { name?: string } | null)?.name) ?? null,
    }))

    // Rating: prefer the stored aggregate; else compute from the reviews we have.
    let avgRating = typeof v.avg_rating === 'number' ? v.avg_rating : null
    if (avgRating == null && reviews.length) {
      avgRating = Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10
    }

    // An influencer's audience, if they have a linked creator profile with a follower count.
    let followerCount: number | null = null
    try {
      const { data: cp } = await admin.from('creator_profiles').select('follower_count').eq('vendor_id', vendorId).maybeSingle()
      followerCount = typeof cp?.follower_count === 'number' ? cp.follower_count : null
    } catch { /* no linked creator profile — fine */ }

    return {
      slug,
      name: v.name as string,
      craft,
      bio: (v.description as string | null) ?? null,
      avatarUrl: (v.logo_url as string | null) ?? null,
      verified: !!v.verified,
      tier: (v.tier as string) ?? 'free',
      isApnosh: !!v.is_apnosh,
      avgRating,
      totalBookings: Number(v.total_bookings) || 0,
      reviewCount: reviews.length,
      serviceArea: Array.isArray(v.service_area) ? (v.service_area as string[]) : [],
      styleTags: craft && CRAFT_TAGS[craft] ? CRAFT_TAGS[craft] : [],
      followerCount,
      portfolio: portfolioItems.map((p) => ({ id: p.id, url: p.url, caption: p.caption })),
      offerings,
      reviews,
    }
  } catch {
    return null
  }
}
