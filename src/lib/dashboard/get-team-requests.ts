'use server'

/**
 * The owner's view of their open team-related requests.
 *
 * Closes the loop on /dashboard/social/team. Without this, an owner
 * who taps "Talk to your strategist about your photographer" or sends
 * a conversational ask gets a "Sent" toast and then has nowhere to
 * see that the request landed. This server lib pulls every open
 * request the client has open across the three intent shapes:
 *
 *   - swap_requests          (owner asked to swap an existing specialist)
 *   - add_specialist_requests (owner asked to add a specific specialist)
 *   - client_tasks where source='client_request' AND visible_to_client=true
 *     AND title starts with the team-help signal we set in /api/dashboard/team/ask
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { ROLE_LABEL } from './team-labels'

export type TeamRequestKind = 'swap' | 'add' | 'ask'

export interface TeamRequest {
  id: string
  kind: TeamRequestKind
  /** Human title for the row, e.g. "About your photographer". */
  title: string
  /** Optional one-line preview (the message or reason). */
  preview: string | null
  /** Status display, e.g. "Discussing", "Quote sent". */
  statusLabel: string
  /** Background tone for the status chip. */
  statusTone: 'info' | 'warn' | 'progress'
  requestedAt: string
}

export async function getOpenTeamRequests(clientId: string): Promise<TeamRequest[]> {
  const admin = createAdminClient()

  const [swapsRes, addsRes, asksRes] = await Promise.all([
    admin
      .from('swap_requests')
      .select('id, current_role, reason, requested_at, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion'])
      .order('requested_at', { ascending: false })
      .limit(10),
    admin
      .from('add_specialist_requests')
      .select('id, proposed_specialist_id, proposed_roles, note, requested_at, status')
      .eq('client_id', clientId)
      .in('status', ['open', 'in_discussion', 'quoted'])
      .order('requested_at', { ascending: false })
      .limit(10),
    /* Conversational "ask" path lands in client_tasks with a
       distinctive title. Filter to those rows so we don't show
       other tasks here (those live in the inbox already). */
    admin
      .from('client_tasks')
      .select('id, title, body, created_at, status')
      .eq('client_id', clientId)
      .eq('source', 'client_request')
      .eq('visible_to_client', true)
      .ilike('title', 'Wants help adding to their team%')
      .in('status', ['todo', 'doing'])
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const items: TeamRequest[] = []

  for (const s of swapsRes.data ?? []) {
    items.push({
      id: `swap-${s.id}`,
      kind: 'swap',
      title: `About your ${(ROLE_LABEL[s.current_role as string] ?? (s.current_role as string)).toLowerCase()}`,
      preview: (s.reason as string) ?? null,
      statusLabel: s.status === 'in_discussion' ? 'Discussing with your team' : 'Sent',
      statusTone: s.status === 'in_discussion' ? 'progress' : 'info',
      requestedAt: s.requested_at as string,
    })
  }

  for (const a of addsRes.data ?? []) {
    const roles = Array.isArray(a.proposed_roles) ? (a.proposed_roles as string[]) : []
    const roleStr = roles.length > 0
      ? roles.map(r => (ROLE_LABEL[r] ?? r).toLowerCase()).join(', ')
      : 'someone new'
    items.push({
      id: `add-${a.id}`,
      kind: 'add',
      title: `Adding ${roleStr}`,
      preview: (a.note as string) ?? null,
      statusLabel: a.status === 'quoted' ? 'Quote on its way' : a.status === 'in_discussion' ? 'Discussing with your team' : 'Sent',
      statusTone: a.status === 'quoted' ? 'warn' : 'info',
      requestedAt: a.requested_at as string,
    })
  }

  for (const t of asksRes.data ?? []) {
    items.push({
      id: `ask-${t.id}`,
      kind: 'ask',
      title: 'Your team request',
      preview: (t.body as string) ?? null,
      statusLabel: t.status === 'doing' ? 'Your strategist is on it' : 'Sent',
      statusTone: t.status === 'doing' ? 'progress' : 'info',
      requestedAt: t.created_at as string,
    })
  }

  items.sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime())
  return items
}
