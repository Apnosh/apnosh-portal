'use server'

/**
 * Admin cost dashboard data. Shows per-client + global Anthropic
 * spend so the team can spot runaway clients before the bill hits.
 *
 * Cost is computed at turn time and stored on agent_conversations
 * (total_cost_usd column). We just aggregate here.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTier, TIERS } from '@/lib/agent/tiers'

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

export interface ClientCostRow {
  clientId: string
  clientName: string
  tier: string
  tierLabel: string
  costToday: number
  costThisMonth: number
  costLast30Days: number
  messagesToday: number
  messagesLast30Days: number
  monthlyCostCap: number | null
  capUtilization: number | null
  isAtRisk: boolean
  conversationCount: number
}

export interface CostDashboardData {
  rows: ClientCostRow[]
  totals: {
    todayUsd: number
    last30DaysUsd: number
    conversationCount: number
    activeClientCount: number
  }
  generatedAt: string
}

export async function getCostDashboard(): Promise<CostDashboardData | { error: string }> {
  const ctx = await requireAdmin()
  if ('error' in ctx) return { error: ctx.error }
  const admin = createAdminClient()

  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const month30Start = new Date()
  month30Start.setUTCDate(month30Start.getUTCDate() - 30)

  const [clientsRes, convsRes, todayTurnsRes, monthTurnsRes] = await Promise.all([
    admin.from('clients').select('id, name, tier').neq('status', 'churned'),
    admin.from('agent_conversations')
      .select('id, client_id, total_cost_usd, started_at')
      .gte('started_at', month30Start.toISOString()),
    admin.from('agent_conversation_turns')
      .select('conversation_id')
      .eq('role', 'user')
      .gte('created_at', dayStart.toISOString()),
    admin.from('agent_conversation_turns')
      .select('conversation_id')
      .eq('role', 'user')
      .gte('created_at', month30Start.toISOString()),
  ])

  const clients = (clientsRes.data ?? []) as Array<{ id: string; name: string; tier: string | null }>
  const convs = (convsRes.data ?? []) as Array<{ id: string; client_id: string; total_cost_usd: number | null; started_at: string }>
  const todayTurns = (todayTurnsRes.data ?? []) as Array<{ conversation_id: string }>
  const monthTurns = (monthTurnsRes.data ?? []) as Array<{ conversation_id: string }>

  /* Build a per-client aggregation. */
  const byClient = new Map<string, {
    costToday: number
    costThisMonth: number
    costLast30: number
    convs: number
    msgsToday: number
    msgs30: number
  }>()

  const convToClient = new Map(convs.map(c => [c.id, c.client_id]))
  for (const c of convs) {
    const cur = byClient.get(c.client_id) ?? { costToday: 0, costThisMonth: 0, costLast30: 0, convs: 0, msgsToday: 0, msgs30: 0 }
    const cost = Number(c.total_cost_usd ?? 0)
    cur.costLast30 += cost
    cur.costThisMonth += cost  // alias for owner-facing 'monthly'
    if (new Date(c.started_at) >= dayStart) cur.costToday += cost
    cur.convs += 1
    byClient.set(c.client_id, cur)
  }
  for (const t of todayTurns) {
    const cid = convToClient.get(t.conversation_id)
    if (!cid) continue
    const cur = byClient.get(cid) ?? { costToday: 0, costThisMonth: 0, costLast30: 0, convs: 0, msgsToday: 0, msgs30: 0 }
    cur.msgsToday += 1
    byClient.set(cid, cur)
  }
  for (const t of monthTurns) {
    const cid = convToClient.get(t.conversation_id)
    if (!cid) continue
    const cur = byClient.get(cid) ?? { costToday: 0, costThisMonth: 0, costLast30: 0, convs: 0, msgsToday: 0, msgs30: 0 }
    cur.msgs30 += 1
    byClient.set(cid, cur)
  }

  const rows: ClientCostRow[] = clients.map(c => {
    const tier = resolveTier(c.tier)
    const agg = byClient.get(c.id) ?? { costToday: 0, costThisMonth: 0, costLast30: 0, convs: 0, msgsToday: 0, msgs30: 0 }
    const cap = tier.monthlyCostCapCents != null ? tier.monthlyCostCapCents / 100 : null
    const utilization = cap != null && cap > 0 ? agg.costLast30 / cap : null
    return {
      clientId: c.id,
      clientName: c.name,
      tier: c.tier ?? tier.id,
      tierLabel: tier.label,
      costToday: round(agg.costToday),
      costThisMonth: round(agg.costThisMonth),
      costLast30Days: round(agg.costLast30),
      messagesToday: agg.msgsToday,
      messagesLast30Days: agg.msgs30,
      monthlyCostCap: cap,
      capUtilization: utilization,
      isAtRisk: utilization != null && utilization >= 0.75,
      conversationCount: agg.convs,
    }
  }).sort((a, b) => b.costLast30Days - a.costLast30Days)

  const totals = {
    todayUsd: round(rows.reduce((s, r) => s + r.costToday, 0)),
    last30DaysUsd: round(rows.reduce((s, r) => s + r.costLast30Days, 0)),
    conversationCount: convs.length,
    activeClientCount: rows.filter(r => r.messagesLast30Days > 0).length,
  }

  return { rows, totals, generatedAt: new Date().toISOString() }
}

function round(n: number): number {
  return Number(n.toFixed(4))
}

void TIERS  // re-exported indirectly via resolveTier; keep import for tree-shaking sanity
