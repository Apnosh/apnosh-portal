import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

// ============================================================
// Money helpers -- use these everywhere so conversions stay consistent.
// ============================================================

/** Safe dollars (number) -> cents (integer). Rounds to nearest cent. */
export function dollarsToCents(dollars: number): number {
  return Math.round(dollars * 100)
}

export function centsToDollars(cents: number): number {
  return cents / 100
}

/** USD display formatter. Use in all UI so the app stays consistent. */
export function formatCents(cents: number, currency: string = 'usd'): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: currency.toUpperCase(),
    minimumFractionDigits: 2,
  }).format(cents / 100)
}

/**
 * Next Apnosh billing anchor (15th of the month). Returns the next
 * 15th on or after the provided date. Stripe takes this as a unix
 * timestamp via `billing_cycle_anchor`.
 */
export function nextBillingAnchor(from: Date = new Date()): Date {
  const anchor = new Date(from)
  anchor.setHours(12, 0, 0, 0)
  if (anchor.getDate() <= 15) {
    anchor.setDate(15)
  } else {
    anchor.setMonth(anchor.getMonth() + 1, 15)
  }
  return anchor
}

// ============================================================
// Client-keyed helpers (new billing model, migration 055+).
// ============================================================
// The legacy helpers below (getOrCreateStripeCustomer, etc.) operate on
// businesses.id and remain for the self-serve /dashboard/orders flow.
// The functions below are for the admin-initiated retainer flow that
// keys on clients.id per the billing spec.

function getAdminSupabase() {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  )
}

/**
 * Look up or create a Stripe customer for a given client_id.
 * Mirrors the stripe_customer_id into billing_customers.
 *
 * Address is REQUIRED for Stripe Tax to calculate sales tax on invoices.
 * Without it, tax calculation silently skips. State + postal code is
 * the minimum; line1/city/country fill out a cleaner invoice header.
 */
export async function getOrCreateStripeCustomerForClient(opts: {
  clientId: string
  email: string
  name: string
  phone?: string
  address?: {
    line1?: string
    line2?: string
    city?: string
    state: string           // e.g. 'WA'
    postal_code: string     // e.g. '98101'
    country?: string        // defaults to 'US'
  }
}): Promise<string> {
  const admin = getAdminSupabase()

  // Existing mirror row? If so, update address if new one provided.
  const { data: existing } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', opts.clientId)
    .maybeSingle()

  if (existing?.stripe_customer_id) {
    if (opts.address) {
      await stripe.customers.update(existing.stripe_customer_id, {
        address: {
          line1: opts.address.line1,
          line2: opts.address.line2,
          city: opts.address.city,
          state: opts.address.state,
          postal_code: opts.address.postal_code,
          country: opts.address.country ?? 'US',
        },
      })
    }
    return existing.stripe_customer_id
  }

  const customer = await stripe.customers.create({
    email: opts.email,
    name: opts.name,
    phone: opts.phone,
    address: opts.address
      ? {
          line1: opts.address.line1,
          line2: opts.address.line2,
          city: opts.address.city,
          state: opts.address.state,
          postal_code: opts.address.postal_code,
          country: opts.address.country ?? 'US',
        }
      : undefined,
    // Footer shown at the bottom of every hosted invoice page + PDF.
    // Nudges clients toward ACH to reduce card processing fees.
    invoice_settings: {
      footer: 'Pay by bank transfer (ACH) for no processing fees. Credit card also accepted.',
    },
    metadata: { client_id: opts.clientId },
  })

  await admin.from('billing_customers').insert({
    client_id: opts.clientId,
    stripe_customer_id: customer.id,
  })

  return customer.id
}

/**
 * Start a monthly retainer subscription for a client at a custom amount.
 *
 * Uses:
 *   - collection_method: 'send_invoice' (Stripe emails an invoice rather
 *     than auto-charging; clients used to paying by check respond better
 *     to this)
 *   - billing_cycle_anchor: next 15th (Apnosh's monthly billing day)
 *   - proration_behavior: 'none' (no mid-month pro-rated charge during
 *     cutover; first full invoice on the next 15th)
 *
 * Creates a per-subscription price inline via `price_data`, which lets us
 * charge any custom retainer amount without creating a Stripe Price for
 * every client. The umbrella product ID is required.
 */
export async function startMonthlyRetainer(opts: {
  customerId: string
  clientId: string
  amountCents: number
  planName?: string
  retainerProductId: string
  billingAnchor?: Date
}): Promise<Stripe.Subscription> {
  const anchor = opts.billingAnchor ?? nextBillingAnchor()
  const anchorUnix = Math.floor(anchor.getTime() / 1000)

  return await stripe.subscriptions.create({
    customer: opts.customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    billing_cycle_anchor: anchorUnix,
    proration_behavior: 'none',
    // Stripe Tax calculates sales tax per line based on:
    //   - Origin: the business profile address on the Stripe account
    //   - Destination: the customer's address (must be set on Customer)
    //   - Tax code on each Product (set at product-creation time)
    // In WA this correctly applies sales tax on taxable categories
    // (e.g., video production) and skips exempt ones (pure advertising).
    automatic_tax: { enabled: true },
    // Payment methods listed in display order: ACH first so clients see
    // it as the primary option (saves ~3% per charge; Apnosh absorbs the
    // difference when clients insist on card).
    payment_settings: {
      payment_method_types: ['us_bank_account', 'card'],
      save_default_payment_method: 'on_subscription',
    },
    items: [
      {
        price_data: {
          product: opts.retainerProductId,
          currency: 'usd',
          unit_amount: opts.amountCents,
          recurring: { interval: 'month' },
        },
      },
    ],
    metadata: {
      client_id: opts.clientId,
      plan_name: opts.planName ?? 'Monthly Retainer',
      source: 'admin_portal',
    },
  })
}

/**
 * Get or create a Stripe Customer for a business.
 * Stores the stripe_customer_id on the business record.
 */
export async function getOrCreateStripeCustomer(
  businessId: string,
  email: string,
  name: string
): Promise<string> {
  const supabase = await createClient()

  // Check if business already has a Stripe customer
  const { data: business } = await supabase
    .from('businesses')
    .select('stripe_customer_id')
    .eq('id', businessId)
    .single()

  if (business?.stripe_customer_id) {
    return business.stripe_customer_id
  }

  // Create new Stripe customer
  const customer = await stripe.customers.create({
    email,
    name,
    metadata: {
      supabase_business_id: businessId,
    },
  })

  // Store on business record
  await supabase
    .from('businesses')
    .update({ stripe_customer_id: customer.id })
    .eq('id', businessId)

  return customer.id
}

/**
 * Create a Stripe Checkout Session for purchasing services.
 * Supports mixed carts (subscriptions + one-time items).
 */
export async function createCheckoutSession({
  customerId,
  lineItems,
  successUrl,
  cancelUrl,
  metadata,
}: {
  customerId: string
  lineItems: Stripe.Checkout.SessionCreateParams.LineItem[]
  successUrl: string
  cancelUrl: string
  metadata?: Record<string, string>
}): Promise<string> {
  // Determine if any items are recurring
  const hasSubscription = lineItems.some(
    (item) => item.price_data?.recurring
  )

  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    payment_method_types: ['card', 'us_bank_account'],
    line_items: lineItems,
    mode: hasSubscription ? 'subscription' : 'payment',
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
    subscription_data: hasSubscription
      ? { metadata: metadata || {} }
      : undefined,
    payment_intent_data: !hasSubscription
      ? { metadata: metadata || {} }
      : undefined,
  })

  return session.url!
}

/**
 * Create a Stripe Customer Portal session.
 * Lets clients manage payment methods, view invoices, cancel subscriptions.
 */
export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  })

  return session.url
}

/**
 * Create a Stripe Subscription for a client (admin use).
 * Each service becomes a line item on the subscription.
 */
export async function createSubscription({
  customerId,
  priceIds,
  metadata,
}: {
  customerId: string
  priceIds: string[]
  metadata?: Record<string, string>
}): Promise<Stripe.Subscription> {
  const subscription = await stripe.subscriptions.create({
    customer: customerId,
    items: priceIds.map((priceId) => ({ price: priceId })),
    payment_behavior: 'default_incomplete',
    payment_settings: {
      payment_method_types: ['card', 'us_bank_account'],
      save_default_payment_method: 'on_subscription',
    },
    expand: ['latest_invoice.payment_intent'],
    metadata,
  })

  return subscription
}

/**
 * Create a one-time invoice for a client (admin use).
 */
export async function createOneTimeInvoice({
  customerId,
  amount,
  description,
}: {
  customerId: string
  amount: number
  description: string
}): Promise<Stripe.Invoice> {
  // Create invoice item
  await stripe.invoiceItems.create({
    customer: customerId,
    amount: Math.round(amount * 100), // Convert to cents
    currency: 'usd',
    description,
  })

  // Create and finalize invoice
  const invoice = await stripe.invoices.create({
    customer: customerId,
    auto_advance: true, // Finalize and send automatically
    collection_method: 'send_invoice',
    days_until_due: 7,
  })

  const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id)

  return finalizedInvoice
}
