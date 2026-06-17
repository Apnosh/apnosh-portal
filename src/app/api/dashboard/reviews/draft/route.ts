/**
 * POST /api/dashboard/reviews/draft — AI-drafted public reply to a review.
 *
 * Body: { reviewId, tone? }. Looks up the review (admin), checks access against
 * its client, and makes one real Claude call that writes a reply in the owner's
 * voice, grounded in the actual review text + rating. Returns { reply }.
 */
import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'

export const dynamic = 'force-dynamic'
export const maxDuration = 20

const TONES: Record<string, string> = {
  winback: 'focused on winning this guest back: be genuinely sorry, take ownership of what went wrong, and offer to make it right and earn another visit',
  thankful: 'warm and grateful: thank them specifically, make them feel valued, and invite them back',
  professional: 'polished and professional, measured and courteous',
  short: 'very short, just two or three warm sentences',
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const reviewId: string | undefined = body.reviewId
  const tone: string = TONES[body.tone] ? body.tone : 'thankful'
  if (!reviewId) return NextResponse.json({ error: 'reviewId required' }, { status: 400 })

  const admin = createAdminClient()
  const { data: r } = await admin
    .from('reviews')
    .select('client_id, author_name, rating, review_text, source')
    .eq('id', reviewId)
    .maybeSingle()
  if (!r) return NextResponse.json({ error: 'Review not found' }, { status: 404 })

  const access = await checkClientAccess(r.client_id as string)
  if (!access.authorized) return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: 'AI is not configured' }, { status: 500 })

  const { data: client } = await admin.from('clients').select('name').eq('id', r.client_id as string).maybeSingle()
  const businessName = (client?.name as string) || 'our restaurant'
  const author = (r.author_name as string) || 'a guest'
  const rawName = ((r.author_name as string | null) ?? '').trim()
  const first = rawName ? rawName.split(' ')[0] : ''
  const rating = Number(r.rating ?? 0)
  const source = (r.source as string) ?? 'google'

  const greet = first
    ? `- Greet ${first} by name where it feels natural, and thank them.`
    : `- The reviewer left no name, so do not invent or use a name. Open warmly (like "Hi there" or "Thank you so much") and thank them.`
  const system = `You are the owner of ${businessName}, a restaurant, writing a PUBLIC reply to a customer review on ${source}. Write in the owner's own voice: ${TONES[tone]}.
Rules:
${greet}
- For a positive review (4 or 5 stars), be warm and specific, and invite them back.
- For a critical review (3 stars or fewer), take it seriously, apologize where fair, and offer to make it right. Never be defensive.
- No em dashes. Short, plain sentences. Sound like a real person, not a form letter.
- Return ONLY the reply text, with no preamble or quotation marks.`
  const user = `The review (${rating} of 5 stars) from ${author}:
"${(r.review_text as string) || '(no written comment, just a star rating)'}"

Write the owner's reply.`

  try {
    const anthropic = new Anthropic()
    const msg = await anthropic.messages.create({
      model: 'claude-opus-4-8',
      max_tokens: 600,
      system,
      messages: [{ role: 'user', content: user }],
    })
    const reply = msg.content.filter((b) => b.type === 'text').map((b) => (b as { text: string }).text).join('').trim()
    if (!reply) return NextResponse.json({ error: 'Empty draft' }, { status: 502 })
    return NextResponse.json({ reply })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Draft failed' }, { status: 500 })
  }
}
