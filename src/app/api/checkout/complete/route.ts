import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { paymentsTable } from '@/lib/campaigns/checkout-server'
import { confirmBookingForPayment } from '@/lib/campaigns/gates/booking-server'
import { ensureCampaignSubscription } from '@/lib/campaigns/campaign-subscription-server'
import { campaignCheckoutEnabled, CHECKOUT_CLOSED_MESSAGE } from '@/lib/checkout-gate'
import { verifyAndLinkCheckoutPayment } from '@/lib/campaigns/checkout-server'
import { deskBill } from '@/lib/requests/desk-bill'
import { deskPaymentMatchesOrder } from '@/lib/requests/desk-guards'
import { createAdminClient } from '@/lib/supabase/admin'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/complete — called after the card is charged AND the campaign has shipped
 * (the client ships via the normal saveAndShip rail, then links it here). Verifies the charge
 * actually succeeded with Stripe, marks the payment paid, links the campaign, and commits the
 * Stripe Tax transaction. Idempotent: a second call with the same PaymentIntent returns the
 * already-linked campaign without re-charging or re-shipping.
 */
export async function POST(req: NextRequest) {
  // Server-side kill switch. Checked FIRST, before auth or any Stripe work, so a
  // closed checkout cannot be reached by calling the API directly.
  if (!campaignCheckoutEnabled()) {
    return NextResponse.json({ error: CHECKOUT_CLOSED_MESSAGE, checkoutClosed: true }, { status: 503 })
  }
  const body = await req.json().catch(() => ({}))
  const paymentIntentId = body.paymentIntentId as string | undefined
  const campaignId = body.campaignId as string | undefined
  const requestId = typeof body.requestId === 'string' ? body.requestId : undefined
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })

  // select('*') so the request_id column being absent (pre-258) cannot error the read.
  const { data: row } = await paymentsTable()
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  const access = await checkClientAccess(row.client_id as string)
  if (!access.authorized) return denied(access.reason)

  // A DESK order: the work is minted HERE, on the far side of a verified charge, instead of at the
  // moment the owner tapped Confirm. Everything below this block is the campaign lane.
  if (requestId) return completeDeskOrder(paymentIntentId, requestId, row as Record<string, unknown>)

  // Already reconciled — hand back the same campaign, no double work. Still confirm the shoot booking
  // AND ensure the monthly subscription (both idempotent) in case a prior attempt linked the campaign
  // but hadn't finished those steps.
  if (row.status === 'paid' && row.campaign_id) {
    await confirmBookingForPayment(paymentIntentId, row.campaign_id as string).catch(() => false)
    await ensureCampaignSubscription(paymentIntentId, row.campaign_id as string).catch(() => null)
    return NextResponse.json({ ok: true, campaignId: row.campaign_id })
  }

  // Confirm the charge (or, for a monthly-only order, the card setup) really succeeded before we
  // mark anything paid. Monthly-only checkouts key the row to a SetupIntent (seti_...): no charge
  // today, but the card must be verified so the subscription can start from it.
  try {
    if (paymentIntentId.startsWith('seti_')) {
      const si = await stripe.setupIntents.retrieve(paymentIntentId)
      if (si.status !== 'succeeded') {
        return NextResponse.json({ ok: false, error: 'Card setup has not completed.' }, { status: 402 })
      }
    } else {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId)
      if (pi.status !== 'succeeded') {
        return NextResponse.json({ ok: false, error: 'Payment has not completed.' }, { status: 402 })
      }
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not verify payment.' }, { status: 502 })
  }

  const nowISO = new Date().toISOString()
  await paymentsTable()
    .update({
      status: 'paid',
      campaign_id: campaignId ?? row.campaign_id ?? null,
      paid_at: nowISO,
      ...(campaignId ? { shipped_at: nowISO } : {}),
    })
    .eq('stripe_payment_intent_id', paymentIntentId)

  // Commit a Stripe Tax transaction so the collected tax is reportable. Best-effort.
  if (row.stripe_tax_calculation_id) {
    try {
      const txn = await stripe.tax.transactions.createFromCalculation({
        calculation: row.stripe_tax_calculation_id as string,
        reference: campaignId || paymentIntentId,
      })
      await paymentsTable()
        .update({ stripe_tax_transaction_id: txn.id })
        .eq('stripe_payment_intent_id', paymentIntentId)
    } catch {
      /* tax already collected on the PaymentIntent; the reporting transaction is non-critical */
    }
  }

  // Confirm the shoot booking (if any) and bind it to the campaign — flips the 30-min hold to a firm
  // booking, seeds the real shoot date into the campaign + its shoot work orders. Best-effort: a
  // non-shoot order is a clean no-op, and a hiccup here never unships a paid order.
  const boundCampaignId = campaignId ?? (row.campaign_id as string | null)
  if (boundCampaignId) {
    await confirmBookingForPayment(paymentIntentId, boundCampaignId).catch(() => false)
    // Start the monthly subscription from the saved card (G4). Best-effort + idempotent: a failure
    // records itself + pages staff and NEVER unwinds the paid one-time order.
    await ensureCampaignSubscription(paymentIntentId, boundCampaignId).catch(() => null)
  }

  return NextResponse.json({ ok: true, campaignId: boundCampaignId ?? null })
}

/**
 * Finish a paid DESK order.
 *
 * THE PAYMENT MUST BE THIS ORDER'S OWN. requestId arrives in the request body, and the payment row
 * used to be found by PaymentIntent alone — so any settled payment on the same account could be
 * pointed at any unpaid desk order, and the row's request_id was then overwritten to match. One
 * card charge, two orders delivered, and the first order's receipt now names the second. The three
 * checks below close it, all BEFORE anything is verified or minted:
 *   1. the row already says it belongs to THIS request (prepare stamps request_id at creation)
 *   2. the row is not a campaign checkout wearing a desk order's name
 *   3. Stripe's own metadata on the intent says the same two things
 *
 * After those, the verification is the campaign lane's own — verifyAndLinkCheckoutPayment — which
 * proves the charge is really captured at Stripe and covers the bill. Only then does the work order
 * mint. FAILS CLOSED: an unverified or mismatched payment mints nothing and says why.
 */
async function completeDeskOrder(paymentIntentId: string, requestId: string, payRow: Record<string, unknown>) {
  const clientId = String(payRow.client_id ?? '')
  const taxCalculationId = (payRow.stripe_tax_calculation_id as string | null) ?? null

  // Stripe's copy of the same fact. The intent was created by our own prepare route with the
  // order's id on it; an intent that does not say so is not this order's, whatever our row says.
  // A read we cannot make is a FAILURE, never a pass — this is the money path.
  let meta: Record<string, string> | null = null
  try {
    meta = (paymentIntentId.startsWith('seti_')
      ? (await stripe.setupIntents.retrieve(paymentIntentId)).metadata
      : (await stripe.paymentIntents.retrieve(paymentIntentId)).metadata) ?? {}
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not verify payment.' }, { status: 502 })
  }
  const claim = {
    rowRequestId: typeof payRow.request_id === 'string' ? payRow.request_id : null,
    rowCampaignId: (payRow.campaign_id as string | null) ?? null,
    intentKind: meta.kind ?? null,
    intentRequestId: meta.requestId ?? null,
  }
  if (!deskPaymentMatchesOrder(claim, requestId)) {
    return NextResponse.json({ ok: false, error: 'That payment is not for this order.' }, { status: 403 })
  }

  const admin = createAdminClient()
  const { data: reqRaw } = await admin.from('creative_requests').select('*').eq('id', requestId).maybeSingle()
  const reqRow = reqRaw as Record<string, unknown> | null
  if (!reqRow) return NextResponse.json({ error: 'That order does not exist.' }, { status: 404 })
  // Tenancy: the payment's client and the order's client must be the same account.
  if (String(reqRow.client_id ?? '') !== clientId) return NextResponse.json({ error: 'forbidden' }, { status: 403 })

  const cadence = reqRow.cadence === 'monthly' ? 'monthly' as const : 'once' as const
  const bill = deskBill(reqRow.quote_cents as number | null, cadence)
  const verified = await verifyAndLinkCheckoutPayment({
    paymentIntentId,
    clientId,
    requestId,
    preTaxCents: bill.preTaxCents,
  })
  if (!verified.ok) return NextResponse.json({ ok: false, error: verified.reason }, { status: 402 })

  // The tax transaction, so the collected tax is reportable. Best-effort, same as the cart.
  if (taxCalculationId) {
    try {
      const txn = await stripe.tax.transactions.createFromCalculation({ calculation: taxCalculationId, reference: `req_${requestId}` })
      await paymentsTable().update({ stripe_tax_transaction_id: txn.id }).eq('stripe_payment_intent_id', paymentIntentId)
    } catch { /* the tax was collected on the charge; the reporting transaction is non-critical */ }
  }

  const { finalizePaidDeskOrder } = await import('@/lib/requests/desk-order')
  const done = await finalizePaidDeskOrder({
    requestId,
    // The row we already read and checked — the receipt this order points back at.
    paymentRowId: typeof payRow.id === 'string' ? payRow.id : null,
    intentId: paymentIntentId,
  })
  return NextResponse.json({ ok: done.ok, requestId, workOrderId: done.workOrderId, ...(done.warnings.length ? { warnings: done.warnings } : {}) })
}
