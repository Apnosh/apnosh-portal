import 'server-only'
/**
 * recurring-cycles — month-2+ mints REAL work for recurring services.
 *
 * The sim's shell finding (break #3c / crack #17): a monthly subscription kept billing
 * while month 2+ minted no work object at all — the "you approve each reply" service
 * just sat. This sweep (piggybacked on the daily outcomes-poll cron, same pattern as
 * the completion sweep) walks every ACTIVE campaign subscription and, for each
 * recurring-class service on the campaign, mints the next monthly cycle's
 * service_work_orders row (seeded with the same playbook checklist) whenever billed
 * months outrun minted cycles.
 *
 * Honesty properties:
 *  - Work is minted only while the subscription is genuinely 'active' (a canceled or
 *    failed subscription mints nothing).
 *  - Cycle rows insert with line_item_id NULL (the unique(campaign_id, line_item_id)
 *    guard treats NULLs as distinct) and a "Month N:" title, so cycle 1 (the ship
 *    mint) is never duplicated and each month's work is its own checkable object.
 *  - Idempotent per month: the shortfall math (recurring-cycles-core) counts existing
 *    rows per service, so a re-run mints nothing extra.
 *  - Degrade-safe: missing tables (pre-190/215/221) no-op cleanly.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { turnaroundFor } from './data/service-turnaround'
import { seedSteps } from './data/service-playbooks'
import { monthsElapsed, cycleShortfall, cycleTitle } from './recurring-cycles-core'

const MAX_MINTS_PER_TICK = 20

export interface RecurringSweep { subscriptions: number; minted: number }

export async function sweepRecurringCycles(nowISO: string = new Date().toISOString()): Promise<RecurringSweep> {
  const admin = createAdminClient()
  const out: RecurringSweep = { subscriptions: 0, minted: 0 }

  // Active campaign subscriptions with a bound campaign (the billing truth source).
  let subs: Array<{ campaign_id: string; client_id: string; started: string | null }> = []
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (admin.from('campaign_payments') as any)
      .select('campaign_id, client_id, paid_at, created_at, subscription_status')
      .eq('subscription_status', 'active')
      .not('campaign_id', 'is', null)
    if (error || !Array.isArray(data)) return out
    subs = data.map((r: Record<string, unknown>) => ({
      campaign_id: String(r.campaign_id),
      client_id: String(r.client_id ?? ''),
      started: (r.paid_at as string) ?? (r.created_at as string) ?? null,
    }))
  } catch {
    return out
  }
  if (!subs.length) return out
  out.subscriptions = subs.length

  for (const sub of subs) {
    if (out.minted >= MAX_MINTS_PER_TICK) break
    const elapsed = monthsElapsed(sub.started, nowISO)
    if (elapsed < 2) continue   // month 1's work was minted at ship

    // Every service work order on the campaign; group recurring-class by service.
    let rows: Array<Record<string, unknown>> = []
    try {
      const { data } = await admin
        .from('service_work_orders')
        .select('service_id, title, status')
        .eq('campaign_id', sub.campaign_id)
      rows = (data ?? []) as Array<Record<string, unknown>>
    } catch { continue }

    const byService = new Map<string, { count: number; baseTitle: string }>()
    for (const r of rows) {
      const sid = String(r.service_id ?? '')
      if (turnaroundFor(sid)?.class !== 'recurring') continue
      if (String(r.status ?? '') === 'cancelled') continue
      const cur = byService.get(sid) ?? { count: 0, baseTitle: String(r.title ?? sid) }
      cur.count++
      // Keep the ORIGINAL (cycle-1) title as the base: strip any "Month N: " prefix.
      cur.baseTitle = String(r.title ?? cur.baseTitle).replace(/^Month \d+: /, '')
      byService.set(sid, cur)
    }

    for (const [sid, info] of byService) {
      if (out.minted >= MAX_MINTS_PER_TICK) break
      const owed = cycleShortfall(elapsed, info.count)
      if (owed <= 0) continue
      // Mint ONE cycle per tick per service (the daily cron catches up gently).
      const t = turnaroundFor(sid)
      const dueDays = t && t.class === 'recurring' ? t.startsWithin.max : 5
      const due = new Date(Date.parse(nowISO) + dueDays * 86400000)
      try {
        const { error } = await admin.from('service_work_orders').insert({
          campaign_id: sub.campaign_id,
          client_id: sub.client_id,
          line_item_id: null,
          service_id: sid,
          title: cycleTitle(info.baseTitle, info.count + 1),
          status: 'queued',
          due_date: due.toISOString().slice(0, 10),
          gate_kind: null,
          steps: seedSteps(sid),
        })
        if (!error) out.minted++
      } catch { /* next service */ }
    }
  }
  return out
}
