/**
 * /work/clients/[clientId]/team — strategist-facing team management.
 *
 * Edits the same data the client sees on /dashboard/social/team:
 *   - mark a person as primary contact
 *   - update "current focus" — the one-liner under the primary card
 *   - resolve open swap_requests (mark resolved + optional note)
 *
 * Resolving a swap doesn't auto-end the assignment; staff still
 * decides whether to actually swap the person or talk the client
 * down. The new assignee is set separately via the existing
 * onboarding tools.
 */

import { redirect, notFound } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getTeamForClient } from '@/lib/dashboard/get-team'
import TeamMgmtView from './team-mgmt-view'

export const dynamic = 'force-dynamic'

interface PageProps { params: Promise<{ clientId: string }> }

export default async function Page({ params }: PageProps) {
  const { clientId } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    redirect('/work')
  }

  // RLS-gated visibility check.
  const { data: client } = await supabase
    .from('clients')
    .select('id, name')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) notFound()

  const admin = createAdminClient()
  const [team, openSwapsRes, openAddsRes] = await Promise.all([
    getTeamForClient(clientId),
    admin
      .from('swap_requests')
      .select('id, current_specialist_id, current_role, reason, reason_tags, requested_at, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion'])
      .order('requested_at', { ascending: false }),
    admin
      .from('add_specialist_requests')
      .select('id, proposed_specialist_id, proposed_roles, note, requested_at, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion', 'quoted'])
      .order('requested_at', { ascending: false }),
  ])

  // Resolve proposed-specialist display names for the add-requests
  // rail. Tiny separate query since the team list may not include
  // these people yet (they're not assigned).
  const proposedIds = [...new Set((openAddsRes.data ?? []).map(r => r.proposed_specialist_id as string))]
  const { data: proposedProfiles } = proposedIds.length > 0
    ? await admin.from('profiles').select('id, full_name, avatar_url').in('id', proposedIds)
    : { data: [] as Array<{ id: string; full_name: string | null; avatar_url: string | null }> }
  const proposedMap = new Map((proposedProfiles ?? []).map(p => [p.id as string, p]))

  return (
    <TeamMgmtView
      clientId={clientId}
      clientName={(client.name as string) ?? 'Client'}
      team={team}
      openSwaps={(openSwapsRes.data ?? []).map(r => ({
        id: r.id as string,
        currentSpecialistId: r.current_specialist_id as string,
        currentRole: r.current_role as string,
        reason: (r.reason as string) ?? null,
        reasonTags: Array.isArray(r.reason_tags) ? (r.reason_tags as string[]) : [],
        requestedAt: r.requested_at as string,
        status: r.status as 'open' | 'in_discussion',
      }))}
      openAdds={(openAddsRes.data ?? []).map(r => {
        const p = proposedMap.get(r.proposed_specialist_id as string)
        return {
          id: r.id as string,
          proposedSpecialistId: r.proposed_specialist_id as string,
          proposedSpecialistName: (p?.full_name as string) ?? 'Specialist',
          proposedSpecialistAvatar: (p?.avatar_url as string) ?? null,
          proposedRoles: Array.isArray(r.proposed_roles) ? (r.proposed_roles as string[]) : [],
          note: (r.note as string) ?? null,
          requestedAt: r.requested_at as string,
          status: r.status as 'open' | 'in_discussion' | 'quoted',
        }
      })}
    />
  )
}
