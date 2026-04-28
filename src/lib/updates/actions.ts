'use server'

/**
 * Server actions for the unified updates system.
 *
 * Lifecycle:
 *   1. createUpdate() -- admin/client creates a draft update
 *   2. publishUpdate() -- triggers fanout to each target platform
 *   3. fanoutUpdate() (internal) -- runs the per-platform writes
 *   4. retryFanout() -- manual retry of failed fanouts
 *
 * The actual platform write logic lives in src/lib/updates/fanout/*.ts
 * (one file per target platform). This file orchestrates.
 */

import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import { revalidatePath } from 'next/cache'
import type {
  UpdateType, UpdatePayload, UpdateRecord, UpdateFanoutRecord,
  FanoutTarget, HoursPayload, WeeklyHours, SpecialHoursEntry, ClosurePayload,
} from './types'
import { DEFAULT_TARGETS } from './types'
import { fanoutToGbp } from './fanout/gbp'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminDb = SupabaseClient<any, 'public', any>

function adminDb(): AdminDb {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  ) as AdminDb
}

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }
  const { data: profile } = await supabase
    .from('profiles').select('role').eq('id', user.id).maybeSingle()
  if (!profile || !['admin', 'super_admin'].includes(profile.role)) {
    return { ok: false, error: 'Admin access required' }
  }
  return { ok: true, userId: user.id }
}

// ───────────────────────────────────────────────────────────────
// createUpdate -- record an update in draft state
// ───────────────────────────────────────────────────────────────

export async function createUpdate(args: {
  clientId: string
  locationId?: string | null
  type: UpdateType
  payload: UpdatePayload['data']
  targets?: FanoutTarget[]
  scheduledFor?: string | null
  summary?: string
  approvalRequired?: boolean
}): Promise<
  { success: true; data: { id: string } } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const targets = args.targets ?? DEFAULT_TARGETS[args.type]

  const db = adminDb()
  const { data, error } = await db
    .from('client_updates')
    .insert({
      client_id: args.clientId,
      location_id: args.locationId ?? null,
      type: args.type,
      payload: args.payload,
      targets,
      scheduled_for: args.scheduledFor ?? null,
      summary: args.summary ?? null,
      approval_required: args.approvalRequired ?? false,
      created_by: auth.userId,
      status: 'draft',
    })
    .select('id')
    .single()

  if (error) return { success: false, error: error.message }

  // Pre-create fanout rows for every target so we can show "pending" UI immediately
  if (targets.length > 0) {
    await db.from('client_update_fanouts').insert(
      targets.map(target => ({
        update_id: data.id as string,
        target,
        status: 'pending',
      })),
    )
  }

  revalidatePath(`/admin/clients/${args.clientId}`)
  return { success: true, data: { id: data.id as string } }
}

// ───────────────────────────────────────────────────────────────
// publishUpdate -- trigger fanout for an existing update
// ───────────────────────────────────────────────────────────────

export async function publishUpdate(updateId: string): Promise<
  | { success: true; data: { fanoutResults: { target: FanoutTarget; status: string; error?: string }[] } }
  | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()

  // 1. Load the update + fanout rows
  const { data: update, error: updErr } = await db
    .from('client_updates').select('*').eq('id', updateId).maybeSingle()
  if (updErr || !update) return { success: false, error: updErr?.message ?? 'Update not found' }

  if (update.status === 'published') {
    return { success: false, error: 'Update is already published' }
  }
  if (update.approval_required && !update.approved_at) {
    return { success: false, error: 'Update requires approval before publishing' }
  }

  // Mark the update as publishing
  await db.from('client_updates').update({ status: 'publishing' }).eq('id', updateId)

  // 2. Apply source-of-truth change first (e.g. update gbp_locations.hours)
  // This means the canonical state changes BEFORE we try to push to platforms.
  // If platforms fail, manual retry uses the canonical state.
  if (update.type === 'hours') {
    const stResult = await applyHoursToSourceOfTruth(update)
    if (!stResult.success) {
      await db.from('client_updates').update({ status: 'failed' }).eq('id', updateId)
      return { success: false, error: stResult.error }
    }
  } else if (update.type === 'closure') {
    const stResult = await applyClosureToSourceOfTruth(update)
    if (!stResult.success) {
      await db.from('client_updates').update({ status: 'failed' }).eq('id', updateId)
      return { success: false, error: stResult.error }
    }
  }
  // menu_item, promotion, event, asset, info: no source-of-truth update needed
  // (these are announcements; future menu_items table will be the SoT for menu)

  // 3. Fanout to each target platform in parallel
  const targets = (update.targets ?? []) as FanoutTarget[]
  const fanoutResults = await Promise.all(
    targets.map(target => runFanout(updateId, target, update)),
  )

  // 4. Determine final status based on fanout results
  const allSucceeded = fanoutResults.every(r => r.status === 'success' || r.status === 'skipped')
  const anyFailed = fanoutResults.some(r => r.status === 'failed')
  const finalStatus = allSucceeded ? 'published' : anyFailed ? 'failed' : 'publishing'

  await db.from('client_updates').update({
    status: finalStatus,
    published_at: allSucceeded ? new Date().toISOString() : null,
  }).eq('id', updateId)

  revalidatePath(`/admin/clients/${update.client_id}`)
  return {
    success: true,
    data: {
      fanoutResults: fanoutResults.map(r => ({
        target: r.target,
        status: r.status,
        error: r.error,
      })),
    },
  }
}

// ───────────────────────────────────────────────────────────────
// Source-of-truth writes (per type)
// ───────────────────────────────────────────────────────────────

async function applyHoursToSourceOfTruth(
  update: { id: string; location_id: string | null; client_id: string; payload: HoursPayload },
): Promise<{ success: true } | { success: false; error: string }> {
  const db = adminDb()
  const payload = update.payload

  // Resolve which locations this update applies to
  let locationIds: string[]
  if (update.location_id) {
    locationIds = [update.location_id]
  } else {
    const { data: locs } = await db
      .from('gbp_locations')
      .select('id')
      .eq('client_id', update.client_id)
      .eq('status', 'assigned')
    locationIds = (locs ?? []).map(l => l.id as string)
  }

  if (locationIds.length === 0) {
    return { success: false, error: 'No locations to update' }
  }

  // Apply per scope
  if (payload.scope === 'regular' && payload.weekly) {
    const { error } = await db
      .from('gbp_locations')
      .update({ hours: payload.weekly })
      .in('id', locationIds)
    if (error) return { success: false, error: error.message }
  } else if (payload.scope === 'special' && payload.special) {
    // Merge new special_hours entries into existing array (replace by date)
    for (const locId of locationIds) {
      const { data: loc } = await db
        .from('gbp_locations')
        .select('special_hours')
        .eq('id', locId)
        .maybeSingle()
      const existing = ((loc?.special_hours as SpecialHoursEntry[]) ?? [])
      const incomingDates = new Set(payload.special.map(s => s.date))
      const merged = [
        ...existing.filter(e => !incomingDates.has(e.date)),
        ...payload.special,
      ].sort((a, b) => a.date.localeCompare(b.date))
      const { error } = await db
        .from('gbp_locations')
        .update({ special_hours: merged })
        .eq('id', locId)
      if (error) return { success: false, error: error.message }
    }
  }

  return { success: true }
}

async function applyClosureToSourceOfTruth(
  update: { id: string; location_id: string | null; client_id: string; payload: ClosurePayload },
): Promise<{ success: true } | { success: false; error: string }> {
  const db = adminDb()
  const payload = update.payload

  // Resolve target locations
  let locationIds: string[]
  if (update.location_id) {
    locationIds = [update.location_id]
  } else {
    const { data: locs } = await db
      .from('gbp_locations')
      .select('id')
      .eq('client_id', update.client_id)
      .eq('status', 'assigned')
    locationIds = (locs ?? []).map(l => l.id as string)
  }

  if (locationIds.length === 0) {
    return { success: false, error: 'No locations to close' }
  }

  // Build special_hours entries: one entry per day in the range, all closed
  const startDate = new Date(payload.starts_at)
  const endDate = new Date(payload.ends_at)
  const note = payload.reason || (payload.kind === 'emergency' ? 'Emergency closure' : 'Closed')

  const entries: SpecialHoursEntry[] = []
  // Iterate inclusive range, day by day. UTC to avoid timezone drift.
  const cursor = new Date(Date.UTC(
    startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(),
  ))
  const end = new Date(Date.UTC(
    endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(),
  ))
  while (cursor.getTime() <= end.getTime()) {
    entries.push({
      date: cursor.toISOString().slice(0, 10),
      hours: [], // closed
      note,
    })
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  }

  // Merge into each location's special_hours, replacing any existing entries
  // for the same dates.
  for (const locId of locationIds) {
    const { data: loc } = await db
      .from('gbp_locations')
      .select('special_hours')
      .eq('id', locId)
      .maybeSingle()
    const existing = ((loc?.special_hours as SpecialHoursEntry[]) ?? [])
    const incomingDates = new Set(entries.map(e => e.date))
    const merged = [
      ...existing.filter(e => !incomingDates.has(e.date)),
      ...entries,
    ].sort((a, b) => a.date.localeCompare(b.date))
    const { error } = await db
      .from('gbp_locations')
      .update({ special_hours: merged })
      .eq('id', locId)
    if (error) return { success: false, error: error.message }
  }

  return { success: true }
}

// ───────────────────────────────────────────────────────────────
// Website fanout -- Apnosh Sites reads source-of-truth, so we just
// trigger ISR revalidation to bust the page cache.
// ───────────────────────────────────────────────────────────────

async function fanoutToWebsite(clientId: string): Promise<{
  success: boolean
  externalId?: string
  externalUrl?: string
  error?: string
  skipped?: boolean
}> {
  const db = adminDb()
  const { data: client } = await db
    .from('clients').select('slug').eq('id', clientId).maybeSingle()
  if (!client?.slug) {
    return { success: true, skipped: true, error: 'Client has no slug' }
  }

  // Check site type + publication state
  const { data: settings } = await db
    .from('site_settings')
    .select('site_type, is_published, external_deploy_hook_url, external_site_url')
    .eq('client_id', clientId)
    .maybeSingle()

  const siteType = (settings?.site_type as string | null) ?? 'none'

  if (siteType === 'none') {
    return { success: true, skipped: true, error: 'Client has no site configured' }
  }

  if (!settings?.is_published) {
    return { success: true, skipped: true, error: 'Site is not yet published' }
  }

  // Apnosh-hosted sites: revalidate the cached page
  if (siteType === 'apnosh_generated' || siteType === 'apnosh_custom') {
    try {
      revalidatePath(`/sites/${client.slug as string}`)
      return {
        success: true,
        externalUrl: `/sites/${client.slug as string}`,
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Revalidation failed' }
    }
  }

  // External repo sites: POST to their deploy hook so they rebuild + refetch
  if (siteType === 'external_repo') {
    const hookUrl = settings?.external_deploy_hook_url as string | null
    if (!hookUrl) {
      return {
        success: true,
        skipped: true,
        error: 'External site has no deploy hook configured',
      }
    }
    try {
      const res = await fetch(hookUrl, { method: 'POST' })
      if (!res.ok) {
        return {
          success: false,
          error: `Deploy hook returned ${res.status}: ${(await res.text()).slice(0, 200)}`,
        }
      }
      return {
        success: true,
        externalUrl: (settings?.external_site_url as string | null) ?? undefined,
      }
    } catch (e) {
      return { success: false, error: e instanceof Error ? e.message : 'Deploy hook call failed' }
    }
  }

  return { success: true, skipped: true, error: `Unknown site_type: ${siteType}` }
}

// ───────────────────────────────────────────────────────────────
// Per-target fanout dispatch
// ───────────────────────────────────────────────────────────────

async function runFanout(
  updateId: string,
  target: FanoutTarget,
  update: { id: string; type: string; client_id: string; location_id: string | null; payload: unknown },
): Promise<{ target: FanoutTarget; status: 'success' | 'failed' | 'skipped'; error?: string }> {
  const db = adminDb()
  await db.from('client_update_fanouts')
    .update({ status: 'in_progress', attempted_at: new Date().toISOString() })
    .eq('update_id', updateId).eq('target', target)

  try {
    let result: { success: boolean; externalId?: string; externalUrl?: string; error?: string; skipped?: boolean }
    switch (target) {
      case 'gbp':
        result = await fanoutToGbp(update as Parameters<typeof fanoutToGbp>[0])
        break
      case 'website':
        // Apnosh Sites reads from source-of-truth (gbp_locations + client_updates),
        // so a "fanout" is just triggering an ISR revalidation. The actual data
        // change has already happened in source-of-truth.
        result = await fanoutToWebsite(update.client_id)
        break
      // Other targets will be added incrementally:
      // case 'yelp':      result = await fanoutToYelp(update); break
      // case 'facebook':  result = await fanoutToFacebook(update); break
      // case 'instagram': result = await fanoutToInstagram(update); break
      // case 'email':     result = await fanoutToEmail(update); break
      default:
        result = { success: true, skipped: true, error: `Target ${target} not yet implemented` }
    }

    const status = result.skipped ? 'skipped' : result.success ? 'success' : 'failed'
    await db.from('client_update_fanouts').update({
      status,
      external_id: result.externalId ?? null,
      external_url: result.externalUrl ?? null,
      error_message: result.error ?? null,
      completed_at: new Date().toISOString(),
    }).eq('update_id', updateId).eq('target', target)

    return { target, status, error: result.error }
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    await db.from('client_update_fanouts').update({
      status: 'failed',
      error_message: message,
      completed_at: new Date().toISOString(),
    }).eq('update_id', updateId).eq('target', target)
    return { target, status: 'failed', error: message }
  }
}

// ───────────────────────────────────────────────────────────────
// Retry a failed fanout
// ───────────────────────────────────────────────────────────────

export async function retryFanout(updateId: string, target: FanoutTarget): Promise<
  { success: true } | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: update } = await db.from('client_updates').select('*').eq('id', updateId).maybeSingle()
  if (!update) return { success: false, error: 'Update not found' }

  await db.from('client_update_fanouts').update({
    retry_count: db.rpc('increment'),
    status: 'pending',
  }).eq('update_id', updateId).eq('target', target)

  const result = await runFanout(updateId, target, update)
  revalidatePath(`/admin/clients/${update.client_id}`)
  return result.status === 'success' ? { success: true } : { success: false, error: result.error ?? 'Retry failed' }
}

// ───────────────────────────────────────────────────────────────
// List updates for a client (for the admin dashboard)
// ───────────────────────────────────────────────────────────────

export async function listUpdates(clientId: string, limit = 50): Promise<
  | { success: true; data: { updates: UpdateRecord[]; fanouts: Record<string, UpdateFanoutRecord[]> } }
  | { success: false; error: string }
> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = adminDb()
  const { data: updates, error } = await db
    .from('client_updates')
    .select('*')
    .eq('client_id', clientId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return { success: false, error: error.message }

  const updateIds = (updates ?? []).map(u => u.id as string)
  const { data: fanouts } = await db
    .from('client_update_fanouts')
    .select('*')
    .in('update_id', updateIds)

  const fanoutsByUpdate: Record<string, UpdateFanoutRecord[]> = {}
  for (const f of fanouts ?? []) {
    const key = f.update_id as string
    if (!fanoutsByUpdate[key]) fanoutsByUpdate[key] = []
    fanoutsByUpdate[key].push({
      id: f.id as string,
      updateId: f.update_id as string,
      target: f.target as FanoutTarget,
      status: f.status as UpdateFanoutRecord['status'],
      payload: f.payload as Record<string, unknown> | null,
      externalId: f.external_id as string | null,
      externalUrl: f.external_url as string | null,
      errorMessage: f.error_message as string | null,
      retryCount: (f.retry_count as number) ?? 0,
      nextRetryAt: f.next_retry_at as string | null,
      attemptedAt: f.attempted_at as string | null,
      completedAt: f.completed_at as string | null,
    })
  }

  const records: UpdateRecord[] = (updates ?? []).map(u => ({
    id: u.id as string,
    clientId: u.client_id as string,
    locationId: u.location_id as string | null,
    type: u.type as UpdateType,
    payload: u.payload as UpdatePayload['data'],
    status: u.status as UpdateRecord['status'],
    targets: (u.targets as FanoutTarget[]) ?? [],
    scheduledFor: u.scheduled_for as string | null,
    approvalRequired: u.approval_required as boolean,
    approvedBy: u.approved_by as string | null,
    approvedAt: u.approved_at as string | null,
    createdBy: u.created_by as string | null,
    createdAt: u.created_at as string,
    updatedAt: u.updated_at as string,
    publishedAt: u.published_at as string | null,
    summary: u.summary as string | null,
    source: u.source as UpdateRecord['source'],
  }))

  return { success: true, data: { updates: records, fanouts: fanoutsByUpdate } }
}
