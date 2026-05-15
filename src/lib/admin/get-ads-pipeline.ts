'use server'

/**
 * Cross-client ad campaign pipeline for /admin/ads.
 *
 * Unlike /work/boosts which is RLS-scoped to a single buyer's book,
 * this returns EVERY campaign across EVERY client so Apnosh admins
 * can run portfolio-level analysis: total monthly spend, campaigns
 * in each stage, alerts on stuck campaigns, etc.
 *
 * Required for 10K-restaurant scale because per-buyer workqueues
 * can't surface portfolio risks (e.g., "this AM has 50 campaigns
 * stuck in pending because they're overwhelmed").
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type CampaignStatus =
  | 'pending' | 'launching' | 'active' | 'paused' | 'completed' | 'cancelled'

export type CampaignType =
  | 'post_boost' | 'reels_boost' | 'foot_traffic'
  | 'reservations' | 'lead_gen' | 'awareness'

export interface PipelineCampaign {
  id: string
  clientId: string
  clientName: string
  clientSlug: string | null
  campaignType: CampaignType
  status: CampaignStatus
  platform: string
  budgetTotal: number
  days: number
  spend: number
  reach: number
  clicks: number
  audiencePreset: string | null
  platformCampaignId: string | null
  launchedAt: string | null
  endedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface PipelineSummary {
  /** Number of campaigns in each status. */
  byStatus: Record<CampaignStatus, number>
  /** Number of campaigns of each type, active only. */
  byTypeActive: Record<CampaignType, number>
  /** Total spend across all live + completed campaigns in last 30 days. */
  spendLast30d: number
  /** Total budgeted (not yet fully spent) across active campaigns. */
  budgetActive: number
  /** Campaigns sitting in "pending" for > 3 days -- stuck signal. */
  stuckPendingCount: number
  /** Most recent metrics-sync timestamp across all live campaigns. */
  lastMetricsSyncAt: string | null
}

interface RawRow {
  id: string
  client_id: string
  campaign_type: CampaignType
  status: CampaignStatus
  platform: string
  budget_total: number | string
  days: number
  spend: number | string
  reach: number
  clicks: number
  audience_preset: string | null
  platform_campaign_id: string | null
  launched_at: string | null
  ended_at: string | null
  last_metrics_sync_at: string | null
  created_at: string
  updated_at: string
  clients?: { name: string | null; slug: string | null } | { name: string | null; slug: string | null }[] | null
}

async function requireAdmin(): Promise<void> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data } = await admin
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()
  if (data?.role !== 'admin' && data?.role !== 'super_admin') {
    throw new Error('Admin only')
  }
}

export async function getAdsPipeline(): Promise<{
  campaigns: PipelineCampaign[]
  summary: PipelineSummary
}> {
  await requireAdmin()
  const admin = createAdminClient()

  const { data } = await admin
    .from('ad_campaigns')
    .select(`
      id, client_id, campaign_type, status, platform,
      budget_total, days, spend, reach, clicks,
      audience_preset, platform_campaign_id,
      launched_at, ended_at, last_metrics_sync_at,
      created_at, updated_at,
      clients(name, slug)
    `)
    .order('created_at', { ascending: false })
    .limit(500)

  const raw = (data ?? []) as unknown as RawRow[]

  const campaigns: PipelineCampaign[] = raw.map(r => {
    const clientRow = Array.isArray(r.clients) ? r.clients[0] : r.clients
    return {
      id: r.id,
      clientId: r.client_id,
      clientName: clientRow?.name ?? 'Unknown',
      clientSlug: clientRow?.slug ?? null,
      campaignType: r.campaign_type,
      status: r.status,
      platform: r.platform,
      budgetTotal: Number(r.budget_total ?? 0),
      days: r.days,
      spend: Number(r.spend ?? 0),
      reach: Number(r.reach ?? 0),
      clicks: Number(r.clicks ?? 0),
      audiencePreset: r.audience_preset,
      platformCampaignId: r.platform_campaign_id,
      launchedAt: r.launched_at,
      endedAt: r.ended_at,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }
  })

  // Summary
  const now = Date.now()
  const thirtyAgo = now - 30 * 86_400_000
  const threeDaysAgo = now - 3 * 86_400_000

  const byStatus: Record<CampaignStatus, number> = {
    pending: 0, launching: 0, active: 0, paused: 0, completed: 0, cancelled: 0,
  }
  const byTypeActive: Record<CampaignType, number> = {
    post_boost: 0, reels_boost: 0, foot_traffic: 0, reservations: 0, lead_gen: 0, awareness: 0,
  }
  let spendLast30d = 0
  let budgetActive = 0
  let stuckPendingCount = 0
  let lastSyncMs = 0

  for (const c of campaigns) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1
    if (c.status === 'active' || c.status === 'launching' || c.status === 'paused') {
      byTypeActive[c.campaignType] = (byTypeActive[c.campaignType] ?? 0) + 1
      budgetActive += c.budgetTotal
    }
    if (c.status === 'pending') {
      if (new Date(c.createdAt).getTime() < threeDaysAgo) stuckPendingCount += 1
    }
    // Spend rolled up over last 30 days (campaigns that launched in window or are still running).
    const launched = c.launchedAt ? new Date(c.launchedAt).getTime() : 0
    if (launched > thirtyAgo && c.spend > 0) {
      spendLast30d += c.spend
    }
    if (c.launchedAt) {
      const raw = campaignsFindMetricsSync(c, data ?? [])
      const t = raw ? new Date(raw).getTime() : 0
      if (t > lastSyncMs) lastSyncMs = t
    }
  }

  return {
    campaigns,
    summary: {
      byStatus,
      byTypeActive,
      spendLast30d,
      budgetActive,
      stuckPendingCount,
      lastMetricsSyncAt: lastSyncMs > 0 ? new Date(lastSyncMs).toISOString() : null,
    },
  }
}

function campaignsFindMetricsSync(c: PipelineCampaign, raw: unknown[]): string | null {
  const row = (raw as Array<{ id: string; last_metrics_sync_at: string | null }>).find(r => r.id === c.id)
  return row?.last_metrics_sync_at ?? null
}
