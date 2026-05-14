'use server'

/**
 * AI-drafted replies for unanswered reviews. Strategist reviews +
 * edits + sends. Cuts response time from minutes to seconds.
 *
 * Reads the unanswered reviews for a client, runs Anthropic over
 * each one with the client's business context, returns drafts the
 * strategist can paste into the existing reply flow.
 *
 * No caching — drafts are cheap enough to regenerate on demand, and
 * the strategist may want a fresh take.
 */

import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'

const anthropic = new Anthropic()

export interface DraftReply {
  reviewId: string
  reply: string
}

export async function draftRepliesForClient(
  clientId: string,
  options?: { limit?: number; locationId?: string | null },
): Promise<DraftReply[]> {
  const admin = createAdminClient()
  const limit = options?.limit ?? 10
  const locationId = options?.locationId ?? null

  /* Business context — name and primary category give the model
     enough to write reply copy that sounds in-voice. */
  const { data: clientRow } = await admin
    .from('clients')
    .select('name, business_type')
    .eq('id', clientId)
    .maybeSingle()
  const businessName = (clientRow?.name as string | undefined) ?? 'our restaurant'

  let q = admin
    .from('reviews')
    .select('id, source, rating, author_name, review_text, created_at')
    .eq('client_id', clientId)
    .is('responded_at', null)
    .not('review_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (locationId) q = q.eq('location_id', locationId)
  const { data: reviews } = await q

  const list = (reviews ?? []) as Array<{
    id: string
    source: string
    rating: number
    author_name: string | null
    review_text: string | null
    created_at: string
  }>
  if (list.length === 0) return []

  const reviewBlock = list.map((r, i) => {
    const author = r.author_name ?? 'a customer'
    return `[${i}] id=${r.id} author=${author} rating=${r.rating}/5 source=${r.source}
text: ${(r.review_text ?? '').replace(/\s+/g, ' ').slice(0, 600)}`
  }).join('\n\n')

  const prompt = `You are drafting reply messages to customer reviews for ${businessName}, a restaurant.

For each review below, write a short owner-style reply.

Rules:
- 1-3 sentences, conversational, no corporate-speak.
- Thank the customer by name when given.
- For positive reviews (4-5 stars): warm, specific to what they mentioned, invite them back.
- For mixed reviews (3 stars): acknowledge what they liked, address what didn't land, invite them to email the restaurant for follow-up.
- For negative reviews (1-2 stars): apologize sincerely, take responsibility, offer to make it right offline (email or phone). Do NOT be defensive. Never deny the issue.
- Never make up specific facts the review doesn't mention.
- Never use the phrases "we appreciate your feedback" or "we value your business" — they're filler.
- No emojis.
- Sign off with just the business name, e.g. "— ${businessName}".

Output ONLY valid JSON, no prose around it:
{ "replies": [{ "reviewId": "<id>", "reply": "<draft text>" }] }

Reviews:
${reviewBlock}`

  const res = await anthropic.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 4000,
    messages: [{ role: 'user', content: prompt }],
  })
  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
    .trim()
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(cleaned) as { replies?: DraftReply[] }
  return Array.isArray(parsed.replies) ? parsed.replies : []
}
