/**
 * POST /api/work/performance/analyze
 *
 * Data analyst's AI assist: synthesizes the book-level rollup
 * (counts + top posts + per-client activity) into 3-5 specific
 * insights worth briefing upstream Monday morning.
 *
 * This is the only AI helper that runs at BOOK scale rather than
 * per-client. It doesn't pull a single getClientContext — it pulls
 * recent judgments and posts across the analyst's whole book.
 *
 * Audit row written to ai_generations (no specific client_id; we
 * use the first client in the book to satisfy the FK, but record
 * the kind so it can be filtered out of per-client analytics).
 */

import { NextResponse, type NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getPerformanceData } from '@/lib/work/get-performance-data'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

const MODEL = 'claude-sonnet-4-6'

interface Insight { headline: string; detail: string; tag: 'opportunity' | 'risk' | 'signal' }

export async function POST(_req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['strategist', 'data_analyst']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const data = await getPerformanceData()

  // Pull recent judgments across the book — these reveal pattern
  // complaints/wins the analyst should know about.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentJudgments } = await supabase
    .from('human_judgments')
    .select('judgment, reason_tags, reason_note, subject_type, created_at')
    .gte('created_at', fourteenDaysAgo)
    .order('created_at', { ascending: false })
    .limit(30)

  const judgmentSummary = (recentJudgments ?? [])
    .map(j => {
      const tags = Array.isArray(j.reason_tags) ? (j.reason_tags as string[]).join(',') : ''
      return `${j.judgment}${tags ? ` [${tags}]` : ''}${j.reason_note ? ` — ${j.reason_note}` : ''}`
    })
    .join('\n')

  const top3Posts = data.topPosts.slice(0, 5)
    .map(p => `[${p.clientName ?? 'unknown'}] ${p.totalInteractions} int · ${p.engagementRate !== null ? (p.engagementRate * 100).toFixed(1) + '% eng' : 'n/a'} · "${(p.caption ?? '').slice(0, 80)}"`)
    .join('\n')

  const activitySummary = data.clientActivity.slice(0, 8)
    .map(c => `[${c.clientName ?? c.clientId.slice(0, 6)}] drafts:${c.draftCount} pub:${c.publishedCount} eng:${c.totalEngagement} replies:${c.repliesSent} reviews:${c.reviewsAnswered}`)
    .join('\n')

  const counts = data.counts
  const delta = (p: { thisWeek: number; lastWeek: number }) =>
    `${p.thisWeek} (Δ${p.thisWeek - p.lastWeek >= 0 ? '+' : ''}${p.thisWeek - p.lastWeek})`

  const systemPrompt = `You are a data analyst briefing the strategy team Monday morning. You write a short, specific memo.

Output JSON only:
  { "insights": [
      { "headline": "5-12 word punchline", "detail": "1-2 sentence reasoning naming specific clients/numbers", "tag": "opportunity" | "risk" | "signal" }
    ],
    "why": "one short line on how you reached these (which numbers were load-bearing)" }

Rules:
- Return 3-5 insights. Quality over quantity.
- Be SPECIFIC. Name the client. Name the number. "Drafts up 40%" not "throughput improving".
- "opportunity" = something to push harder on. "risk" = something drifting. "signal" = neutral pattern worth knowing.
- Don't pad. If only 3 things are worth saying, return 3.
- Don't invent numbers. If the data doesn't support an insight, don't make it.`

  const userPrompt = `## This week's book-level counts
- Drafts created: ${delta(counts.draftsCreated)}
- Drafts approved: ${delta(counts.draftsApproved)}
- Posts published: ${delta(counts.draftsPublished)}
- Judgments recorded: ${delta(counts.judgments)}
- DM/comment replies: ${delta(counts.replies)}
- Review replies: ${delta(counts.reviewReplies)}
- Boosts launched: ${delta(counts.boostsLaunched)}
- AI generations: ${delta(counts.aiGenerations)}

## Top posts (last 60 days)
${top3Posts || '(none yet)'}

## Per-client activity this week
${activitySummary || '(none yet)'}

## Recent judgments (last 14 days) — what humans pushed back on
${judgmentSummary || '(none yet)'}

## Book size
${data.bookSize} clients

Return the JSON now.`

  const anthropic = new Anthropic()
  const startedAt = new Date()
  let rawOutput = ''
  let inputTokens = 0
  let outputTokens = 0
  let parsed: { insights: Insight[]; why: string } | null = null
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

  // Pick the first client in the analyst's visible book for FK purposes
  const { data: firstClient } = await supabase.from('clients').select('id').limit(1).maybeSingle()
  const anchorClientId = firstClient?.id as string | undefined

  if (anchorClientId) {
    await admin
      .from('ai_generations')
      .insert({
        client_id: anchorClientId,
        task_type: 'critique',
        model: MODEL,
        input_summary: { kind: 'book_analysis', book_size: data.bookSize },
        output_summary: { kind: 'book_analysis', error: parseError, insight_count: parsed?.insights?.length ?? null, why: parsed?.why ?? null },
        raw_text: rawOutput.slice(0, 8000),
        latency_ms: completedAt.getTime() - startedAt.getTime(),
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        error_message: parseError,
        created_by: user.id,
      })
  }

  if (parseError || !parsed) {
    return NextResponse.json({ error: 'AI failed', detail: parseError }, { status: 502 })
  }

  return NextResponse.json({ ok: true, insights: parsed.insights, why: parsed.why })
}
