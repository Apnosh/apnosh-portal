/**
 * POST /api/work/drafts/[id]/generate-caption
 *
 * Copywriter's AI assist. Given a draft (with an idea + theme +
 * optional existing caption), generate a polished caption grounded
 * in the client's full context — facts, voice, top performers,
 * cross-client patterns.
 *
 * Same retrieval contract as generate-ideas (principle #6). The
 * generation is recorded on ai_generations + ai_generation_inputs.
 * The returned caption is NOT auto-saved to the draft — the
 * copywriter reviews + edits, then saves via lifecycle 'edit'.
 *
 * Body: { tone?: string } — optional tone nudge
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientContext } from '@/lib/ai/get-client-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

interface Body { tone?: string }

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: draftId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  const tone = body?.tone?.slice(0, 100)

  // RLS gates which drafts the caller can see.
  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, idea, caption, hashtags, media_brief, source_theme_id')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const context = await getClientContext(draft.client_id as string)

  // Pull theme if present, for grounding.
  let themeBlock = ''
  let themeVersion: number | null = null
  if (draft.source_theme_id) {
    const { data: t } = await supabase
      .from('editorial_themes')
      .select('theme_name, theme_blurb, pillars, version')
      .eq('id', draft.source_theme_id as string)
      .maybeSingle()
    if (t) {
      const pillars = Array.isArray(t.pillars) ? (t.pillars as unknown[]).map(String).join(', ') : ''
      themeBlock = `\n## This month's theme\n${t.theme_name ?? ''} — ${t.theme_blurb ?? ''}${pillars ? `\nPillars: ${pillars}` : ''}`
      themeVersion = Number(t.version ?? 1)
    }
  }

  const systemPrompt = `You are a senior copywriter polishing a single social media caption for a restaurant client. You work within a brand voice and known facts about this client. You write briefly, specifically, and on-brand.

Output JSON only:
  { "caption": "the polished caption, ready to post",
    "rationale": "one sentence on what voice/fact/pattern you used" }

Rules:
- 1-3 sentences. Brevity wins.
- Match the brand voice; reference at least one specific fact when natural.
- Emoji and hashtags allowed but only if on-brand.
- Do NOT use words on the client's pet-peeve list.
- Be the second draft, not the first. Tighter than the input.`

  const userPrompt = `Polish a caption for this draft.

## Draft idea
${draft.idea ?? ''}

## Current caption (may be empty or rough)
${draft.caption ?? '(none — write from scratch)'}

${themeBlock}

${tone ? `## Tone nudge for this caption\n${tone}\n` : ''}
${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: { caption?: string; rationale?: string } | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
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

  // Audit
  const aiGenInsert = await admin
    .from('ai_generations')
    .insert({
      client_id: draft.client_id,
      task_type: 'refine',  // closest valid task_type for caption polish
      model: MODEL,
      input_summary: { kind: 'caption_polish', draft_id: draftId },
      output_summary: { kind: 'caption_polish', error: parseError, rationale: parsed?.rationale ?? null },
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
      client_id: draft.client_id,
      prompt: userPrompt.slice(0, 8000),
      retrieved_facts: context.retrieval.factIds,
      retrieved_posts: context.retrieval.postIds,
      retrieved_drafts: context.retrieval.crossClientDraftIds,
      brand_voice_version: context.retrieval.brandVersion,
      theme_version: themeVersion,
      cross_client_signal: context.crossClientSignal.length > 0
        ? { count: context.crossClientSignal.length, descriptors: context.crossClientSignal.map(s => s.anonDescriptor) }
        : null,
      model: MODEL,
    })
  }

  if (parseError || !parsed?.caption) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    caption: parsed.caption,
    rationale: parsed.rationale ?? null,
    generationId,
  })
}
