/**
 * POST /api/requests/[id]/accept — the owner says yes to a quote.
 *
 * This is the loop's closer: quoted → in_progress, accepted_at stamped, and the
 * request bridges into the creator work-order rail (delivery requires a link,
 * the owner approves the work, approval drives money) so fulfillment runs on
 * the hardened spine instead of beside it. Only the request's own client can
 * accept, and only from 'quoted' — there is nothing to say yes to before a
 * price exists.
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTypeById, summaryLine, type RequestAnswers } from '@/lib/requests/catalog'
import { mintRequestWorkOrder } from '@/lib/requests/bridge'
import { notifyStaffForClient } from '@/lib/notifications'

export const runtime = 'nodejs'

async function resolveClientId(userId: string): Promise<string | null> {
  const admin = createAdminClient()
  const { data: biz } = await admin
    .from('businesses').select('client_id').eq('owner_id', userId).maybeSingle()
  if (biz?.client_id) return biz.client_id
  const { data: cu } = await admin
    .from('client_users').select('client_id').eq('auth_user_id', userId).maybeSingle()
  return cu?.client_id ?? null
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const clientId = await resolveClientId(user.id)
  if (!clientId) return NextResponse.json({ error: 'No client context' }, { status: 403 })

  const admin = createAdminClient()
  const { data: row } = await admin
    .from('creative_requests')
    .select('id, client_id, type, brief, status, team_note, attachments, due_date, quote_cents')
    .eq('id', id)
    .maybeSingle()
  if (!row || row.client_id !== clientId) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }
  if (row.status !== 'quoted') {
    return NextResponse.json({ error: 'This request has no quote to accept yet.' }, { status: 409 })
  }

  const workOrderId = await mintRequestWorkOrder({
    id: row.id,
    client_id: row.client_id,
    type: row.type,
    brief: (row.brief ?? {}) as RequestAnswers,
    attachments: row.attachments ?? null,
    due_date: row.due_date ?? null,
    quote_cents: row.quote_cents ?? null,
    team_note: row.team_note ?? null,
  })

  const { data: updated, error } = await admin
    .from('creative_requests')
    .update({
      status: 'in_progress',
      accepted_at: new Date().toISOString(),
      work_order_id: workOrderId,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('status', 'quoted') // one accept wins; a concurrent second accept no-ops
    .select('id, status')
    .single()
  if (error || !updated) {
    return NextResponse.json({ error: 'Could not accept. Try again.' }, { status: 500 })
  }

  /* Staff hear the yes immediately — this is the moment work starts. */
  try {
    const type = requestTypeById(row.type)
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_signoff',
      title: `Accepted: ${summaryLine(row.type, (row.brief ?? {}) as RequestAnswers)}`,
      body: `The owner said yes${row.quote_cents ? ` at $${(row.quote_cents / 100).toFixed(0)}` : ''}. ${type?.label ?? 'The work'} is now in progress.`,
      link: '/admin/requests',
    })
  } catch (e) {
    console.error('[requests] accept staff notify failed (accept still stands)', e)
  }

  return NextResponse.json({ ok: true, request: updated, work_order_id: workOrderId })
}
