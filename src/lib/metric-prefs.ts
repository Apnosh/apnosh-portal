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

export async function getDisabledSourceSet(clientId: string): Promise<Set<string>> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('client_metric_prefs')
      .select('disabled_sources')
      .eq('client_id', clientId)
      .maybeSingle()
    const raw = data?.disabled_sources
    if (Array.isArray(raw)) return new Set(raw.filter((v): v is string => typeof v === 'string'))
  } catch { /* prefs must never break a dashboard */ }
  return new Set()
}
