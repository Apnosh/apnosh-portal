/**
 * POST /api/requests/[id]/accept — the owner says yes to a quote.
 *
 * This is the loop's closer, and since Move 5b the yes is not free either. A quote with a price
 * moves to 'awaiting_payment' and the owner pays through the same desk checkout their own orders
 * use; the work order is minted on the far side of the charge. A quote of $0 still goes straight
 * to 'in_progress' and bridges into the creator work-order rail (delivery requires a link, the
 * owner approves the work, approval drives money), because there is nothing to pay. Only the
 * request's own client can accept, and only from 'quoted': there is nothing to say yes to before
 * a price exists.
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
import { deskPaymentDue, acceptGoesToTill, AWAITING_PAYMENT, DESK_NEEDS_PAYMENT } from '@/lib/requests/desk-guards'
import { campaignCheckoutEnabled } from '@/lib/checkout-gate'
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

  /* THE YES GOES TO THE TILL. A person's quote used to mint work here and bill "on delivery",
   * which was the last free work in the desk: a work order existed, an invoice did not, and no row
   * anywhere said money was owed. A quote with a price now moves to awaiting_payment on the yes and
   * pays through the same desk checkout an owner's own order pays through; the work is minted on
   * the far side of the charge (finalizePaidDeskOrder). A quote of $0 still mints on the yes,
   * because there is nothing to pay. */
  const quoteCents = (row.quote_cents as number | null) ?? null
  /* The same switch every other card path reads. With it off the desk's prepare answers
   * checkoutClosed, so sending the yes to awaiting_payment parked the owner where no card can be
   * taken and no button goes forward. Shut till, the yes mints the work and the bill follows the
   * approval, which is what the screen says too. */
  if (acceptGoesToTill(quoteCents, campaignCheckoutEnabled())) {
    const { data: sentToTill, error: tillErr } = await admin
      .from('creative_requests')
      .update({ status: AWAITING_PAYMENT, accepted_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('status', 'quoted')   // one accept wins, same as below
      .select('id, status')
      .single()
    if (tillErr || !sentToTill) {
      return NextResponse.json({ error: 'Could not accept. Try again.' }, { status: 500 })
    }
    try {
      await notifyStaffForClient(clientId, ['strategist', 'designer'], {
        kind: 'client_signoff',
        title: `Said yes: ${summaryLine(String(row.type), (row.brief ?? {}) as RequestAnswers)}`,
        body: `The owner accepted the $${((quoteCents ?? 0) / 100).toFixed(0)} quote and is paying now. Work starts when the card clears.`,
        link: '/admin/requests',
      })
    } catch (e) {
      console.error('[requests] accept-to-till staff notify failed (the accept still stands)', e)
    }
    return NextResponse.json({ ok: true, needsPayment: true, requestId: id, request: sentToTill })
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

  /* Staff hear the yes immediately — this is the moment work starts. When a PRICED quote mints
   * because the till is shut, the same notice carries the bill: the owner was told we send it
   * after they approve, and a person has to send it. Nothing else in the app will. */
  try {
    const type = requestTypeById(String(row.type))
    const cents = Number(row.quote_cents) || 0
    const owed = cents > 0
    await notifyStaffForClient(clientId, ['strategist', 'designer'], {
      kind: 'client_signoff',
      title: `Accepted: ${summaryLine(String(row.type), (row.brief ?? {}) as RequestAnswers)}`,
      body: owed
        ? `The owner said yes at $${(cents / 100).toFixed(0)}. ${type?.label ?? 'The work'} is now in progress. Card checkout is off, so they were told the bill comes after they approve the work: send the $${(cents / 100).toFixed(0)} invoice then.`
        : `The owner said yes. ${type?.label ?? 'The work'} is now in progress. Nothing to bill on this one.`,
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
