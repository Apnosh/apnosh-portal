/**
 * POST /api/work/boosts/recommend
 *
 * Paid media buyer's AI assist. Given a top-performing organic post,
 * AI proposes a budget + duration + audience preset + rationale.
 *
 * Same retrieval contract as the other AI helpers — pulls client
 * voice, top posts, rejection patterns, cross-client signal.
 *
 * Body: { postId: string }
 *
 * Returns: { recommendation: { budget, days, audience, audience_notes?, why } }
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

interface Body { postId: string }

interface BoostRecJSON {
  budget: number
  days: number
  audience: 'locals' | 'foodies' | 'recent'
  audience_notes?: string
  why: string
}

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['paid_media', 'ad_buyer']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  const { data: post } = await supabase
    .from('social_posts')
    .select('id, client_id, platform, caption, posted_at, total_interactions, reach, likes, comments, saves, shares, video_views, media_type')
    .eq('id', body.postId)
    .maybeSingle()
  if (!post) return NextResponse.json({ error: 'post not found' }, { status: 404 })

  const clientId = post.client_id as string
  const context = await getClientContext(clientId)

  const reach = Number(post.reach ?? 0)
  const interactions = Number(post.total_interactions ?? 0)
  const engagementRate = reach > 0 ? interactions / reach : null

  const postBlock = `## The organic post being considered
Platform: ${post.platform}
Type: ${post.media_type}
Caption: ${(post.caption as string) ?? ''}
Reach: ${reach}
Total interactions: ${interactions}
Engagement rate: ${engagementRate !== null ? (engagementRate * 100).toFixed(1) + '%' : 'unknown'}
Likes: ${post.likes ?? 0}  ·  Comments: ${post.comments ?? 0}  ·  Saves: ${post.saves ?? 0}  ·  Shares: ${post.shares ?? 0}
Posted at: ${post.posted_at ?? 'unknown'}`

  const systemPrompt = `You are a senior paid social media buyer. You decide whether to boost an organic post and at what spec.

Output JSON only:
  { "budget": number,           // total USD budget for the campaign
    "days": number,              // duration in days
    "audience": "locals" | "foodies" | "recent",   // preset
    "audience_notes": string,    // optional extra targeting notes (radius, interests, custom audience)
    "why": string                // one paragraph rationale tying organic signal to expected paid outcome }

Rules:
- Match budget to the client's tier and the post's signal strength. Cheap test ($30-$50) for moderate signal, $100-$250 for breakout posts, more only with proven CPC history.
- Duration: 3-5d for tests, 7-10d for committed pushes.
- Audience: 'locals' for foot-traffic-driving (location-anchored content), 'foodies' for craft/dish-focused, 'recent' for retargeting/engagement amplification.
- Be specific in "why" — reference the engagement rate, the post type, and the brand voice fit.
- Avoid the patterns in the client's rejection list (if any).`

  const userPrompt = `${postBlock}

${context.promptSummary}

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: BoostRecJSON | null = null
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
      task_type: 'critique',  // closest valid enum: assessing a post for boost
      model: MODEL,
      input_summary: { kind: 'boost_recommendation', post_id: body.postId },
      output_summary: { kind: 'boost_recommendation', error: parseError, budget: parsed?.budget ?? null, audience: parsed?.audience ?? null },
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

  // Snap audience to a valid preset; default to locals if AI got creative
  const audience = ['locals', 'foodies', 'recent'].includes(parsed.audience) ? parsed.audience : 'locals'

  return NextResponse.json({
    ok: true,
    recommendation: { ...parsed, audience },
    generationId,
  })
}
