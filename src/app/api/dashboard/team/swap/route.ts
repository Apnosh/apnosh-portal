/**
 * POST /api/dashboard/team/swap
 *
 * Client requests to swap a specialist off their account. We write a
 * swap_request row (status='open') and notify the primary contact of
 * the client so they can handle the conversation offline.
 *
 * Per spec: the specialist being swapped is NEVER notified — the
 * RLS policy on swap_requests prevents them from seeing the row, and
 * we don't send any notification their way either.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

interface Body {
  clientId: string
  currentSpecialistId: string
  currentRole: string
  reason?: string | null
  reasonTags?: string[]
}

const VALID_ROLES = new Set([
  'admin', 'strategist', 'ad_buyer', 'community_mgr', 'editor',
  'copywriter', 'videographer', 'photographer', 'influencer',
  'client_owner', 'client_manager',
  'social_media_manager', 'seo_specialist',
])

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.clientId || !body?.currentSpecialistId || !body?.currentRole) {
    return NextResponse.json({ error: 'clientId, currentSpecialistId, currentRole required' }, { status: 400 })
  }
  if (!VALID_ROLES.has(body.currentRole)) {
    return NextResponse.json({ error: `unknown role: ${body.currentRole}` }, { status: 400 })
  }

  // Tenancy gate: caller must own (or be linked to) this client.
  const { clientId } = await resolveCurrentClient(body.clientId)
  if (clientId !== body.clientId) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const admin = createAdminClient()

  // Idempotency: if there's already an open swap for the same
  // (client, specialist, role), update its reason rather than create
  // a duplicate. Less noise for the strategist.
  const { data: existing } = await admin
    .from('swap_requests')
    .select('id')
    .eq('client_id', body.clientId)
    .eq('current_specialist_id', body.currentSpecialistId)
    .eq('current_role', body.currentRole)
    .in('status', ['open', 'in_discussion'])
    .maybeSingle()

  if (existing) {
    await admin
      .from('swap_requests')
      .update({
        reason: body.reason ?? null,
        reason_tags: Array.isArray(body.reasonTags) ? body.reasonTags : [],
        requested_at: new Date().toISOString(),
        requested_by: user.id,
      })
      .eq('id', existing.id)
  } else {
    await admin.from('swap_requests').insert({
      client_id: body.clientId,
      current_specialist_id: body.currentSpecialistId,
      current_role: body.currentRole,
      requested_by: user.id,
      reason: body.reason ?? null,
      reason_tags: Array.isArray(body.reasonTags) ? body.reasonTags : [],
      status: 'open',
    })
  }

  // Audit
  await admin.from('events').insert({
    client_id: body.clientId,
    event_type: 'team.swap_requested',
    subject_type: 'role_assignment',
    subject_id: body.currentSpecialistId,
    actor_id: user.id,
    actor_role: 'client',
    summary: `Client asked to swap ${body.currentRole}`,
    payload: { role: body.currentRole, has_reason: !!body.reason?.trim() },
  })

  // Notify the strategist + onboarder so someone routes it. We don't
  // notify the specialist being swapped (RLS already prevents them
  // from seeing the row; this just makes that intentional in the
  // notification fanout too).
  await notifyStaffForClient(
    body.clientId,
    ['strategist', 'onboarder'],
    {
      kind: 'client_request',
      title: 'Client asked to swap a specialist',
      body: body.reason?.slice(0, 140) ?? 'No reason given — open a conversation.',
      link: `/work/clients/${body.clientId}/team`,
    },
  ).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true })
}
