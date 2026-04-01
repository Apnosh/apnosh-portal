import Stripe from 'stripe'
import { createClient } from '@/lib/supabase/server'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY is not set')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-03-31.basil',
  typescript: true,
})

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
