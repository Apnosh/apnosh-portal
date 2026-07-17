/**
 * Server half of charge-at-checkout for the campaign cart. Ensures a Stripe customer for the
 * client and computes real sales tax via Stripe Tax. Never trusts client-sent amounts — the
 * authoritative bill is recomputed from the draft with `checkoutBill`.
 *
 * Server-only (needs STRIPE_SECRET_KEY + SUPABASE_SERVICE_ROLE_KEY at request time). All money
 * in integer cents. Tax degrades gracefully: if Stripe Tax isn't enabled or the address is
 * insufficient, tax is 0 and checkout still works (subtotal + service fee only).
 */
import 'server-only'
import type Stripe from 'stripe'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { stripe, getOrCreateStripeCustomerForClient } from '@/lib/stripe'

export interface BillingAddress {
  line1?: string
  line2?: string
  city?: string
  state?: string
  postal_code?: string
  country?: string
}

function admin() {
  return createAdminClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

/** Ensure a Stripe customer exists for the client; returns its id (+ the billing email used). */
export async function ensureCheckoutCustomer(clientId: string): Promise<{ customerId: string } | { error: string }> {
  const a = admin()
  const { data: client } = await a
    .from('clients')
    .select('id, name, email, phone, billing_email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { error: 'Client not found' }
  // Prefer the client's own billing/email; many accounts keep their email only on the login record
  // (client_users), so fall back to the owner's login email before giving up.
  let email = (client.billing_email as string | null) || (client.email as string | null)
  if (!email) {
    const { data: users } = await a.from('client_users').select('email, role').eq('client_id', clientId)
    const withEmail = (users ?? []).filter((u): u is { email: string; role: string } => typeof u?.email === 'string' && u.email.length > 0)
    email = (withEmail.find((u) => u.role === 'owner')?.email) || withEmail[0]?.email || null
  }
  if (!email) return { error: 'No billing email on file for this account.' }
  try {
    const customerId = await getOrCreateStripeCustomerForClient({
      clientId: client.id as string,
      email,
      name: (client.name as string) || 'Apnosh client',
      phone: (client.phone as string | null) ?? undefined,
    })
    return { customerId }
  } catch (e) {
    return { error: e instanceof Error ? e.message : 'Could not reach payment provider.' }
  }
}

/**
 * Compute sales tax (cents) on the pre-tax amount via Stripe Tax. Prefers a billing address
 * entered at checkout; else falls back to the customer's stored address. Returns 0 + null id
 * on ANY failure (Tax not enabled, missing/short address) so the charge still goes through.
 */
export async function computeTaxCents(opts: {
  preTaxCents: number
  address?: BillingAddress
  customerId?: string
}): Promise<{ taxCents: number; calculationId: string | null }> {
  if (opts.preTaxCents <= 0) return { taxCents: 0, calculationId: null }
  const hasAddr = !!(opts.address && (opts.address.postal_code || opts.address.state))
  try {
    const calc = await stripe.tax.calculations.create({
      currency: 'usd',
      line_items: [{ amount: opts.preTaxCents, reference: 'apnosh-campaign-checkout', tax_behavior: 'exclusive' }],
      ...(hasAddr
        ? {
            customer_details: {
              address: {
                line1: opts.address!.line1,
                line2: opts.address!.line2,
                city: opts.address!.city,
                state: opts.address!.state,
                postal_code: opts.address!.postal_code,
                country: opts.address!.country ?? 'US',
              },
              address_source: 'billing',
            },
          }
        : opts.customerId
        ? { customer: opts.customerId }
        : {}),
    })
    return { taxCents: calc.tax_amount_exclusive ?? 0, calculationId: calc.id }
  } catch {
    return { taxCents: 0, calculationId: null }
  }
}

/** The customer's card on file (default payment method, else the most recent card), or null.
 *  Reads Stripe directly so it never depends on webhook-mirror timing. */
export async function getSavedCard(customerId: string): Promise<{ id: string; brand: string; last4: string } | null> {
  try {
    const cust = (await stripe.customers.retrieve(customerId)) as Stripe.Customer
    if (cust.deleted) return null
    const def = cust.invoice_settings?.default_payment_method
    const defId = typeof def === 'string' ? def : def?.id
    let pm: Stripe.PaymentMethod | null = null
    if (defId) {
      pm = await stripe.paymentMethods.retrieve(defId)
    } else {
      const list = await stripe.paymentMethods.list({ customer: customerId, type: 'card', limit: 1 })
      pm = list.data[0] ?? null
    }
    if (pm?.card) return { id: pm.id, brand: pm.card.brand, last4: pm.card.last4 }
    return null
  } catch {
    return null
  }
}

/** Best-effort: save the billing address onto the Stripe customer so next checkout starts with tax. */
export async function saveCustomerAddress(customerId: string, address: BillingAddress): Promise<void> {
  try {
    await stripe.customers.update(customerId, {
      address: {
        line1: address.line1,
        line2: address.line2,
        city: address.city,
        state: address.state,
        postal_code: address.postal_code,
        country: address.country ?? 'US',
      },
    })
  } catch {
    /* non-fatal — tax already computed from the entered address */
  }
}

/** Untyped admin client for the campaign_payments table (types not regenerated for migration 215). */
export function paymentsTable() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return admin().from('campaign_payments') as any
}

/**
 * G7 — payment-aware ship. Before a BILLABLE campaign ships on the charge-at-checkout path,
 * confirm the charge really succeeded, then bind the payment row to the campaign so /checkout/complete
 * (and the webhook backstop) are idempotent.
 *
 * Checks, in order: the PaymentIntent has a payment row → the row belongs to THIS client → the charge
 * is captured (row already 'paid', else the live PI is 'succeeded') → the amount paid covers the bill.
 * On success, links campaign_id + marks paid/shipped (first-write-wins). Returns a discriminated result;
 * the caller turns `!ok` into a 402 and NEVER ships. Degrades honestly: a missing table / unreadable
 * row / Stripe error is a verification FAILURE (we never ship a billable order we can't prove was paid).
 */
export async function verifyAndLinkCheckoutPayment(opts: {
  paymentIntentId: string
  clientId: string
  campaignId: string
  preTaxCents: number
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  let row: { client_id?: string; status?: string; campaign_id?: string | null; subtotal_cents?: number; service_fee_cents?: number } | null = null
  try {
    const { data } = await paymentsTable()
      .select('client_id, status, campaign_id, subtotal_cents, service_fee_cents')
      .eq('stripe_payment_intent_id', opts.paymentIntentId)
      .maybeSingle()
    row = data
  } catch {
    return { ok: false, reason: 'Could not verify your payment. Please try again.' }
  }
  if (!row) return { ok: false, reason: 'No payment on file for this order.' }
  if (row.client_id !== opts.clientId) return { ok: false, reason: 'This payment belongs to a different account.' }

  // Captured? Trust a 'paid' row (webhook/complete already reconciled). Otherwise ask Stripe directly,
  // because the ship can land before the webhook flips the row (the card cleared client-side first).
  // A monthly-only order keys its row to a SetupIntent (seti_...): "paid" there means the card
  // setup succeeded — the subscription bills it right after ship.
  let paid = row.status === 'paid'
  if (!paid) {
    try {
      if (opts.paymentIntentId.startsWith('seti_')) {
        const si = await stripe.setupIntents.retrieve(opts.paymentIntentId)
        paid = si.status === 'succeeded'
      } else {
        const pi = await stripe.paymentIntents.retrieve(opts.paymentIntentId)
        paid = pi.status === 'succeeded'
      }
    } catch {
      return { ok: false, reason: 'Could not verify your payment. Please try again.' }
    }
  }
  if (!paid) return { ok: false, reason: 'Your payment has not completed yet.' }

  // The amount actually billed must cover this campaign's pre-tax bill (recomputed from its
  // line items). Both were computed server-side from the same draft, so this is defense-in-depth
  // against a swapped/stale PaymentIntent, never expected to trip on the happy path.
  const paidPreTax = (row.subtotal_cents ?? 0) + (row.service_fee_cents ?? 0)
  if (paidPreTax < opts.preTaxCents) return { ok: false, reason: 'The amount paid does not cover this order.' }

  // Bind the payment to the campaign (idempotent with /checkout/complete + the webhook backstop).
  const nowISO = new Date().toISOString()
  try {
    await paymentsTable()
      .update({ status: 'paid', campaign_id: opts.campaignId, paid_at: nowISO, shipped_at: nowISO })
      .eq('stripe_payment_intent_id', opts.paymentIntentId)
      .is('campaign_id', null)
  } catch {
    /* the charge is verified paid; a link hiccup is reconciled by /complete + the webhook */
  }
  return { ok: true }
}
