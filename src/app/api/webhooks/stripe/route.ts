import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import {
  ensureClientForStripeCustomer,
  grantFromCatalogItem,
  revokeFromCatalogItem,
} from '@/lib/billing-grants'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

// Use service role client for webhook handler (bypasses RLS)
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.text()
  const signature = request.headers.get('stripe-signature')

  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 })
  }

  let event: Stripe.Event

  try {
    event = stripe.webhooks.constructEvent(
      body,
      signature,
      process.env.STRIPE_WEBHOOK_SECRET!
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('Webhook signature verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        await handleCheckoutComplete(supabase, session)
        break
      }

      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoicePaid(supabase, invoice)
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice
        await handleInvoiceFailed(supabase, invoice)
        break
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionUpdated(supabase, subscription)
        break
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription
        await handleSubscriptionDeleted(supabase, subscription)
        break
      }

      default:
        console.log(`Unhandled event type: ${event.type}`)
    }
  } catch (err) {
    console.error(`Error handling ${event.type}:`, err)
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 })
  }

  return NextResponse.json({ received: true })
}

// ── Handlers ──

async function handleCheckoutComplete(
  supabase: ReturnType<typeof getAdminClient>,
  session: Stripe.Checkout.Session
) {
  const businessId = session.metadata?.business_id
  if (!businessId) return

  // Update orders from this checkout session to confirmed
  await supabase
    .from('orders')
    .update({ status: 'confirmed', stripe_checkout_session_id: session.id })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')

  // If subscription mode, the subscription.created event handles the rest
  if (session.mode === 'subscription' && session.subscription) {
    const subscriptionId =
      typeof session.subscription === 'string'
        ? session.subscription
        : session.subscription.id

    // Fetch the full subscription to get line items
    const subscription = await stripe.subscriptions.retrieve(subscriptionId, {
      expand: ['items.data.price.product'],
    })

    // Create subscription record(s) in Supabase
    const customerId =
      typeof subscription.customer === 'string'
        ? subscription.customer
        : subscription.customer.id

    for (const item of subscription.items.data) {
      const product = item.price.product as Stripe.Product

      await supabase.from('subscriptions').insert({
        business_id: businessId,
        plan_id: product.metadata?.service_id || null,
        plan_name: product.name,
        plan_price: (item.price.unit_amount || 0) / 100,
        billing_interval: item.price.recurring?.interval === 'year' ? 'annually' : 'monthly',
        status: subscription.status === 'active' ? 'active' : 'trialing',
        stripe_subscription_id: subscription.id,
        stripe_customer_id: customerId,
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      })
    }

    // ── Grant service-area access on the matching client ──
    const clientId = await ensureClientForStripeCustomer(supabase, {
      stripeCustomerId: customerId,
      email: session.customer_details?.email ?? session.customer_email ?? null,
      name: session.customer_details?.name ?? null,
    })
    if (clientId) {
      for (const item of subscription.items.data) {
        const product = item.price.product as Stripe.Product
        const catalogId = product.metadata?.service_id
        if (catalogId) {
          await grantFromCatalogItem(supabase, clientId, catalogId)
        }
      }
    }
  }

  // ── One-time / non-subscription purchases also grant access ──
  if (session.mode !== 'subscription') {
    const customerId =
      typeof session.customer === 'string'
        ? session.customer
        : session.customer?.id
    if (customerId) {
      const clientId = await ensureClientForStripeCustomer(supabase, {
        stripeCustomerId: customerId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        name: session.customer_details?.name ?? null,
      })
      if (clientId) {
        // Pull line items to find catalog ids
        const lineItems = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product'],
        })
        for (const li of lineItems.data) {
          const product = li.price?.product as Stripe.Product | undefined
          const catalogId = product?.metadata?.service_id
          if (catalogId) {
            await grantFromCatalogItem(supabase, clientId, catalogId)
          }
        }
      }
    }
  }

  // Auto-generate work briefs for each confirmed order
  const { data: confirmedOrders } = await supabase
    .from('orders')
    .select('id, service_name, type, quantity, special_instructions, deadline')
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'confirmed')

  if (confirmedOrders?.length) {
    for (const order of confirmedOrders) {
      const { error: briefErr } = await supabase.from('work_briefs').insert({
        business_id: businessId,
        order_id: order.id,
        title: `Brief: ${order.service_name}`,
        description: order.special_instructions || `Work brief for ${order.service_name}`,
        status: 'pending',
        deadline: order.deadline || null,
      })
      if (briefErr) {
        console.error('Failed to create work brief:', briefErr.message)
      }
    }
  }

  // Create notification for the client
  const { data: business } = await supabase
    .from('businesses')
    .select('owner_id, name')
    .eq('id', businessId)
    .single()

  if (business) {
    await supabase.from('notifications').insert({
      user_id: business.owner_id,
      type: 'payment',
      title: 'Payment confirmed',
      body: `Your payment for ${business.name} has been confirmed. We'll get started right away.`,
      link: '/dashboard/orders',
    })
  }
}

async function handleInvoicePaid(
  supabase: ReturnType<typeof getAdminClient>,
  invoice: Stripe.Invoice
) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id

  if (!customerId) return

  // Find business by Stripe customer ID
  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!business) return

  // Upsert invoice record
  await supabase.from('invoices').upsert(
    {
      business_id: business.id,
      stripe_invoice_id: invoice.id,
      amount: (invoice.amount_paid || 0) / 100,
      status: 'paid',
      description: invoice.description || `Invoice ${invoice.number}`,
      invoice_url: invoice.hosted_invoice_url || null,
      invoice_pdf: invoice.invoice_pdf || null,
      period_start: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      period_end: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
      paid_at: new Date().toISOString(),
    },
    { onConflict: 'stripe_invoice_id' }
  )

  // Update subscription status to active if it was past_due
  if (invoice.subscription) {
    const subId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription.id

    await supabase
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('stripe_subscription_id', subId)
      .eq('status', 'past_due')
  }
}

async function handleInvoiceFailed(
  supabase: ReturnType<typeof getAdminClient>,
  invoice: Stripe.Invoice
) {
  const customerId =
    typeof invoice.customer === 'string'
      ? invoice.customer
      : invoice.customer?.id

  if (!customerId) return

  const { data: business } = await supabase
    .from('businesses')
    .select('id, owner_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (!business) return

  // Upsert invoice as failed
  await supabase.from('invoices').upsert(
    {
      business_id: business.id,
      stripe_invoice_id: invoice.id,
      amount: (invoice.amount_due || 0) / 100,
      status: 'failed',
      description: invoice.description || `Invoice ${invoice.number}`,
      invoice_url: invoice.hosted_invoice_url || null,
      invoice_pdf: invoice.invoice_pdf || null,
      period_start: invoice.period_start
        ? new Date(invoice.period_start * 1000).toISOString()
        : null,
      period_end: invoice.period_end
        ? new Date(invoice.period_end * 1000).toISOString()
        : null,
    },
    { onConflict: 'stripe_invoice_id' }
  )

  // Update subscription to past_due
  if (invoice.subscription) {
    const subId =
      typeof invoice.subscription === 'string'
        ? invoice.subscription
        : invoice.subscription.id

    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', subId)
  }

  // Notify client
  await supabase.from('notifications').insert({
    user_id: business.owner_id,
    type: 'payment',
    title: 'Payment failed',
    body: 'Your recent payment could not be processed. Please update your payment method.',
    link: '/dashboard/billing',
  })
}

async function handleSubscriptionUpdated(
  supabase: ReturnType<typeof getAdminClient>,
  subscription: Stripe.Subscription
) {
  const statusMap: Record<string, string> = {
    active: 'active',
    past_due: 'past_due',
    canceled: 'cancelled',
    unpaid: 'past_due',
    trialing: 'trialing',
    paused: 'paused',
  }

  await supabase
    .from('subscriptions')
    .update({
      status: statusMap[subscription.status] || 'active',
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancelled_at: subscription.canceled_at
        ? new Date(subscription.canceled_at * 1000).toISOString()
        : null,
    })
    .eq('stripe_subscription_id', subscription.id)
}

async function handleSubscriptionDeleted(
  supabase: ReturnType<typeof getAdminClient>,
  subscription: Stripe.Subscription
) {
  await supabase
    .from('subscriptions')
    .update({
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', subscription.id)

  // Notify client
  const customerId =
    typeof subscription.customer === 'string'
      ? subscription.customer
      : subscription.customer.id

  const { data: business } = await supabase
    .from('businesses')
    .select('owner_id, client_id')
    .eq('stripe_customer_id', customerId)
    .single()

  if (business) {
    await supabase.from('notifications').insert({
      user_id: business.owner_id,
      type: 'payment',
      title: 'Subscription cancelled',
      body: 'Your subscription has been cancelled. You can resubscribe anytime from the Orders page.',
      link: '/dashboard/orders',
    })
  }

  // ── Revoke service-area access for whatever was on the cancelled sub ──
  const clientId = business?.client_id
    ?? (await ensureClientForStripeCustomer(supabase, { stripeCustomerId: customerId }))
  if (clientId) {
    // Pull the cancelled subscription's line items so we know what to revoke
    try {
      const fullSub = await stripe.subscriptions.retrieve(subscription.id, {
        expand: ['items.data.price.product'],
      })
      for (const item of fullSub.items.data) {
        const product = item.price.product as Stripe.Product
        const catalogId = product.metadata?.service_id
        if (catalogId) {
          await revokeFromCatalogItem(supabase, clientId, catalogId)
        }
      }
    } catch (err) {
      console.error('[stripe webhook] revoke lookup failed:', err)
    }
  }
}
