'use server'

/**
 * Marketplace data for /dashboard/marketplace.
 *
 * Returns bookable creators (food influencers, photographers,
 * videographers) joined with their profile display info.
 * Geographic scope is Washington-only for v1 — broaden by adding
 * states to creator_profiles.service_area.
 */

import { createAdminClient } from '@/lib/supabase/admin'

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
