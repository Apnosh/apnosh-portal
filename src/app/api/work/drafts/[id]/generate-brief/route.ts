/**
 * POST /api/work/drafts/[id]/generate-brief
 *
 * Designer's AI assist. Given a draft (idea + caption + theme), AI
 * proposes a structured visual brief — what the photographer or
 * videographer should capture. Same retrieval contract as the other
 * AI helpers (principle #6).
 *
 * Returns the brief as structured fields. Caller saves via lifecycle
 * 'edit' with mediaBrief = the returned object.
 *
 * Body: { angle?: string } — optional creative angle nudge
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientContext } from '@/lib/ai/get-client-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

interface Body { angle?: string }

interface BriefJSON {
  composition?: string    // wide / tight / overhead / pov / carousel
  lighting?: string       // warm / cool / natural / contrasty
  props?: string[]        // specific objects to capture
  mood?: string           // adjectives describing energy
  references?: string[]   // photographer/director references or visual hints
  shot_list?: string[]    // if multi-shot/carousel: ordered shots
  why?: string            // one-line rationale tying to brand voice
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: draftId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  const angle = body?.angle?.slice(0, 200)

  const { data: draft } = await supabase
    .from('content_drafts')
    .select('id, client_id, idea, caption, media_brief, source_theme_id, target_platforms')
    .eq('id', draftId)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const context = await getClientContext(draft.client_id as string)

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
      themeBlock = `\n## Theme\n${t.theme_name ?? ''} — ${t.theme_blurb ?? ''}${pillars ? `\nPillars: ${pillars}` : ''}`
      themeVersion = Number(t.version ?? 1)
    }
  }

  const platforms = Array.isArray(draft.target_platforms)
    ? (draft.target_platforms as string[]).join(', ')
    : 'instagram'

  const systemPrompt = `You are a senior creative director / designer briefing a photographer or videographer on a specific social post. You write a concise, actionable visual brief.

Output JSON only:
  { "composition": "e.g. 'tight macro from above' or 'medium two-shot, owner left frame'",
    "lighting": "e.g. 'warm golden 5pm light, slight backlight'",
    "props": ["specific items to include in frame"],
    "mood": "2-3 adjective phrase",
    "references": ["e.g. Hidden Cameras documentary feel, Bon Appétit style"],
    "shot_list": ["if multi-shot/carousel, ordered shots; else empty"],
    "why": "one sentence: why this look fits the brand voice + theme" }

Rules:
- Be specific. Avoid generic terms like "good lighting" or "make it look nice".
- Match the client's brand voice (no fancy if voice is direct; no flowery if pet_peeve says so).
- Platform-aware: square for IG feed, vertical for Reels/TikTok, etc.
- If the idea is a carousel, the shot_list MUST list the slides in order.`

  const userPrompt = `Write a visual brief for this draft.

## Idea
${draft.idea ?? ''}

## Caption (locks the angle)
${draft.caption ?? '(no caption yet — base the brief on the idea + theme)'}

## Target platforms
${platforms}

${themeBlock}

${angle ? `## Creative angle nudge\n${angle}\n` : ''}
${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: BriefJSON | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1500,
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
      client_id: draft.client_id,
      task_type: 'design',  // valid enum value; this IS a design task
      model: MODEL,
      input_summary: { kind: 'visual_brief', draft_id: draftId },
      output_summary: { kind: 'visual_brief', error: parseError, why: parsed?.why ?? null },
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

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({
    ok: true,
    brief: parsed,
    generationId,
  })
}
