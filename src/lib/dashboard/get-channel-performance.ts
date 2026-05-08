'use server'

/**
 * Per-channel performance helpers — feed the ChannelHero strip on each
 * channel page (Posts / Reviews / Email & SMS / Website).
 *
 * Same shape as the dashboard pulse cards but scoped to a single
 * channel: 7-day rolling window, 14-day daily series for sparkline,
 * conservative thresholds so we don't alarm on tiny absolute numbers.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import type { ChannelMetric } from '@/components/dashboard/channel-hero'

function fmtCompact(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}

function fmtDelta(thisN: number, prevN: number, threshold = 5): { delta: string | null; up: boolean | null } {
  if (prevN < threshold) return { delta: null, up: null }
  const pct = Math.round(((thisN - prevN) / prevN) * 100)
  return { delta: `${pct >= 0 ? '+' : ''}${pct}%`, up: pct >= 0 }
}

function buildSeries<T extends { date: string }>(rows: T[] | null, valueOf: (r: T) => number, days = 14): number[] {
  const byDate = new Map<string, number>()
  for (const r of rows ?? []) {
    const d = (r.date as string).slice(0, 10)
    byDate.set(d, (byDate.get(d) ?? 0) + valueOf(r))
  }
  const now = new Date()
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const out: number[] = []
  for (let i = days - 1; i >= 0; i--) {
    out.push(byDate.get(fmt(new Date(now.getTime() - i * 86400000))) ?? 0)
  }
  return out
}

// ─────────────────────────────────────────────────────────────
// Posts (social) performance
// ─────────────────────────────────────────────────────────────
export interface PostsPerformance {
  metrics: ChannelMetric[]
  summary: string | null
}

export async function getPostsPerformance(clientId: string): Promise<PostsPerformance> {
  const admin = createAdminClient()
  const now = new Date()
  const d7 = new Date(now.getTime() - 7 * 86400000)
  const d14 = new Date(now.getTime() - 14 * 86400000)
  const fmt = (d: Date) => d.toISOString().slice(0, 10)

  const [thisRow, prevRow, dailyRow, postsRow] = await Promise.all([
    admin
      .from('social_metrics')
      .select('reach, impressions, engagement, profile_visits')
      .eq('client_id', clientId)
      .gte('date', fmt(d7)),
    admin
      .from('social_metrics')
      .select('reach, impressions, engagement, profile_visits')
      .eq('client_id', clientId)
      .gte('date', fmt(d14))
      .lt('date', fmt(d7)),
    admin
      .from('social_metrics')
      .select('date, reach, impressions, engagement')
      .eq('client_id', clientId)
      .gte('date', fmt(d14))
      .order('date', { ascending: true }),
    admin
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .eq('status', 'published')
      .gte('scheduled_for', d7.toISOString()),
  ])

  const sum = <T extends Record<string, unknown>>(rows: T[] | null, field: keyof T): number =>
    (rows ?? []).reduce((acc, r) => acc + Number(r[field] ?? 0), 0)

  const thisReach = sum(thisRow.data, 'reach')
  const prevReach = sum(prevRow.data, 'reach')
  const thisImpressions = sum(thisRow.data, 'impressions')
  const prevImpressions = sum(prevRow.data, 'impressions')
  const thisEngagement = sum(thisRow.data, 'engagement')
  const prevEngagement = sum(prevRow.data, 'engagement')
  const publishedCount = postsRow.count ?? 0

  const hasData = (thisRow.data?.length ?? 0) + (prevRow.data?.length ?? 0) > 0

  if (!hasData) {
    return {
      summary: null,
      metrics: [
        { label: 'Reach', state: 'no-data', subtitle: 'People who saw your content', href: '/dashboard/connected-accounts', connectLabel: 'Connect socials' },
        { label: 'Impressions', state: 'no-data', subtitle: 'Times your content was shown', href: '/dashboard/connected-accounts', connectLabel: 'Connect socials' },
        { label: 'Posts published', state: 'no-data', subtitle: 'Last 7 days', href: '/dashboard/social/calendar', connectLabel: 'Schedule a post' },
      ],
    }
  }

  return {
    summary: null,  // optional AI summary added in a later increment
    metrics: [
      {
        label: 'Reach',
        state: 'live',
        value: fmtCompact(thisReach),
        ...fmtDelta(thisReach, prevReach, 50),
        subtitle: 'People who saw your content',
        series: buildSeries(dailyRow.data, r => Number(r.reach ?? 0)),
      },
      {
        label: 'Impressions',
        state: 'live',
        value: fmtCompact(thisImpressions),
        ...fmtDelta(thisImpressions, prevImpressions, 100),
        subtitle: 'Times your content was shown',
        series: buildSeries(dailyRow.data, r => Number(r.impressions ?? 0)),
      },
      {
        label: 'Engagement',
        state: 'live',
        value: fmtCompact(thisEngagement),
        ...fmtDelta(thisEngagement, prevEngagement, 5),
        subtitle: `${publishedCount} post${publishedCount === 1 ? '' : 's'} published this week`,
        series: buildSeries(dailyRow.data, r => Number(r.engagement ?? 0)),
      },
    ],
  }
}

// ─────────────────────────────────────────────────────────────
// Reviews performance
// ─────────────────────────────────────────────────────────────
export interface ReviewsPerformance {
  metrics: ChannelMetric[]
  summary: string | null
}

export async function getReviewsPerformance(clientId: string): Promise<ReviewsPerformance> {
  const admin = createAdminClient()
  const now = new Date()
  const d30 = new Date(now.getTime() - 30 * 86400000)
  const d60 = new Date(now.getTime() - 60 * 86400000)

  const [recentRow, prevMonthRow, allRecentRow, unrespondedRow] = await Promise.all([
    admin
      .from('reviews')
      .select('rating, posted_at, responded_at')
      .eq('client_id', clientId)
      .gte('posted_at', d30.toISOString()),
    admin
      .from('reviews')
      .select('rating')
      .eq('client_id', clientId)
      .gte('posted_at', d60.toISOString())
      .lt('posted_at', d30.toISOString()),
    // Daily count for sparkline — last 30 days
    admin
      .from('reviews')
      .select('posted_at')
      .eq('client_id', clientId)
      .gte('posted_at', d30.toISOString())
      .order('posted_at', { ascending: true }),
    admin
      .from('reviews')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .is('response_text', null),
  ])

  const recent = recentRow.data ?? []
  const prevMonth = prevMonthRow.data ?? []
  const newCount = recent.length
  const prevCount = prevMonth.length
  const avg = newCount > 0 ? recent.reduce((s, r) => s + Number(r.rating ?? 0), 0) / newCount : null
  const prevAvg = prevCount > 0 ? prevMonth.reduce((s, r) => s + Number(r.rating ?? 0), 0) / prevCount : null

  const respondedWithin24h = recent.filter(r => {
    if (!r.responded_at) return false
    const posted = new Date(r.posted_at as string).getTime()
    const responded = new Date(r.responded_at as string).getTime()
    return responded - posted <= 24 * 3600 * 1000
  }).length
  const responseRate = newCount > 0 ? Math.round((respondedWithin24h / newCount) * 100) : null
  const unrespondedCount = unrespondedRow.count ?? 0

  // Build a 14-day sparkline of new reviews per day (synthesized from posted_at)
  const buckets: Record<string, number> = {}
  for (const r of allRecentRow.data ?? []) {
    const d = (r.posted_at as string).slice(0, 10)
    buckets[d] = (buckets[d] ?? 0) + 1
  }
  const fmt = (d: Date) => d.toISOString().slice(0, 10)
  const reviewsSeries: number[] = []
  for (let i = 13; i >= 0; i--) {
    reviewsSeries.push(buckets[fmt(new Date(now.getTime() - i * 86400000))] ?? 0)
  }

  if (newCount === 0 && prevCount === 0) {
    return {
      summary: null,
      metrics: [
        { label: 'Average star', state: 'no-data', subtitle: 'Last 30 days', href: '/dashboard/connected-accounts', connectLabel: 'Connect Google or Yelp' },
        { label: 'New reviews', state: 'no-data', subtitle: 'Last 30 days', href: '/dashboard/connected-accounts', connectLabel: 'Connect review sources' },
        { label: 'Response rate (24h)', state: 'no-data', subtitle: 'Replied within 24h', href: '/dashboard/connected-accounts' },
      ],
    }
  }

  return {
    summary: unrespondedCount > 0
      ? `${unrespondedCount} review${unrespondedCount === 1 ? '' : 's'} ${unrespondedCount === 1 ? 'is' : 'are'} unanswered. Replying within 24 hours has a measurable impact on perceived quality.`
      : null,
    metrics: [
      {
        label: 'Average star',
        state: 'live',
        value: avg !== null ? `${avg.toFixed(1)}★` : '—',
        delta: prevAvg !== null && avg !== null ? `${avg >= prevAvg ? '+' : ''}${(avg - prevAvg).toFixed(1)}` : null,
        up: avg !== null && prevAvg !== null ? avg >= prevAvg : null,
        subtitle: 'Last 30 days',
      },
      {
        label: 'New reviews',
        state: 'live',
        value: String(newCount),
        ...fmtDelta(newCount, prevCount, 3),
        subtitle: 'Last 30 days',
        series: reviewsSeries,
      },
      {
        label: 'Response rate',
        state: 'live',
        value: responseRate !== null ? `${responseRate}%` : '—',
        delta: null,
        up: responseRate !== null ? responseRate >= 75 : null,
        subtitle: `Replied within 24h${unrespondedCount > 0 ? ` · ${unrespondedCount} unanswered` : ''}`,
      },
    ],
  }
}
