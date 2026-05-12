/**
 * POST /api/dashboard/drafts/[id]/sign-off
 *
 * Client owner signs off on an approved draft. Stamps
 * client_signed_off_at; writes an event so staff knows to proceed
 * with scheduling. Does not change draft.status — staff still
 * controls the schedule/publish lifecycle.
 *
 * Scoped to drafts the requesting user owns through their client
 * mapping.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { notifyStaffForClient } from '@/lib/notifications'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { id } = await ctx.params

  // Authorize: the draft must belong to a client the user has access to
  const admin = createAdminClient()
  const { data: draft } = await admin
    .from('content_drafts')
    .select('id, client_id, status, proposed_via, client_signed_off_at')
    .eq('id', id)
    .maybeSingle()
  if (!draft) return NextResponse.json({ error: 'draft not found' }, { status: 404 })

  const { clientId } = await resolveCurrentClient(draft.client_id as string)
  if (clientId !== draft.client_id) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  if (draft.status !== 'approved') {
    return NextResponse.json({ error: `draft is ${draft.status}, must be approved to sign off` }, { status: 409 })
  }
  if (draft.client_signed_off_at) {
    return NextResponse.json({ error: 'already signed off', signedOffAt: draft.client_signed_off_at }, { status: 409 })
  }

  const signedOffAt = new Date().toISOString()
  const { error } = await admin
    .from('content_drafts')
    .update({
      client_signed_off_at: signedOffAt,
      client_signed_off_by: user.id,
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: draft.client_id,
    event_type: 'draft.client_signed_off',
    subject_type: 'content_draft',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'client',
    summary: 'Client signed off on the draft',
  })

  await notifyStaffForClient(
    draft.client_id as string,
    ['strategist', 'community_mgr'],
    {
      kind: 'client_signoff',
      title: 'Client signed off — ready to schedule',
      body: 'The owner approved the draft. You can publish or schedule it.',
      link: `/work/drafts?draft=${id}`,
    },
  ).catch(() => ({ notified: 0 }))

  return NextResponse.json({ ok: true, signedOffAt })
}
