'use server'

/**
 * Reads of the ad_campaigns table for client-facing screens.
 *
 * Two slices the UI uses:
 *   - Active: pending / launching / active / paused — what the strategist
 *     is currently working on or running.
 *   - Past:   completed / cancelled — historical results.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export type CampaignStatus =
  | 'pending' | 'launching' | 'active' | 'paused' | 'completed' | 'cancelled'

export interface CampaignRow {
  id: string
  clientId: string
  sourcePostId: string | null
  sourceText: string
  sourceMediaUrl: string | null
  sourcePlatforms: string[]
  budgetTotal: number
  days: number
  audiencePreset: string
  status: CampaignStatus
  launchedAt: string | null
  endedAt: string | null
  reach: number
  clicks: number
  spend: number
  footTrafficEst: number | null
  createdAt: string
}

const ACTIVE: CampaignStatus[] = ['pending', 'launching', 'active', 'paused']
const PAST:   CampaignStatus[] = ['completed', 'cancelled']

export async function getActiveCampaigns(clientId: string): Promise<CampaignRow[]> {
  return fetchCampaigns(clientId, ACTIVE, 10)
}

export async function getPastCampaigns(clientId: string, limit = 8): Promise<CampaignRow[]> {
  return fetchCampaigns(clientId, PAST, limit)
}

/**
 * The most recent completed campaign, for the "Last boost result" card on
 * the social hub. Returns null when nothing's completed yet.
 */
export async function getLatestCompletedCampaign(clientId: string): Promise<CampaignRow | null> {
  const rows = await fetchCampaigns(clientId, ['completed'], 1)
  return rows[0] ?? null
}

async function fetchCampaigns(
  clientId: string,
  statuses: CampaignStatus[],
  limit: number,
): Promise<CampaignRow[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('ad_campaigns')
    .select('id, client_id, source_post_id, source_post_snapshot, budget_total, days, audience_preset, status, launched_at, ended_at, reach, clicks, spend, foot_traffic_est, created_at')
    .eq('client_id', clientId)
    .in('status', statuses)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []).map(toRow)
}

function toRow(r: Record<string, unknown>): CampaignRow {
  const snap = (r.source_post_snapshot as Record<string, unknown> | null) ?? {}
  return {
    id: r.id as string,
    clientId: r.client_id as string,
    sourcePostId: (r.source_post_id as string | null) ?? null,
    sourceText: (snap.text as string | null) ?? '',
    sourceMediaUrl: (snap.media_url as string | null) ?? null,
    sourcePlatforms: (snap.platforms as string[] | null) ?? [],
    budgetTotal: Number(r.budget_total ?? 0),
    days: Number(r.days ?? 0),
    audiencePreset: (r.audience_preset as string) ?? 'locals',
    status: r.status as CampaignStatus,
    launchedAt: (r.launched_at as string | null) ?? null,
    endedAt: (r.ended_at as string | null) ?? null,
    reach: Number(r.reach ?? 0),
    clicks: Number(r.clicks ?? 0),
    spend: Number(r.spend ?? 0),
    footTrafficEst: (r.foot_traffic_est as number | null) ?? null,
    createdAt: r.created_at as string,
  }
}
