import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { paymentsTable } from '@/lib/campaigns/checkout-server'
import { confirmBookingForPayment } from '@/lib/campaigns/gates/booking-server'
import { ensureCampaignSubscription } from '@/lib/campaigns/campaign-subscription-server'

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
  const body = await req.json().catch(() => ({}))
  const paymentIntentId = body.paymentIntentId as string | undefined
  const campaignId = body.campaignId as string | undefined
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })

  const { data: row } = await paymentsTable()
    .select('client_id, status, campaign_id, total_cents, stripe_tax_calculation_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  const access = await checkClientAccess(row.client_id as string)
  if (!access.authorized) return denied(access.reason)

  // Already reconciled — hand back the same campaign, no double work. Still confirm the shoot booking
  // AND ensure the monthly subscription (both idempotent) in case a prior attempt linked the campaign
  // but hadn't finished those steps.
  if (row.status === 'paid' && row.campaign_id) {
    await confirmBookingForPayment(paymentIntentId, row.campaign_id as string).catch(() => false)
    await ensureCampaignSubscription(paymentIntentId, row.campaign_id as string).catch(() => null)
    return NextResponse.json({ ok: true, campaignId: row.campaign_id })
  }

  // Confirm the charge really succeeded before we mark anything paid.
  let pi
  try {
    pi = await stripe.paymentIntents.retrieve(paymentIntentId)
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not verify payment.' }, { status: 502 })
  }
  if (pi.status !== 'succeeded') {
    return NextResponse.json({ ok: false, error: 'Payment has not completed.' }, { status: 402 })
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
