/**
 * /api/dashboard/insights-detail — the "further breakdown" data for the owner's
 * Insights deep-dive that the shared /api/dashboard/load payload doesn't carry:
 *   - findYou: where Google views come from (search vs maps, phone vs computer)
 *   - topQueries: the exact phrases people searched to find the business
 *   - topPosts: the best social posts by reach
 *
 * Lazy-fetched by the Insights page (keyed on clientId), mirroring the
 * review-summary fetch, so the home load stays lean. Every source is
 * best-effort: a missing GBP connection or un-synced social leaves that
 * section quiet instead of failing the page.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { getGbpAnalytics, type AnalyticsRange } from '@/lib/dashboard/get-gbp-analytics'
import { getSocialPosts } from '@/lib/dashboard/get-social-posts'
import { createAdminClient } from '@/lib/supabase/admin'

export const maxDuration = 15

type FindYou = { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number }
type TopPost = {
  id: string; platform: string; permalink: string | null; thumbnailUrl: string | null
  type: string; reach: number; likes: number; saves: number; postedAt: string | null
}

// Plain-English post type from the raw IG/FB media fields.
function postType(mediaType: string | null, product: string | null): string {
  const p = (product ?? '').toUpperCase()
  const m = (mediaType ?? '').toUpperCase()
  if (p === 'REELS') return 'Reel'
  if (m === 'VIDEO') return 'Video'
  if (m === 'CAROUSEL_ALBUM') return 'Carousel'
  return 'Photo'
}

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  // the funnel + visibility tabs pick the window; default to 30 days
  const rp = req.nextUrl.searchParams.get('range')
  const range: AnalyticsRange = rp === '7d' || rp === '90d' || rp === '12m' ? rp : '30d'

  const admin = createAdminClient()
  const [gbp, posts, primaryLoc] = await Promise.allSettled([
    getGbpAnalytics(clientId, range),
    getSocialPosts(clientId, 90),
    // the business's primary city → the funnel's "target audience" label
    admin.from('client_locations').select('city, state').eq('client_id', clientId).eq('is_primary', true).maybeSingle(),
  ])

  let findYou: FindYou | null = null
  let topQueries: { query: string; impressions: number }[] = []
  // Brand-awareness view: how many times we showed up, split Maps vs Search, and
  // what people did after seeing us. Same 30d window as findYou so the numbers
  // on the Visibility tab agree with each other.
  // total = Google impressions + social reach (folded in below, after socialReach is
  // known). google/social carry the honest split so the funnel can label it truthfully;
  // maps/search stay the Google-views breakdown used elsewhere.
  let views: { total: number; maps: number; search: number; google?: number; social?: number } | null = null
  let actions: { directions: number; calls: number; websiteClicks: number } | null = null
  // the most recent day Google actually has data for (its Performance API runs a few
  // days behind); surfaced as "as of ‹date›" so an owner reads the lag honestly.
  let asOf: string | null = null
  let windowStart: string | null = null // first day of the selected window → shown as "start – asOf"
  // signed year-over-year % change per funnel stage (same calendar window last year);
  // null where there's no prior-year baseline to compare against.
  let yoy: { awareness: number | null; interest: number | null; actions: number | null; orders: number | null } | null = null
  if (gbp.status === 'fulfilled' && gbp.value) {
    const b = gbp.value.impressionBreakdown
    const maps = b.mapsMobile + b.mapsDesktop
    const search = b.searchMobile + b.searchDesktop
    const anyImpr = maps + search
    findYou = anyImpr > 0 ? b : null
    views = anyImpr > 0 ? { total: anyImpr, maps, search } : null
    const t = gbp.value.totals
    actions = { directions: t.directions ?? 0, calls: t.calls ?? 0, websiteClicks: t.websiteClicks ?? 0 }
    topQueries = (gbp.value.topQueries ?? [])
      .filter((q) => q.query && q.impressions > 0)
      .slice(0, 6)
    // getGbpAnalytics trims trailing all-zero days, so the last daily point is the
    // freshest day with real numbers; fall back to the window end if the series is empty.
    const dl = gbp.value.daily
    asOf = dl.length ? dl[dl.length - 1].date : gbp.value.end
    windowStart = gbp.value.start // the window's first day (today−3 − (rangeDays−1))
    // per-stage YoY, computed on the SAME fields both years so each % is like-for-like
    const p = gbp.value.prevTotals
    const chg = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null)
    yoy = {
      awareness: chg(t.impressions, p.impressions),
      interest: chg(t.directions + t.calls + t.websiteClicks, p.directions + p.calls + p.websiteClicks),
      actions: chg(t.directions + t.calls, p.directions + p.calls),
      orders: chg(t.directions, p.directions), // Orders = directions × rate → its % equals the directions %
    }
  }

  // the funnel's "target audience" = the primary location's city (owner-editable later)
  let audience: string | null = null
  if (primaryLoc.status === 'fulfilled') {
    const loc = (primaryLoc.value as { data: { city: string | null } | null } | null)?.data
    if (loc?.city) audience = loc.city
  }

  let topPosts: TopPost[] = []
  // Social reach + whether any social account is even connected. The Visibility
  // tab always shows the social channel in its data flow; these stay 0 / false
  // (an honest "connect to unlock") until an Instagram/Facebook sync exists.
  let socialReach = 0
  let socialConnected = false
  // Whether Google Business Profile analytics resolved at all. Drives the honest
  // "Not connected" label on the Google pieces of a stage breakdown (vs a real 0).
  const googleConnected = gbp.status === 'fulfilled' && !!gbp.value
  if (posts.status === 'fulfilled' && Array.isArray(posts.value)) {
    socialConnected = posts.value.length > 0
    socialReach = posts.value.reduce((s, p) => s + (p.reach ?? 0), 0)
    topPosts = posts.value
      .filter((p) => (p.reach ?? 0) > 0)
      .sort((a, b) => (b.reach ?? 0) - (a.reach ?? 0))
      .slice(0, 3)
      .map((p) => ({
        id: p.id,
        platform: p.platform,
        permalink: p.permalink,
        thumbnailUrl: p.thumbnail_url,
        type: postType(p.media_type, p.media_product_type),
        reach: p.reach ?? 0,
        likes: p.likes ?? 0,
        saves: p.saves ?? 0,
        postedAt: p.posted_at ?? null,
      }))
  }

  // Fold social REACH into the funnel's TOP stage only — Awareness = "people who saw you"
  // = Google views + social reach. Reach is the only social number with an honest funnel
  // meaning; likes/comments/profile-visits are NOT folded (they'd break monotonicity). The
  // deeper stages stay Google-measured. Honesty rules:
  //   · GBP off/zero AND no social reach → views stays null (funnel hides, unchanged).
  //   · GBP has impressions, social 0/disconnected → total = google only, social = 0 (looks
  //     byte-identical to today).
  //   · social has reach → it's added to the total, split carried for an honest label.
  if (views) {
    views = { total: views.total + socialReach, google: views.total, social: socialReach, maps: views.maps, search: views.search }
  } else if (socialReach > 0) {
    // GBP disconnected/zero but social has real reach → an honest social-only Awareness.
    views = { total: socialReach, google: 0, social: socialReach, maps: 0, search: 0 }
  }
  // NOTE: yoy.awareness stays the GOOGLE-only year-over-year comparison. We do NOT have a
  // cheap prior-period social reach here, and fabricating one would be dishonest, so a
  // Google-only awareness trend is the honest choice.

  // Interest-stage social signals (best effort; 0 when absent). Profile visits are an
  // INTEREST signal (someone looked closer), post engagement is likes/comments/saves, and
  // followers gained is audience GROWTH. These feed the Interest breakdown, NOT Awareness.
  let profileVisits = 0
  let followersGained = 0
  let socialEngagement = 0
  {
    const days = range === '7d' ? 7 : range === '90d' ? 90 : range === '12m' ? 365 : 30
    const since = new Date()
    since.setDate(since.getDate() - (days - 1))
    const bound = since.toISOString().slice(0, 10)
    const sm = await admin
      .from('social_metrics')
      .select('profile_visits, followers_gained, engagement')
      .eq('client_id', clientId)
      .gte('date', bound)
    for (const r of (sm.data ?? []) as Record<string, unknown>[]) {
      profileVisits += Number(r.profile_visits) || 0
      followersGained += Number(r.followers_gained) || 0
      socialEngagement += Number(r.engagement) || 0
    }
  }

  return NextResponse.json({ findYou, topQueries, topPosts, views, actions, socialReach, socialConnected, googleConnected, profileVisits, followersGained, socialEngagement, asOf, windowStart, audience, yoy })
}
