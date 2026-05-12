/**
 * POST /api/work/engage/[id]/suggest
 *
 * Community manager's AI assist. Given a social_interactions row,
 * produces a draft reply grounded in the client's voice, recent
 * top posts, rejection patterns, and cross-client signals.
 *
 * Returns: { suggestion: string, generationId: string }
 *
 * Audit row written to ai_generations + ai_generation_inputs.
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

  if (!(await isCapable(['community_mgr']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: interaction } = await supabase
    .from('social_interactions')
    .select('id, client_id, platform, kind, author_name, text, post_caption_snippet, sentiment')
    .eq('id', id)
    .maybeSingle()
  if (!interaction) return NextResponse.json({ error: 'interaction not found' }, { status: 404 })

  const clientId = interaction.client_id as string
  const context = await getClientContext(clientId)

  const kindLabel =
    interaction.kind === 'dm' ? 'a direct message'
    : interaction.kind === 'mention' ? 'a mention'
    : 'a comment'

  const systemPrompt = `You are the community manager for a restaurant. You write the actual reply that gets posted publicly under the brand's voice. Stay short, warm, and on-brand.

Output JSON only:
  { "reply": "the reply text — 1-3 sentences max, no hashtags, no signoffs",
    "why": "one short line on what voice/context you matched" }

Rules:
- Match the client's voice EXACTLY. If their voice is "direct, no fluff" — be direct. If "playful + warm" — be warm.
- For comments: keep replies SHORT. Usually 1 sentence. Match the energy of the commenter.
- For DMs: a bit longer is fine, especially for questions. Still warm + concrete.
- For questions about menu/hours/location: answer if the answer is in the client facts; otherwise direct them to call or visit.
- If the message is rude / spam / negative — be gracious and brief. Don't escalate. Don't apologize for things that aren't the restaurant's fault.
- Never invent details. If you don't know, say "DM us" or "give us a call".
- NEVER use the @ mention back unless replying to a DM.
- Avoid the rejection patterns in the client's history (if any).`

  const userPrompt = `Draft a reply to ${kindLabel} on ${interaction.platform}.

## The message
From: ${interaction.author_name ?? 'Anonymous'}
Sentiment: ${interaction.sentiment ?? 'unknown'}
Text: "${interaction.text}"

${interaction.post_caption_snippet ? `## Context — the post they're replying to\n"${interaction.post_caption_snippet}"\n` : ''}

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
      input_summary: { kind: 'engage_reply', interaction_id: id, interaction_kind: interaction.kind },
      output_summary: { kind: 'engage_reply', error: parseError, reply_chars: parsed?.reply?.length ?? null, why: parsed?.why ?? null },
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
