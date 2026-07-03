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
import { clicksByDraft } from '@/lib/publish/tracked-link'
import { campaignChannelLift } from './window-lift'
import { computeVerdict, type PieceOutcome, type CampaignOutcomes, type WindowProof } from './verdict'

export type { PieceOutcome, CampaignOutcomes, WindowProof } from './verdict'

/** A short owner-facing label for a piece, from its caption (never the raw key). */
function pieceLabel(caption: unknown): string | null {
  const c = typeof caption === 'string' ? caption.trim() : ''
  if (!c) return null
  return c.length > 48 ? `${c.slice(0, 47)}…` : c
}

/** The piece's production stage from its real content_drafts.status — mirrors computeProgress's
 *  buckets (server.ts) so the per-piece card and the progress spine never disagree. Unknown/empty
 *  status falls to 'making', never 'posted'. */
function lifecycleOf(status: string): 'making' | 'scheduled' | 'posted' {
  if (status === 'published') return 'posted'
  if (status === 'scheduled' || status === 'approved') return 'scheduled'
  return 'making'
}

export async function getCampaignOutcomes(campaignId: string): Promise<CampaignOutcomes> {
  const admin = createAdminClient()
  const { data: drafts } = await admin
    .from('content_drafts')
    .select('id, campaign_piece_key, published_post_id, caption, status, published_at')
    .eq('campaign_id', campaignId)

  // Exclude terminal drafts (rejected/failed/archived) so a killed piece is never counted as a
  // result — mirrors computeProgress's DEAD set so this card and the progress spine agree.
  const DEAD = new Set(['rejected', 'failed', 'archived'])
  const list = (drafts ?? []).filter((d) => !DEAD.has((d.status as string) ?? ''))
  const stampedIds = list.map((d) => d.published_post_id).filter(Boolean) as string[]

  // Fallback join: if the forward stamp (content_drafts.published_post_id) failed at publish
  // time, no automated path ever repairs it — but the publish stub carries source_draft_id, so
  // for published drafts missing the stamp we recover the link from the social_posts side.
  // The stamped id stays the primary join.
  const unstamped = list.filter((d) => d.published_at && !d.published_post_id).map((d) => d.id as string)
  const fallbackByDraft = new Map<string, string>()
  if (unstamped.length) {
    const { data: stubs } = await admin.from('social_posts').select('id, source_draft_id').in('source_draft_id', unstamped)
    for (const s of stubs ?? []) {
      const src = s.source_draft_id as string | null
      if (src && !fallbackByDraft.has(src)) fallbackByDraft.set(src, s.id as string)
    }
  }

  const postIds = [...stampedIds, ...fallbackByDraft.values()]
  const metrics = new Map<string, { reach: number | null; interactions: number | null; permalink: string | null }>()
  if (postIds.length) {
    const { data: posts } = await admin.from('social_posts').select('id, reach, total_interactions, permalink').in('id', postIds)
    for (const p of posts ?? []) metrics.set(p.id as string, { reach: (p.reach as number) ?? null, interactions: (p.total_interactions as number) ?? null, permalink: (p.permalink as string) ?? null })
  }

  // First-party link taps per piece (tracked_links minted at publish). Fails soft
  // to an empty map pre-196; a piece with no tracked link stays clicks: null.
  const clickMap = await clicksByDraft(admin, list.map((d) => d.id as string)).catch(() => new Map<string, number>())

  let sumReach = 0, sumInteractions = 0, liveCount = 0
  const pieces: PieceOutcome[] = list.map((d) => {
    const postId = (d.published_post_id as string | null) ?? fallbackByDraft.get(d.id as string) ?? null
    const post = postId ? metrics.get(postId) : undefined
    const reach = post?.reach ?? null
    const interactions = post?.interactions ?? null
    const hasData = !!postId && (reach != null || interactions != null)
    const er = hasData && reach ? (interactions ?? 0) / reach : null
    if (hasData) { sumReach += reach ?? 0; sumInteractions += interactions ?? 0; liveCount++ }
    return {
      draftId: d.id as string,
      pieceKey: (d.campaign_piece_key as string) ?? null,
      label: pieceLabel(d.caption),
      state: hasData ? 'live' : 'gathering',
      reach, interactions,
      link: post?.permalink ?? null,             // the real post URL when the platform gives one; never synthesized
      lifecycle: lifecycleOf((d.status as string) ?? ''),
      publishedAtISO: (d.published_at as string) ?? null,   // the real posted date, per piece
      clicks: clickMap.get(d.id as string) ?? null,         // first-party link taps; null = no tracked link

      readout: computeVerdict({ hasData, attribution: hasData ? 'per_post' : 'none', reach, interactions, engagementRate: er }),
    }
  })

  const rollupEr = sumReach > 0 ? sumInteractions / sumReach : null
  let rollup = computeVerdict({ hasData: liveCount > 0, attribution: liveCount > 0 ? 'per_post' : 'none', reach: sumReach, interactions: sumInteractions, engagementRate: rollupEr })
  let anyData = liveCount > 0
  let proof: WindowProof | null = null

  // No per-post reading on any piece (e.g. a GBP-led campaign, whose posts never get a
  // social_posts row)? Fall back to a CAMPAIGN-LEVEL channel lift so the owner sees an honest
  // "since this campaign started" signal instead of gathering forever. Per-piece rows stay
  // 'gathering' — this is a campaign-scoped correlation, never attributed to one piece.
  //
  // Gated on evidence of output: the lift is a client-level ambient signal, so a campaign
  // that never published anything must NOT wear it as "what happened" — without this gate,
  // every shipped-but-unproduced campaign would show the client's background lift for work
  // that never went out. At least one published draft keeps the fallback available.
  const anyPublished = list.some((d) => d.published_at)
  if (!anyData && anyPublished) {
    const campaign = await getCampaign(campaignId).catch(() => null)
    const anchor = (campaign?.shippedAt ?? '').slice(0, 10)
    if (campaign && anchor) {
      const cl = await campaignChannelLift(campaign.clientId, anchor, campaign.draft.brief?.channelIds ?? [])
      if (cl.hasData) {
        rollup = computeVerdict({ hasData: true, attribution: 'window_lift', metricLabel: cl.metricLabel, metricDelta: cl.metricDelta })
        // Concrete before/after for the Done hero — window_lift path only (per_post has no baseline).
        proof = { metricLabel: cl.metricLabel, before: cl.before, after: cl.after, days: cl.days }
        anyData = true
      }
    }
  }

  return { pieces, anyData, rollup, proof }
}
