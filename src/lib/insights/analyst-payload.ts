/**
 * analyst-payload — the GROUNDED, real-numbers-only brief the AI Data Analyst
 * reasons over. This module never invents anything: every value comes from the
 * same honest funnel the dashboard shows (computeStages), the real reputation
 * numbers, the real top searches, and the real active campaigns. The AI is only
 * ever allowed to talk about what's in here (see analyst.ts guardrails), which is
 * what keeps the analyst on-brand with the outcome-accountability promise.
 *
 * The pure derivations (deriveDropOffs, summarizeSources) are I/O-free and unit
 * tested; buildAnalystPayload wires the real readers to them and is best-effort
 * (a missing source leaves its slice quiet, never throws).
 */

import {
  computeStages,
  type ComputedStage,
  type InsightsWindow,
} from './compute-stages'
import { getStageCampaigns } from '@/lib/dashboard/get-stage-campaigns'
import { getGbpAnalytics, type AnalyticsRange } from '@/lib/dashboard/get-gbp-analytics'
import { createAdminClient } from '@/lib/supabase/admin'

// The pure derivations + shared types live in analyst-derive.ts so they can be tested
// without this module's server-only imports. Re-exported here so every existing
// importer of analyst-payload keeps working unchanged.
export * from './analyst-derive'
import {
  deriveChanges,
  deriveDropOffs,
  summarizeSources,
  type AnalystPayload,
  type AnalystStage,
} from './analyst-derive'

/** ComputedStage → the flattened AnalystStage the payload carries. */
function toAnalystStage(cs: ComputedStage): AnalystStage {
  return {
    stage: cs.stage,
    label: cs.label,
    headline: cs.headline,
    unit: cs.unit,
    isEmpty: cs.isEmpty,
    note: cs.note,
    sources: cs.sources.map((s) => ({
      label: s.shortLabel || s.displayName,
      provider: s.provider,
      value: s.value,
      status: s.status,
      counted: s.counted,
    })),
  }
}

// Read a source's value out of a stage by id-like label match, for reputation.
function sourceValue(stage: AnalystStage | undefined, label: string): number | null {
  if (!stage) return null
  const s = stage.sources.find((x) => x.label === label)
  return s && s.value != null ? s.value : null
}

// ── The grounded build (best-effort I/O; never throws) ───────────────────

export async function buildAnalystPayload(
  clientId: string,
  window: InsightsWindow = '30d',
): Promise<AnalystPayload> {
  const range: AnalyticsRange = window
  const admin = createAdminClient()

  const [stagesRes, prevStagesRes, campaignsRes, gbpRes, bizRes, locRes] = await Promise.allSettled([
    computeStages(clientId, window),
    // The same funnel one period earlier. Best-effort like everything else here: if it
    // fails we simply have no comparison, never a wrong one.
    computeStages(clientId, window, 1),
    getStageCampaigns(clientId),
    getGbpAnalytics(clientId, range),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    admin.from('client_locations').select('city, state').eq('client_id', clientId).eq('is_primary', true).maybeSingle(),
  ])

  const computed = stagesRes.status === 'fulfilled' ? stagesRes.value : []
  const stages = computed.map(toAnalystStage)
  const prevStages = prevStagesRes.status === 'fulfilled' ? prevStagesRes.value.map(toAnalystStage) : []
  const changes = prevStages.length ? deriveChanges(stages, prevStages) : []
  const dropOffs = deriveDropOffs(stages)
  const sources = summarizeSources(stages)

  // reputation rides in on the Retention stage's real review sources — no extra query
  const retention = stages.find((s) => s.stage === 5)
  const reputation = {
    rating: sourceValue(retention, 'Star rating'),
    reviewCount: sourceValue(retention, 'Google reviews'),
  }

  const topSearches =
    gbpRes.status === 'fulfilled' && gbpRes.value?.topQueries
      ? gbpRes.value.topQueries.slice(0, 8)
      : []

  const activeCampaignsByStage: Record<string, string[]> = {}
  if (campaignsRes.status === 'fulfilled' && campaignsRes.value) {
    for (const [stageKey, list] of Object.entries(campaignsRes.value)) {
      const names = (list ?? []).map((c) => c.name).filter(Boolean)
      if (names.length) activeCampaignsByStage[stageKey] = names
    }
  }

  const bizName =
    bizRes.status === 'fulfilled' && bizRes.value?.data?.name ? bizRes.value.data.name : 'Your restaurant'
  const loc = locRes.status === 'fulfilled' ? locRes.value?.data : null

  return {
    business: { name: bizName, city: loc?.city ?? null, state: loc?.state ?? null },
    window,
    stages,
    changes,
    dropOffs,
    reputation,
    topSearches,
    activeCampaignsByStage,
    sources,
  }
}
