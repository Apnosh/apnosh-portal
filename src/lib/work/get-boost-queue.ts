/**
 * Paid media buyer's data: pending campaigns to launch, live campaigns
 * to monitor, and organic posts that are doing well but haven't been
 * boosted yet (= the buyer's prospect list).
 *
 * RLS scopes everything to the buyer's assigned book (policies added
 * in migration 112). Admins see everything via has_capability('admin').
 */

import { createClient as createServerClient } from '@/lib/supabase/server'

export type CampaignStatus =
  | 'pending' | 'launching' | 'active' | 'paused' | 'completed' | 'cancelled'

export interface BoostRow {
  id: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  sourcePostId: string | null
  sourceText: string
  sourceMediaUrl: string | null
  sourcePlatforms: string[]
  budgetTotal: number
  days: number
  audiencePreset: string
  audienceNotes: string | null
  status: CampaignStatus
  platform: string
  platformCampaignId: string | null
  launchedAt: string | null
  endedAt: string | null
  reach: number
  clicks: number
  impressions: number
  spend: number
  footTrafficEst: number | null
  lastMetricsSyncAt: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

export interface OpportunityRow {
  postId: string
  clientId: string
  clientName: string | null
  clientSlug: string | null
  platform: string
  permalink: string | null
  caption: string
  mediaUrl: string | null
  postedAt: string | null
  totalInteractions: number
  reach: number
  likes: number
  comments: number
  /** Engagement rate as a 0..1 fraction (interactions / reach), or null if reach=0. */
  engagementRate: number | null
}

const PENDING: CampaignStatus[] = ['pending']
const LIVE: CampaignStatus[] = ['launching', 'active', 'paused']
const HISTORY: CampaignStatus[] = ['completed', 'cancelled']

interface RawCampaign {
  id: string
  client_id: string
  source_post_id: string | null
  source_post_snapshot: Record<string, unknown> | null
  budget_total: number | string
  days: number
  audience_preset: string
  audience_notes: string | null
  status: CampaignStatus
  platform: string
  platform_campaign_id: string | null
  launched_at: string | null
  ended_at: string | null
  reach: number
  clicks: number
  impressions: number
  spend: number | string
  foot_traffic_est: number | null
  last_metrics_sync_at: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

function toRow(r: RawCampaign, clientMap: Map<string, { name: string | null; slug: string | null }>): BoostRow {
  const snap = (r.source_post_snapshot ?? {}) as { text?: string; media_url?: string | null; platforms?: string[] }
  const c = clientMap.get(r.client_id) ?? { name: null, slug: null }
  return {
    id: r.id,
    clientId: r.client_id,
    clientName: c.name,
    clientSlug: c.slug,
    sourcePostId: r.source_post_id,
    sourceText: snap.text ?? '',
    sourceMediaUrl: snap.media_url ?? null,
    sourcePlatforms: Array.isArray(snap.platforms) ? snap.platforms : [],
    budgetTotal: Number(r.budget_total ?? 0),
    days: Number(r.days ?? 0),
    audiencePreset: r.audience_preset,
    audienceNotes: r.audience_notes,
    status: r.status,
    platform: r.platform,
    platformCampaignId: r.platform_campaign_id,
    launchedAt: r.launched_at,
    endedAt: r.ended_at,
    reach: Number(r.reach ?? 0),
    clicks: Number(r.clicks ?? 0),
    impressions: Number(r.impressions ?? 0),
    spend: Number(r.spend ?? 0),
    footTrafficEst: r.foot_traffic_est,
    lastMetricsSyncAt: r.last_metrics_sync_at,
    notes: r.notes,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export interface BoostQueue {
  pending: BoostRow[]
  live: BoostRow[]
  history: BoostRow[]
  opportunities: OpportunityRow[]
}

const SELECT = 'id, client_id, source_post_id, source_post_snapshot, budget_total, days, audience_preset, audience_notes, status, platform, platform_campaign_id, launched_at, ended_at, reach, clicks, impressions, spend, foot_traffic_est, last_metrics_sync_at, notes, created_at, updated_at'

export async function getBoostQueue(): Promise<BoostQueue> {
  const supabase = await createServerClient()

  const [pendingRes, liveRes, historyRes] = await Promise.all([
    supabase.from('ad_campaigns').select(SELECT).in('status', PENDING).order('created_at', { ascending: false }).limit(50),
    supabase.from('ad_campaigns').select(SELECT).in('status', LIVE).order('launched_at', { ascending: false, nullsFirst: true }).limit(50),
    supabase.from('ad_campaigns').select(SELECT).in('status', HISTORY).order('ended_at', { ascending: false, nullsFirst: false }).limit(20),
  ])

  const all = [
    ...(pendingRes.data ?? []),
    ...(liveRes.data ?? []),
    ...(historyRes.data ?? []),
  ] as RawCampaign[]

  const clientIds = Array.from(new Set(all.map(c => c.client_id)))
  const clientMap = new Map<string, { name: string | null; slug: string | null }>()
  if (clientIds.length > 0) {
    const { data: clients } = await supabase.from('clients').select('id, name, slug').in('id', clientIds)
    for (const c of clients ?? []) {
      clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
  }

  // Opportunities: top organic posts (last 60 days) not already boosted.
  // Sorted by total_interactions desc, capped per client to avoid one
  // breakout post hogging the whole list.
  const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()
  const { data: rawPosts } = await supabase
    .from('social_posts')
    .select('id, client_id, platform, permalink, caption, media_url, posted_at, total_interactions, reach, likes, comments')
    .gte('posted_at', sixtyDaysAgo)
    .order('total_interactions', { ascending: false })
    .limit(120)

  const boostedPostIds = new Set(all.map(c => c.source_post_id).filter((x): x is string => !!x))
  const perClientCap = 3
  const perClientCount = new Map<string, number>()
  const opps: OpportunityRow[] = []
  for (const p of (rawPosts ?? []) as Array<Record<string, unknown>>) {
    const id = p.id as string
    const clientId = p.client_id as string
    if (boostedPostIds.has(id)) continue
    const used = perClientCount.get(clientId) ?? 0
    if (used >= perClientCap) continue
    if (!clientMap.has(clientId)) {
      // ensure we have client metadata for opportunity rows too
      const { data: c } = await supabase.from('clients').select('id, name, slug').eq('id', clientId).maybeSingle()
      if (c) clientMap.set(c.id as string, { name: (c.name as string) ?? null, slug: (c.slug as string) ?? null })
    }
    const reachNum = Number(p.reach ?? 0)
    const intNum = Number(p.total_interactions ?? 0)
    const c = clientMap.get(clientId) ?? { name: null, slug: null }
    opps.push({
      postId: id,
      clientId,
      clientName: c.name,
      clientSlug: c.slug,
      platform: (p.platform as string) ?? 'instagram',
      permalink: (p.permalink as string) ?? null,
      caption: (p.caption as string) ?? '',
      mediaUrl: (p.media_url as string) ?? null,
      postedAt: (p.posted_at as string) ?? null,
      totalInteractions: intNum,
      reach: reachNum,
      likes: Number(p.likes ?? 0),
      comments: Number(p.comments ?? 0),
      engagementRate: reachNum > 0 ? intNum / reachNum : null,
    })
    perClientCount.set(clientId, used + 1)
    if (opps.length >= 30) break
  }

  return {
    pending: ((pendingRes.data ?? []) as RawCampaign[]).map(r => toRow(r, clientMap)),
    live: ((liveRes.data ?? []) as RawCampaign[]).map(r => toRow(r, clientMap)),
    history: ((historyRes.data ?? []) as RawCampaign[]).map(r => toRow(r, clientMap)),
    opportunities: opps,
  }
}
