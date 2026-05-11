'use server'

/**
 * Reads the client's current social-content plan: tier + allotment +
 * usage so far this month. Powers the "Plan" card on the social hub.
 *
 * Allotment is stored on clients.allotments (jsonb, set per-service).
 * Usage is counted from scheduled_posts in the current calendar month
 * for that client.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface ContentPlan {
  tier: string | null              // 'Basic' | 'Standard' | 'Pro' | 'Internal' | null
  monthlyRate: number | null       // dollars/month
  /** How many social posts the plan includes per month. */
  socialMonthlyAllotment: number | null
  /** Count of posts created this month (any status). */
  usedThisMonth: number
  /** Remaining = allotment - used. Clamped at 0. Null when no allotment defined. */
  remainingThisMonth: number | null
  /** Percent used, 0-100, when allotment is set. */
  percentUsed: number | null
}

export async function getContentPlan(clientId: string): Promise<ContentPlan> {
  const admin = createAdminClient()
  const now = new Date()
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  const [clientRes, usageRes] = await Promise.all([
    admin
      .from('clients')
      .select('tier, monthly_rate, allotments')
      .eq('id', clientId)
      .maybeSingle(),
    admin
      .from('scheduled_posts')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', clientId)
      .gte('created_at', monthStart),
  ])

  const tier = (clientRes.data?.tier as string | null) ?? null
  const monthlyRate = clientRes.data?.monthly_rate != null
    ? Number(clientRes.data.monthly_rate)
    : null

  const allotments = (clientRes.data?.allotments as Record<string, unknown> | null) ?? {}
  const socialAllotment =
    (allotments.social_posts_per_month as number | undefined) ??
    (allotments.social as number | undefined) ??
    null

  const used = usageRes.count ?? 0
  const remaining =
    socialAllotment != null ? Math.max(0, socialAllotment - used) : null
  const percentUsed =
    socialAllotment != null && socialAllotment > 0
      ? Math.min(100, Math.round((used / socialAllotment) * 100))
      : null

  return {
    tier,
    monthlyRate,
    socialMonthlyAllotment: socialAllotment ?? null,
    usedThisMonth: used,
    remainingThisMonth: remaining,
    percentUsed,
  }
}
