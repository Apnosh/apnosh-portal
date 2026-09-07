import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { computeTaxCents, saveCustomerAddress, paymentsTable, type BillingAddress } from '@/lib/campaigns/checkout-server'
import { campaignCheckoutEnabled, CHECKOUT_CLOSED_MESSAGE } from '@/lib/checkout-gate'
import { preTaxFromRow, type StoredBillRow } from '@/lib/campaigns/checkout-bill'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/tax — recompute tax for a pending checkout once the owner enters a billing
 * address, and update the PaymentIntent amount to match. Returns the refreshed itemized bill.
 * Never trusts a client-sent amount: the pre-tax base comes from the stored payment row, through
 * the same preTaxFromRow the prepare route charged on — credit and all.
 */
export async function POST(req: NextRequest) {
  // Server-side kill switch. Checked FIRST, before auth or any Stripe work, so a
  // closed checkout cannot be reached by calling the API directly.
  if (!campaignCheckoutEnabled()) {
    return NextResponse.json({ error: CHECKOUT_CLOSED_MESSAGE, checkoutClosed: true }, { status: 503 })
  }
  const body = await req.json().catch(() => ({}))
  const paymentIntentId = body.paymentIntentId as string | undefined
  const address = body.address as BillingAddress | undefined
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })

  // select('*') so a database without migration 261 — where friend_credit_cents does not exist —
  // cannot fail this read on a missing column (42703). The bill function below reads an absent
  // credit as zero, which is what it is.
  const { data: row } = await paymentsTable()
    .select('*')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  const access = await checkClientAccess(row.client_id as string)
  if (!access.authorized) return denied(access.reason)
  if (row.status !== 'pending') return NextResponse.json({ error: 'This checkout is already complete.' }, { status: 409 })

  // THE SAME PRE-TAX BASE PREPARE USED. Not subtotal + fee: the row keeps the FULL items subtotal
  // (refund-math measures delivered work against it) while the fee and the total are the credited
  // ones, so adding those two back together charges the owner the $50 we gave them. preTaxFromRow
  // takes the credit off and can never come out above the amount already on the intent.
  const preTaxCents = preTaxFromRow(row as StoredBillRow)
  const friendCreditCents = Math.max(0, Number((row as { friend_credit_cents?: number }).friend_credit_cents ?? 0) || 0)
  try {
    const tax = await computeTaxCents({ preTaxCents, address, customerId: row.stripe_customer_id as string })
    const totalCents = preTaxCents + tax.taxCents

    await stripe.paymentIntents.update(paymentIntentId, { amount: totalCents })
    if (address) await saveCustomerAddress(row.stripe_customer_id as string, address)

    await paymentsTable()
      .update({ tax_cents: tax.taxCents, total_cents: totalCents, stripe_tax_calculation_id: tax.calculationId })
      .eq('stripe_payment_intent_id', paymentIntentId)

    return NextResponse.json({
      breakdown: {
        subtotalCents: row.subtotal_cents,
        serviceFeeCents: row.service_fee_cents,
        taxCents: tax.taxCents,
        totalCents,
        // Absent on every bill without one, so a screen with no credit prints the lines it always
        // has. With one, the receipt keeps naming it after the address is entered.
        ...(friendCreditCents > 0 ? { friendCreditCents } : {}),
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update tax.' }, { status: 500 })
  }
}
