/**
 * POST /api/dashboard/reviews/[id]/reply
 *
 * Client-side review reply: stores reply text in `reviews` AND posts
 * it to Google Business Profile via the v4 API so it actually appears
 * publicly on the listing. The /api/work/.../reply endpoint is the
 * admin/strategist variant that historically only stored the reply
 * text in the DB.
 *
 * Body: { replyText: string }
 *
 * The GBP path is read from reviews.review_url (set during sync as
 * "accounts/{a}/locations/{l}/reviews/{r}"). The access token comes
 * from the client's own channel_connections row.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { refreshGoogleToken } from '@/lib/google'
import { postReplyToReview } from '@/lib/integrations/gbp-connector'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const { id } = await ctx.params
  const body = await req.json().catch(() => null) as { replyText?: string } | null
  const replyText = body?.replyText?.trim()
  if (!replyText) return NextResponse.json({ error: 'replyText required' }, { status: 400 })

  const admin = createAdminClient()

  const { data: reviewRow } = await admin
    .from('reviews')
    .select('id, client_id, source, external_id, review_url, response_text')
    .eq('id', id)
    .maybeSingle()
  if (!reviewRow || reviewRow.client_id !== clientId) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }
  if (reviewRow.source !== 'google') {
    return NextResponse.json({ error: 'Only Google reviews support reply via the portal today' }, { status: 400 })
  }
  if (!reviewRow.review_url) {
    return NextResponse.json({ error: 'Missing GBP path on this review — re-sync first' }, { status: 409 })
  }

  /* review_url is "accounts/{a}/locations/{l}/reviews/{r}". Parse out
     each segment for the v4 API call. */
  const m = /^accounts\/([^/]+)\/locations\/([^/]+)\/reviews\/([^/]+)$/.exec(reviewRow.review_url)
  if (!m) {
    return NextResponse.json({ error: 'Unrecognised review path' }, { status: 500 })
  }
  const [, accountId, locationId, reviewIdPath] = m

  const { data: connRow } = await admin
    .from('channel_connections')
    .select('id, access_token, refresh_token, token_expires_at')
    .eq('client_id', clientId)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .maybeSingle()
  if (!connRow?.access_token) {
    return NextResponse.json({ error: 'No active Google Business Profile connection' }, { status: 409 })
  }

  /* Refresh the token if it's close to expiry — same pattern as the
     scheduled sync uses. */
  let accessToken = connRow.access_token as string
  const expiresAt = connRow.token_expires_at ? new Date(connRow.token_expires_at as string).getTime() : 0
  if (expiresAt - Date.now() < 60_000 && connRow.refresh_token) {
    try {
      const refreshed = await refreshGoogleToken(connRow.refresh_token as string)
      accessToken = refreshed.access_token
      const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()
      await admin
        .from('channel_connections')
        .update({ access_token: accessToken, token_expires_at: newExpires })
        .eq('id', connRow.id)
    } catch (err) {
      return NextResponse.json({ error: `Token refresh failed: ${(err as Error).message}` }, { status: 500 })
    }
  }

  const apiResult = await postReplyToReview({
    accessToken,
    accountId,
    locationId,
    reviewId: reviewIdPath,
    comment: replyText,
  })
  if (!apiResult.ok) {
    return NextResponse.json({ error: apiResult.error ?? 'Failed to post reply to Google' }, { status: 502 })
  }

  /* Mirror the reply into our DB so the UI shows it immediately
     without a re-sync. */
  await admin
    .from('reviews')
    .update({
      response_text: replyText,
      responded_at: new Date().toISOString(),
      responded_by: user.email ?? user.id,
    })
    .eq('id', id)

  return NextResponse.json({ ok: true })
}
