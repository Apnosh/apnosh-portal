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
  const [team, openSwapsRes] = await Promise.all([
    getTeamForClient(clientId),
    admin
      .from('swap_requests')
      .select('id, current_specialist_id, current_role, reason, reason_tags, requested_at, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion'])
      .order('requested_at', { ascending: false }),
  ])

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
    />
  )
}
