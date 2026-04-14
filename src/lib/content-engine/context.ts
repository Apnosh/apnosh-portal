'use server'

import { createClient } from '@/lib/supabase/server'

export interface ClientContext {
  // Business info
  businessName: string
  businessType: string | null
  location: string | null
  website: string | null

  // Brand
  voiceNotes: string | null
  toneNotes: string | null
  brandGuidelines: string | null

  // Audience & goals
  goals: string[]
  targetAudience: string | null

  // Performance (last 60 days)
  performance: {
    topContentTypes: Array<{ type: string; avgReach: number }>
    bestDays: string[]
    reachTrend: string // "+12% MoM" or "flat"
    followerGrowth: number
    topPosts: Array<{ type: string; reach: number; date: string }>
  } | null

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

export async function assembleClientContext(clientId: string): Promise<ClientContext> {
  const supabase = await createClient()

  const [
    { data: client },
    { data: brand },
    { data: patterns },
    { data: socialMetrics },
    { data: recentItems },
    { data: templates },
  ] = await Promise.all([
    supabase.from('clients').select('*').eq('id', clientId).maybeSingle(),
    supabase.from('client_brands').select('voice_notes, brand_md').eq('client_id', clientId).maybeSingle(),
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
  ])

  // Compute performance stats
  let performance: ClientContext['performance'] = null
  if (socialMetrics && socialMetrics.length > 0) {
    // Content type performance
    const typeMap = new Map<string, { total: number; count: number }>()
    // For now, we don't have per-post type data in social_metrics
    // We'll use overall reach trends

    // Best days
    const dayMap = new Map<number, { total: number; count: number }>()
    for (const row of socialMetrics) {
      const dow = new Date(row.date + 'T12:00:00').getDay()
      const entry = dayMap.get(dow) ?? { total: 0, count: 0 }
      entry.total += (row.reach as number) ?? 0
      entry.count++
      dayMap.set(dow, entry)
    }
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    const sortedDays = [...dayMap.entries()]
      .map(([dow, { total, count }]) => ({ dow, avg: total / count }))
      .sort((a, b) => b.avg - a.avg)
    const bestDays = sortedDays.slice(0, 2).map((d) => dayNames[d.dow])

    // Reach trend MoM
    const thirtyDaysAgoDate = thirtyDaysAgo()
    const recent = socialMetrics.filter((r) => r.date >= thirtyDaysAgoDate)
    const older = socialMetrics.filter((r) => r.date < thirtyDaysAgoDate)
    const recentReach = recent.reduce((acc, r) => acc + ((r.reach as number) ?? 0), 0)
    const olderReach = older.reduce((acc, r) => acc + ((r.reach as number) ?? 0), 0)
    const pct = olderReach > 0 ? Math.round(((recentReach - olderReach) / olderReach) * 100) : 0
    const reachTrend = pct > 0 ? `+${pct}% MoM` : pct < 0 ? `${pct}% MoM` : 'flat'

    // Follower growth
    const followerGrowth = socialMetrics.reduce(
      (acc, r) => acc + ((r.followers_gained as number) ?? 0), 0
    )

    // Top posts by reach (top 5 days)
    const dailyReach = new Map<string, number>()
    for (const row of socialMetrics) {
      dailyReach.set(row.date, (dailyReach.get(row.date) ?? 0) + ((row.reach as number) ?? 0))
    }
    const topPosts = [...dailyReach.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([date, reach]) => ({ type: 'post', reach, date }))

    performance = {
      topContentTypes: [], // Would need per-post analytics
      bestDays,
      reachTrend,
      followerGrowth,
      topPosts,
    }
  }

  // Compute deliverables from allotments
  const allotments = (client?.allotments ?? {}) as Record<string, number>
  const totalPosts = allotments.social_posts_per_month ?? 12
  const platforms = Object.entries(client?.socials ?? {})
    .filter(([, v]) => !!v)
    .map(([k]) => k)

  // Split total posts into types (rough heuristic)
  const reels = Math.round(totalPosts * 0.25)
  const stories = Math.round(totalPosts * 0.2)
  const carousels = Math.round(totalPosts * 0.15)
  const feedPosts = totalPosts - reels - stories - carousels

  return {
    businessName: client?.name ?? 'Unknown',
    businessType: client?.industry ?? null,
    location: client?.location ?? null,
    website: client?.website ?? null,
    voiceNotes: brand?.voice_notes ?? null,
    toneNotes: null,
    brandGuidelines: patterns?.patterns_md ?? brand?.brand_md ?? null,
    goals: client?.goals ?? [],
    targetAudience: null,
    performance,
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

function sixtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 60)
  return d.toISOString().split('T')[0]
}

function thirtyDaysAgo(): string {
  const d = new Date()
  d.setDate(d.getDate() - 30)
  return d.toISOString().split('T')[0]
}

function getUpcomingEvents(): string[] {
  const now = new Date()
  const month = now.getMonth()
  // Basic holiday calendar — expand later
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
