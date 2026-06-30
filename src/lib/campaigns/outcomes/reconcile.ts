import 'server-only'
/**
 * Outcome snapshot writer (Phase 3, first increment — the per_post gold path).
 *
 * For a shipped campaign, reads each piece (its content_draft) joined to the real
 * platform post it published as (content_drafts.published_post_id → social_posts),
 * and writes one campaign_outcomes row per piece plus a campaign rollup. A piece
 * with no published post / no metrics is written has_data=false — an honest "still
 * gathering", never a fabricated number.
 *
 * Idempotent per day: clears the campaign's readings for today, then writes fresh,
 * so re-running on each piece-publish (or a future daily poll) never duplicates.
 *
 * window_lift attribution, the daily poll, and the PlanningHistory wiring are later,
 * strictly-additive increments. service_id is left null until the learning hook lands.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { planCampaignPieces } from '@/lib/campaigns/work-orders-core'
import { CHANNELS } from '@/lib/campaigns/data/campaign-templates'
import { computeVerdict } from './verdict'

const todayISO = (): string => new Date().toISOString().slice(0, 10)

export async function snapshotCampaign(campaignId: string, source: 'publish' | 'poll' = 'publish'): Promise<{ written: number }> {
  if (!campaignId) return { written: 0 }
  const admin = createAdminClient()

  // The campaign's pieces (content_drafts materialized from its beats).
  const { data: drafts } = await admin
    .from('content_drafts')
    .select('id, client_id, campaign_piece_key, published_post_id')
    .eq('campaign_id', campaignId)
  if (!drafts?.length) return { written: 0 }

  // Their real post metrics — one fetch by id (robust whether or not an FK embed exists).
  const postIds = drafts.map((d) => d.published_post_id).filter(Boolean) as string[]
  const metrics = new Map<string, { reach: number | null; interactions: number | null }>()
  if (postIds.length) {
    const { data: posts } = await admin.from('social_posts').select('id, reach, total_interactions').in('id', postIds)
    for (const p of posts ?? []) metrics.set(p.id as string, { reach: (p.reach as number) ?? null, interactions: (p.total_interactions as number) ?? null })
  }

  const asOf = todayISO()

  // Resolve each piece's catalog serviceId via the CANONICAL plan pieces — keyed by the
  // SAME stable key the drafts carry (campaign_piece_key, e.g. "Video:0"), then
  // channel → CHANNELS.serviceId. (Brief beats key differently — by beat id — so they'd
  // never match the draft keys, which is why this must go through planCampaignPieces.)
  const serviceByKey = new Map<string, string>()
  const campaign = await getCampaign(campaignId).catch(() => null)
  if (campaign) {
    for (const p of planCampaignPieces(campaign, campaign.shippedAt ?? asOf)) {
      const svc = p.channel ? CHANNELS[p.channel]?.serviceId : undefined
      if (svc) serviceByKey.set(p.key, svc)
    }
  }
  const serviceFor = (pieceKey: string | null): string | null => (pieceKey ? serviceByKey.get(pieceKey) ?? null : null)

  const clientId = (drafts[0].client_id as string) ?? null
  let sumReach = 0, sumInteractions = 0, liveCount = 0

  const pieceRows = drafts.map((d) => {
    const post = d.published_post_id ? metrics.get(d.published_post_id as string) : undefined
    const reach = post?.reach ?? null
    const interactions = post?.interactions ?? null
    const hasData = !!d.published_post_id && (reach != null || interactions != null)
    const er = hasData && reach ? (interactions ?? 0) / reach : null
    if (hasData) { sumReach += reach ?? 0; sumInteractions += interactions ?? 0; liveCount++ }
    const v = computeVerdict({ hasData, attribution: hasData ? 'per_post' : 'none', reach, interactions, engagementRate: er })
    return {
      client_id: d.client_id, campaign_id: campaignId, scope: 'piece',
      content_draft_id: d.id, campaign_piece_key: d.campaign_piece_key ?? null, service_id: serviceFor(d.campaign_piece_key ?? null),
      published_post_id: d.published_post_id ?? null,
      as_of_date: asOf, attribution_method: hasData ? 'per_post' : 'none',
      metric_label: 'reach', reach, impressions: null, interactions, engagement_rate: er,
      // metric_delta is reserved for a SIGNED window-lift (a later increment); the engagement
      // rate lives in engagement_rate. Leaving it null keeps the learning substrate honest.
      metric_delta: null, verdict: v.verdict, verdict_reason: v.plain,
      has_data: hasData, source,
    }
  })

  // Campaign rollup: the blended per_post reading across pieces that have data.
  const rollupEr = sumReach > 0 ? sumInteractions / sumReach : null
  const rollupHas = liveCount > 0
  const rv = computeVerdict({ hasData: rollupHas, attribution: rollupHas ? 'per_post' : 'none', reach: sumReach, interactions: sumInteractions, engagementRate: rollupEr })
  const rollup = {
    client_id: clientId, campaign_id: campaignId, scope: 'campaign',
    content_draft_id: null, campaign_piece_key: null, service_id: null, published_post_id: null,
    as_of_date: asOf, attribution_method: rollupHas ? 'per_post' : 'none',
    metric_label: 'reach', reach: rollupHas ? sumReach : null, impressions: null,
    interactions: rollupHas ? sumInteractions : null, engagement_rate: rollupEr,
    metric_delta: null, verdict: rv.verdict, verdict_reason: rv.plain,
    has_data: rollupHas, source,
  }

  // Idempotent per day: clear today's readings for this campaign, then write fresh.
  await admin.from('campaign_outcomes').delete().eq('campaign_id', campaignId).eq('as_of_date', asOf)
  const rows = [...pieceRows, rollup]
  const { error } = await admin.from('campaign_outcomes').insert(rows)
  if (error) throw new Error(`snapshotCampaign: ${error.message}`)
  return { written: rows.length }
}

/** Daily poll: re-snapshot recently-shipped campaigns so each piece's reading builds a
 *  trajectory over time (the trend the verdict's stability gate needs). Best-effort per
 *  campaign — one failure never stops the sweep. Source-stamped 'poll'. */
export async function pollOutcomes(): Promise<{ campaigns: number; written: number; truncated: boolean }> {
  const admin = createAdminClient()
  const cutoff = new Date(Date.now() - 60 * 86_400_000).toISOString()
  const { data: camps, error } = await admin
    .from('campaigns')
    .select('id')
    .eq('status', 'shipped')
    .gte('shipped_at', cutoff)
    .order('shipped_at', { ascending: false })
    .limit(150)
  if (error) throw new Error(`pollOutcomes: ${error.message}`)  // a failed read must not report ok
  const list = camps ?? []
  const deadline = Date.now() + 50_000  // stop cleanly before the 60s cron budget (deterministic truncation)
  let written = 0, processed = 0
  for (const c of list) {
    if (Date.now() > deadline) break
    const r = await snapshotCampaign(c.id as string, 'poll').catch(() => ({ written: 0 }))
    written += r.written; processed++
  }
  return { campaigns: processed, written, truncated: processed < list.length }
}
