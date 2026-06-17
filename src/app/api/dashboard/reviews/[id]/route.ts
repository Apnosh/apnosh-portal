/**
 * GET /api/dashboard/reviews/[id] — one review for the owner review page.
 * Access is checked against the review's own client_id (no clientId needed in
 * the URL), so a deep link resolves safely.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'

export const dynamic = 'force-dynamic'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params
  const admin = createAdminClient()
  const { data: r } = await admin
    .from('reviews')
    .select('id, client_id, author_name, rating, review_text, source, posted_at, response_text, responded_at')
    .eq('id', id)
    .maybeSingle()
  if (!r) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  const access = await checkClientAccess(r.client_id as string)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  return NextResponse.json({
    review: {
      id: r.id,
      author: (r.author_name as string) || 'A guest',
      rating: Number(r.rating ?? 0),
      text: (r.review_text as string) ?? '',
      source: ((r.source as string) ?? 'google').toLowerCase(),
      postedAt: (r.posted_at as string) ?? null,
      responseText: (r.response_text as string) ?? null,
      respondedAt: (r.responded_at as string) ?? null,
    },
  })
}
