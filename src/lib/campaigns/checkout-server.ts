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
  const { data: client } = await admin()
    .from('clients')
    .select('id, name, email, phone, billing_email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) return { error: 'Client not found' }
  const email = (client.billing_email as string | null) || (client.email as string | null)
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
