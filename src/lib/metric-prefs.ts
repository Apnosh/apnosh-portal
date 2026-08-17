/**
 * Choose-your-metrics: per-client display preferences (owner ask 2026-08-18).
 * ==========================================================================
 * disabled_sources holds source-registry ids the CLIENT switched off. The
 * toggles are display-only: every pipeline keeps collecting, so switching a
 * metric back on brings its full history with it. computeStages consults this
 * set, which gates the funnel, the insights stages and the home funnel counts
 * in one place (they all sum `counted` sources).
 *
 * Missing table or failed read resolves to "nothing disabled" - preferences
 * must never be able to break a dashboard.
 */

import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'

export interface MetricPrefs {
  /** summed-by-default metrics the client turned OFF */
  disabled: Set<string>
  /** optional metrics the client turned ON */
  enabled: Set<string>
}

const strSet = (raw: unknown): Set<string> =>
  new Set(Array.isArray(raw) ? raw.filter((v): v is string => typeof v === 'string') : [])

export async function getMetricPrefs(clientId: string): Promise<MetricPrefs> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('client_metric_prefs')
      .select('disabled_sources, enabled_sources')
      .eq('client_id', clientId)
      .maybeSingle()
    return { disabled: strSet(data?.disabled_sources), enabled: strSet(data?.enabled_sources) }
  } catch { /* prefs must never break a dashboard */ }
  return { disabled: new Set(), enabled: new Set() }
}

export async function getDisabledSourceSet(clientId: string): Promise<Set<string>> {
  return (await getMetricPrefs(clientId)).disabled
}
