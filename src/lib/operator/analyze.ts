/**
 * Run an analysis pass for a client. Builds context, calls Claude with
 * a structured-output prompt, parses proposals, persists everything.
 *
 * This is the core of the AI Marketing Operator. Cron calls this once
 * per client per week (and on-demand for anomaly detection).
 */

import Anthropic from '@anthropic-ai/sdk'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { buildClientContext } from './context'
import type { ClaudeProposalOutput, ClientContext } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

const MODEL = 'claude-sonnet-4-5-20250929'

const SYSTEM_PROMPT = `You are the AI Marketing Operator for restaurants on the Apnosh platform.
Your job is to analyze each restaurant's recent performance, brand context,
and recent activity, then propose 3-7 concrete marketing actions for the
next 7 days.

You are not generic ChatGPT. You have:
- Deep restaurant marketing expertise
- The restaurant's specific brand voice + goals + target audience
- Their actual performance data (impressions, calls, directions, menu clicks)
- Awareness of what they've already published recently

Each proposal must be specific, actionable, on-brand, and tied to either:
- Anomaly response (something is off, here's the fix)
- Content (recurring posting cadence in their voice)
- Maintenance (hours, info, basic operational updates)
- Opportunity (chance to drive more orders/calls/visits)

Categories:
- 'anomaly_response' for fixing problems
- 'content' for IG/FB posts (use type='social_post')
- 'maintenance' for hours/info updates
- 'opportunity' for promotions, events, or new menu items

CRITICAL CONSTRAINTS:
- Match the restaurant's brand voice exactly (read voice_notes carefully)
- Don't propose things they've already done in the last 14 days
- Don't propose more than 1 promotion at a time (overlapping promos confuse customers)
- Confidence score reflects how certain you are this is the right move (0.0 to 1.0)
- For social_post type, payload should be: { caption, platforms, hashtags?, photo_asset_url? }
- For other types, payload should match the existing Apnosh schema (hours, menu_item, promotion, event, closure)

Output ONLY valid JSON matching the schema. No prose outside the JSON.`

interface AnalyzeResult {
  success: true
  agentRunId: string
  proposalCount: number
  summary: string
  costUsd: number
}

interface AnalyzeError {
  success: false
  error: string
  agentRunId?: string
}

export async function analyzeClient(args: {
  clientId: string
  triggeredBy?: 'cron' | 'manual' | 'api'
  runType?: 'weekly_analysis' | 'anomaly_check' | 'manual'
  userId?: string
}): Promise<AnalyzeResult | AnalyzeError> {
  const db = adminDb()

  // 1. Create agent_run record
  const { data: run, error: runErr } = await db
    .from('agent_runs')
    .insert({
      client_id: args.clientId,
      run_type: args.runType ?? 'weekly_analysis',
      triggered_by: args.triggeredBy ?? 'manual',
      status: 'running',
      created_by: args.userId ?? null,
      model: MODEL,
    })
    .select('id')
    .single()
  if (runErr || !run) {
    return { success: false, error: runErr?.message ?? 'Failed to create agent_run' }
  }
  const runId = run.id as string

  // 2. Build full context
  const context = await buildClientContext(args.clientId)
  if (!context) {
    await db.from('agent_runs').update({
      status: 'failed',
      error_message: 'Client not found',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    return { success: false, error: 'Client not found', agentRunId: runId }
  }

  // 3. Call Claude
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    await db.from('agent_runs').update({
      status: 'failed',
      error_message: 'ANTHROPIC_API_KEY not configured',
      completed_at: new Date().toISOString(),
    }).eq('id', runId)
    return { success: false, error: 'ANTHROPIC_API_KEY not configured', agentRunId: runId }
  }

  const userPrompt = buildUserPrompt(context)
  const client = new Anthropic({ apiKey })

  let response
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    })
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Claude API call failed'
    await db.from('agent_runs').update({
      status: 'failed',
      error_message: errMsg,
      completed_at: new Date().toISOString(),
      raw_input: { context, system: SYSTEM_PROMPT },
    }).eq('id', runId)
    return { success: false, error: errMsg, agentRunId: runId }
  }

  // 4. Parse Claude's structured output
  const textBlock = response.content.find(b => b.type === 'text')
  const rawText = textBlock && 'text' in textBlock ? textBlock.text : ''
  const parsed = parseStructuredOutput(rawText)
  if (!parsed) {
    await db.from('agent_runs').update({
      status: 'failed',
      error_message: 'Failed to parse Claude output',
      completed_at: new Date().toISOString(),
      raw_input: { context },
      raw_output: { text: rawText },
      input_tokens: response.usage.input_tokens,
      output_tokens: response.usage.output_tokens,
    }).eq('id', runId)
    return { success: false, error: 'Failed to parse Claude output', agentRunId: runId }
  }

  // 5. Cost estimate (Sonnet 4.5: $3/Mtok input, $15/Mtok output)
  const costUsd = (response.usage.input_tokens * 3 + response.usage.output_tokens * 15) / 1_000_000

  // 6. Insert proposals
  const proposalRows = parsed.proposals.map(p => ({
    client_id: args.clientId,
    agent_run_id: runId,
    type: p.type,
    payload: p.payload,
    targets: p.targets,
    scheduled_for: p.scheduled_for ?? null,
    summary: p.summary,
    reasoning: p.reasoning,
    confidence_score: Math.min(Math.max(p.confidence, 0), 1),
    category: p.category,
    status: 'pending' as const,
    expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(), // 7d auto-expire
  }))

  if (proposalRows.length > 0) {
    const { error: insertErr } = await db.from('proposed_actions').insert(proposalRows)
    if (insertErr) {
      await db.from('agent_runs').update({
        status: 'failed',
        error_message: `Insert proposals failed: ${insertErr.message}`,
        completed_at: new Date().toISOString(),
        raw_output: { text: rawText, parsed },
      }).eq('id', runId)
      return { success: false, error: insertErr.message, agentRunId: runId }
    }
  }

  // 7. Mark run as success
  await db.from('agent_runs').update({
    status: 'success',
    completed_at: new Date().toISOString(),
    summary: parsed.summary,
    raw_input: { context_summary: summarizeContext(context) },
    raw_output: { parsed },
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    cost_usd: costUsd,
  }).eq('id', runId)

  return {
    success: true,
    agentRunId: runId,
    proposalCount: parsed.proposals.length,
    summary: parsed.summary,
    costUsd,
  }
}

// ─── Prompt construction ────────────────────────────────────────

function buildUserPrompt(ctx: ClientContext): string {
  const m = ctx.recentMetrics
  const trend = (curr: number, prev: number) => {
    if (prev === 0) return 'N/A (new)'
    const pct = ((curr - prev) / prev) * 100
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}% (${curr.toLocaleString()} vs ${prev.toLocaleString()})`
  }

  return `# Restaurant context

**Name:** ${ctx.client.name}
**Cuisine / industry:** ${ctx.client.primary_industry ?? 'not specified'}
**Description:** ${ctx.client.brief_description ?? 'not specified'}

**Goals:** ${JSON.stringify(ctx.client.goals)}
**Target audience:** ${JSON.stringify(ctx.client.target_audience)}
**Content pillars:** ${JSON.stringify(ctx.client.content_pillars)}

**Brand:**
- Primary color: ${ctx.brand?.primary_color ?? 'not set'}
- Voice notes: ${ctx.brand?.voice_notes ?? 'not set'}
- Photo style: ${ctx.brand?.photo_style ?? 'not set'}
- Visual style: ${ctx.brand?.visual_style ?? 'not set'}

**Primary location:** ${ctx.primaryLocation?.name ?? 'unknown'}
**Address:** ${ctx.primaryLocation?.address ?? 'not set'}

# Recent performance (last 30d vs prior 30d)
${m
  ? `- Impressions: ${trend(m.last30_impressions, m.prev30_impressions)}
- Calls: ${trend(m.last30_calls, m.prev30_calls)}
- Directions: ${trend(m.last30_directions, m.prev30_directions)}
- Website clicks: ${trend(m.last30_website_clicks, m.prev30_website_clicks)}
- Menu clicks: ${trend(m.last30_menu_clicks, m.prev30_menu_clicks)}`
  : 'No metrics data available yet.'}

# Recently published (last 30 days)
${
  ctx.recentUpdates.length === 0
    ? 'Nothing published recently.'
    : ctx.recentUpdates.map(u => `- [${u.type}] ${u.summary ?? '(no summary)'} (${u.published_at?.slice(0, 10) ?? '?'})`).join('\n')
}

# Active state
- Active promotions: ${ctx.activePromotions}
- Upcoming events: ${ctx.upcomingEvents}

# Your task

Propose 3-7 concrete marketing actions for the next 7 days. Each must be specific, on-brand,
tied to one of the four categories (anomaly_response / content / maintenance / opportunity).

Output JSON ONLY in this exact schema:

\`\`\`json
{
  "summary": "1-2 sentence overall narrative for this week",
  "proposals": [
    {
      "type": "social_post" | "hours" | "menu_item" | "promotion" | "event" | "closure",
      "summary": "1-line description for the queue",
      "reasoning": "why this proposal makes sense given context",
      "confidence": 0.0-1.0,
      "category": "anomaly_response" | "content" | "maintenance" | "opportunity",
      "payload": { ... type-specific ... },
      "targets": ["instagram", "facebook", "gbp", "website", ...],
      "scheduled_for": "2026-04-30T11:00:00Z" (optional, ISO)
    }
  ]
}
\`\`\`

Output ONLY the JSON. No markdown fences, no prose.`
}

function parseStructuredOutput(raw: string): ClaudeProposalOutput | null {
  // Claude sometimes wraps in markdown fences despite instructions
  const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*$/g, '').trim()
  try {
    const parsed = JSON.parse(cleaned)
    if (typeof parsed.summary === 'string' && Array.isArray(parsed.proposals)) {
      return parsed as ClaudeProposalOutput
    }
    return null
  } catch {
    return null
  }
}

function summarizeContext(ctx: ClientContext): Record<string, unknown> {
  // Trim down for storage; full context is too verbose for raw_input
  return {
    client_name: ctx.client.name,
    industry: ctx.client.primary_industry,
    has_brand: !!ctx.brand,
    has_location: !!ctx.primaryLocation,
    has_metrics: !!ctx.recentMetrics,
    recent_update_count: ctx.recentUpdates.length,
    active_promos: ctx.activePromotions,
    upcoming_events: ctx.upcomingEvents,
  }
}
