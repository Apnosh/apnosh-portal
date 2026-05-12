/**
 * POST /api/work/edits/[id]/complete
 *
 * Editor marks a shoot 'completed' — the cut is done and uploaded
 * via shoot_uploads (kind='final'). Writes an event for audit.
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['editor']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params

  const { data: existing } = await supabase
    .from('shoots')
    .select('id, client_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'shoot not found' }, { status: 404 })
  if (existing.status !== 'uploaded') {
    return NextResponse.json({ error: `cannot complete from status ${existing.status}` }, { status: 409 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('shoots')
    .update({ status: 'completed' })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: 'shoot.completed',
    subject_type: 'shoot',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: 'Shoot completed (editor)',
  })

  return NextResponse.json({ ok: true, status: 'completed' })
}
