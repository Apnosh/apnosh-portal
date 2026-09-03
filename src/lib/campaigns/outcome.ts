/**
 * Campaign outcome — did the Google number a campaign works on move after launch?
 * The two weeks after launch against the two weeks before, on the stage's own metric
 * (Found you = impressions, Interest = website clicks, Actions = directions + calls).
 * Honest by construction: real rows only, both windows must be covered, and the
 * wording everywhere is "what happened", never "because of".
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getStageCampaigns } from '@/lib/dashboard/get-stage-campaigns'

import type { CampaignOutcome, OutcomeState } from '@/lib/campaigns/outcome-view'
export type { CampaignOutcome, OutcomeState } from '@/lib/campaigns/outcome-view'

const STAGE_METRIC: Record<string, { pick: (r: Record<string, unknown>) => number; noun: string; minAbs: number }> = {
  shown: { pick: (r) => Number(r.impressions_total ?? r.search_views) || 0, noun: 'times you showed up on Google', minAbs: 50 },
  engaged: { pick: (r) => Number(r.website_clicks) || 0, noun: 'website clicks from Google', minAbs: 5 },
  moved: { pick: (r) => (Number(r.directions) || 0) + (Number(r.calls) || 0), noun: 'calls and direction taps', minAbs: 5 },
}
const iso = (d: Date) => d.toISOString().slice(0, 10)

/** Outcomes for every launched campaign of a client, keyed by campaign id. Best-effort: {} on failure. */
export async function getCampaignOutcomesBatch(clientId: string, campaigns: { id: string; shippedAt: string | null }[]): Promise<Record<string, CampaignOutcome>> {
  const out: Record<string, CampaignOutcome> = {}
  const withDate = campaigns.filter((c) => c.shippedAt)
  if (!withDate.length) return out
  // the stage each campaign works on (moved beats engaged beats shown when it touches several)
  const stageOf = new Map<string, string>()
  try {
    const stages = await getStageCampaigns(clientId)
    for (const stage of ['moved', 'engaged', 'shown']) for (const c of stages[stage] ?? []) if (!stageOf.has(c.id)) stageOf.set(c.id, stage)
  } catch { /* fall through: unknown stage → shown */ }
  const admin = createAdminClient()
  const earliest = withDate.reduce((m, c) => (c.shippedAt! < m ? c.shippedAt! : m), withDate[0].shippedAt!)
  const start = new Date(earliest); start.setUTCDate(start.getUTCDate() - 15)
  const { data: rows } = await admin
    .from('gbp_metrics')
    .select('date, impressions_total, search_views, website_clicks, directions, calls, location_id')
    .eq('client_id', clientId)
    .gte('date', iso(start))
    .order('date', { ascending: true })
  const real = (rows ?? []).filter((r) => r.location_id !== 'demo-proof')
  const latest = real.length ? String(real[real.length - 1].date) : null
  for (const c of withDate) {
    const stage = stageOf.get(c.id) ?? 'shown'
    const m = STAGE_METRIC[stage] ?? STAGE_METRIC.shown
    const launch = new Date(c.shippedAt!); launch.setUTCHours(0, 0, 0, 0)
    const afterEnd = new Date(launch); afterEnd.setUTCDate(afterEnd.getUTCDate() + 13)
    const beforeStart = new Date(launch); beforeStart.setUTCDate(beforeStart.getUTCDate() - 14)
    if (!latest || real.length < 10) { out[c.id] = { state: 'no_data', stage, noun: m.noun, before: 0, after: 0, pct: null, spark: [], daysIn: 0 }; continue }
    const byDay = new Map<string, number>()
    let before = 0; const bd = new Set<string>()
    for (const r of real) {
      const d = String(r.date); const v = m.pick(r as Record<string, unknown>)
      if (d >= iso(beforeStart) && d < iso(launch)) { before += v; bd.add(d) }
      else if (d >= iso(launch) && d <= iso(afterEnd)) byDay.set(d, (byDay.get(d) ?? 0) + v)
    }
    const spark = [...byDay.keys()].sort().map((d) => byDay.get(d)!)
    const after = spark.reduce((a, b) => a + b, 0)
    const daysIn = byDay.size
    if (iso(afterEnd) > latest || daysIn < 10 || bd.size < 10) { out[c.id] = { state: 'too_soon', stage, noun: m.noun, before, after, pct: null, spark, daysIn }; continue }
    if (before <= 0) { out[c.id] = { state: 'no_data', stage, noun: m.noun, before, after, pct: null, spark, daysIn }; continue }
    const pct = Math.round(((after - before) / before) * 100)
    const diff = after - before
    const state: OutcomeState = diff >= m.minAbs && pct >= 10 ? 'up' : diff <= -m.minAbs && pct <= -10 ? 'down' : 'flat'
    out[c.id] = { state, stage, noun: m.noun, before, after, pct, spark, daysIn }
  }
  return out
}

