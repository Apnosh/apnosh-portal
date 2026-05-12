/**
 * POST /api/dashboard/team/add-specialist
 *
 * Client requests to add a specialist to their team. Writes an
 * add_specialist_requests row and pings the strategist + onboarder
 * so someone routes the conversation and generates a quote.
 *
 * Per spec: the proposed specialist NEVER sees the row (RLS) and
 * is not in the notification fanout. Sarah-mediated.
 *
 * Idempotent on (client, proposedSpecialist, status in open/in_discussion)
 * — a second tap updates the existing row rather than creating a duplicate.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

interface Body {
  clientId: string
  proposedSpecialistId: string
  proposedRoles?: string[]
  note?: string | null
}

const VALID_ROLES = new Set([
  'admin', 'strategist', 'ad_buyer', 'community_mgr', 'editor',
  'copywriter', 'videographer', 'photographer', 'influencer',
  'social_media_manager', 'seo_specialist',
])

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.clientId || !body?.proposedSpecialistId) {
    return NextResponse.json({ error: 'clientId and proposedSpecialistId required' }, { status: 400 })
  }

  // Tenancy gate.
  const { clientId } = await resolveCurrentClient(body.clientId)
  if (clientId !== body.clientId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const proposedRoles = (body.proposedRoles ?? []).filter(r => VALID_ROLES.has(r))

  const admin = createAdminClient()

  // Idempotency: existing open / in_discussion / quoted request
  // for the same (client, person) is updated rather than duplicated.
  const { data: existing } = await admin
    .from('add_specialist_requests')
    .select('id')
    .eq('client_id', body.clientId)
    .eq('proposed_specialist_id', body.proposedSpecialistId)
    .in('status', ['open', 'in_discussion', 'quoted'])
    .maybeSingle()

  if (existing) {
    await admin
      .from('add_specialist_requests')
      .update({
        proposed_roles: proposedRoles,
        note: body.note ?? null,
        requested_at: new Date().toISOString(),
        requested_by: user.id,
      })
      .eq('id', existing.id)
  } else {
    await admin.from('add_specialist_requests').insert({
      client_id: body.clientId,
      proposed_specialist_id: body.proposedSpecialistId,
      proposed_roles: proposedRoles,
      requested_by: user.id,
      note: body.note ?? null,
      status: 'open',
    })
  }

  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'team.add_specialist_requested',
    subject_type: 'profile',
    subject_id: body.proposedSpecialistId,
    actor_id: user.id,
    actor_role: 'client',
    summary: 'Client asked to add a specialist to their team',
    payload: {
      proposed_roles: proposedRoles,
      has_note: !!body.note?.trim(),
    },
  })

  await notifyStaffForClient(
    body.clientId,
    ['strategist', 'onboarder'],
    {
      kind: 'client_request',
      title: 'Client wants to add a specialist',
      body: body.note?.slice(0, 140) ?? 'Open the team page to review.',
      link: `/work/clients/${body.clientId}/team`,
    },
  ).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true })
}
