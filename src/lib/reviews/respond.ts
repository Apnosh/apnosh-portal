'use server'

/**
 * Review response composer (Q1 wk 6, 1.2b).
 *
 * Takes a strategist-edited reply, posts it to the source provider
 * (Google for now; Yelp/Tripadvisor in Q2/Q3), and updates the local
 * reviews row with the response text + responded_at.
 *
 * The strategist UI in /admin/reviews calls this; the public-facing
 * /dashboard/local-seo/reviews page is read-only (clients see the
 * response after the AM posts it).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { logEvent } from '@/lib/events/log'
import { postReplyToReview } from '@/lib/integrations/gbp-connector'

interface RespondInput {
  reviewId: string                // reviews.id (our row, not external_id)
  comment: string
  /** auth.users.id of the strategist posting the reply */
  actorId: string
  actorRole?: 'admin' | 'strategist'
}

export async function respondToReview(
  input: RespondInput
): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()

  const { data: review, error: reviewErr } = await admin
    .from('reviews')
    .select('id, client_id, source, external_id, posted_at, response_text, rating')
    .eq('id', input.reviewId)
    .maybeSingle()
  if (reviewErr) return { ok: false, error: reviewErr.message }
  if (!review) return { ok: false, error: 'Review not found' }

  if (review.source !== 'google') {
    return { ok: false, error: `Auto-response not yet supported for source=${review.source}` }
  }
  if (!review.external_id) {
    return { ok: false, error: 'Review has no external_id; cannot post reply' }
  }

  // Find the connection + the location this review came from.
  const { data: connection } = await admin
    .from('channel_connections')
    .select('access_token, metadata')
    .eq('client_id', review.client_id)
    .eq('channel', 'google_business_profile')
    .eq('status', 'active')
    .maybeSingle()
  if (!connection?.access_token) {
    return { ok: false, error: 'No active Google Business connection for this client' }
  }

  const { data: location } = await admin
    .from('gbp_locations')
    .select('store_code')
    .eq('client_id', review.client_id)
    .limit(1)
    .maybeSingle()
  if (!location?.store_code) {
    return { ok: false, error: 'No GBP location mapped for this client' }
  }

  const accountId = (connection.metadata?.account_id as string | undefined) ?? '-'

  const postResult = await postReplyToReview({
    accessToken: connection.access_token,
    accountId,
    locationId: location.store_code,
    reviewId: review.external_id,
    comment: input.comment,
  })
  if (!postResult.ok) return postResult

  const respondedAt = new Date().toISOString()
  await admin
    .from('reviews')
    .update({
      response_text: input.comment,
      responded_at: respondedAt,
      responded_by: input.actorRole ?? 'admin',
    })
    .eq('id', review.id)

  // Compute "within hours" for analytics
  const postedAt = new Date(review.posted_at).getTime()
  const now = Date.now()
  const withinHours = Math.round((now - postedAt) / 3600000)

  await logEvent({
    clientId: review.client_id,
    eventType: 'review.responded',
    subjectType: 'review',
    subjectId: review.id,
    actorId: input.actorId,
    actorRole: input.actorRole ?? 'admin',
    payload: {
      reviewId: review.id,
      responseExcerpt: input.comment.slice(0, 200),
      withinHours,
    },
    summary: `Replied to ${review.rating}★ review (${withinHours}h after post)`,
  })

  return { ok: true }
}
