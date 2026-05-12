/**
 * POST /api/work/inbox/[id]/dismiss
 *
 * Staff dismisses a client_tasks row without creating a draft.
 * Used for logistics-only requests, duplicates, or things handled
 * out-of-band.
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

  if (!(await isCapable(['strategist', 'copywriter', 'community_mgr', 'onboarder']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const { data: task } = await supabase
    .from('client_tasks')
    .select('id, client_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!task) return NextResponse.json({ error: 'task not found' }, { status: 404 })
  if (task.status === 'done' || task.status === 'canceled') {
    return NextResponse.json({ error: `already ${task.status}` }, { status: 409 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('client_tasks')
    .update({
      status: 'canceled',
      completed_by: user.id,
      completed_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: task.client_id,
    event_type: 'client_task.dismissed',
    subject_type: 'client_task',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: 'Task dismissed',
  })

  return NextResponse.json({ ok: true, status: 'dismissed' })
}
