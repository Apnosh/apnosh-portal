/**
 * PATCH /api/work/clients/[clientId]/add-requests/[reqId]
 *
 * Strategist updates an add_specialist_requests row — accepted,
 * declined, withdrawn, quoted, or parked in discussion. Accepting
 * just clears the request; the actual role assignment is done via
 * the existing onboarding tools (the request was a signal, not a
 * direct assignment).
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

const VALID_STATUS = new Set([
  'open', 'in_discussion', 'quoted', 'accepted', 'declined', 'withdrawn',
])

interface Body {
  status: 'open' | 'in_discussion' | 'quoted' | 'accepted' | 'declined' | 'withdrawn'
  resolutionNote?: string | null
  quoteId?: string | null
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clientId: string; reqId: string }> }) {
  const { clientId, reqId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.status || !VALID_STATUS.has(body.status)) {
    return NextResponse.json({ error: 'valid status required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updates: Record<string, unknown> = { status: body.status }
  if (['accepted', 'declined', 'withdrawn'].includes(body.status)) {
    updates.resolved_at = new Date().toISOString()
    updates.resolved_by = user.id
    if (body.resolutionNote) updates.resolution_note = body.resolutionNote
  }
  if (body.quoteId) updates.quote_id = body.quoteId

  const { error } = await admin
    .from('add_specialist_requests')
    .update(updates)
    .eq('id', reqId)
    .eq('client_id', clientId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: clientId,
    event_type: `team.add_specialist_${body.status}`,
    subject_type: 'add_specialist_request',
    subject_id: reqId,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Add-specialist request marked ${body.status}`,
    payload: { quote_id: body.quoteId ?? null, note: body.resolutionNote ?? null },
  })

  return NextResponse.json({ ok: true })
}
