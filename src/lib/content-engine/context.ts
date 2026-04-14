'use server'

import { createClient } from '@/lib/supabase/server'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TargetAudience {
  age_range?: string
  gender?: string
  income?: string
  lifestyle?: string
  pain_points?: string[]
}

export interface KeyPerson {
  name: string
  role: string
  comfortable_on_camera?: boolean
  notes?: string
}

export interface FilmingLocation {
  name: string
  notes?: string
  good_for?: string[]
}

export interface Competitor {
  name: string
  handle?: string
  notes?: string
}

export interface GoldenPost {
  caption: string
  hashtags: string | null
  platform: string | null
  type: string | null
  performance_notes: string | null
  style_notes: string | null
}

export interface ClientContext {
  // Business info
  businessName: string
  businessType: string | null
  location: string | null
  website: string | null
  socialHandles: Record<string, string>

  // Brand
  voiceNotes: string | null
  brandGuidelines: string | null
  photoStyle: string | null
  visualStyle: string | null

  // Audience & goals
  goals: string[]
  targetAudience: TargetAudience | null

  // Content strategy
  contentPillars: string[]
  contentAvoid: string[]
  hashtagSets: { branded?: string[]; community?: string[]; location?: string[] } | null
  ctaPreferences: string[]

  // People & places
  keyPeople: KeyPerson[]
  filmingLocations: FilmingLocation[]

  // Competitors
  competitors: Competitor[]

  // Seasonal
  seasonalNotes: string | null

  // Offerings
  offerings: string[]

  // Content defaults (persisted settings)
  contentDefaults: Record<string, unknown>

  // Performance (last 60 days)
  performance: {
    bestDays: string[]
    reachTrend: string
    followerGrowth: number
    topPosts: Array<{ type: string; reach: number; date: string }>
  } | null

  // Golden posts (top-performing approved content with captions)
  goldenPosts: GoldenPost[]

  // Recent content (last 3 months)
  recentContent: Array<{ title: string; type: string; date: string }>

  // Templates
  templates: Array<{ title: string; type: string; performance: string | null }>

  // Deliverables
  deliverables: {
    reels: number
    feed_posts: number
    stories: number
    carousels: number
    platforms: string[]
  }

  // Upcoming events
  upcomingEvents: string[]
}

// ---------------------------------------------------------------------------
// Main assembly function
// ---------------------------------------------------------------------------

export async function assembleClientContext(clientId: string): Promise<ClientContext> {
  const supabase = await createClient()

  const [
    { data: client },
    { data: brand },
    { data: patterns },
    { data: socialMetrics },
    { data: recentItems },
    { data: templates },
    { data: goldenPosts },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('client_brands').select('voice_notes, brand_md, photo_style, visual_style').eq('client_id', clientId).maybeSingle(),
    supabase.from('client_patterns').select('patterns_md').eq('client_id', clientId).maybeSingle(),
    supabase
      .from('social_metrics')
      .select('date, platform, reach, impressions, followers_gained, engagement')
      .eq('client_id', clientId)
      .gte('date', sixtyDaysAgo())
      .order('date', { ascending: true }),
    supabase
      .from('content_calendar_items')
      .select('concept_title, content_type, scheduled_date, status')
      .eq('client_id', clientId)
      .in('status', ['published', 'scheduled', 'approved', 'strategist_approved'])
      .order('scheduled_date', { ascending: false })
      .limit(30),
    supabase
      .from('content_templates')
      .select('title, content_type, typical_performance')
      .eq('client_id', clientId)
      .order('times_used', { ascending: false })
      .limit(10),
    // Golden posts: approved style library entries with captions
    supabase
      .from('style_library')
      .select('caption, hashtags, platform, template_type, performance_notes, style_notes')
      .eq('client_id', clientId)
      .eq('is_golden', true)
      .eq('status', 'approved')
      .limit(10),
  ])

  // Parse new JSON fields from client record
  const targetAudience = parseJson<TargetAudience>(client?.target_audience)
  const contentPillars = parseJsonArray<string>(client?.content_pillars)
  const contentAvoid = parseJsonArray<string>(client?.content_avoid)
  const hashtagSets = parseJson<{ branded?: string[]; community?: string[]; location?: string[] }>(client?.hashtag_sets)
  const ctaPreferences = parseJsonArray<string>(client?.cta_preferences)
  const keyPeople = parseJsonArray<KeyPerson>(client?.key_people)
  const filmingLocations = parseJsonArray<FilmingLocation>(client?.filming_locations)
  const competitors = parseJsonArray<Competitor>(client?.competitors)
  const offerings = parseJsonArray<string>(client?.offerings)
  const socialHandles = (client?.socials ?? {}) as Record<string, string>

  // Compute performance stats
  let performance: ClientContext['performance'] = null
  if (socialMetrics && socialMetrics.length > 0) {
    const dayMap = new Map<number, { total: number; count: number }>()
    for (const row of socialMetrics) {
      const dow = new Date(row.date + 'T12:00:00').getDay()
      const entry = dayMap.get(dow) ?? { total: 0, count: 0 }
      entry.total += (row.reach as number) ?? 0
      entry.count++
      dayMap.set(dow, entry)
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const bestDays = [...dayMap.entries()]
      .map(([dow, { total, count }]) => ({ dow, avg: total / count }))
      .sort((a, b) => b.avg - a.avg)
      .slice(0, 2)
      .map((d) => dayNames[d.dow])

    const thirtyDaysAgoDate = thirtyDaysAgo()
    const recent = socialMetrics.filter((r) => r.date >= thirtyDaysAgoDate)
    const older = socialMetrics.filter((r) => r.date < thirtyDaysAgoDate)
    const recentReach = recent.reduce((acc, r) => acc + ((r.reach as number) ?? 0), 0)
    const olderReach = older.reduce((acc, r) => acc + ((r.reach as number) ?? 0), 0)
    const pct = olderReach > 0 ? Math.round(((recentReach - olderReach) / olderReach) * 100) : 0
    const reachTrend = pct > 0 ? `+${pct}% MoM` : pct < 0 ? `${pct}% MoM` : 'flat'

    const followerGrowth = socialMetrics.reduce((acc, r) => acc + ((r.followers_gained as number) ?? 0), 0)

    const dailyReach = new Map<string, number>()
    for (const row of socialMetrics) {
      dailyReach.set(row.date, (dailyReach.get(row.date) ?? 0) + ((row.reach as number) ?? 0))
    }
    const topPosts = [...dailyReach.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([date, reach]) => ({ type: 'post', reach, date }))

    performance = { bestDays, reachTrend, followerGrowth, topPosts }
  }

  // Compute deliverables
  const allotments = (client?.allotments ?? {}) as Record<string, number>
  const totalPosts = allotments.social_posts_per_month ?? 12
  const platforms = Object.entries(socialHandles).filter(([, v]) => !!v).map(([k]) => k)
  const reels = Math.round(totalPosts * 0.25)
  const stories = Math.round(totalPosts * 0.2)
  const carousels = Math.round(totalPosts * 0.15)
  const feedPosts = totalPosts - reels - stories - carousels

  return {
    businessName: client?.name ?? 'Unknown',
    businessType: client?.industry ?? null,
    location: client?.location ?? null,
    website: client?.website ?? null,
    socialHandles,
    voiceNotes: brand?.voice_notes ?? null,
    brandGuidelines: patterns?.patterns_md ?? brand?.brand_md ?? null,
    photoStyle: brand?.photo_style ?? null,
    visualStyle: brand?.visual_style ?? null,
    goals: Array.isArray(client?.goals) ? client.goals : parseJsonArray(client?.goals),
    targetAudience,
    contentPillars,
    contentAvoid,
    hashtagSets,
    ctaPreferences,
    keyPeople,
    filmingLocations,
    competitors,
    seasonalNotes: client?.seasonal_notes ?? null,
    offerings,
    contentDefaults: parseJson<Record<string, unknown>>(client?.content_defaults) ?? {},
    performance,
    goldenPosts: (goldenPosts ?? []).map((p) => ({
      caption: p.caption ?? '',
      hashtags: p.hashtags,
      platform: p.platform,
      type: p.template_type,
      performance_notes: p.performance_notes,
      style_notes: p.style_notes,
    })),
    recentContent: (recentItems ?? []).map((r) => ({
      title: r.concept_title,
      type: r.content_type,
      date: r.scheduled_date ?? '',
    })),
    templates: (templates ?? []).map((t) => ({
      title: t.title,
      type: t.content_type,
      performance: t.typical_performance,
    })),
    deliverables: { reels, feed_posts: feedPosts, stories, carousels, platforms },
    upcomingEvents: getUpcomingEvents(),
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseJson<T>(val: unknown): T | null {
  if (!val) return null
  if (typeof val === 'object') return val as T
  try { return JSON.parse(val as string) as T } catch { return null }
}

function parseJsonArray<T>(val: unknown): T[] {
  if (!val) return []
  if (Array.isArray(val)) return val as T[]
  try {
    const parsed = JSON.parse(val as string)
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

function sixtyDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 60); return d.toISOString().split('T')[0]
}

function thirtyDaysAgo(): string {
  const d = new Date(); d.setDate(d.getDate() - 30); return d.toISOString().split('T')[0]
}

function getUpcomingEvents(): string[] {
  const month = new Date().getMonth()
  const events: Record<number, string[]> = {
    0: ['New Year\'s Day (Jan 1)', 'MLK Day (3rd Mon)'],
    1: ['Valentine\'s Day (Feb 14)', 'Presidents\' Day (3rd Mon)'],
    2: ['St. Patrick\'s Day (Mar 17)', 'First Day of Spring (Mar 20)'],
    3: ['Easter', 'Earth Day (Apr 22)'],
    4: ['Cinco de Mayo (May 5)', 'Mother\'s Day (2nd Sun)', 'Memorial Day (last Mon)'],
    5: ['Father\'s Day (3rd Sun)', 'Juneteenth (Jun 19)'],
    6: ['Independence Day (Jul 4)'],
    7: ['Back to School'],
    8: ['Labor Day (1st Mon)', 'Fall Equinox (Sep 22)'],
    9: ['Halloween (Oct 31)'],
    10: ['Veterans Day (Nov 11)', 'Thanksgiving (4th Thu)', 'Black Friday', 'Small Business Saturday'],
    11: ['Hanukkah', 'Christmas (Dec 25)', 'New Year\'s Eve (Dec 31)'],
  }
  return events[month] ?? []
}
