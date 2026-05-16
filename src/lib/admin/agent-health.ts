'use server'

/**
 * Daily agent health metrics. The page admins check to know
 * "is the agent OK right now?" without diving into individual
 * conversations.
 *
 * Computes everything from agent_* tables in one shot. Cheap enough
 * at our scale that we don't bother caching -- if a metric is wrong
 * after a deploy, refresh = truth.
 */

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

export interface ToolHealth {
  toolName: string
  executions: number
  executed: number
  failed: number
  cancelled: number
  pending: number
  failureRate: number    // 0..1
  cancelRate: number     // 0..1
  recentErrors: Array<{ executionId: string; reason: string; createdAt: string }>
}

export interface AgentHealthData {
  windowDays: number
  totals: {
    conversations: number
    turns: number
    userMessages: number
    toolExecutions: number
    escalations: number
    activeClients: number
  }
  feedback: {
    ownerThumbsUp: number
    ownerThumbsDown: number
    thumbsUpRate: number      // up / (up + down)
    strategistRatings: number
    avgOwnerOverall: number | null
    avgStrategistOverall: number | null
  }
  latency: {
    p50Ms: number | null
    p95Ms: number | null
    p99Ms: number | null
    samples: number
  }
  cost: {
    totalUsd: number
    avgPerConversationUsd: number | null
    /* Top 5 most expensive clients in window. */
    topSpenders: Array<{ clientId: string; clientName: string; usd: number; convs: number }>
  }
  tools: ToolHealth[]
  /* Daily trend for last N days -- thumbs-up rate + escalation rate
     by day so a regression shows as a downward line. */
  dailyTrend: Array<{
    date: string
    conversations: number
    thumbsUpRate: number | null
    escalationRate: number
    avgCostUsd: number | null
  }>
  generatedAt: string
}

export async function getAgentHealth(opts: { windowDays?: number } = {}): Promise<AgentHealthData | { error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const admin = createAdminClient()
  const windowDays = opts.windowDays ?? 14
  const since = new Date()
  since.setUTCDate(since.getUTCDate() - windowDays)

  /* Pull everything in parallel. Volume is small enough that we
     fetch full rows and aggregate client-side. */
  const [convRes, turnRes, execRes, evalRes, clientRes] = await Promise.all([
    admin.from('agent_conversations')
      .select('id, client_id, status, started_at, total_cost_usd, total_input_tokens, total_output_tokens, clients(name)')
      .gte('started_at', since.toISOString()),
    admin.from('agent_conversation_turns')
      .select('id, conversation_id, role, latency_ms, created_at')
      .gte('created_at', since.toISOString()),
    admin.from('agent_tool_executions')
      .select('id, conversation_id, tool_name, status, failed_reason, created_at')
      .gte('created_at', since.toISOString()),
    admin.from('agent_evaluations')
      .select('rater_type, thumbs, overall, created_at')
      .gte('created_at', since.toISOString()),
    admin.from('clients').select('id, name'),
  ])

  const convs = (convRes.data ?? []) as Array<{
    id: string; client_id: string; status: string; started_at: string;
    total_cost_usd: number | null; total_input_tokens: number | null; total_output_tokens: number | null;
    clients: { name: string } | Array<{ name: string }> | null;
  }>
  const turns = (turnRes.data ?? []) as Array<{ id: string; conversation_id: string; role: string; latency_ms: number | null; created_at: string }>
  const execs = (execRes.data ?? []) as Array<{ id: string; conversation_id: string | null; tool_name: string; status: string; failed_reason: string | null; created_at: string }>
  const evals = (evalRes.data ?? []) as Array<{ rater_type: string; thumbs: string | null; overall: number | null; created_at: string }>
  const clientsByid = new Map(((clientRes.data ?? []) as Array<{ id: string; name: string }>).map(c => [c.id, c.name]))

  /* ── Totals ────────────────────────────────────────────────── */
  const userMsgCount = turns.filter(t => t.role === 'user').length
  const escalationCount = convs.filter(c => c.status === 'escalated').length
  const activeClientCount = new Set(convs.map(c => c.client_id)).size

  /* ── Feedback ──────────────────────────────────────────────── */
  const ownerEvals = evals.filter(e => e.rater_type === 'owner')
  const stratEvals = evals.filter(e => e.rater_type === 'strategist')
  const thumbsUp = ownerEvals.filter(e => e.thumbs === 'up').length
  const thumbsDown = ownerEvals.filter(e => e.thumbs === 'down').length
  const thumbsUpRate = (thumbsUp + thumbsDown) > 0 ? thumbsUp / (thumbsUp + thumbsDown) : 0
  const ownerScores = ownerEvals.map(e => e.overall).filter((n): n is number => n != null)
  const stratScores = stratEvals.map(e => e.overall).filter((n): n is number => n != null)
  const avgOwner = ownerScores.length > 0 ? ownerScores.reduce((a, b) => a + b, 0) / ownerScores.length : null
  const avgStrat = stratScores.length > 0 ? stratScores.reduce((a, b) => a + b, 0) / stratScores.length : null

  /* ── Latency (assistant turns only -- they're the LLM calls) ─ */
  const latencies = turns
    .filter(t => t.role === 'assistant' && t.latency_ms != null)
    .map(t => t.latency_ms!) // eslint-disable-line @typescript-eslint/no-non-null-assertion
    .sort((a, b) => a - b)

  /* ── Cost ──────────────────────────────────────────────────── */
  const totalCostUsd = convs.reduce((s, c) => s + Number(c.total_cost_usd ?? 0), 0)
  const avgCostUsd = convs.length > 0 ? totalCostUsd / convs.length : null
  const costByClient = new Map<string, { usd: number; convs: number }>()
  for (const c of convs) {
    const cur = costByClient.get(c.client_id) ?? { usd: 0, convs: 0 }
    cur.usd += Number(c.total_cost_usd ?? 0)
    cur.convs += 1
    costByClient.set(c.client_id, cur)
  }
  const topSpenders = Array.from(costByClient.entries())
    .map(([clientId, agg]) => ({
      clientId,
      clientName: clientsByid.get(clientId) ?? '—',
      usd: Number(agg.usd.toFixed(4)),
      convs: agg.convs,
    }))
    .sort((a, b) => b.usd - a.usd)
    .slice(0, 5)

  /* ── Tool health ───────────────────────────────────────────── */
  const toolsMap = new Map<string, ToolHealth>()
  for (const e of execs) {
    const cur = toolsMap.get(e.tool_name) ?? {
      toolName: e.tool_name, executions: 0, executed: 0, failed: 0,
      cancelled: 0, pending: 0, failureRate: 0, cancelRate: 0, recentErrors: [],
    }
    cur.executions += 1
    if (e.status === 'executed') cur.executed += 1
    if (e.status === 'failed') {
      cur.failed += 1
      if (cur.recentErrors.length < 3 && e.failed_reason) {
        cur.recentErrors.push({ executionId: e.id, reason: e.failed_reason, createdAt: e.created_at })
      }
    }
    if (e.status === 'cancelled') cur.cancelled += 1
    if (e.status === 'pending_confirmation' || e.status === 'confirmed') cur.pending += 1
    toolsMap.set(e.tool_name, cur)
  }
  const tools = Array.from(toolsMap.values()).map(t => ({
    ...t,
    failureRate: t.executions > 0 ? t.failed / t.executions : 0,
    cancelRate: t.executions > 0 ? t.cancelled / t.executions : 0,
  })).sort((a, b) => b.failureRate - a.failureRate)

  /* ── Daily trend ───────────────────────────────────────────── */
  const dailyMap = new Map<string, { convs: Set<string>; up: number; down: number; escalations: number; cost: number }>()
  for (const c of convs) {
    const day = c.started_at.slice(0, 10)
    const cur = dailyMap.get(day) ?? { convs: new Set(), up: 0, down: 0, escalations: 0, cost: 0 }
    cur.convs.add(c.id)
    if (c.status === 'escalated') cur.escalations += 1
    cur.cost += Number(c.total_cost_usd ?? 0)
    dailyMap.set(day, cur)
  }
  /* Owner thumbs counted by conversation date via the turns' created_at */
  for (const e of ownerEvals) {
    const day = e.created_at.slice(0, 10)
    const cur = dailyMap.get(day) ?? { convs: new Set(), up: 0, down: 0, escalations: 0, cost: 0 }
    if (e.thumbs === 'up') cur.up += 1
    if (e.thumbs === 'down') cur.down += 1
    dailyMap.set(day, cur)
  }
  const dailyTrend = Array.from(dailyMap.entries())
    .map(([date, agg]) => ({
      date,
      conversations: agg.convs.size,
      thumbsUpRate: (agg.up + agg.down) > 0 ? agg.up / (agg.up + agg.down) : null,
      escalationRate: agg.convs.size > 0 ? agg.escalations / agg.convs.size : 0,
      avgCostUsd: agg.convs.size > 0 ? Number((agg.cost / agg.convs.size).toFixed(4)) : null,
    }))
    .sort((a, b) => a.date.localeCompare(b.date))

  return {
    windowDays,
    totals: {
      conversations: convs.length,
      turns: turns.length,
      userMessages: userMsgCount,
      toolExecutions: execs.length,
      escalations: escalationCount,
      activeClients: activeClientCount,
    },
    feedback: {
      ownerThumbsUp: thumbsUp,
      ownerThumbsDown: thumbsDown,
      thumbsUpRate: Number(thumbsUpRate.toFixed(3)),
      strategistRatings: stratEvals.length,
      avgOwnerOverall: avgOwner != null ? Number(avgOwner.toFixed(2)) : null,
      avgStrategistOverall: avgStrat != null ? Number(avgStrat.toFixed(2)) : null,
    },
    latency: {
      p50Ms: pct(latencies, 0.5),
      p95Ms: pct(latencies, 0.95),
      p99Ms: pct(latencies, 0.99),
      samples: latencies.length,
    },
    cost: {
      totalUsd: Number(totalCostUsd.toFixed(4)),
      avgPerConversationUsd: avgCostUsd != null ? Number(avgCostUsd.toFixed(4)) : null,
      topSpenders,
    },
    tools,
    dailyTrend,
    generatedAt: new Date().toISOString(),
  }
}

function pct(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null
  const idx = Math.min(sorted.length - 1, Math.floor(p * sorted.length))
  return sorted[idx]
}
