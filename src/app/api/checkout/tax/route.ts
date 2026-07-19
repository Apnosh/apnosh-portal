import { NextRequest, NextResponse } from 'next/server'
import { checkClientAccess } from '@/lib/dashboard/check-client-access'
import { stripe } from '@/lib/stripe'
import { computeTaxCents, saveCustomerAddress, paymentsTable, type BillingAddress } from '@/lib/campaigns/checkout-server'

function denied(reason: string | undefined) {
  return NextResponse.json({ error: reason ?? 'forbidden' }, { status: reason === 'unauthenticated' ? 401 : 403 })
}

/**
 * POST /api/checkout/tax — recompute tax for a pending checkout once the owner enters a billing
 * address, and update the PaymentIntent amount to match. Returns the refreshed itemized bill.
 * Never trusts a client-sent amount: the subtotal + fee come from the stored payment row.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const paymentIntentId = body.paymentIntentId as string | undefined
  const address = body.address as BillingAddress | undefined
  if (!paymentIntentId) return NextResponse.json({ error: 'paymentIntentId required' }, { status: 400 })

  const { data: row } = await paymentsTable()
    .select('client_id, subtotal_cents, service_fee_cents, status, stripe_customer_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .maybeSingle()
  if (!row) return NextResponse.json({ error: 'Checkout not found' }, { status: 404 })

  const access = await checkClientAccess(row.client_id as string)
  if (!access.authorized) return denied(access.reason)
  if (row.status !== 'pending') return NextResponse.json({ error: 'This checkout is already complete.' }, { status: 409 })

  const preTaxCents = (row.subtotal_cents as number) + (row.service_fee_cents as number)
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
      },
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Could not update tax.' }, { status: 500 })
  }
}
