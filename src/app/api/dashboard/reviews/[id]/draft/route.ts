/**
 * POST /api/dashboard/reviews/[id]/draft
 *
 * AI-drafts an on-brand public reply to a Google review. The owner edits
 * and posts it via the sibling /reply route. Read-only — drafting never
 * posts anything to Google.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-20250514'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { user, clientId } = await resolveCurrentClient()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured' }, { status: 503 })

  const { id } = await ctx.params
  const admin = createAdminClient()

  const { data: review } = await admin
    .from('reviews')
    .select('id, client_id, rating, review_text, author_name')
    .eq('id', id)
    .maybeSingle()
  if (!review || review.client_id !== clientId) {
    return NextResponse.json({ error: 'Review not found' }, { status: 404 })
  }

  const { data: client } = await admin
    .from('clients')
    .select('name, business_subtype')
    .eq('id', clientId)
    .maybeSingle()
  const brand = (client?.name as string | null) ?? 'the restaurant'
  const subtype = (client?.business_subtype as string | null) ?? null

  const rating = Number(review.rating ?? 0)
  const firstName = (review.author_name as string | null)?.trim().split(/\s+/)[0] ?? null
  const reviewText = (review.review_text as string | null)?.trim() || '(no written review, star rating only)'

  try {
    const Anthropic = (await import('@anthropic-ai/sdk')).default
    const claude = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const ctxLines = [
      `Restaurant: ${brand}${subtype ? ` (${subtype})` : ''}`,
      `Star rating: ${rating} out of 5`,
      firstName ? `Reviewer first name: ${firstName}` : 'Reviewer name: unknown',
      '',
      'Their review:',
      `"${reviewText.slice(0, 800)}"`,
    ]

    const resp = await claude.messages.create({
      model: MODEL,
      max_tokens: 220,
      system: [
        'You write PUBLIC replies to Google reviews on behalf of a restaurant owner. The reply appears publicly under the review on Google.',
        'Voice: warm, brief, human, specific. Sounds like a real person at the restaurant, not a brand bot.',
        'Hard rules:',
        '- No corporate-speak. Never write "We appreciate your feedback", "Thank you for reaching out", or "valued customer".',
        '- 1 to 2 sentences. Shorter is better.',
        '- Use the reviewer’s first name if provided.',
        '- This is PUBLIC and on Google — never say "DM us" or "slide into our DMs". For problems, invite them to call or come back in.',
        '',
        'If the rating is 4-5 stars: thank them warmly and specifically (reference what they mentioned if any). Invite them back.',
        'If the rating is 1-3 stars: acknowledge sincerely and apologize without being defensive or making excuses. Take responsibility, and offer to make it right (ask them to reach out to the restaurant directly or give you another chance). Never argue or blame the customer.',
        '',
        'Output ONLY the reply text. No quotes, no preamble, no markdown, no JSON.',
      ].join('\n'),
      messages: [{ role: 'user', content: ctxLines.join('\n') }],
    })

    const reply = resp.content
      .filter(c => c.type === 'text')
      .map(c => (c as { type: 'text'; text: string }).text)
      .join('')
      .trim()
      .replace(/^["“]|["”]$/g, '')

    if (!reply) return NextResponse.json({ error: 'Could not draft a reply — try again' }, { status: 502 })
    return NextResponse.json({ reply })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 })
  }
}
