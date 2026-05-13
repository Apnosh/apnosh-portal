'use server'

/**
 * Resolves the primary contact (strategist) for a client.
 *
 * Prefers the newer role_assignments path (introduced for the team
 * page — role_assignments.is_primary_contact=true). Falls back to
 * the legacy clients.assigned_team_member_id + team_members table
 * for clients onboarded before the team page existed.
 *
 * Returns null if no primary contact is assigned yet — caller
 * renders "your strategist" as the fallback display name.
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface PrimaryStrategist {
  id: string
  name: string
  firstName: string
  email: string | null
  avatarUrl: string | null
  /** Initials for avatar fallback. */
  initials: string
}

export async function getPrimaryStrategist(
  clientId: string,
): Promise<PrimaryStrategist | null> {
  const admin = createAdminClient()

  /* Path 1: role_assignments (current). One row max per (client, role)
     marked primary, enforced by the partial unique index. */
  const { data: assignment } = await admin
    .from('role_assignments')
    .select('person_id')
    .eq('client_id', clientId)
    .eq('role', 'strategist')
    .eq('is_primary_contact', true)
    .is('ended_at', null)
    .maybeSingle()

  if (assignment?.person_id) {
    const { data: profile } = await admin
      .from('profiles')
      .select('id, full_name, email, avatar_url')
      .eq('id', assignment.person_id as string)
      .maybeSingle()
    if (profile) return shape(profile.id as string, profile.full_name as string | null, profile.email as string | null, profile.avatar_url as string | null)
  }

  /* Path 2: legacy clients.assigned_team_member_id. */
  const { data: client } = await admin
    .from('clients')
    .select('assigned_team_member_id')
    .eq('id', clientId)
    .maybeSingle()
  const tmId = client?.assigned_team_member_id as string | null | undefined
  if (tmId) {
    const { data: tm } = await admin
      .from('team_members')
      .select('id, name, email, avatar_url')
      .eq('id', tmId)
      .maybeSingle()
    if (tm) return shape(tm.id as string, tm.name as string | null, tm.email as string | null, tm.avatar_url as string | null)
  }

  return null
}

function shape(
  id: string,
  fullName: string | null,
  email: string | null,
  avatarUrl: string | null,
): PrimaryStrategist {
  const name = (fullName || email || 'Your strategist').trim()
  const parts = name.split(/\s+/)
  const firstName = parts[0] || name
  const initials = ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '??'
  return { id, name, firstName, email, avatarUrl, initials }
}
