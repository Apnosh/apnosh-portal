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
  summarizeReviews,
  summarizeSources,
  type AnalystPayload,
  type AnalystStage,
  type ReviewDigest,
  type ReviewRow,
} from './analyst-derive'

const WINDOW_DAYS: Record<string, number> = { '7d': 7, '30d': 30, '90d': 90, '12m': 365 }

/**
 * Real reviews, for the digest the analyst reads.
 *
 * Reads `reviews` only, deliberately. `local_reviews` holds a partly overlapping copy
 * of the same Google reviews (4 of 7 duplicated on the client checked), so merging the
 * two would double-count the very numbers this is supposed to get right.
 *
 * The slice is a YEAR, not the analyst's 30-day window, because sentiment needs volume:
 * the same client has 3 reviews in 30 days but 23 in a year. The digest reports both,
 * so the read can say what people say without implying it all happened last month.
 */
async function loadReviewDigest(clientId: string, window: InsightsWindow): Promise<ReviewDigest | null> {
  try {
    const admin = createAdminClient()
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 400) // a little past a year, so the year slice is complete
    const { data, error } = await admin
      .from('reviews')
      .select('rating, review_text, posted_at, response_text')
      .eq('client_id', clientId)
      .gte('posted_at', since.toISOString())
      .order('posted_at', { ascending: false })
      .limit(500)
    if (error || !data) return null
    const rows: ReviewRow[] = (data as Record<string, unknown>[]).map((r) => ({
      rating: typeof r.rating === 'number' ? r.rating : null,
      text: typeof r.review_text === 'string' ? r.review_text : null,
      postedAt: typeof r.posted_at === 'string' ? r.posted_at : null,
      answered: typeof r.response_text === 'string' && r.response_text.trim().length > 0,
    }))
    return summarizeReviews(rows, { windowDays: WINDOW_DAYS[window] ?? 30 })
  } catch {
    return null // best-effort, like everything else here
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

  const [stagesRes, prevStagesRes, reviewsRes, campaignsRes, gbpRes, bizRes, locRes] = await Promise.allSettled([
    computeStages(clientId, window),
    // The same funnel one period earlier. Best-effort like everything else here: if it
    // fails we simply have no comparison, never a wrong one.
    computeStages(clientId, window, 1),
    loadReviewDigest(clientId, window),
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
  const reviews = reviewsRes.status === 'fulfilled' ? reviewsRes.value : null

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
    reviews,
    reputation,
    topSearches,
    activeCampaignsByStage,
    sources,
  }
}
