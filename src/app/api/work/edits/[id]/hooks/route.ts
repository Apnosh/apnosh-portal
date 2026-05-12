/**
 * POST /api/work/edits/[id]/hooks
 *
 * Editor's AI assist: given a shoot's visual brief, generate 3
 * hook variations for the first 2-3 seconds of the cut. Each hook
 * targets a different approach (visual, line of dialogue, on-screen
 * text). Retrieval-aware via getClientContext.
 *
 * Returns: { hooks: string[], why: string, generationId }
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

  if (!(await isCapable(['editor']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: shoot } = await supabase
    .from('shoots')
    .select('id, client_id, title, brief, shot_list, location_name')
    .eq('id', id)
    .maybeSingle()
  if (!shoot) return NextResponse.json({ error: 'shoot not found' }, { status: 404 })

  const clientId = shoot.client_id as string
  const context = await getClientContext(clientId)

  const brief = (shoot.brief as Record<string, unknown> | null) ?? {}
  const composition = (brief.composition as string | undefined) ?? ''
  const lighting = (brief.lighting as string | undefined) ?? ''
  const mood = (brief.mood as string | undefined) ?? ''
  const props = Array.isArray(brief.props) ? (brief.props as string[]).join(', ') : ''
  const shotList = Array.isArray(shoot.shot_list)
    ? (shoot.shot_list as string[]).slice(0, 10).map((s, i) => `${i + 1}. ${s}`).join('\n')
    : ''

  const systemPrompt = `You are a senior video editor. You write the first 2-3 seconds of a Reels/TikTok cut — the HOOK that decides whether someone keeps watching.

Output JSON only:
  { "hooks": [
      { "approach": "visual",    "text": "describe the opening shot or motion (no audio)" },
      { "approach": "spoken",    "text": "the line someone says or VO" },
      { "approach": "on_screen", "text": "the text card that appears" }
    ],
    "why": "one short paragraph tying these to the brand voice + brief" }

Rules:
- Each hook should be specific enough to execute today — not "show something interesting".
- For visual: name the SHOT (e.g. "tight 0.5x speed pour of broth into bowl, no audio, no caption — let the steam carry").
- For spoken: ONE sentence, matched to client voice. No fluff openers like "Hey guys!".
- For on_screen: 3-7 words max. A statement or question, not a description.
- All three should be different angles on the SAME content — not three random ideas.
- Avoid the rejection patterns in the client's history.`

  const userPrompt = `Draft 3 hook variations for this shoot.

## Title
${shoot.title}

## Visual brief
${composition ? `Composition: ${composition}` : ''}
${lighting ? `Lighting: ${lighting}` : ''}
${mood ? `Mood: ${mood}` : ''}
${props ? `Props: ${props}` : ''}

${shotList ? `## Shot list\n${shotList}\n` : ''}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: { hooks: Array<{ approach: string; text: string }>; why: string } | null = null
  let parseError: string | null = null

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1200,
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
      task_type: 'design',
      model: MODEL,
      input_summary: { kind: 'edit_hooks', shoot_id: id },
      output_summary: { kind: 'edit_hooks', error: parseError, hook_count: parsed?.hooks?.length ?? null, why: parsed?.why ?? null },
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

  // Flatten to readable strings: "[visual] tight 0.5x speed pour…"
  const hooks = parsed.hooks.map(h => `[${h.approach}] ${h.text}`)

  return NextResponse.json({ ok: true, hooks, why: parsed.why, generationId })
}
