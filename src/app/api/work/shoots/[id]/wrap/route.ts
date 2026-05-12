/**
 * POST /api/work/shoots/[id]/wrap
 *
 * Field crew marks a shoot as wrapped (raw captured) or uploaded
 * (raw delivered to editor). Drives the state machine that the
 * editor surface reads from.
 *
 * Body: { action: 'wrap' | 'upload' }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

type Action = 'wrap' | 'upload'

const TRANSITIONS: Record<Action, { from: string[]; to: string; ts: string }> = {
  wrap:   { from: ['planned', 'briefed', 'in_progress'], to: 'wrapped',  ts: 'wrapped_at' },
  upload: { from: ['wrapped'],                            to: 'uploaded', ts: 'uploaded_at' },
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['photographer', 'videographer', 'visual_creator']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = await req.json().catch(() => null) as { action?: Action } | null
  if (!body?.action || !(body.action in TRANSITIONS)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('shoots')
    .select('id, client_id, status')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'shoot not found' }, { status: 404 })

  const tx = TRANSITIONS[body.action]
  if (!tx.from.includes(existing.status as string)) {
    return NextResponse.json({ error: `cannot ${body.action} from status ${existing.status}` }, { status: 409 })
  }

  const admin = createAdminClient()
  const { error } = await admin
    .from('shoots')
    .update({ status: tx.to, [tx.ts]: new Date().toISOString() })
    .eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: `shoot.${tx.to}`,
    subject_type: 'shoot',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Shoot ${tx.to}`,
  })

  return NextResponse.json({ ok: true, status: tx.to })
}
