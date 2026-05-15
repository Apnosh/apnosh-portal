'use server'

/**
 * Server actions for moving ad campaigns through the pipeline.
 *
 * Strategists use these from the /admin/ads cards without having to
 * navigate to a per-campaign edit page. Each action enforces the
 * legal state transition + captures the minimum data the next stage
 * requires (e.g., Meta campaign ID when going live).
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { CampaignStatus } from '@/lib/admin/get-ads-pipeline'

/* Legal forward transitions. Going backward (e.g., active -> pending)
   is never allowed via the UI; cancellation is the only "undo". */
const NEXT: Partial<Record<CampaignStatus, CampaignStatus>> = {
  pending:   'launching',
  launching: 'active',
  active:    'completed',
  paused:    'active',
}

async function requireAdmin(): Promise<string> {
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
  return user.id
}

export type AdvanceResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Move a campaign one step forward in the pipeline.
 *
 * Transitions:
 *   pending   -> launching   (strategist picks up the request)
 *   launching -> active      (ad is live; requires Meta campaign ID)
 *   active    -> completed   (campaign window ended)
 *   paused    -> active      (resume a paused campaign)
 */
export async function advanceCampaign(input: {
  campaignId: string
  /** Required only when going from launching -> active. */
  platformCampaignId?: string
}): Promise<AdvanceResult> {
  const userId = await requireAdmin()
  const admin = createAdminClient()

  const { data: row } = await admin
    .from('ad_campaigns')
    .select('id, status, platform_campaign_id')
    .eq('id', input.campaignId)
    .maybeSingle()

  if (!row) return { success: false, error: 'Campaign not found' }

  const current = row.status as CampaignStatus
  const next = NEXT[current]
  if (!next) {
    return { success: false, error: `Can't advance from ${current}` }
  }

  const patch: Record<string, unknown> = {
    status: next,
    updated_at: new Date().toISOString(),
  }

  if (current === 'pending') {
    patch.approved_by = userId
  }
  if (next === 'active') {
    // Require a Meta campaign ID either passed in or already on file.
    const platformId = input.platformCampaignId?.trim() || row.platform_campaign_id
    if (!platformId) {
      return { success: false, error: 'Meta campaign ID required before going live.' }
    }
    patch.platform_campaign_id = platformId
    if (current === 'launching') patch.launched_at = new Date().toISOString()
  }
  if (next === 'completed') {
    patch.ended_at = new Date().toISOString()
  }

  const { error } = await admin
    .from('ad_campaigns')
    .update(patch)
    .eq('id', input.campaignId)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/ads')
  return { success: true }
}

/**
 * Pause an active campaign without ending it.
 */
export async function pauseCampaign(campaignId: string): Promise<AdvanceResult> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('ad_campaigns')
    .select('status')
    .eq('id', campaignId)
    .maybeSingle()
  if (!row) return { success: false, error: 'Campaign not found' }
  if (row.status !== 'active') {
    return { success: false, error: 'Only active campaigns can be paused.' }
  }
  const { error } = await admin
    .from('ad_campaigns')
    .update({ status: 'paused', updated_at: new Date().toISOString() })
    .eq('id', campaignId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/ads')
  return { success: true }
}

/**
 * Cancel a campaign at any stage prior to completion. Once active,
 * cancellation is permanent and the strategist should also stop the
 * campaign inside Meta Ads Manager.
 */
export async function cancelCampaign(campaignId: string, reason?: string): Promise<AdvanceResult> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data: row } = await admin
    .from('ad_campaigns')
    .select('status, notes')
    .eq('id', campaignId)
    .maybeSingle()
  if (!row) return { success: false, error: 'Campaign not found' }
  if (row.status === 'completed' || row.status === 'cancelled') {
    return { success: false, error: 'Campaign is already in a terminal state.' }
  }
  const notes = reason
    ? `${row.notes ? row.notes + '\n\n' : ''}Cancelled: ${reason}`
    : row.notes
  const { error } = await admin
    .from('ad_campaigns')
    .update({
      status: 'cancelled',
      ended_at: new Date().toISOString(),
      notes,
      updated_at: new Date().toISOString(),
    })
    .eq('id', campaignId)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/ads')
  return { success: true }
}
