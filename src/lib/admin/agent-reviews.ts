'use server'

/**
 * Strategist review queue (closes the AI-First learning loop).
 *
 * The agent generates 100s of conversations per day across all clients.
 * No human can read them all. This module surfaces the ones that
 * matter -- low owner ratings, high error counts, lots of cancels,
 * fresh-but-unreviewed -- so strategists spend their attention where
 * it pays off.
 *
 * Strategist ratings (rater_type='strategist') are second-pass
 * judgments on top of the owner's 1-tap ratings (rater_type='owner').
 * Both feed agent_evaluations; the cross-client patterns view
 * eventually weighs them differently if we want.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

async function requireAdmin(): Promise<{ userId: string } | { error: string }> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) return { error: 'Not authenticated' }
  const admin = createAdminClient()
  const { data: profile } = await admin
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (profile?.role !== 'admin') return { error: 'Admin required' }
  return { userId: user.id }
}

// ─── List ─────────────────────────────────────────────────────────

export interface QueueRow {
  conversationId: string
  clientId: string
  clientName: string
  startedAt: string
  endedAt: string | null
  status: string
  title: string | null
  summary: string | null
  turnCount: number
  toolCount: number
  failedToolCount: number
  cancelledToolCount: number
  ownerThumbsUp: number
  ownerThumbsDown: number
  strategistRated: boolean
  /** Computed priority score -- higher = more deserving of review. */
  priorityScore: number
}

export interface ListQueueOptions {
  filter?: 'needs_review' | 'reviewed' | 'all'
  limit?: number
}

export async function listAgentReviewQueue(opts: ListQueueOptions = {}): Promise<QueueRow[]> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return []
  const admin = createAdminClient()

  /* Pull the last 60 days of conversations + aggregates. We compute
     priority + sort client-side; row counts are small enough at our
     scale that this is fine. */
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - 60)

  const [convRes, turnRes, execRes, evalRes] = await Promise.all([
    admin.from('agent_conversations')
      .select('id, client_id, started_at, ended_at, status, title, summary, clients(name)')
      .gte('started_at', since.toISOString())
      .order('started_at', { ascending: false })
      .limit(500),
    admin.from('agent_conversation_turns')
      .select('conversation_id, role')
      .gte('created_at', since.toISOString()),
    admin.from('agent_tool_executions')
      .select('conversation_id, status')
      .gte('created_at', since.toISOString()),
    admin.from('agent_evaluations')
      .select('conversation_id, rater_type, thumbs')
      .gte('created_at', since.toISOString()),
  ])

  const conversations = (convRes.data ?? []) as Array<{
    id: string; client_id: string; started_at: string; ended_at: string | null;
    status: string; title: string | null; summary: string | null;
    clients: { name: string } | Array<{ name: string }> | null;
  }>

  /* Aggregate counts by conversation. */
  const turnCounts = new Map<string, number>()
  for (const t of ((turnRes.data ?? []) as Array<{ conversation_id: string }>)) {
    turnCounts.set(t.conversation_id, (turnCounts.get(t.conversation_id) ?? 0) + 1)
  }
  const execCounts = new Map<string, { total: number; failed: number; cancelled: number }>()
  for (const e of ((execRes.data ?? []) as Array<{ conversation_id: string | null; status: string }>)) {
    if (!e.conversation_id) continue
    const cur = execCounts.get(e.conversation_id) ?? { total: 0, failed: 0, cancelled: 0 }
    cur.total += 1
    if (e.status === 'failed') cur.failed += 1
    if (e.status === 'cancelled') cur.cancelled += 1
    execCounts.set(e.conversation_id, cur)
  }
  const evalCounts = new Map<string, { ownerUp: number; ownerDown: number; strategistRated: boolean }>()
  for (const ev of ((evalRes.data ?? []) as Array<{ conversation_id: string; rater_type: string; thumbs: string | null }>)) {
    const cur = evalCounts.get(ev.conversation_id) ?? { ownerUp: 0, ownerDown: 0, strategistRated: false }
    if (ev.rater_type === 'owner') {
      if (ev.thumbs === 'up') cur.ownerUp += 1
      if (ev.thumbs === 'down') cur.ownerDown += 1
    }
    if (ev.rater_type === 'strategist') cur.strategistRated = true
    evalCounts.set(ev.conversation_id, cur)
  }

  const rows: QueueRow[] = conversations.map(c => {
    const e = execCounts.get(c.id) ?? { total: 0, failed: 0, cancelled: 0 }
    const v = evalCounts.get(c.id) ?? { ownerUp: 0, ownerDown: 0, strategistRated: false }
    const score = computePriority({
      ownerDown: v.ownerDown,
      failed: e.failed,
      cancelled: e.cancelled,
      ageDays: (Date.now() - new Date(c.started_at).getTime()) / 86_400_000,
      strategistRated: v.strategistRated,
    })
    return {
      conversationId: c.id,
      clientId: c.client_id,
      clientName: Array.isArray(c.clients) ? (c.clients[0]?.name ?? '—') : (c.clients?.name ?? '—'),
      startedAt: c.started_at,
      endedAt: c.ended_at,
      status: c.status,
      title: c.title,
      summary: c.summary,
      turnCount: turnCounts.get(c.id) ?? 0,
      toolCount: e.total,
      failedToolCount: e.failed,
      cancelledToolCount: e.cancelled,
      ownerThumbsUp: v.ownerUp,
      ownerThumbsDown: v.ownerDown,
      strategistRated: v.strategistRated,
      priorityScore: score,
    }
  })

  const filtered = rows.filter(r => {
    if (opts.filter === 'needs_review') return !r.strategistRated
    if (opts.filter === 'reviewed') return r.strategistRated
    return true
  })
  filtered.sort((a, b) => b.priorityScore - a.priorityScore)
  return filtered.slice(0, opts.limit ?? 100)
}

function computePriority(args: {
  ownerDown: number
  failed: number
  cancelled: number
  ageDays: number
  strategistRated: boolean
}): number {
  /* Reviewed convos get a permanent -1000 so they sink. Otherwise
     weight 👎 highest (owner explicitly said it was bad), then tool
     failures, then cancels, with a freshness decay. */
  if (args.strategistRated) return -1000
  return (args.ownerDown * 5) + (args.failed * 3) + (args.cancelled * 1) + Math.max(0, 14 - args.ageDays)
}

// ─── Detail ───────────────────────────────────────────────────────

export interface ConversationDetail {
  conversation: {
    id: string
    clientId: string
    clientName: string
    startedAt: string
    endedAt: string | null
    status: string
    title: string | null
    summary: string | null
  }
  turns: Array<{
    id: string
    turnIndex: number
    role: string
    content: unknown
    toolCalls: unknown
    toolCallId: string | null
    model: string | null
    inputTokens: number | null
    outputTokens: number | null
    latencyMs: number | null
    createdAt: string
  }>
  executions: Array<{
    id: string
    toolName: string
    status: string
    input: unknown
    output: unknown
    failedReason: string | null
    createdAt: string
  }>
  evaluations: Array<{
    id: string
    raterType: string
    thumbs: string | null
    tags: string[] | null
    notes: string | null
    createdAt: string
  }>
  outcomes: Array<{
    id: string
    toolExecutionId: string | null
    metricName: string
    baselineValue: number | null
    observedValue: number | null
    signalStrength: string | null
    notes: string | null
  }>
}

export async function getConversationDetail(conversationId: string): Promise<ConversationDetail | null> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return null
  const admin = createAdminClient()

  const { data: conv } = await admin
    .from('agent_conversations')
    .select('id, client_id, started_at, ended_at, status, title, summary, clients(name)')
    .eq('id', conversationId)
    .maybeSingle()
  if (!conv) return null

  const [turnRes, execRes, evalRes, outRes] = await Promise.all([
    admin.from('agent_conversation_turns').select('*').eq('conversation_id', conversationId).order('turn_index', { ascending: true }),
    admin.from('agent_tool_executions').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
    admin.from('agent_evaluations').select('*').eq('conversation_id', conversationId).order('created_at', { ascending: true }),
    admin.from('agent_outcomes').select('*').eq('conversation_id', conversationId),
  ])

  const c = conv as {
    id: string; client_id: string; started_at: string; ended_at: string | null;
    status: string; title: string | null; summary: string | null;
    clients: { name: string } | Array<{ name: string }> | null;
  }
  const clientName = Array.isArray(c.clients) ? (c.clients[0]?.name ?? '—') : (c.clients?.name ?? '—')

  return {
    conversation: {
      id: c.id, clientId: c.client_id, clientName,
      startedAt: c.started_at, endedAt: c.ended_at,
      status: c.status, title: c.title, summary: c.summary,
    },
    turns: ((turnRes.data ?? []) as Array<Record<string, unknown>>).map(t => ({
      id: t.id as string,
      turnIndex: t.turn_index as number,
      role: t.role as string,
      content: t.content,
      toolCalls: t.tool_calls,
      toolCallId: (t.tool_call_id as string | null) ?? null,
      model: (t.model as string | null) ?? null,
      inputTokens: (t.input_tokens as number | null) ?? null,
      outputTokens: (t.output_tokens as number | null) ?? null,
      latencyMs: (t.latency_ms as number | null) ?? null,
      createdAt: t.created_at as string,
    })),
    executions: ((execRes.data ?? []) as Array<Record<string, unknown>>).map(e => ({
      id: e.id as string,
      toolName: e.tool_name as string,
      status: e.status as string,
      input: e.input,
      output: e.output,
      failedReason: (e.failed_reason as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
    evaluations: ((evalRes.data ?? []) as Array<Record<string, unknown>>).map(e => ({
      id: e.id as string,
      raterType: e.rater_type as string,
      thumbs: (e.thumbs as string | null) ?? null,
      tags: (e.tags as string[] | null) ?? null,
      notes: (e.notes as string | null) ?? null,
      createdAt: e.created_at as string,
    })),
    outcomes: ((outRes.data ?? []) as Array<Record<string, unknown>>).map(o => ({
      id: o.id as string,
      toolExecutionId: (o.tool_execution_id as string | null) ?? null,
      metricName: o.metric_name as string,
      baselineValue: (o.baseline_value as number | null) ?? null,
      observedValue: (o.observed_value as number | null) ?? null,
      signalStrength: (o.signal_strength as string | null) ?? null,
      notes: (o.notes as string | null) ?? null,
    })),
  }
}

// ─── Strategist-side rating ───────────────────────────────────────

export interface StrategistRatingInput {
  conversationId: string
  understoodIntent?: number
  pickedRightTool?: number
  outputOnBrand?: number
  escalatedAppropriately?: number
  overall: number
  tags?: string[]
  notes?: string
}

export async function submitStrategistRating(
  input: StrategistRatingInput,
): Promise<{ success: true } | { success: false; error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { success: false, error: ctx.error }
  const admin = createAdminClient()
  const { error } = await admin.from('agent_evaluations').upsert({
    conversation_id: input.conversationId,
    rater_type: 'strategist',
    rater_id: ctx.userId,
    understood_intent: input.understoodIntent ?? null,
    picked_right_tool: input.pickedRightTool ?? null,
    output_on_brand: input.outputOnBrand ?? null,
    escalated_appropriately: input.escalatedAppropriately ?? null,
    overall: input.overall,
    tags: input.tags ?? null,
    notes: input.notes ?? null,
  }, { onConflict: 'conversation_id,rater_type,rater_id' })
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/agent-reviews')
  return { success: true }
}
