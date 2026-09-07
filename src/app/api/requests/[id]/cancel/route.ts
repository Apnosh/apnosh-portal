/**
 * POST /api/requests/[id]/cancel — the owner cancels a desk order they paid for.
 *
 * Until now there was no caller for a desk refund at all: refundCampaignPayment could take a
 * requestId and nothing ever passed one, so an owner who ordered by mistake had to email somebody.
 *
 * The rules, in the order they are checked:
 *   1. it is their order (tenancy, same check as everywhere else)
 *   2. it has NOT been delivered — after delivery the work exists and this is a conversation with
 *      a person, not a button. The screen says so and points at Get help.
 *   3. the refund runs with the SAME fail-closed law as the campaign stop: an unreadable payment
 *      row or an unreadable work order sends NOTHING, says so plainly, and pages a person.
 *
 * A full refund carries its own settlement (refunds-server): the monthly subscription is cancelled,
 * unstarted work is voided, staff are told. Nothing of that is repeated here.
 */
import { NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { refundCampaignPayment, getPaidChargeForRequest, REFUND_UNCONFIRMED, pageAdmins } from '@/lib/campaigns/refunds-server'
import { requestTypeById } from '@/lib/requests/catalog'
import { deskCancelable } from '@/lib/requests/desk-guards'

export const runtime = 'nodejs'

/** The words the owner reads when the work has already landed. One door, named. */
const ALREADY_DELIVERED =
  'This order is already delivered, so it cannot be cancelled here. Tap Get help and we will sort it out with you.'

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const admin = createAdminClient()
  const { data: rowRaw } = await admin.from('creative_requests').select('*').eq('id', id).maybeSingle()
  const row = rowRaw as Record<string, unknown> | null
  if (!row) return NextResponse.json({ error: 'Request not found' }, { status: 404 })

  const clientId = String(row.client_id ?? '')
  const access = await checkClientAccess(clientId)
  if (!access.authorized) {
    return NextResponse.json({ error: access.reason ?? 'forbidden' }, { status: access.reason === 'unauthenticated' ? 401 : 403 })
  }

  // PRE-DELIVERY ONLY. Both halves are asked, because either can be ahead of the other: the request
  // row's status, and the work order that actually makes the thing.
  if (!deskCancelable(String(row.status ?? ''))) {
    return NextResponse.json({ error: ALREADY_DELIVERED, delivered: true }, { status: 409 })
  }
  const { data: wo, error: woErr } = await admin
    .from('creator_work_orders')
    .select('status')
    .eq('campaign_piece_key', `request:${id}`)
    .limit(1)
    .maybeSingle()
  // FAIL CLOSED on an unreadable work order: "we could not read" looks exactly like "nothing was
  // delivered", and that is the biggest refund we could send.
  if (woErr) {
    await pageAdmins(clientId, 'A cancel was held back', `An owner tried to cancel desk order ${id} and we could not read its work order (${woErr.message}), so nothing was sent back. Settle it by hand.`, '/admin/requests')
    return NextResponse.json({ error: REFUND_UNCONFIRMED }, { status: 503 })
  }
  if (!deskCancelable(String(row.status ?? ''), (wo as { status?: string } | null)?.status ?? null)) {
    return NextResponse.json({ error: ALREADY_DELIVERED, delivered: true }, { status: 409 })
  }

  const label = requestTypeById(String(row.type ?? ''))?.label ?? 'order'

  // NOTHING WAS EVER CHARGED. An order still waiting for the card is cancelled by closing it —
  // there is no money to send back and no Stripe call to make.
  const charge = await getPaidChargeForRequest(id)
  if (!charge.ok) {
    await pageAdmins(clientId, 'A cancel was held back', `An owner tried to cancel desk order ${id} and we could not read its payment row (${charge.reason}), so nothing was sent back. Settle it by hand.`, '/admin/requests')
    return NextResponse.json({ error: REFUND_UNCONFIRMED }, { status: 503 })
  }
  if (!charge.paid || charge.paid.totalCents <= 0) {
    await admin.from('creative_requests').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', id)
      .then(() => undefined, () => undefined)
    return NextResponse.json({
      ok: true,
      refundedCents: 0,
      message: `Your ${label.toLowerCase()} order is cancelled. Nothing was charged, so nothing is sent back.`,
    })
  }

  const r = await refundCampaignPayment({
    requestId: id,
    reason: 'You cancelled this order before it was delivered, so we sent your money back.',
    notifyOwner: false,      // the message below says it once, with the number
  }).catch(() => null)

  if (!r || !r.ok) {
    return NextResponse.json({ error: r?.reason ?? REFUND_UNCONFIRMED }, { status: 502 })
  }
  const back = r.refundedCents > 0 ? r.refundedCents : r.totalRefundedCents
  return NextResponse.json({
    ok: true,
    refundedCents: r.refundedCents,
    message: back > 0
      ? `Your ${label.toLowerCase()} order is cancelled. We are sending back $${(back / 100).toFixed(2)}. It lands on your card in 5 to 10 days.`
      : `Your ${label.toLowerCase()} order is cancelled. There was nothing left to send back.`,
  })
}
