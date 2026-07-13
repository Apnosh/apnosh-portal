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

/** One source inside a stage, flattened to just what the analyst needs. */
export interface AnalystSource {
  label: string
  provider: string
  value: number | null
  status: string
  /** true when this source's value is part of the stage headline */
  counted: boolean
}

/** One funnel stage, real numbers only. */
export interface AnalystStage {
  stage: number
  label: string
  /** the headline == sum of counted sources, or null when the stage has no data */
  headline: number | null
  unit?: string
  isEmpty: boolean
  note?: string
  sources: AnalystSource[]
}

/** The fall-off between two consecutive stages that both have a real number. */
export interface AnalystDropOff {
  fromStage: number
  fromLabel: string
  fromValue: number
  toStage: number
  toLabel: string
  toValue: number
  /** toValue / fromValue as a percentage (how many made it to the next step) */
  keptPct: number
}

/** Which sources feed the funnel today vs. which are dark (would add signal). */
export interface AnalystSourceSummary {
  connected: string[]
  dark: Array<{ label: string; state: string }>
}

/** The complete grounded brief handed to the analyst. */
export interface AnalystPayload {
  business: { name: string; city: string | null; state: string | null }
  window: InsightsWindow
  stages: AnalystStage[]
  dropOffs: AnalystDropOff[]
  reputation: { rating: number | null; reviewCount: number | null }
  topSearches: Array<{ query: string; impressions: number }>
  activeCampaignsByStage: Record<string, string[]>
  sources: AnalystSourceSummary
}

// ── Pure derivations (no I/O — unit tested) ──────────────────────────────

/**
 * The drop-off between each pair of consecutive stages that BOTH have a real
 * number and where the earlier stage is > 0. Stages with no data (null headline)
 * break the chain — we never invent a fall-off across a gap we can't see.
 */
export function deriveDropOffs(stages: AnalystStage[]): AnalystDropOff[] {
  const out: AnalystDropOff[] = []
  const withData = stages.filter((s) => s.headline != null && !s.isEmpty) as (AnalystStage & { headline: number })[]
  for (let i = 0; i < withData.length - 1; i++) {
    const from = withData[i]
    const to = withData[i + 1]
    // only chain ADJACENT funnel stages (no leap across a hidden stage)
    if (to.stage - from.stage !== 1) continue
    if (from.headline <= 0) continue
    out.push({
      fromStage: from.stage,
      fromLabel: from.label,
      fromValue: from.headline,
      toStage: to.stage,
      toLabel: to.label,
      toValue: to.headline,
      keptPct: Math.round((to.headline / from.headline) * 1000) / 10,
    })
  }
  return out
}

/**
 * Split every source across all stages into "connected" (a real number is
 * flowing) vs "dark" (exists but isn't feeding the funnel — not connected,
 * errored, or no adapter yet). Deduped by label. This is how the analyst knows
 * its own blind spots and can honestly say "I can't see X."
 */
export function summarizeSources(stages: AnalystStage[]): AnalystSourceSummary {
  const connected = new Set<string>()
  const dark = new Map<string, string>()
  for (const st of stages) {
    for (const s of st.sources) {
      const live = (s.status === 'CONNECTED' || s.status === 'MANUAL_ENTRY') && s.value != null
      if (live) {
        connected.add(s.label)
        dark.delete(s.label) // a label that's live anywhere is not dark
      } else if (!connected.has(s.label) && s.status !== 'CONNECTED') {
        dark.set(s.label, s.status)
      }
    }
  }
  return {
    connected: [...connected],
    dark: [...dark.entries()].map(([label, state]) => ({ label, state })),
  }
}

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

  const [stagesRes, campaignsRes, gbpRes, bizRes, locRes] = await Promise.allSettled([
    computeStages(clientId, window),
    getStageCampaigns(clientId),
    getGbpAnalytics(clientId, range),
    admin.from('clients').select('name').eq('id', clientId).maybeSingle(),
    admin.from('client_locations').select('city, state').eq('client_id', clientId).eq('is_primary', true).maybeSingle(),
  ])

  const computed = stagesRes.status === 'fulfilled' ? stagesRes.value : []
  const stages = computed.map(toAnalystStage)
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
    dropOffs,
    reputation,
    topSearches,
    activeCampaignsByStage,
    sources,
  }
}
