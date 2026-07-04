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
import { getGbpAnalytics } from '@/lib/dashboard/get-gbp-analytics'
import { getSocialPosts } from '@/lib/dashboard/get-social-posts'

export const maxDuration = 15

type FindYou = { searchMobile: number; searchDesktop: number; mapsMobile: number; mapsDesktop: number }
type TopPost = {
  id: string; platform: string; permalink: string | null; thumbnailUrl: string | null
  type: string; reach: number; likes: number; saves: number
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

  const [gbp, posts] = await Promise.allSettled([
    getGbpAnalytics(clientId, '30d'),
    getSocialPosts(clientId, 90),
  ])

  let findYou: FindYou | null = null
  let topQueries: { query: string; impressions: number }[] = []
  if (gbp.status === 'fulfilled' && gbp.value) {
    const b = gbp.value.impressionBreakdown
    const anyImpr = b.searchMobile + b.searchDesktop + b.mapsMobile + b.mapsDesktop
    findYou = anyImpr > 0 ? b : null
    topQueries = (gbp.value.topQueries ?? [])
      .filter((q) => q.query && q.impressions > 0)
      .slice(0, 6)
  }

  let topPosts: TopPost[] = []
  if (posts.status === 'fulfilled' && Array.isArray(posts.value)) {
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
      }))
  }

  return NextResponse.json({ findYou, topQueries, topPosts })
}
