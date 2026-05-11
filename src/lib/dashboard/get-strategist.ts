'use server'

/**
 * Resolves the strategist assigned to a client for the "Your strategist"
 * dashboard card. Returns null if no strategist is assigned yet.
 *
 * Uses clients.assigned_team_member_id (migration 088).
 */

import { createAdminClient } from '@/lib/supabase/admin'

export interface StrategistSummary {
  id: string
  name: string
  email: string
  role: string
  avatarUrl: string | null
  lastInteractionAt: string | null
  lastInteractionSummary: string | null
}

export async function getStrategistForClient(
  clientId: string
): Promise<StrategistSummary | null> {
  const admin = createAdminClient()
  const { data: client } = await admin
    .from('clients')
    .select('assigned_team_member_id')
    .eq('id', clientId)
    .maybeSingle()

  const tmId = client?.assigned_team_member_id as string | null | undefined
  if (!tmId) return null

  const [tmRes, lastInteractionRes] = await Promise.all([
    admin
      .from('team_members')
      .select('id, name, email, role, avatar_url')
      .eq('id', tmId)
      .maybeSingle(),
    admin
      .from('client_interactions')
      .select('summary, occurred_at')
      .eq('client_id', clientId)
      .eq('performed_by_name', null)  // any -- we'll fix below; let's just take most recent
      .order('occurred_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!tmRes.data) return null

  // Fix: above filter is wrong (performed_by_name IS NULL); we want the
  // most-recent interaction regardless of who performed it. Redo simply.
  const { data: lastInt } = await admin
    .from('client_interactions')
    .select('summary, occurred_at')
    .eq('client_id', clientId)
    .order('occurred_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  void lastInteractionRes

  return {
    id: tmRes.data.id,
    name: tmRes.data.name as string,
    email: tmRes.data.email as string,
    role: (tmRes.data.role as string) ?? 'Strategist',
    avatarUrl: (tmRes.data.avatar_url as string) ?? null,
    lastInteractionAt: lastInt?.occurred_at as string ?? null,
    lastInteractionSummary: lastInt?.summary as string ?? null,
  }
}
