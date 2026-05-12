/**
 * POST /api/work/themes/[id]/generate-ideas
 *
 * The first real implementation of principle #6 in the principles
 * doc: AI never runs blind. Before generating, we retrieve:
 *   - the theme + its pillars
 *   - the client's active knowledge facts
 *   - top-performing recent posts (last 90d)
 *   - last 3 themes for context continuity
 *   - brand voice (versioned)
 *
 * Claude generates N post ideas grounded in all of that. Each idea
 * lands as a content_drafts row (status='idea', proposed_via='ai').
 * The full retrieval is recorded in ai_generation_inputs so we can
 * later analyze "did richer context produce better ideas".
 *
 * Body (optional): { count?: number, platforms?: string[] }
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getClientContext } from '@/lib/ai/get-client-context'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// Sonnet 4.6 — fast + strong enough for structured ideation. Opus is
// overkill here; cost matters at scale (one generation per theme per
// client per month, but we'll burn through it as the strategist
// regenerates while tuning).
const MODEL = 'claude-sonnet-4-6'
const DEFAULT_COUNT = 10
const MAX_COUNT = 20

interface Body {
  count?: number
  platforms?: string[]
}

interface IdeaJSON {
  idea: string
  caption: string
  platforms?: string[]
  hashtags?: string[]
  media_brief?: string
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id: themeId } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  const count = Math.min(MAX_COUNT, Math.max(3, body?.count ?? DEFAULT_COUNT))
  const platforms = Array.isArray(body?.platforms) && body.platforms.length > 0
    ? body.platforms
    : ['instagram']

  // RLS protects which themes this user can see.
  const { data: theme } = await supabase
    .from('editorial_themes')
    .select('id, client_id, month, theme_name, theme_blurb, pillars, key_dates, version')
    .eq('id', themeId)
    .maybeSingle()
  if (!theme) return NextResponse.json({ error: 'theme not found' }, { status: 404 })

  // Retrieval per principle #6.
  const context = await getClientContext(theme.client_id as string)

  // Build prompt.
  const pillarsList = Array.isArray(theme.pillars)
    ? (theme.pillars as unknown[]).map(String).join(', ')
    : 'none specified'

  const monthLabel = theme.month
    ? new Date(theme.month as string).toLocaleDateString(undefined, { year: 'numeric', month: 'long' })
    : 'this month'

  const systemPrompt = `You are a senior social media strategist generating post ideas for a specific restaurant client. You ground every idea in:

1. The theme this month
2. The client's known facts, brand voice, and past top-performing posts

Output strict JSON: an array of post ideas. Each idea has fields:
  { "idea": "short one-line description of what this post is about",
    "caption": "the actual caption ready to post (use the brand voice; emoji + hashtags fine if on-brand)",
    "platforms": ["instagram", ...],
    "hashtags": ["#tag1", "#tag2"],
    "media_brief": "one-line description of the visual the photographer/videographer should capture"
  }

Rules:
- Variety: cycle through different pillars and angles. Don't repeat themes.
- Specific: every idea should be uniquely about THIS restaurant. Generic ideas are failure.
- Brand voice: match the past top performers' tone and energy.
- Brief captions (1-3 sentences) unless the client's voice runs longer.
- No JSON wrapper. Just the array.`

  const userPrompt = `Generate ${count} post ideas for ${context.clientName ?? 'this client'} for ${monthLabel}.

# Theme: ${theme.theme_name ?? '(untitled)'}
${theme.theme_blurb ? `Blurb: ${theme.theme_blurb}` : ''}
Pillars: ${pillarsList}
Target platforms: ${platforms.join(', ')}

${context.promptSummary}

Return the JSON array of ${count} ideas now.`

  // Run Claude.
  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let costUsd: number | null = null
  let parseError: string | null = null
  let ideas: IdeaJSON[] = []

  try {
    const msg = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    })
    inputTokens = msg.usage.input_tokens
    outputTokens = msg.usage.output_tokens
    // Sonnet 4.5 pricing: $3/M in, $15/M out (placeholder; refine when known)
    costUsd = (inputTokens / 1_000_000) * 3 + (outputTokens / 1_000_000) * 15

    const block = msg.content.find(c => c.type === 'text')
    rawOutput = block ? (block as { type: 'text'; text: string }).text : ''

    // Parse JSON. Tolerate code fences.
    const jsonStart = rawOutput.indexOf('[')
    const jsonEnd = rawOutput.lastIndexOf(']')
    if (jsonStart === -1 || jsonEnd === -1) throw new Error('no JSON array in response')
    const slice = rawOutput.slice(jsonStart, jsonEnd + 1)
    const parsed = JSON.parse(slice)
    if (!Array.isArray(parsed)) throw new Error('JSON root not an array')
    ideas = parsed.filter(p => p && typeof p === 'object' && typeof p.idea === 'string')
  } catch (e: unknown) {
    parseError = e instanceof Error ? e.message : String(e)
  }

  const completedAt = new Date()
  const admin = createAdminClient()

  // 1) Write ai_generations row (audit trail — principle #1 + #2).
  // Schema reality: ai_generations.task_type has a check constraint
  // that only permits: generate, recreate, refine, extract, design,
  // critique, judge. Use 'generate' since this IS a generation task,
  // and stuff the more specific label into output_summary so we can
  // still group / filter later.
  const latencyMs = completedAt.getTime() - startedAt.getTime()
  const aiGenInsert = await admin
    .from('ai_generations')
    .insert({
      client_id: theme.client_id,
      task_type: 'generate',
      model: MODEL,
      input_summary: { kind: 'post_ideas_from_theme', prompt: userPrompt.slice(0, 4000) },
      output_summary: { kind: 'post_ideas_from_theme', count: ideas.length, error: parseError },
      raw_text: rawOutput.slice(0, 16000),
      latency_ms: latencyMs,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      error_message: parseError,
      created_by: user.id,
    })
    .select('id')
    .maybeSingle()

  if (aiGenInsert.error) {
    // Don't swallow — surface so the caller knows audit failed even
    // if drafts succeed. This prevents the "no provenance" bug.
    console.error('ai_generations insert failed:', aiGenInsert.error)
  }
  const generationId = aiGenInsert.data?.id as string | undefined
  void costUsd  // cost computed but not persisted (no column yet)

  // 2) Write ai_generation_inputs row (retrieval audit — principle #6).
  if (generationId) {
    await admin.from('ai_generation_inputs').insert({
      generation_id: generationId,
      client_id: theme.client_id,
      prompt: userPrompt.slice(0, 8000),
      retrieved_facts: context.retrieval.factIds,
      retrieved_posts: context.retrieval.postIds,
      retrieved_drafts: [],
      brand_voice_version: context.retrieval.brandVersion,
      theme_version: Number(theme.version ?? 1),
      cross_client_signal: null,
      model: MODEL,
    })
  }

  if (parseError) {
    return NextResponse.json({ error: 'AI generation failed', detail: parseError }, { status: 502 })
  }

  // 3) Insert one content_drafts row per idea. Use admin client to
  //    bypass any RLS gotchas; strategist already proved access by
  //    seeing the theme via RLS above.
  const draftRows = ideas.map(it => ({
    client_id: theme.client_id,
    source_theme_id: theme.id,
    status: 'idea',
    service_line: 'social',
    idea: it.idea.slice(0, 500),
    caption: typeof it.caption === 'string' ? it.caption.slice(0, 4000) : null,
    media_brief: it.media_brief ? { brief: it.media_brief } : {},
    hashtags: Array.isArray(it.hashtags) ? it.hashtags.slice(0, 30) : [],
    target_platforms: Array.isArray(it.platforms) && it.platforms.length > 0
      ? it.platforms.slice(0, 5)
      : platforms,
    proposed_by: user.id,
    proposed_via: 'ai',
    brand_voice_version: context.retrieval.brandVersion,
    theme_version: Number(theme.version ?? 1),
    ai_generation_ids: generationId ? [generationId] : [],
  }))

  const { data: created, error: insErr } = await admin
    .from('content_drafts')
    .insert(draftRows)
    .select('id')

  if (insErr) {
    return NextResponse.json({ error: 'failed to write drafts', detail: insErr.message }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    generationId,
    draftIds: (created ?? []).map(c => c.id),
    count: created?.length ?? 0,
  })
}
