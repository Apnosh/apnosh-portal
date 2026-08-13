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

  const db = createAdminClient()
  /* Sorted in the database rather than in memory: the page only ever holds one slice, so the
   * ordering has to be authoritative at the source. Nulls last so an undated row cannot jump
   * to the top of "newest first". */
  const { data, count, error } = await db
    .from('social_posts')
    .select('id, platform, permalink, thumbnail_url, media_type, media_product_type, reach, video_views, likes, saves, posted_at, raw_data', { count: 'exact' })
    .eq('client_id', clientId)
    .order('posted_at', { ascending: false, nullsFirst: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: 'Could not load posts' }, { status: 500 })

  const posts = (data ?? []).map((r) => toPostView(r as Parameters<typeof toPostView>[0]))
  const total = count ?? posts.length
  return NextResponse.json(
    { posts, total, offset, limit, hasMore: offset + posts.length < total },
    { headers: { 'Cache-Control': 'no-store' } },
  )
}
