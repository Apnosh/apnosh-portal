/**
 * Tool: draft_review_response
 *
 * Drafts a reply to a specific review using the existing
 * review-draft-replies.ts pipeline (Anthropic + brand context).
 * The agent returns the draft inline so the owner can read it,
 * tweak, and either send it themselves via Local SEO or have the
 * agent post it (future: post_review_response tool).
 *
 * Non-destructive (it's just a draft) but requires confirmation
 * because the owner should see and approve copy that represents
 * the brand publicly.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { draftRepliesForClient } from '@/lib/review-draft-replies'
import { registerToolHandler } from '../registry'
import type { ToolExecutionContext } from '../types'

export interface DraftReviewResponseInput {
  review_id?: string         // a specific review; if omitted, drafts for most-recent unresponded
  tone?: 'warm' | 'professional' | 'apologetic' | 'enthusiastic'
}

export const DRAFT_REVIEW_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    review_id: { type: 'string', description: 'UUID of a specific review. Omit to draft for the most-recent unresponded review.' },
    tone: { type: 'string', enum: ['warm', 'professional', 'apologetic', 'enthusiastic'], description: 'Optional tone steer.' },
  },
  additionalProperties: false,
} as const

export interface DraftReviewResponseOutput {
  review_id: string
  review_text: string | null
  rating: number | null
  drafted_response: string
}

async function handler(
  rawInput: unknown,
  ctx: ToolExecutionContext,
): Promise<DraftReviewResponseOutput> {
  const input = rawInput as DraftReviewResponseInput
  const admin = createAdminClient()

  /* Resolve which review to draft for. */
  let reviewId = input.review_id ?? null
  if (!reviewId) {
    const { data } = await admin
      .from('reviews')
      .select('id')
      .eq('client_id', ctx.clientId)
      .is('response_text', null)
      .order('posted_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    reviewId = (data?.id as string | undefined) ?? null
  }
  if (!reviewId) throw new Error('No review to draft a response for')

  /* Pull the review details so we can echo them back. */
  const { data: review } = await admin
    .from('reviews')
    .select('id, client_id, rating, review_text, author_name')
    .eq('id', reviewId)
    .maybeSingle()
  if (!review || review.client_id !== ctx.clientId) {
    throw new Error('Review not found for this client')
  }

  /* Reuse the existing draftRepliesForClient pipeline. It returns
     drafts for multiple reviews; we just pull ours. */
  const drafts = await draftRepliesForClient(ctx.clientId, { limit: 20 })
  const draft = drafts.find(d => d.reviewId === reviewId)
  if (!draft) throw new Error('Failed to generate draft (review may already be responded)')

  return {
    review_id: reviewId,
    review_text: (review.review_text as string | null) ?? null,
    rating: (review.rating as number | null) ?? null,
    drafted_response: draft.reply,
  }
}

registerToolHandler('draftReviewResponse', handler as never)
