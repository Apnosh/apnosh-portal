import 'server-only'
/**
 * Outcome reader for the owner-facing campaign monitor (Phase 3).
 *
 * Reads the CURRENT number live (content_drafts → social_posts) so a piece's reach
 * is never shown stale; the campaign_outcomes ledger is for trajectory + learning
 * (later increments). Every piece resolves to a real number ('live') or an honest
 * 'gathering' state — never a fabricated value.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { getCampaign } from '@/lib/campaigns/server'
import { campaignChannelLift } from './window-lift'
import { computeVerdict, type PieceOutcome, type CampaignOutcomes } from './verdict'

export type { PieceOutcome, CampaignOutcomes } from './verdict'

/** A short owner-facing label for a piece, from its caption (never the raw key). */
function pieceLabel(caption: unknown): string | null {
  const c = typeof caption === 'string' ? caption.trim() : ''
  if (!c) return null
  return c.length > 48 ? `${c.slice(0, 47)}…` : c
}

export async function getCampaignOutcomes(campaignId: string): Promise<CampaignOutcomes> {
  const admin = createAdminClient()
  const { data: drafts } = await admin
    .from('content_drafts')
    .select('id, campaign_piece_key, published_post_id, caption')
    .eq('campaign_id', campaignId)

  const list = drafts ?? []
  const postIds = list.map((d) => d.published_post_id).filter(Boolean) as string[]
  const metrics = new Map<string, { reach: number | null; interactions: number | null }>()
  if (postIds.length) {
    const { data: posts } = await admin.from('social_posts').select('id, reach, total_interactions').in('id', postIds)
    for (const p of posts ?? []) metrics.set(p.id as string, { reach: (p.reach as number) ?? null, interactions: (p.total_interactions as number) ?? null })
  }

  let sumReach = 0, sumInteractions = 0, liveCount = 0
  const pieces: PieceOutcome[] = list.map((d) => {
    const post = d.published_post_id ? metrics.get(d.published_post_id as string) : undefined
    const reach = post?.reach ?? null
    const interactions = post?.interactions ?? null
    const hasData = !!d.published_post_id && (reach != null || interactions != null)
    const er = hasData && reach ? (interactions ?? 0) / reach : null
    if (hasData) { sumReach += reach ?? 0; sumInteractions += interactions ?? 0; liveCount++ }
    return {
      draftId: d.id as string,
      pieceKey: (d.campaign_piece_key as string) ?? null,
      label: pieceLabel(d.caption),
      state: hasData ? 'live' : 'gathering',
      reach, interactions,
      readout: computeVerdict({ hasData, attribution: hasData ? 'per_post' : 'none', reach, interactions, engagementRate: er }),
    }
  })

  const rollupEr = sumReach > 0 ? sumInteractions / sumReach : null
  let rollup = computeVerdict({ hasData: liveCount > 0, attribution: liveCount > 0 ? 'per_post' : 'none', reach: sumReach, interactions: sumInteractions, engagementRate: rollupEr })
  let anyData = liveCount > 0

  // No per-post reading on any piece (e.g. a GBP-led campaign, whose posts never get a
  // social_posts row)? Fall back to a CAMPAIGN-LEVEL channel lift so the owner sees an honest
  // "since this campaign started" signal instead of gathering forever. Per-piece rows stay
  // 'gathering' — this is a campaign-scoped correlation, never attributed to one piece.
  if (!anyData) {
    const campaign = await getCampaign(campaignId).catch(() => null)
    const anchor = (campaign?.shippedAt ?? '').slice(0, 10)
    if (campaign && anchor) {
      const cl = await campaignChannelLift(campaign.clientId, anchor, campaign.draft.brief?.channelIds ?? [])
      if (cl.hasData) {
        rollup = computeVerdict({ hasData: true, attribution: 'window_lift', metricLabel: cl.metricLabel, metricDelta: cl.metricDelta })
        anyData = true
      }
    }
  }

  return { pieces, anyData, rollup }
}
