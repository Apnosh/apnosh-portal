import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { checkoutBill } from '@/lib/campaigns/checkout-bill'
import { ensureCheckoutCustomer, computeTaxCents, paymentsTable } from '@/lib/campaigns/checkout-server'
import type { CampaignDraft } from '@/lib/campaigns/types'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/prepare — start a charge-at-checkout for a composed cart draft.
 * Recomputes the bill server-side (never trusts the client), computes tax from any stored
 * address, creates a PaymentIntent (card saved for reuse), and records a pending payment row
 * with the draft snapshot. Returns the client secret + itemized breakdown for the pay page.
 *
 * A $0 one-time bill (all owner-run/free lanes) skips Stripe entirely — the caller ships directly.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const clientId = body.clientId as string | undefined
  const draft = body.draft as CampaignDraft | undefined
  if (!clientId || !draft || !Array.isArray(draft.items)) {
    return NextResponse.json({ error: 'clientId and draft required' }, { status: 400 })
  }
  const access = await checkClientAccess(clientId)
  if (!access.authorized) return denied(access.reason)

  const bill = checkoutBill(draft)
  // Free order (owner-run/DIY lanes): nothing to charge. The client ships via the normal rail.
  if (bill.preTaxCents <= 0) {
    return NextResponse.json({
      free: true,
      breakdown: { subtotalCents: 0, serviceFeeCents: 0, taxCents: 0, totalCents: 0 },
      monthlyCents: bill.perMonthCents,
    })
  }

  const cust = await ensureCheckoutCustomer(clientId)
  if ('error' in cust) return NextResponse.json({ error: cust.error }, { status: 500 })

  try {
    const tax = await computeTaxCents({ preTaxCents: bill.preTaxCents, customerId: cust.customerId })
    const totalCents = bill.preTaxCents + tax.taxCents

    const pi = await stripe.paymentIntents.create({
      amount: totalCents,
      currency: 'usd',
      customer: cust.customerId,
      // Save the card on the customer so the next checkout can reuse it.
      setup_future_usage: 'off_session',
      automatic_payment_methods: { enabled: true },
      description: `Apnosh — ${draft.name || 'campaign'}`,
      metadata: { clientId, kind: 'campaign_checkout' },
    })

    const { error: insErr } = await paymentsTable().insert({
      client_id: clientId,
      stripe_payment_intent_id: pi.id,
      stripe_customer_id: cust.customerId,
      subtotal_cents: bill.subtotalCents,
      service_fee_cents: bill.serviceFeeCents,
      tax_cents: tax.taxCents,
      total_cents: totalCents,
      status: 'pending',
      stripe_tax_calculation_id: tax.calculationId,
      draft,
    })
    // If we can't record the payment (e.g. migration 215 not applied), don't leave a chargeable
    // PaymentIntent with no matching row — cancel it and surface a clear error.
    if (insErr) {
      await stripe.paymentIntents.cancel(pi.id).catch(() => {})
      return NextResponse.json({ error: 'Checkout is not set up yet (payments table missing). Apply migration 215 and try again.' }, { status: 500 })
    }

    return NextResponse.json({
      paymentIntentId: pi.id,
      clientSecret: pi.client_secret,
      publishableKey: process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? null,
      breakdown: {
        subtotalCents: bill.subtotalCents,
        serviceFeeCents: bill.serviceFeeCents,
        taxCents: tax.taxCents,
        totalCents,
      },
      monthlyCents: bill.perMonthCents,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not start checkout.' }, { status: 500 })
  }
}
