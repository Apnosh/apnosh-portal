/**
 * Outcome wiring (AI-First Principle #2: outcomes everywhere).
 *
 * Walks recent tool_executions and attaches measured outcomes 7 days
 * after publish. Closes the loop:
 *   - update_menu_item -> menu_items.created_at + did GBP food_menu_clicks
 *     lift in the 7 days after?
 *   - post_to_gbp -> gbp_metrics post_views + post_clicks for the
 *     7 days after publish
 *   - update_hours -> did GBP impressions change?
 *   - update_page_copy -> did website_metrics.visitors / page_views shift?
 *
 * Each measurable execution writes one or more agent_outcomes rows.
 * Idempotent via (tool_execution_id, metric_name) -- safe to re-run.
 */

import { createAdminClient } from '@/lib/supabase/admin'

interface ExecutionRow {
  id: string
  client_id: string
  tool_name: string
  audit_event_type: string
  executed_at: string
  conversation_id: string | null
}

export interface OutcomeBackfillReport {
  executionsScanned: number
  outcomesWritten: number
  skipped: number
  errors: Array<{ executionId: string; message: string }>
}

/**
 * Walk all executed tool actions from N..M days ago and attach
 * measured outcomes. Default window: actions that executed 7-14 days
 * ago (gives them a full 7-day post-publish measurement window).
 */
export async function backfillOutcomes(args: {
  minDaysAgo?: number
  maxDaysAgo?: number
} = {}): Promise<OutcomeBackfillReport> {
  const minDaysAgo = args.minDaysAgo ?? 7
  const maxDaysAgo = args.maxDaysAgo ?? 30
  const admin = createAdminClient()

  const since = new Date()
  since.setUTCDate(since.getUTCDate() - maxDaysAgo)
  const until = new Date()
  until.setUTCDate(until.getUTCDate() - minDaysAgo)

  const { data: execs } = await admin
    .from('agent_tool_executions')
    .select('id, client_id, tool_name, audit_event_type, executed_at, conversation_id')
    .eq('status', 'executed')
    .gte('executed_at', since.toISOString())
    .lte('executed_at', until.toISOString())
    .order('executed_at', { ascending: true })

  const rows = (execs ?? []) as ExecutionRow[]
  const report: OutcomeBackfillReport = {
    executionsScanned: rows.length,
    outcomesWritten: 0,
    skipped: 0,
    errors: [],
  }

  for (const exec of rows) {
    try {
      const outcomes = await measureOutcomesFor(exec)
      if (outcomes.length === 0) {
        report.skipped += 1
        continue
      }
      for (const o of outcomes) {
        const { error } = await admin.from('agent_outcomes').upsert({
          conversation_id: exec.conversation_id,
          tool_execution_id: exec.id,
          metric_name: o.metricName,
          baseline_value: o.baselineValue,
          observed_value: o.observedValue,
          observed_at: new Date().toISOString(),
          window_days: o.windowDays,
          signal_strength: o.signalStrength,
          notes: o.notes ?? null,
        }, { onConflict: 'tool_execution_id,metric_name' })
        if (error) {
          report.errors.push({ executionId: exec.id, message: error.message })
        } else {
          report.outcomesWritten += 1
        }
      }
    } catch (err) {
      report.errors.push({ executionId: exec.id, message: (err as Error).message })
    }
  }

  return report
}

interface MeasuredOutcome {
  metricName: string
  baselineValue: number | null
  observedValue: number | null
  windowDays: number
  signalStrength: 'strong' | 'weak' | 'noisy' | null
  notes?: string
}

/**
 * Dispatch table: pick the right metric(s) to measure based on what
 * the tool did. Adding a new measured tool = add a case here.
 */
async function measureOutcomesFor(exec: ExecutionRow): Promise<MeasuredOutcome[]> {
  switch (exec.tool_name) {
    case 'post_to_gbp':
      return measureGbpPostLift(exec)
    case 'update_menu_item':
      return measureMenuItemLift(exec)
    case 'update_hours':
      return measureHoursChangeLift(exec)
    case 'update_page_copy':
      return measurePageCopyLift(exec)
    default:
      return []  // non-measurable tools (search_business_data, tag_photo, request_human_help)
  }
}

// ─── Per-tool measurements ────────────────────────────────────────

async function measureGbpPostLift(exec: ExecutionRow): Promise<MeasuredOutcome[]> {
  /* Did GBP post views + clicks rise in the 7 days after the post,
     compared to the 7 days before? */
  const admin = createAdminClient()
  const postDate = new Date(exec.executed_at)
  const before = await fetchGbpMetrics(exec.client_id, addDays(postDate, -7), postDate)
  const after = await fetchGbpMetrics(exec.client_id, postDate, addDays(postDate, 7))

  return [
    diffMetric('gbp_post_views_7d_lift', before.post_views, after.post_views, 7),
    diffMetric('gbp_post_clicks_7d_lift', before.post_clicks, after.post_clicks, 7),
    diffMetric('gbp_impressions_7d_lift', before.impressions, after.impressions, 7),
  ]
}

async function measureMenuItemLift(exec: ExecutionRow): Promise<MeasuredOutcome[]> {
  /* Did GBP food_menu_clicks (or food_orders) rise after the menu
     update? */
  const admin = createAdminClient()
  void admin
  const postDate = new Date(exec.executed_at)
  const before = await fetchGbpMetrics(exec.client_id, addDays(postDate, -14), postDate)
  const after = await fetchGbpMetrics(exec.client_id, postDate, addDays(postDate, 7))
  return [
    diffMetric('gbp_food_menu_clicks_7d_lift', before.food_menu_clicks ?? 0, after.food_menu_clicks ?? 0, 7),
    diffMetric('gbp_food_orders_7d_lift', before.food_orders ?? 0, after.food_orders ?? 0, 7),
  ]
}

async function measureHoursChangeLift(exec: ExecutionRow): Promise<MeasuredOutcome[]> {
  const postDate = new Date(exec.executed_at)
  const before = await fetchGbpMetrics(exec.client_id, addDays(postDate, -7), postDate)
  const after = await fetchGbpMetrics(exec.client_id, postDate, addDays(postDate, 7))
  return [
    diffMetric('gbp_impressions_7d_lift', before.impressions, after.impressions, 7),
    diffMetric('gbp_directions_7d_lift', before.directions, after.directions, 7),
  ]
}

async function measurePageCopyLift(exec: ExecutionRow): Promise<MeasuredOutcome[]> {
  /* Did website_metrics change after the copy update? */
  const admin = createAdminClient()
  const postDate = new Date(exec.executed_at)
  const beforeRange = await fetchWebsiteMetrics(admin, exec.client_id, addDays(postDate, -7), postDate)
  const afterRange = await fetchWebsiteMetrics(admin, exec.client_id, postDate, addDays(postDate, 7))
  return [
    diffMetric('website_visitors_7d_lift', beforeRange.visitors, afterRange.visitors, 7),
    diffMetric('website_page_views_7d_lift', beforeRange.page_views, afterRange.page_views, 7),
  ]
}

// ─── Metric helpers ───────────────────────────────────────────────

interface GbpAggregate {
  impressions: number
  directions: number
  calls: number
  website_clicks: number
  post_views: number
  post_clicks: number
  food_menu_clicks: number
  food_orders: number
}

async function fetchGbpMetrics(clientId: string, start: Date, end: Date): Promise<GbpAggregate> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('gbp_metrics')
    .select('impressions_total, directions, calls, website_clicks, post_views, post_clicks, food_menu_clicks, food_orders')
    .eq('client_id', clientId)
    .gte('date', start.toISOString().slice(0, 10))
    .lt('date', end.toISOString().slice(0, 10))
  const rows = (data ?? []) as Array<{
    impressions_total: number | null; directions: number | null; calls: number | null;
    website_clicks: number | null; post_views: number | null; post_clicks: number | null;
    food_menu_clicks: number | null; food_orders: number | null;
  }>
  return {
    impressions: sum(rows, 'impressions_total'),
    directions: sum(rows, 'directions'),
    calls: sum(rows, 'calls'),
    website_clicks: sum(rows, 'website_clicks'),
    post_views: sum(rows, 'post_views'),
    post_clicks: sum(rows, 'post_clicks'),
    food_menu_clicks: sum(rows, 'food_menu_clicks'),
    food_orders: sum(rows, 'food_orders'),
  }
}

async function fetchWebsiteMetrics(
  admin: ReturnType<typeof createAdminClient>,
  clientId: string,
  start: Date,
  end: Date,
): Promise<{ visitors: number; page_views: number; sessions: number }> {
  const { data } = await admin
    .from('website_metrics')
    .select('visitors, page_views, sessions')
    .eq('client_id', clientId)
    .gte('date', start.toISOString().slice(0, 10))
    .lt('date', end.toISOString().slice(0, 10))
  const rows = (data ?? []) as Array<{ visitors: number | null; page_views: number | null; sessions: number | null }>
  return {
    visitors: sum(rows, 'visitors'),
    page_views: sum(rows, 'page_views'),
    sessions: sum(rows, 'sessions'),
  }
}

function sum<T extends Record<string, number | null>>(rows: T[], key: keyof T): number {
  return rows.reduce((acc, r) => acc + (r[key] ?? 0), 0)
}

function diffMetric(name: string, before: number, after: number, days: number): MeasuredOutcome {
  /* Signal strength is heuristic: large absolute lift + meaningful
     percentage = strong; small either way = noisy. We're not doing
     statistical tests here -- this is signal for a human reviewing
     "did this action help?", not p-value science. */
  const delta = after - before
  const pct = before > 0 ? (delta / before) * 100 : null
  let strength: MeasuredOutcome['signalStrength'] = 'noisy'
  if (Math.abs(delta) >= 10 && pct != null && Math.abs(pct) >= 25) strength = 'strong'
  else if (Math.abs(delta) >= 3 || (pct != null && Math.abs(pct) >= 10)) strength = 'weak'
  return {
    metricName: name,
    baselineValue: before,
    observedValue: after,
    windowDays: days,
    signalStrength: strength,
    notes: pct != null ? `${pct > 0 ? '+' : ''}${pct.toFixed(1)}% (${delta > 0 ? '+' : ''}${delta})` : undefined,
  }
}

function addDays(d: Date, days: number): Date {
  const out = new Date(d)
  out.setUTCDate(out.getUTCDate() + days)
  return out
}
