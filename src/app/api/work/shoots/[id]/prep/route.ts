/**
 * POST /api/work/shoots/[id]/prep
 *
 * Field crew's AI assist. Translates a shoot brief into shoot-day
 * execution help: equipment checklist, arrival timing, rapport
 * questions for the owner, backup shot ideas.
 *
 * Crew member opens the detail page on their phone before they
 * leave; one tap gives them a prep brief grounded in the client's
 * voice + the shot list.
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

interface PrepJSON {
  equipment: string[]
  arrival_timing: string
  rapport_questions: string[]
  backup_shots: string[]
  why?: string
}

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  // Field crew gate
  if (!(await isCapable(['photographer', 'videographer', 'visual_creator']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const { data: shoot } = await supabase
    .from('shoots')
    .select('id, client_id, title, scheduled_at, duration_min, status, location_name, location_addr, brief, shot_list')
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
    ? (shoot.shot_list as string[]).slice(0, 12).map((s, i) => `${i + 1}. ${s}`).join('\n')
    : ''

  const systemPrompt = `You are a senior field producer briefing a videographer/photographer the morning of a restaurant shoot. They have the brief; you give them the execution layer.

Output JSON only:
  { "equipment": ["packing list — be specific, not generic. Skip obvious gear."],
    "arrival_timing": "one sentence — when to show up + why (lunch rush? golden hour? after the lunch crew clears?)",
    "rapport_questions": ["2-3 short questions to ask the owner on arrival — tied to this brand specifically"],
    "backup_shots": ["2-3 backup shot ideas in case primary plan fails (low light, crowd, etc)"],
    "why": "one sentence on what you anchored on" }

Rules:
- equipment: name specific gear that this brief needs — variable ND for a window-light pour, low-angle stabilizer for an overhead shot, etc. Don't list "camera, lens, tripod" — assume basics.
- arrival_timing: tie to client-specific facts (their busy windows, their golden hour). Mention WHY.
- rapport_questions: must be brand-specific. NOT "how's business?". Reference real client details from the facts.
- backup_shots: realistic alternates. "If the broth shot loses light, pivot to a hands-on pickle prep."
- Be concrete. This is going on a phone screen the crew member glances at in the car.`

  const userPrompt = `Prep brief for this shoot.

## Shoot
Title: ${shoot.title}
Scheduled: ${shoot.scheduled_at} (${shoot.duration_min} min)
Location: ${shoot.location_name ?? '(no location)'}${shoot.location_addr ? ' — ' + shoot.location_addr : ''}

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
  let parsed: PrepJSON | null = null
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
      client_id: clientId,
      task_type: 'design',
      model: MODEL,
      input_summary: { kind: 'shoot_prep', shoot_id: id },
      output_summary: { kind: 'shoot_prep', error: parseError, equipment_count: parsed?.equipment?.length ?? null, why: parsed?.why ?? null },
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

  return NextResponse.json({ ok: true, prep: parsed, generationId })
}
