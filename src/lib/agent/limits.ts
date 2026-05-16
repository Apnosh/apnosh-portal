/**
 * Per-client usage + cost cap enforcement.
 *
 * Called by the sendMessage server action before every agent turn.
 * If a cap is exceeded, returns the reason so the chat UI can render
 * a "you've hit your monthly allowance" message with an upgrade CTA
 * instead of silently failing.
 *
 * Three caps per tier (see tiers.ts):
 *   - dailyMessageLimit  -- prevents abuse + accidental floods
 *   - monthlyMessageLimit -- the soft contract boundary
 *   - monthlyCostCapCents -- the hard bankruptcy ceiling
 *
 * Lower of (message cap, cost cap) wins.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTier, type TierSpec } from './tiers'

export interface UsageSnapshot {
  tier: TierSpec
  messagesToday: number
  messagesThisMonth: number
  costThisMonthCents: number
  /* For the chat header meter -- whichever is the most-restrictive
     remaining capacity, plus its label. */
  primaryLimitLabel: string | null
  primaryLimitRemaining: number | null
  primaryLimitTotal: number | null
}

export interface LimitCheck {
  allowed: boolean
  /* When !allowed, a human-readable reason + the kind of cap hit. */
  blockedReason?: string
  blockedKind?: 'daily_messages' | 'monthly_messages' | 'monthly_cost'
  /* Snapshot, useful for UI/logging regardless. */
  snapshot: UsageSnapshot
}

export async function getUsageSnapshot(clientId: string): Promise<UsageSnapshot> {
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients').select('tier').eq('id', clientId).maybeSingle()
  const tier = resolveTier(client?.tier as string | undefined)

  const dayStart = new Date()
  dayStart.setUTCHours(0, 0, 0, 0)
  const monthStart = new Date()
  monthStart.setUTCDate(monthStart.getUTCDate() - 30)

  const [todayTurnsRes, monthTurnsRes, monthCostRes] = await Promise.all([
    admin.from('agent_conversation_turns')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', dayStart.toISOString())
      .in('conversation_id', await listClientConversationIds(clientId, dayStart)),
    admin.from('agent_conversation_turns')
      .select('id', { count: 'exact', head: true })
      .eq('role', 'user')
      .gte('created_at', monthStart.toISOString())
      .in('conversation_id', await listClientConversationIds(clientId, monthStart)),
    admin.from('agent_conversations')
      .select('total_cost_usd')
      .eq('client_id', clientId)
      .gte('started_at', monthStart.toISOString()),
  ])

  const messagesToday = todayTurnsRes.count ?? 0
  const messagesThisMonth = monthTurnsRes.count ?? 0
  const costThisMonthCents = Math.round(
    ((monthCostRes.data ?? []) as Array<{ total_cost_usd: number | null }>)
      .reduce((acc, c) => acc + Number(c.total_cost_usd ?? 0), 0) * 100,
  )

  /* Pick the meter to render in the chat header. Show the closest-
     to-zero of (daily messages, monthly messages, monthly cost). */
  const candidates: Array<{ label: string; remaining: number | null; total: number | null; ratio: number }> = []
  if (tier.dailyMessageLimit != null) {
    const remaining = Math.max(0, tier.dailyMessageLimit - messagesToday)
    candidates.push({
      label: `${remaining} of ${tier.dailyMessageLimit} messages left today`,
      remaining,
      total: tier.dailyMessageLimit,
      ratio: remaining / tier.dailyMessageLimit,
    })
  }
  if (tier.monthlyMessageLimit != null) {
    const remaining = Math.max(0, tier.monthlyMessageLimit - messagesThisMonth)
    candidates.push({
      label: `${remaining} of ${tier.monthlyMessageLimit} messages left this month`,
      remaining,
      total: tier.monthlyMessageLimit,
      ratio: remaining / tier.monthlyMessageLimit,
    })
  }
  /* Cost cap deliberately not shown to owner -- internal ceiling. */

  const closest = candidates.sort((a, b) => a.ratio - b.ratio)[0]

  return {
    tier,
    messagesToday,
    messagesThisMonth,
    costThisMonthCents,
    primaryLimitLabel: closest?.label ?? null,
    primaryLimitRemaining: closest?.remaining ?? null,
    primaryLimitTotal: closest?.total ?? null,
  }
}

export async function checkAndEnforceLimits(clientId: string): Promise<LimitCheck> {
  const snapshot = await getUsageSnapshot(clientId)
  const { tier } = snapshot

  if (tier.dailyMessageLimit != null && snapshot.messagesToday >= tier.dailyMessageLimit) {
    return {
      allowed: false,
      snapshot,
      blockedKind: 'daily_messages',
      blockedReason: `You've used your ${tier.dailyMessageLimit} ${tier.label} messages for today. The counter resets at midnight UTC.`,
    }
  }
  if (tier.monthlyMessageLimit != null && snapshot.messagesThisMonth >= tier.monthlyMessageLimit) {
    return {
      allowed: false,
      snapshot,
      blockedKind: 'monthly_messages',
      blockedReason: `You've used all ${tier.monthlyMessageLimit} ${tier.label} messages this month. Upgrade your plan or wait until next month's cycle.`,
    }
  }
  if (tier.monthlyCostCapCents != null && snapshot.costThisMonthCents >= tier.monthlyCostCapCents) {
    /* Cost cap message stays generic owner-side -- the dollar amount
       is internal info that confuses owners. */
    return {
      allowed: false,
      snapshot,
      blockedKind: 'monthly_cost',
      blockedReason: `You've used your AI allowance for this month. Upgrade your plan or talk to your strategist to discuss higher limits.`,
    }
  }
  return { allowed: true, snapshot }
}

async function listClientConversationIds(clientId: string, since: Date): Promise<string[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('agent_conversations')
    .select('id')
    .eq('client_id', clientId)
    .gte('started_at', since.toISOString())
  const rows = (data ?? []) as Array<{ id: string }>
  /* Empty array breaks the `.in(...)` filter -- pass a sentinel. */
  return rows.length > 0 ? rows.map(r => r.id) : ['00000000-0000-0000-0000-000000000000']
}
