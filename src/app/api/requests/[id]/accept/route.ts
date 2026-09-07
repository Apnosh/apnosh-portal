/**
 * POST /api/requests/[id]/accept — the owner says yes to a quote.
 *
 * This is the loop's closer: quoted → in_progress, accepted_at stamped, and the
 * request bridges into the creator work-order rail (delivery requires a link,
 * the owner approves the work, approval drives money) so fulfillment runs on
 * the hardened spine instead of beside it. Only the request's own client can
 * accept, and only from 'quoted' — there is nothing to say yes to before a
 * price exists.
 *
 * IT IS NOT THE TILL. An order the owner placed themselves is priced by the
 * server and pays by card first ('awaiting_payment'); it must never be turned
 * into work by tapping yes to a price the owner set in motion. That order used
 * to land in 'quoted' too, so this route minted it for nothing. Now it refuses,
 * with the code the screen turns into "Pay to start".
 */

import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requestTypeById, summaryLine, type RequestAnswers } from '@/lib/requests/catalog'
import { mintRequestWorkOrder } from '@/lib/requests/bridge'
import { deskPaymentDue, DESK_NEEDS_PAYMENT } from '@/lib/requests/desk-guards'
import { COLLECTED_STATUSES } from '@/lib/campaigns/refund-math'
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
  // select('*') so paid_at being absent (pre-258) reads as "not paid", never as an error.
  const { data: rowRaw } = await admin
    .from('creative_requests')
    .select('*')
    .eq('id', id)
    .maybeSingle()
  const row = rowRaw as Record<string, unknown> | null
  if (!row || row.client_id !== clientId) {
    return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  }

  /* MONEY BEFORE WORK. Two things can make this order the till's rather than a person's quote: its
   * own status, or a charge that was started for it and never collected. Either one, and the answer
   * is the card, not a yes. */
  const paymentDue = deskPaymentDue({
    status: String(row.status ?? ''),
    paidAt: (row.paid_at as string | null) ?? null,
    unpaidTillRow: row.status === 'quoted' ? await hasUncollectedTillRow(id) : false,
  })
  if (paymentDue) {
    return NextResponse.json({
      error: 'This order is not paid yet. Pay for it and your team starts.',
      code: DESK_NEEDS_PAYMENT,
      requestId: id,
    }, { status: 402 })
  }

  if (row.status !== 'quoted') {
    return NextResponse.json({ error: 'This request has no quote to accept yet.' }, { status: 409 })
  }

  const workOrderId = await mintRequestWorkOrder({
    id: String(row.id),
    client_id: String(row.client_id),
    type: String(row.type),
    brief: (row.brief ?? {}) as RequestAnswers,
    attachments: (row.attachments as { url: string; name: string }[] | null) ?? null,
    due_date: (row.due_date as string | null) ?? null,
    quote_cents: (row.quote_cents as number | null) ?? null,
    team_note: (row.team_note as string | null) ?? null,
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
    const type = requestTypeById(String(row.type))
    const cents = Number(row.quote_cents) || 0
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_signoff',
      title: `Accepted: ${summaryLine(String(row.type), (row.brief ?? {}) as RequestAnswers)}`,
      body: `The owner said yes${cents ? ` at $${(cents / 100).toFixed(0)}` : ''}. ${type?.label ?? 'The work'} is now in progress.`,
      link: '/admin/requests',
    })
  } catch (e) {
    console.error('[requests] accept staff notify failed (accept still stands)', e)
  }

  return NextResponse.json({ ok: true, request: updated, work_order_id: workOrderId })
}

/**
 * Is there a charge started for this order that never collected?
 *
 * The belt on top of the braces: a 'quoted' row with a payment row on it is the same unpaid owner
 * order under an older status — an order placed before this move landed, or one whose status write
 * fell back pre-258.
 *
 * FALSE on an unreadable read, and that is right here rather than fail-closed: pre-258 there is no
 * request_id column, so the read errors — and pre-258 the till cannot take a card at all, so there
 * is no charge to be waiting for. The status check above is what stops the new lane.
 */
async function hasUncollectedTillRow(requestId: string): Promise<boolean> {
  try {
    const { data, error } = await createAdminClient()
      .from('campaign_payments')
      .select('status')
      .eq('request_id', requestId)
      .limit(20)
    if (error || !Array.isArray(data) || data.length === 0) return false
    const collected = (data as { status?: string }[])
      .some((r) => (COLLECTED_STATUSES as readonly string[]).includes(String(r.status ?? '')))
    return !collected
  } catch {
    return false
  }
}
