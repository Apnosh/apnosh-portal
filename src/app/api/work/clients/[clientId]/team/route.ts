/**
 * PATCH /api/work/clients/[clientId]/team
 *
 * Updates a single role_assignments row for a (clientId, personId, role)
 * triple. Currently handles two fields:
 *   - currentFocus: the one-liner under the primary card
 *   - isPrimaryContact: true ⇒ clear any existing primary on the same role
 *     (a partial unique index also enforces this at the DB layer)
 *
 * Authed via the user-scoped client (RLS gates which clients a staffer
 * can see); mutations go through the admin client because the role
 * assignment table doesn't have a "staff can update" policy that fits
 * cleanly — the route-level capability check is the gate.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

interface Body {
  personId: string
  role: string
  currentFocus?: string | null
  isPrimaryContact?: boolean
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await ctx.params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!(await isCapable(['strategist', 'onboarder', 'community_mgr']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  // RLS-visibility gate.
  const { data: client } = await supabase.from('clients').select('id').eq('id', clientId).maybeSingle()
  if (!client) return NextResponse.json({ error: 'client not found' }, { status: 404 })

  const body = (await req.json().catch(() => null)) as Body | null
  if (!body?.personId || !body?.role) {
    return NextResponse.json({ error: 'personId and role required' }, { status: 400 })
  }

  const admin = createAdminClient()
  const updates: Record<string, unknown> = {}
  if (typeof body.currentFocus === 'string' || body.currentFocus === null) {
    updates.current_focus = body.currentFocus
  }

  // Setting primary clears any other primaries on the same (client,role)
  // pair. The partial unique index would reject a second 'true', so we
  // demote the others in the same transaction conceptually (two writes).
  if (body.isPrimaryContact === true) {
    await admin
      .from('role_assignments')
      .update({ is_primary_contact: false })
      .eq('client_id', clientId)
      .eq('role', body.role)
      .neq('person_id', body.personId)
      .is('ended_at', null)
    updates.is_primary_contact = true
  } else if (body.isPrimaryContact === false) {
    updates.is_primary_contact = false
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'no fields to update' }, { status: 400 })
  }

  const { error } = await admin
    .from('role_assignments')
    .update(updates)
    .eq('client_id', clientId)
    .eq('person_id', body.personId)
    .eq('role', body.role)
    .is('ended_at', null)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
