/**
 * Auto-reply to NEW 5-star Google reviews for clients who opted in
 * (clients.auto_reply_five_star). Drafts an on-brand thank-you with Claude
 * and posts it to Google. Run from the daily GBP sync.
 *
 * Safety rails:
 *   - Opt-in only (default off).
 *   - 5-star reviews ONLY — never 4 or below; criticals always need a human.
 *   - Only reviews posted in the last 14 days (no flood on first enable).
 *   - Capped per run per client.
 *   - Only replies where there's no reply yet.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveTokenForClient } from '@/lib/gbp-menu'
import { postReplyToReview } from '@/lib/integrations/gbp-connector'

const MODEL = 'claude-sonnet-4-20250514'
const LOOKBACK_DAYS = 14
const MAX_PER_RUN = 5

interface ReviewRow {
  id: string
  review_text: string | null
  author_name: string | null
  review_url: string | null
}

async function draftThankYou(brand: string, subtype: string | null, review: ReviewRow): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null
  const firstName = review.author_name?.trim().split(/\s+/)[0] ?? null
  const reviewText = review.review_text?.trim() || '(5 stars, no written review)'
  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    const resp = await claude.messages.create({
      model: MODEL,
      max_tokens: 160,
      system: [
        'You write a PUBLIC reply to a 5-star Google review on behalf of a restaurant owner. It appears publicly under the review.',
        'Voice: warm, brief, human, specific. Not a brand bot. No corporate-speak ("We appreciate your feedback", "valued customer").',
        'Thank them by first name if given, reference what they liked if they wrote it, and invite them back. 1 to 2 sentences. Never say "DM us".',
        'Output ONLY the reply text. No quotes, no preamble, no markdown.',
      ].join('\n'),
      messages: [{ role: 'user', content: `Restaurant: ${brand}${subtype ? ` (${subtype})` : ''}\n${firstName ? `Reviewer first name: ${firstName}` : ''}\nTheir 5-star review:\n"${reviewText.slice(0, 600)}"` }],
    })
    const text = resp.content.filter(c => c.type === 'text').map(c => (c as { type: 'text'; text: string }).text).join('').trim().replace(/^["“]|["”]$/g, '')
    return text || null
  } catch {
    return null
  }
}

export async function autoReplyFiveStarForClient(clientId: string): Promise<{ replied: number }> {
  const admin = createAdminClient()

  const { data: client } = await admin
    .from('clients')
    .select('auto_reply_five_star, name, business_subtype')
    .eq('id', clientId)
    .maybeSingle()
  if (!client?.auto_reply_five_star) return { replied: 0 }
  if (!process.env.ANTHROPIC_API_KEY) return { replied: 0 }

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400000).toISOString()
  const { data: reviews } = await admin
    .from('reviews')
    .select('id, review_text, author_name, review_url')
    .eq('client_id', clientId)
    .eq('source', 'google')
    .eq('rating', 5)
    .is('response_text', null)
    .not('review_url', 'is', null)
    .gte('posted_at', since)
    .order('posted_at', { ascending: false })
    .limit(MAX_PER_RUN)
  if (!reviews?.length) return { replied: 0 }

  const tok = await getActiveTokenForClient(clientId, null)
  if ('error' in tok) return { replied: 0 }

  let replied = 0
  for (const r of reviews as ReviewRow[]) {
    const m = /^accounts\/([^/]+)\/locations\/([^/]+)\/reviews\/([^/]+)$/.exec(r.review_url ?? '')
    if (!m) continue
    const reply = await draftThankYou(client.name as string, (client.business_subtype as string | null) ?? null, r)
    if (!reply) continue
    const res = await postReplyToReview({ accessToken: tok.accessToken, accountId: m[1], locationId: m[2], reviewId: m[3], comment: reply })
    if (!res.ok) continue
    await admin.from('reviews').update({
      response_text: reply,
      responded_at: new Date().toISOString(),
      responded_by: 'auto',
    }).eq('id', r.id)
    try {
      await admin.from('gbp_listing_audit').insert({
        client_id: clientId, actor_user_id: null, actor_email: 'auto-reply',
        action: 'auto_reply_review', fields: { reviewId: r.id, length: reply.length }, error: null,
      })
    } catch { /* ignore */ }
    replied++
  }
  return { replied }
}
