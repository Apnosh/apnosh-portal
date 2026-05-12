/**
 * POST /api/work/boosts/[id]/lifecycle
 *
 * Drives a live campaign through pause / resume / complete / cancel.
 * Complete carries final metrics (spend, reach, clicks) so the row
 * becomes a queryable outcome for future AI rec context.
 *
 * Body:
 *   { action: 'pause' | 'resume' | 'complete' | 'cancel',
 *     spend?: number, reach?: number, clicks?: number }  // complete only
 */

import { NextResponse, type NextRequest } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isCapable } from '@/lib/auth/require-any-capability'

export const dynamic = 'force-dynamic'

type Action = 'pause' | 'resume' | 'complete' | 'cancel'

interface Body {
  action: Action
  spend?: number
  reach?: number
  clicks?: number
}

const TRANSITIONS: Record<Action, { from: string[]; to: string }> = {
  pause: { from: ['active'], to: 'paused' },
  resume: { from: ['paused'], to: 'active' },
  complete: { from: ['active', 'paused', 'launching'], to: 'completed' },
  cancel: { from: ['pending', 'launching', 'active', 'paused'], to: 'cancelled' },
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  if (!(await isCapable(['paid_media', 'ad_buyer']))) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }

  const { id } = await ctx.params
  const body = (await req.json().catch(() => null)) as Body | null
  if (!body || !body.action || !(body.action in TRANSITIONS)) {
    return NextResponse.json({ error: 'invalid action' }, { status: 400 })
  }

  const { data: existing } = await supabase
    .from('ad_campaigns')
    .select('id, client_id, status, spend, reach, clicks')
    .eq('id', id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'campaign not found' }, { status: 404 })

  const tx = TRANSITIONS[body.action]
  if (!tx.from.includes(existing.status as string)) {
    return NextResponse.json({ error: `cannot ${body.action} from status ${existing.status}` }, { status: 409 })
  }

  const patch: Record<string, unknown> = { status: tx.to }
  if (body.action === 'complete') {
    if (typeof body.spend === 'number') patch.spend = body.spend
    if (typeof body.reach === 'number') patch.reach = body.reach
    if (typeof body.clicks === 'number') patch.clicks = body.clicks
    patch.ended_at = new Date().toISOString()
    patch.last_metrics_sync_at = new Date().toISOString()
  }
  if (body.action === 'cancel') {
    patch.ended_at = new Date().toISOString()
  }

  const admin = createAdminClient()
  const { error: updateErr } = await admin.from('ad_campaigns').update(patch).eq('id', id)
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  await admin.from('events').insert({
    client_id: existing.client_id,
    event_type: `boost.${body.action}d`,
    subject_type: 'ad_campaign',
    subject_id: id,
    actor_id: user.id,
    actor_role: 'staff',
    summary: `Boost ${body.action}d`,
    payload: body.action === 'complete'
      ? { spend: patch.spend, reach: patch.reach, clicks: patch.clicks }
      : {},
  })

  return NextResponse.json({ ok: true, status: tx.to })
}
