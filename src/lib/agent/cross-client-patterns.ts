/**
 * Cross-client patterns (AI-First Principle #7).
 *
 * Reads from the cross_client_patterns materialized view. Two
 * consumers:
 *
 *   1. The agent context loader can call relevantPatternsFor() to
 *      slip 2-3 patterns into the prompt that fit this client's
 *      vertical/subtype. Acts as guidance, not instruction.
 *   2. The admin /admin/agent-patterns surface so strategists can
 *      see what's actually working and feed it back into prompts
 *      or playbooks.
 *
 * Refresh logic lives at /api/cron/agent-patterns (refreshes the
 * materialized view nightly).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface PatternRow {
  toolName: string
  metricName: string
  industry: string
  sampleSize: number
  avgPctChange: number | null
  medianPctChange: number | null
  strongSignalCount: number
  weakSignalCount: number
  noisySignalCount: number
}

export async function listAllPatterns(): Promise<PatternRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('cross_client_patterns')
    .select('*')
    .order('strong_signal_count', { ascending: false })
    .limit(200)
  return ((data ?? []) as Array<{
    tool_name: string; metric_name: string; industry: string;
    sample_size: number; avg_pct_change: number | null;
    median_pct_change: number | null;
    strong_signal_count: number; weak_signal_count: number; noisy_signal_count: number;
  }>).map(r => ({
    toolName: r.tool_name,
    metricName: r.metric_name,
    industry: r.industry,
    sampleSize: r.sample_size,
    avgPctChange: r.avg_pct_change,
    medianPctChange: r.median_pct_change,
    strongSignalCount: r.strong_signal_count,
    weakSignalCount: r.weak_signal_count,
    noisySignalCount: r.noisy_signal_count,
  }))
}

/**
 * Pull a small handful of patterns that fit a client's vertical.
 * The context loader can splice these into the prompt as "similar
 * restaurants who ran X saw Y%."
 */
export async function relevantPatternsFor(args: {
  industry: string | null
  tools?: string[]
  limit?: number
}): Promise<PatternRow[]> {
  const admin = createAdminClient()
  let query = admin.from('cross_client_patterns')
    .select('*')
    .gte('sample_size', 3)
    .order('strong_signal_count', { ascending: false })
    .limit(args.limit ?? 5)
  if (args.industry) query = query.in('industry', [args.industry, 'unknown'])
  if (args.tools && args.tools.length > 0) query = query.in('tool_name', args.tools)
  const { data } = await query
  return ((data ?? []) as Array<{
    tool_name: string; metric_name: string; industry: string;
    sample_size: number; avg_pct_change: number | null;
    median_pct_change: number | null;
    strong_signal_count: number; weak_signal_count: number; noisy_signal_count: number;
  }>).map(r => ({
    toolName: r.tool_name,
    metricName: r.metric_name,
    industry: r.industry,
    sampleSize: r.sample_size,
    avgPctChange: r.avg_pct_change,
    medianPctChange: r.median_pct_change,
    strongSignalCount: r.strong_signal_count,
    weakSignalCount: r.weak_signal_count,
    noisySignalCount: r.noisy_signal_count,
  }))
}

/** Refresh the materialized view. Idempotent. */
export async function refreshPatterns(): Promise<{ refreshed: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin.rpc('refresh_cross_client_patterns')
  /* If the RPC doesn't exist (we haven't created it yet), fall back
     to a direct call -- privileges permitting. */
  if (error && error.message.includes('Could not find the function')) {
    /* Supabase service-role doesn't expose REFRESH MATERIALIZED VIEW
       via the data API, so this branch will currently fail in
       production. The cron route runs the SQL via a Postgres function
       below. */
    return { refreshed: false, error: 'refresh_cross_client_patterns() not installed' }
  }
  if (error) return { refreshed: false, error: error.message }
  return { refreshed: true }
}
