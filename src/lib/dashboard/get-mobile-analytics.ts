'use server'

/**
 * Unified analytics for the mobile analytics page.
 *
 * Combines four data sources into one clean, render-ready shape:
 *   - GBP / Get Found   (gbp_metrics via getGbpAnalytics)
 *   - Website           (website_metrics: visitors, sources, conversions)
 *   - Reputation        (reviews: rating, distribution, recent)
 *   - Social            (social_metrics: reach, engagement, top post)
 *
 * The headline concept is the CUSTOMER JOURNEY funnel:
 *   Discovery  → people who saw you (impressions + website + social reach)
 *   Interest   → people who looked closer (profile/photo/post views + page views)
 *   Action     → people who reached out (calls + directions + clicks + conversions)
 *
 * That funnel is what a restaurant owner actually cares about: am I
 * being found, are people interested, and are they taking action?
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getGbpAnalytics, type AnalyticsRange } from './get-gbp-analytics'

export interface MobileAnalytics {
  range: AnalyticsRange
  /* Customer journey funnel. */
  funnel: {
    discovery: number
    interest: number
    action: number
    /* % of discovery that became action. */
    conversionRate: number
  }
  /* Get Found (GBP). */
  gbp: {
    impressions: number
    impressionsPrior: number
    searchTotal: number
    mapsTotal: number
    calls: number
    callsPrior: number
    directions: number
    directionsPrior: number
    websiteClicks: number
    websiteClicksPrior: number
    photoViews: number
    sparkline: number[]
    topQueries: Array<{ query: string; impressions: number }>
  }
  /* Website. */
  website: {
    connected: boolean
    visitors: number
    visitorsPrior: number
    sessions: number
    pageViews: number
    bounceRate: number | null
    avgSessionSeconds: number | null
    conversions: number
    topSources: Array<{ source: string; visitors: number }>
    sparkline: number[]
  }
  /* Reputation. */
  reviews: {
    avgRating: number | null
    total: number
    newThisPeriod: number
    distribution: [number, number, number, number, number] // [5,4,3,2,1]
  }
  /* Social. */
  social: {
    connected: boolean
    reach: number
    reachPrior: number
    engagement: number
    followers: number
    followersChange: number
    topPost: { caption: string; engagement: number; imageUrl: string | null } | null
  }
}

function rangeToDays(range: AnalyticsRange): number {
  if (range === '7d') return 7
  if (range === '30d') return 30
  if (range === '90d') return 90
  if (range === '12m') return 365
  return 30
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function getMobileAnalytics(
  clientId: string,
  range: AnalyticsRange = '30d',
): Promise<MobileAnalytics> {
  const admin = createAdminClient()
  const days = rangeToDays(range)

  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 3) // GBP reporting lag boundary
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - (days - 1))
  const priorEnd = new Date(start)
  priorEnd.setUTCDate(priorEnd.getUTCDate() - 1)
  const priorStart = new Date(priorEnd)
  priorStart.setUTCDate(priorStart.getUTCDate() - (days - 1))

  /* Run GBP + website + reviews + social in parallel. */
  const [gbp, websiteRows, websitePriorRows, reviewRows, socialRows] = await Promise.all([
    getGbpAnalytics(clientId, range),
    admin
      .from('website_metrics')
      .select('date, visitors, sessions, page_views, bounce_rate, avg_session_duration, traffic_sources, conversion_events')
      .eq('client_id', clientId)
      .gte('date', ymd(start))
      .lte('date', ymd(end))
      .order('date', { ascending: true }) as unknown as Promise<{ data: WebsiteRow[] | null }>,
    admin
      .from('website_metrics')
      .select('visitors')
      .eq('client_id', clientId)
      .gte('date', ymd(priorStart))
      .lte('date', ymd(priorEnd)) as unknown as Promise<{ data: Array<{ visitors: number | null }> | null }>,
    admin
      .from('reviews')
      .select('rating, posted_at')
      .eq('client_id', clientId)
      .gte('posted_at', ymd(priorStart)) as unknown as Promise<{ data: Array<{ rating: number | null; posted_at: string }> | null }>,
    admin
      .from('social_metrics')
      .select('total_reach, total_engagement, followers_count, followers_change, top_post_caption, top_post_engagement, top_post_image_url, year, month')
      .eq('client_id', clientId)
      .order('year', { ascending: false })
      .order('month', { ascending: false })
      .limit(2) as unknown as Promise<{ data: SocialRow[] | null }>,
  ])

  /* ── GBP ── */
  const gbpImpressions = gbp.totals.impressions
  const gbpSearch = gbp.impressionBreakdown.searchMobile + gbp.impressionBreakdown.searchDesktop
  const gbpMaps = gbp.impressionBreakdown.mapsMobile + gbp.impressionBreakdown.mapsDesktop
  const gbpSparkline = gbp.daily.map(d => d.impressions)

  /* ── Website ── */
  const wRows = websiteRows.data ?? []
  const websiteConnected = wRows.length > 0
  const sumW = (key: keyof WebsiteRow) =>
    wRows.reduce((s, r) => s + (Number(r[key] ?? 0) || 0), 0)
  const websiteVisitors = sumW('visitors')
  const websiteVisitorsPrior = (websitePriorRows.data ?? [])
    .reduce((s, r) => s + (Number(r.visitors ?? 0) || 0), 0)
  const websiteSessions = sumW('sessions')
  const websitePageViews = sumW('page_views')
  const bounceVals = wRows.map(r => r.bounce_rate).filter((b): b is number => b !== null && b !== undefined)
  const bounceRate = bounceVals.length ? bounceVals.reduce((a, b) => a + b, 0) / bounceVals.length : null
  const durVals = wRows.map(r => r.avg_session_duration).filter((d): d is number => d !== null && d !== undefined)
  const avgSessionSeconds = durVals.length ? Math.round(durVals.reduce((a, b) => a + b, 0) / durVals.length) : null

  /* Aggregate traffic sources across the window. */
  const sourceTotals = new Map<string, number>()
  for (const r of wRows) {
    const srcs = r.traffic_sources
    if (srcs && typeof srcs === 'object') {
      for (const [src, val] of Object.entries(srcs)) {
        const n = typeof val === 'number' ? val : Number(val) || 0
        sourceTotals.set(src, (sourceTotals.get(src) ?? 0) + n)
      }
    }
  }
  const topSources = [...sourceTotals.entries()]
    .map(([source, visitors]) => ({ source, visitors }))
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 4)

  /* Conversions = sum of conversion_events counts. */
  let conversions = 0
  for (const r of wRows) {
    const ce = r.conversion_events
    if (ce && typeof ce === 'object') {
      for (const val of Object.values(ce)) {
        conversions += typeof val === 'number' ? val : Number(val) || 0
      }
    }
  }
  const websiteSparkline = wRows.map(r => Number(r.visitors ?? 0) || 0)

  /* ── Reviews ── */
  const allReviews = reviewRows.data ?? []
  const periodReviews = allReviews.filter(r => r.posted_at >= ymd(start))
  const dist: [number, number, number, number, number] = [0, 0, 0, 0, 0]
  let ratingSum = 0
  let ratingCount = 0
  for (const r of allReviews) {
    const rating = Math.round(Number(r.rating ?? 0))
    if (rating >= 1 && rating <= 5) {
      dist[5 - rating] += 1
      ratingSum += rating
      ratingCount += 1
    }
  }
  const avgRating = ratingCount > 0 ? ratingSum / ratingCount : null

  /* ── Social ── */
  const sRows = socialRows.data ?? []
  /* Sum the most recent month across platforms. social_metrics is one
     row per platform per month, so group by the latest year+month. */
  const latestMonth = sRows[0]
  const currentMonthRows = latestMonth
    ? sRows.filter(r => r.year === latestMonth.year && r.month === latestMonth.month)
    : []
  const priorMonthRows = latestMonth
    ? sRows.filter(r => !(r.year === latestMonth.year && r.month === latestMonth.month))
    : []
  const socialConnected = currentMonthRows.length > 0
  const socialReach = currentMonthRows.reduce((s, r) => s + (r.total_reach ?? 0), 0)
  const socialReachPrior = priorMonthRows.reduce((s, r) => s + (r.total_reach ?? 0), 0)
  const socialEngagement = currentMonthRows.reduce((s, r) => s + (r.total_engagement ?? 0), 0)
  const followers = currentMonthRows.reduce((s, r) => s + (r.followers_count ?? 0), 0)
  const followersChange = currentMonthRows.reduce((s, r) => s + (r.followers_change ?? 0), 0)
  /* Best top-post across platforms by engagement. */
  const bestPost = currentMonthRows
    .filter(r => r.top_post_caption)
    .sort((a, b) => (b.top_post_engagement ?? 0) - (a.top_post_engagement ?? 0))[0]

  /* ── Funnel ── */
  const discovery = gbpImpressions + websiteVisitors + socialReach
  const interest = gbp.totals.photoViews + gbp.totals.postViews + websitePageViews
  const action = gbp.totals.calls + gbp.totals.directions + gbp.totals.websiteClicks + conversions
  const conversionRate = discovery > 0 ? (action / discovery) * 100 : 0

  return {
    range,
    funnel: { discovery, interest, action, conversionRate },
    gbp: {
      impressions: gbpImpressions,
      impressionsPrior: gbp.prevTotals.impressions,
      searchTotal: gbpSearch,
      mapsTotal: gbpMaps,
      calls: gbp.totals.calls,
      callsPrior: gbp.prevTotals.calls,
      directions: gbp.totals.directions,
      directionsPrior: gbp.prevTotals.directions,
      websiteClicks: gbp.totals.websiteClicks,
      websiteClicksPrior: gbp.prevTotals.websiteClicks,
      photoViews: gbp.totals.photoViews,
      sparkline: gbpSparkline,
      topQueries: gbp.topQueries,
    },
    website: {
      connected: websiteConnected,
      visitors: websiteVisitors,
      visitorsPrior: websiteVisitorsPrior,
      sessions: websiteSessions,
      pageViews: websitePageViews,
      bounceRate,
      avgSessionSeconds,
      conversions,
      topSources,
      sparkline: websiteSparkline,
    },
    reviews: {
      avgRating,
      total: ratingCount,
      newThisPeriod: periodReviews.length,
      distribution: dist,
    },
    social: {
      connected: socialConnected,
      reach: socialReach,
      reachPrior: socialReachPrior,
      engagement: socialEngagement,
      followers,
      followersChange,
      topPost: bestPost
        ? {
            caption: bestPost.top_post_caption ?? '',
            engagement: bestPost.top_post_engagement ?? 0,
            imageUrl: bestPost.top_post_image_url ?? null,
          }
        : null,
    },
  }
}

interface WebsiteRow {
  date: string
  visitors: number | null
  sessions: number | null
  page_views: number | null
  bounce_rate: number | null
  avg_session_duration: number | null
  traffic_sources: Record<string, number> | null
  conversion_events: Record<string, number> | null
}

interface SocialRow {
  total_reach: number | null
  total_engagement: number | null
  followers_count: number | null
  followers_change: number | null
  top_post_caption: string | null
  top_post_engagement: number | null
  top_post_image_url: string | null
  year: number
  month: number
}
