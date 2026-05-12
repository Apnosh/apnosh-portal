/**
 * POST /api/work/reviews/[id]/suggest
 *
 * Local SEO AI assist: drafts a response to a Google review. The
 * response will be PUBLIC and ranks for "[restaurant] reviews" search
 * results, so the bar is high — must be on-voice, specific, and
 * gracious (especially under 3 stars).
 *
 * Returns: { suggestion: string, why: string, generationId }
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getClientContext } from '@/lib/ai/get-client-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['local_seo']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: review } = await supabase
    .from('local_reviews')
    .select('id, client_id, source, rating, text, reviewer_name, reviewer_is_local_guide, language')
    .eq('id', id)
    .maybeSingle()
  if (!review) return NextResponse.json({ error: 'review not found' }, { status: 404 })

  const clientId = review.client_id as string
  const context = await getClientContext(clientId)

  // Pull a few recently-replied reviews on this client as voice examples.
  const { data: priorReplies } = await supabase
    .from('local_reviews')
    .select('rating, text, reply_text')
    .eq('client_id', clientId)
    .eq('status', 'replied')
    .order('reply_at', { ascending: false })
    .limit(3)

  const voiceExamples = (priorReplies ?? [])
    .filter(r => r.reply_text)
    .map(r => `[${r.rating}★] "${(r.text as string ?? '').slice(0, 140)}" → reply: "${(r.reply_text as string ?? '').slice(0, 200)}"`)
    .join('\n')

  const rating = Number(review.rating ?? 5)
  const tone = rating <= 2 ? 'gracious-recovery'
    : rating === 3 ? 'warm-but-improving'
    : 'warm-thank-you'

  const systemPrompt = `You are the local reputation manager for a restaurant, writing a PUBLIC Google review response. This reply will be visible to every future customer searching for the restaurant.

Output JSON only:
  { "reply": "the reply text — 1-3 short sentences, no signoffs, no emojis",
    "why": "one short line on what voice/judgment patterns shaped this reply" }

Rules:
- Match the client's voice EXACTLY. Direct voices stay direct; warm voices stay warm. Never default to corporate-speak.
- Use the reviewer's first name once (if given).
- For 4-5 stars: Thank them. Reference ONE specific thing they mentioned. Don't oversell.
- For 3 stars: Warm thanks + acknowledge the soft critique + brief recovery move.
- For 1-2 stars: NEVER argue. Acknowledge the specific frustration. Take ownership only where ownership is due (don't blame customers, don't blame staff publicly). Offer a path to make it right (email, DM, call).
- NEVER promise a refund or comp publicly. Never apologize for the cuisine or core offering.
- Do not include hashtags, emojis, or signoffs ("Cheers!", "Best,"). This is plain prose.
- Keep it short. Public review responses get scanned, not read.
- Avoid the patterns in this client's rejection list.`

  const userPrompt = `Draft a response to this Google review.

## The review
${rating}/5 stars from ${review.reviewer_name ?? 'Anonymous'}${review.reviewer_is_local_guide ? ' (Local Guide)' : ''}
${review.text ? `"${review.text}"` : '(no text — star-only)'}

## Suggested tone
${tone}

${voiceExamples ? `## Recent replies on this client (voice examples — match this register)\n${voiceExamples}\n` : ''}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: { reply: string; why: string } | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 800,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    inputTokens = msg.usage.input_tokens
    outputTokens = msg.usage.output_tokens
    const block = msg.content.find(c => c.type === 'text')
    rawOutput = block ? (block as { type: 'text'; text: string }).text : ''
    const jsonStart = rawOutput.indexOf('{')
    const jsonEnd = rawOutput.lastIndexOf('}')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON in response')
    parsed = JSON.parse(rawOutput.slice(jsonStart, jsonEnd + 1))
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  const completedAt = new Date()
  const admin = createAdminClient()

  const aiGenInsert = await admin
    .from('ai_generations')
    .insert({
      client_id: clientId,
      task_type: 'refine',
      model: MODEL,
      input_summary: { kind: 'review_reply', review_id: id, rating, tone },
      output_summary: { kind: 'review_reply', error: parseError, reply_chars: parsed?.reply?.length ?? null, why: parsed?.why ?? null },
      raw_text: rawOutput.slice(0, 8000),
      latency_ms: completedAt.getTime() - startedAt.getTime(),
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error_message: parseError,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle()

  const generationId = aiGenInsert.data?.id as string | undefined
  if (generationId) {
    await admin.from('ai_generation_inputs').insert({
      generation_id: generationId,
      client_id: clientId,
      prompt: userPrompt.slice(0, 8000),
      retrieved_facts: context.retrieval.factIds,
      retrieved_posts: context.retrieval.postIds,
      retrieved_drafts: context.retrieval.crossClientDraftIds,
      retrieved_judgments: context.retrieval.judgmentIds,
      brand_voice_version: context.retrieval.brandVersion,
      theme_version: null,
      cross_client_signal: context.crossClientSignal.length > 0
        ? { count: context.crossClientSignal.length, descriptors: context.crossClientSignal.map(s => s.anonDescriptor) }
        : null,
      model: MODEL,
    })
  }

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({ ok: true, suggestion: parsed.reply, why: parsed.why, generationId })
}
