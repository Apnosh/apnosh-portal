'use server'

/**
 * Server actions for tracking Meta App tester onboarding per client.
 *
 * Apnosh's Meta app runs in Development mode (Standard Access) for the
 * first ~100 clients, which skips the App Review marathon entirely. The
 * only catch: each client must be added as a tester in the Meta App
 * dashboard before they can OAuth their Instagram or Facebook account.
 *
 * This module powers the helper panel in the admin ConnectionsTab that
 * lets AMs track who's been invited, who has accepted, and what's left
 * to do for each client.
 *
 * Full Meta API automation (POST /{app-id}/roles?user=X&role=testers)
 * requires the client's Facebook user id, which we don't have until
 * after they OAuth -- a chicken-and-egg problem. So for now we record
 * the status manually and provide deep links to the right dashboard
 * pages. The Instagram tester API works by username and is a candidate
 * for partial automation later.
 */

import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export type TesterStatus = 'not_invited' | 'invited' | 'accepted' | 'removed'

export interface ClientMetaTesterStatus {
  clientId: string
  fbStatus: TesterStatus
  fbInvitedAt: string | null
  fbAcceptedAt: string | null
  fbUserId: string | null
  igStatus: TesterStatus
  igInvitedAt: string | null
  igAcceptedAt: string | null
  igUsername: string | null
  notes: string | null
  updatedAt: string
}

async function requireAdmin(): Promise<string> {
  const userSupabase = await createServerClient()
  const { data: { user } } = await userSupabase.auth.getUser()
  if (!user) throw new Error('Not authenticated')

  const admin = createAdminClient()
  const { data } = await admin
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!data) throw new Error('Admin only')
  return user.id
}

export async function getMetaTesterStatus(clientId: string): Promise<ClientMetaTesterStatus | null> {
  await requireAdmin()
  const admin = createAdminClient()
  const { data } = await admin
    .from('client_meta_tester_status')
    .select('*')
    .eq('client_id', clientId)
    .maybeSingle()
  if (!data) return null
  return {
    clientId: data.client_id,
    fbStatus: data.fb_tester_status,
    fbInvitedAt: data.fb_tester_invited_at,
    fbAcceptedAt: data.fb_tester_accepted_at,
    fbUserId: data.fb_user_id,
    igStatus: data.ig_tester_status,
    igInvitedAt: data.ig_tester_invited_at,
    igAcceptedAt: data.ig_tester_accepted_at,
    igUsername: data.ig_username,
    notes: data.notes,
    updatedAt: data.updated_at,
  }
}

interface UpdateInput {
  clientId: string
  fbStatus?: TesterStatus
  igStatus?: TesterStatus
  fbUserId?: string | null
  igUsername?: string | null
  notes?: string | null
}

/**
 * Upsert a client's tester status. Sets the matching invited_at /
 * accepted_at timestamps automatically when the AM advances a stage.
 */
export async function updateMetaTesterStatus(input: UpdateInput): Promise<{ success: true } | { success: false; error: string }> {
  const adminId = await requireAdmin()
  const admin = createAdminClient()
  const now = new Date().toISOString()

  // Load current row (if any) so we only stamp timestamps on transitions.
  const { data: existing } = await admin
    .from('client_meta_tester_status')
    .select('*')
    .eq('client_id', input.clientId)
    .maybeSingle()

  const patch: Record<string, unknown> = {
    client_id: input.clientId,
    updated_by: adminId,
  }

  if (input.fbStatus) {
    patch.fb_tester_status = input.fbStatus
    if (input.fbStatus === 'invited' && existing?.fb_tester_status !== 'invited') {
      patch.fb_tester_invited_at = now
    }
    if (input.fbStatus === 'accepted' && existing?.fb_tester_status !== 'accepted') {
      patch.fb_tester_accepted_at = now
    }
  }
  if (input.igStatus) {
    patch.ig_tester_status = input.igStatus
    if (input.igStatus === 'invited' && existing?.ig_tester_status !== 'invited') {
      patch.ig_tester_invited_at = now
    }
    if (input.igStatus === 'accepted' && existing?.ig_tester_status !== 'accepted') {
      patch.ig_tester_accepted_at = now
    }
  }
  if (input.fbUserId !== undefined) patch.fb_user_id = input.fbUserId
  if (input.igUsername !== undefined) patch.ig_username = input.igUsername
  if (input.notes !== undefined) patch.notes = input.notes

  const { error } = await admin
    .from('client_meta_tester_status')
    .upsert(patch, { onConflict: 'client_id' })

  if (error) return { success: false, error: error.message }
  return { success: true }
}
