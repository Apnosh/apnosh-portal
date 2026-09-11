/**
 * /api/dashboard/social-posts — every post we hold, newest first, for the full list page.
 *
 * The Insights summary shows five. This is the same data behind "View all", mapped through the
 * SAME helpers (toPostView / newestFirst) so the first five here are literally the five on the
 * summary. Paged, because a busy account accumulates hundreds and the phone should not load
 * them all at once.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { createAdminClient } from '@/lib/supabase/admin'
import { toPostView } from '@/lib/insights/post-view'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const PAGE = 30
const RANK_MAX = 500
const MAX_PAGE = 100

export async function GET(req: NextRequest) {
  const clientId = req.nextUrl.searchParams.get('clientId')
  if (!clientId) return NextResponse.json({ error: 'clientId required' }, { status: 400 })

  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    const status = access.reason === 'unauthenticated' ? 401 : 403
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status })
  }

  const offset = Math.max(0, Number(req.nextUrl.searchParams.get('offset') ?? 0) || 0)
  const limit = Math.min(MAX_PAGE, Math.max(1, Number(req.nextUrl.searchParams.get('limit') ?? PAGE) || PAGE))

  /* Two owners asked for this by name in both rounds of testing: the list could
     not be ranked at all, only read newest-first. */
  const sortParam = (req.nextUrl.searchParams.get('sort') ?? 'newest').toLowerCase()
  const sort: 'newest' | 'views' | 'engagement' =
    sortParam === 'views' || sortParam === 'engagement' ? sortParam : 'newest'

  const db = createAdminClient()
  const COLS = 'id, platform, external_id, permalink, thumbnail_url, media_type, media_product_type, reach, video_views, likes, comments, shares, saves, posted_at, caption, raw_data'

  let posts: ReturnType<typeof toPostView>[]
  let total: number

  if (sort === 'newest') {
    /* Sorted in the database rather than in memory: the page only ever holds one slice, so the
     * ordering has to be authoritative at the source. Nulls last so an undated row cannot jump
     * to the top of "newest first". */
    const { data, count, error } = await db
      .from('social_posts')
      .select(COLS, { count: 'exact' })
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: 'Could not load posts' }, { status: 500 })
    posts = (data ?? []).map((r) => toPostView(r as Parameters<typeof toPostView>[0]))
    total = count ?? posts.length
  } else {
    /* Ranking cannot be done in the database here. The number an owner recognises
       is views-or-reach, whichever the platform reports, and engagement is a
       ratio -- both are expressions over two columns, not a column. Sorting one
       PAGE would be worse than not offering it: "most views" would silently mean
       "most views among the twenty we happened to load", which is the kind of
       almost-true number this whole pass exists to remove. So the client's posts
       are read whole and ranked exactly. Bounded at RANK_MAX; the biggest
       account in the system holds under fifty. */
    const { data, error } = await db
      .from('social_posts')
      .select(COLS)
      .eq('client_id', clientId)
      .order('posted_at', { ascending: false, nullsFirst: false })
      .limit(RANK_MAX)
    if (error) return NextResponse.json({ error: 'Could not load posts' }, { status: 500 })
    const all = (data ?? []).map((r) => toPostView(r as Parameters<typeof toPostView>[0]))
    /* A post whose numbers have not arrived, or whose kind never reports them, is
       not a zero and must not be ranked as the worst thing they ever made. Those
       sink to the bottom in their original date order. */
    const known = all.filter((p) => !p.pending && !p.unreported)
    const unknown = all.filter((p) => p.pending || p.unreported)
    const score = (p: (typeof all)[number]) =>
      sort === 'views' ? p.reach : (p.reach > 0 ? (p.likes + p.saves) / p.reach : -1)
    known.sort((a, b) => score(b) - score(a))
    const ranked = [...known, ...unknown]
    total = ranked.length
    posts = ranked.slice(offset, offset + limit)
  }
  return NextResponse.json(
    { posts, total, offset, limit, hasMore: offset + posts.length < total },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
