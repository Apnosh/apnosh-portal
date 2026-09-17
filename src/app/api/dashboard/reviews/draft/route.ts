/**
 * POST /api/dashboard/reviews/draft — AI-drafted public reply to a review.
 *
 * Body: { reviewId, tone? }. Access is checked against the review's client, then one real
 * Claude call writes the reply in the owner's voice (src/lib/reviews/draft-reply.ts). Returns
 * { reply }. The draft is kept in client_cache for a week so the inbox and the Reply now sheet
 * show the same words without a second call.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { draftReviewReply, isTone } from '@/lib/reviews/draft-reply'
import { writeCache } from '@/lib/client-cache'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const reviewId: string | undefined = body.reviewId
  const tone = isTone(body.tone) ? body.tone : 'thankful'
  if (!reviewId) return NextResponse.json({ error: 'reviewId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: r } = await admin.from('reviews').select('client_id').eq('id', reviewId).maybeSingle()
  if (!r) return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  const access = await checkClientAccess(r.client_id as string)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })

  const out = await draftReviewReply(admin, reviewId, tone, { clientId: r.client_id as string })
  if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status })
  writeCache(out.clientId, `reply-draft:${reviewId}:${tone}`, { reply: out.reply }).catch(() => {})
  return NextResponse.json({ reply: out.reply })
}
