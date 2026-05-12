/**
 * PATCH /api/work/clients/[clientId]/swaps/[swapId]
 *
 * Strategist resolves (or withdraws / parks in discussion) a swap
 * request. Doesn't auto-end the role_assignment — staff still decides
 * whether to actually swap the person or talk the client through.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set(['open', 'in_discussion', 'resolved', 'withdrawn'])

interface Body {
  status: 'open' | 'in_discussion' | 'resolved' | 'withdrawn'
  resolvedSpecialistId?: string | null
  resolutionNote?: string | null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clientId: string; swapId: string }> }) {
  const { clientId, swapId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // RLS-visibility gate via the client.
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.status || !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: 'valid status required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {
    status: body.status,
  }
  if (body.status === 'resolved') {
    updates.resolved_at = new Date().toISOString()
    if (body.resolvedSpecialistId) updates.resolved_specialist_id = body.resolvedSpecialistId
    if (body.resolutionNote) updates.resolution_note = body.resolutionNote
  }

  const { error } = await admin
    .from('swap_requests')
    .update(updates)
    .eq('id', swapId)
    .eq('client_id', clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: clientId,
    event_type: `team.swap_${body.status}`,
    subject_type: 'swap_request',
    subject_id: swapId,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Swap request marked ${body.status}`,
    payload: { resolved_specialist_id: body.resolvedSpecialistId ?? null, note: body.resolutionNote ?? null },
  })

  return NextResponse.json({ ok: true })
}
