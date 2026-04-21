/**
 * Stripe webhook -- Apnosh billing v2.
 *
 * Handles the 11 events the spec requires plus 2 legacy events
 * (checkout.session.completed, invoice.payment_succeeded) needed by the
 * existing /dashboard/orders self-serve flow.
 *
 * Every event is:
 *   1. Verified via STRIPE_WEBHOOK_SECRET
 *   2. Recorded in stripe_events for idempotency + audit
 *   3. Processed by a per-type handler that mirrors state into
 *      billing_customers / subscriptions / invoices
 *   4. Side-effect business logic runs AFTER payment-state mirroring:
 *      - work_briefs from confirmed orders (legacy)
 *      - service-area grants/revokes via billing-grants helpers
 *      - notifications to the client
 *
 * Idempotency: if stripe_events already has a row with this event_id
 * AND it was successfully processed, we return 200 immediately.
 * Otherwise we proceed and record success/failure.
 */

import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import {
  ensureClientForStripeCustomer,
  grantFromCatalogItem,
  revokeFromCatalogItem,
} from '@/lib/billing-grants'

export const runtime = 'nodejs'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-02-24.acacia',
})

// Generic SupabaseClient (no generated DB types) -- the billing tables
// from migration 055 are not in the generated types yet. Once the repo's
// Supabase type generation is rerun, this can be tightened.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminClient = SupabaseClient<any, 'public', any>

function getAdminClient(): AdminClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as AdminClient
}

// ============================================================
// Entry
// ============================================================

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
      process.env.STRIPE_WEBHOOK_SECRET!,
    )
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error('[stripe webhook] verification failed:', message)
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const supabase = getAdminClient()

  // Idempotency: skip if we already processed this event_id successfully.
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id, processed_at, error_message')
    .eq('stripe_event_id', event.id)
    .maybeSingle()

  if (existing?.processed_at && !existing.error_message) {
    return NextResponse.json({ received: true, status: 'already_processed' })
  }

  // Record the event (upsert so retries don't duplicate the row).
  await supabase.from('stripe_events').upsert(
    {
      stripe_event_id: event.id,
      event_type: event.type,
      payload: event as unknown as Record<string, unknown>,
    },
    { onConflict: 'stripe_event_id' },
  )

  try {
    await dispatch(event, supabase)

    await supabase
      .from('stripe_events')
      .update({ processed_at: new Date().toISOString(), error_message: null })
      .eq('stripe_event_id', event.id)

    return NextResponse.json({ received: true })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    console.error(`[stripe webhook] ${event.type} handler failed:`, message)

    await supabase
      .from('stripe_events')
      .update({ error_message: message })
      .eq('stripe_event_id', event.id)

    // Return 200 so Stripe doesn't spam retry a handler bug. We've logged
    // the failure in stripe_events for manual review.
    return NextResponse.json({ received: true, error: message })
  }
}

// ============================================================
// Dispatch
// ============================================================

async function dispatch(event: Stripe.Event, supabase: AdminClient) {
  switch (event.type) {
    // --- Subscriptions ---
    case 'customer.subscription.created':
      return handleSubscriptionCreated(supabase, event.data.object as Stripe.Subscription)
    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(supabase, event.data.object as Stripe.Subscription)
    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(supabase, event.data.object as Stripe.Subscription)

    // --- Invoices ---
    case 'invoice.created':
    case 'invoice.finalized':
      return handleInvoiceUpserted(supabase, event.data.object as Stripe.Invoice)
    case 'invoice.paid':
    case 'invoice.payment_succeeded':
      return handleInvoicePaid(supabase, event.data.object as Stripe.Invoice)
    case 'invoice.payment_failed':
      return handleInvoiceFailed(supabase, event.data.object as Stripe.Invoice)
    case 'invoice.voided':
      return handleInvoiceVoided(supabase, event.data.object as Stripe.Invoice)

    // --- Customer / payment method ---
    case 'customer.updated':
      return handleCustomerUpdated(supabase, event.data.object as Stripe.Customer)
    case 'payment_method.attached':
      return handlePaymentMethodAttached(supabase, event.data.object as Stripe.PaymentMethod)

    // --- Legacy (orders self-serve flow) ---
    case 'checkout.session.completed':
      return handleCheckoutComplete(supabase, event.data.object as Stripe.Checkout.Session)

    default:
      // Record-only for unknown types -- no-op handler is fine.
      console.log('[stripe webhook] unhandled event:', event.type)
  }
}

// ============================================================
// Helpers
// ============================================================

async function findClientByStripeCustomer(
  supabase: AdminClient,
  customerId: string,
): Promise<string | null> {
  // Primary: new billing_customers mirror.
  const { data: bc } = await supabase
    .from('billing_customers')
    .select('client_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  if (bc?.client_id) return bc.client_id

  // Fallback: legacy businesses.stripe_customer_id -> client_id bridge.
  const { data: biz } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('stripe_customer_id', customerId)
    .maybeSingle()
  return biz?.client_id ?? null
}

function unixToIso(unix: number | null | undefined): string | null {
  return unix ? new Date(unix * 1000).toISOString() : null
}

function mapSubscriptionStatus(s: Stripe.Subscription.Status): string {
  // Stripe's enum maps 1:1 onto our schema except 'canceled' (US spelling)
  // which we also use. Defensive fallback to 'active' for unknowns.
  const valid = [
    'active', 'past_due', 'canceled', 'trialing', 'unpaid',
    'paused', 'incomplete', 'incomplete_expired',
  ]
  return valid.includes(s) ? s : 'active'
}

function mapInvoiceStatus(s: Stripe.Invoice.Status | null): string {
  if (!s) return 'draft'
  const valid = ['draft', 'open', 'paid', 'void', 'uncollectible']
  return valid.includes(s) ? s : 'open'
}

// ============================================================
// Subscription handlers
// ============================================================

// Map a Stripe subscription status to our clients.billing_status enum.
// clients.billing_status accepts: active | paused | cancelled | past_due
function mapToClientBillingStatus(s: Stripe.Subscription.Status): string | null {
  switch (s) {
    case 'active':
    case 'trialing':
      return 'active'
    case 'past_due':
    case 'incomplete':
      return 'past_due'
    case 'paused':
      return 'paused'
    case 'canceled':
    case 'unpaid':
    case 'incomplete_expired':
      return 'cancelled'
    default:
      return null
  }
}

async function upsertSubscription(
  supabase: AdminClient,
  sub: Stripe.Subscription,
) {
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id

  // Resolve client_id. Create-on-demand via billing-grants helper for the
  // legacy path where the Stripe customer predates the billing_customers row.
  let clientId = await findClientByStripeCustomer(supabase, customerId)
  if (!clientId) {
    const customer = await stripe.customers.retrieve(customerId) as Stripe.Customer
    clientId = await ensureClientForStripeCustomer(supabase, {
      stripeCustomerId: customerId,
      email: customer.email ?? null,
      name: customer.name ?? null,
    })
  }
  if (!clientId) return

  const firstItem = sub.items.data[0]
  const price = firstItem?.price
  const amount = price?.unit_amount ?? 0

  await supabase.from('subscriptions').upsert(
    {
      client_id: clientId,
      stripe_subscription_id: sub.id,
      stripe_customer_id: customerId,
      stripe_price_id: price?.id ?? null,
      plan_name: (sub.metadata?.plan_name as string | undefined) ?? 'Retainer',
      amount_cents: amount,
      currency: (price?.currency ?? 'usd').toLowerCase(),
      interval: price?.recurring?.interval ?? 'month',
      status: mapSubscriptionStatus(sub.status),
      collection_method: sub.collection_method === 'charge_automatically'
        ? 'charge_automatically'
        : 'send_invoice',
      current_period_start: unixToIso(sub.current_period_start),
      current_period_end: unixToIso(sub.current_period_end),
      cancel_at_period_end: sub.cancel_at_period_end,
      canceled_at: unixToIso(sub.canceled_at),
      trial_end: unixToIso(sub.trial_end),
    },
    { onConflict: 'stripe_subscription_id' },
  )

  // Auto-sync the CRM fields on the clients table so the legacy 'Billing'
  // card on the client detail page stays accurate. clients.monthly_rate
  // mirrors the subscription amount (in dollars, numeric). clients.billing_status
  // mirrors the lifecycle state via mapToClientBillingStatus.
  const mappedStatus = mapToClientBillingStatus(sub.status)
  const clientUpdate: Record<string, unknown> = {
    monthly_rate: amount / 100,
  }
  if (mappedStatus) clientUpdate.billing_status = mappedStatus
  await supabase.from('clients').update(clientUpdate).eq('id', clientId)
}

async function handleSubscriptionCreated(supabase: AdminClient, sub: Stripe.Subscription) {
  await upsertSubscription(supabase, sub)
}

async function handleSubscriptionUpdated(supabase: AdminClient, sub: Stripe.Subscription) {
  await upsertSubscription(supabase, sub)
}

async function handleSubscriptionDeleted(supabase: AdminClient, sub: Stripe.Subscription) {
  await supabase
    .from('subscriptions')
    .update({
      status: 'canceled',
      canceled_at: new Date().toISOString(),
    })
    .eq('stripe_subscription_id', sub.id)

  // Revoke any service-area grants tied to this subscription's products.
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id
  const clientId = await findClientByStripeCustomer(supabase, customerId)

  // Also sync clients.billing_status so the legacy card reflects cancellation.
  if (clientId) {
    await supabase
      .from('clients')
      .update({ billing_status: 'cancelled' })
      .eq('id', clientId)
  }

  if (clientId) {
    try {
      const full = await stripe.subscriptions.retrieve(sub.id, {
        expand: ['items.data.price.product'],
      })
      for (const item of full.items.data) {
        const product = item.price.product as Stripe.Product
        const catalogId = product?.metadata?.service_id
        if (catalogId) {
          await revokeFromCatalogItem(supabase, clientId, catalogId)
        }
      }
    } catch (err) {
      console.error('[stripe webhook] revoke lookup failed:', err)
    }
  }
}

// ============================================================
// Invoice handlers
// ============================================================

/**
 * Shared upsert for any invoice event. Mirrors the Stripe invoice into our
 * `invoices` table and (if the invoice is hosted / finalized) mirrors its
 * line items into `invoice_line_items`.
 */
async function upsertInvoice(
  supabase: AdminClient,
  invoice: Stripe.Invoice,
  statusOverride?: string,
) {
  const customerId = typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id
  if (!customerId) return

  const clientId = await findClientByStripeCustomer(supabase, customerId)
  if (!clientId) {
    console.warn(`[stripe webhook] no client for customer ${customerId}; invoice ${invoice.id} skipped`)
    return
  }

  const subId = typeof invoice.subscription === 'string'
    ? invoice.subscription
    : invoice.subscription?.id ?? null

  // Find existing row to know whether to preserve our invoice_number
  // and whether to avoid regressing a real total back to 0.
  const { data: existing } = await supabase
    .from('invoices')
    .select('id, invoice_number, total_cents, status')
    .eq('stripe_invoice_id', invoice.id)
    .maybeSingle()

  // Guard against 'invoice.created' landing AFTER 'invoice.finalized'.
  // When we see an event with zero totals but our row already has real
  // totals, skip the total fields (and status) to avoid regressing.
  // This is specifically the out-of-order webhook race we hit after
  // calling stripe.invoices.create -> invoiceItems.create -> finalize.
  const incomingTotal = invoice.total ?? 0
  const hasExistingTotal = existing && existing.total_cents > 0
  const shouldRegressProtect = hasExistingTotal && incomingTotal === 0

  const invoiceRow: Record<string, unknown> = {
    client_id: clientId,
    stripe_invoice_id: invoice.id,
    stripe_subscription_id: subId,
    type: (subId ? 'subscription' : 'one_time'),
    currency: (invoice.currency ?? 'usd').toLowerCase(),
    issued_at: unixToIso(invoice.created),
    due_at: unixToIso(invoice.due_date),
    paid_at: invoice.status === 'paid' ? unixToIso(invoice.status_transitions?.paid_at) : null,
    voided_at: invoice.status === 'void' ? unixToIso(invoice.status_transitions?.voided_at) : null,
    period_start: unixToIso(invoice.period_start),
    period_end: unixToIso(invoice.period_end),
    hosted_invoice_url: invoice.hosted_invoice_url ?? null,
    invoice_pdf_url: invoice.invoice_pdf ?? null,
    description: invoice.description ?? null,
  }

  // Invoice number: always use OUR format (APNOSH-YYYY-NNNN) via the
  // database default -- never store Stripe's auto-assigned number, which
  // follows their invoice_prefix scheme (e.g. JRMMCTVH-0002).
  // For new rows, omit the field so the default fires.
  // For existing rows, don't touch the column.
  // (invoice.number from Stripe is ignored entirely.)

  // Money fields -- skip writing these if we'd regress from real to zero.
  if (!shouldRegressProtect) {
    invoiceRow.amount_due_cents = invoice.amount_due ?? 0
    invoiceRow.amount_paid_cents = invoice.amount_paid ?? 0
    invoiceRow.subtotal_cents = invoice.subtotal ?? 0
    invoiceRow.tax_cents = invoice.tax ?? 0
    invoiceRow.total_cents = incomingTotal
    invoiceRow.status = statusOverride ?? mapInvoiceStatus(invoice.status)
  }

  const { data: upserted } = await supabase
    .from('invoices')
    .upsert(invoiceRow, { onConflict: 'stripe_invoice_id' })
    .select('id')
    .single()

  if (!upserted?.id) return

  // Re-sync line items. Safe to replace on every event because line items
  // rarely change after finalization, and when they do (revisions) the
  // new set is authoritative.
  await supabase.from('invoice_line_items').delete().eq('invoice_id', upserted.id)

  const lines = invoice.lines?.data ?? []
  if (lines.length > 0) {
    const rows = lines.map(li => ({
      invoice_id: upserted.id,
      stripe_line_item_id: li.id,
      stripe_price_id: li.price?.id ?? null,
      description: li.description ?? '(no description)',
      quantity: li.quantity ?? 1,
      unit_amount_cents: li.price?.unit_amount ?? 0,
      amount_cents: li.amount ?? 0,
      period_start: unixToIso(li.period?.start),
      period_end: unixToIso(li.period?.end),
    }))
    await supabase.from('invoice_line_items').insert(rows)
  }
}

async function handleInvoiceUpserted(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice)
}

async function handleInvoicePaid(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'paid')

  // If this was a subscription invoice that had failed before, flip
  // subscription back to active.
  if (invoice.subscription) {
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
    await supabase
      .from('subscriptions')
      .update({ status: 'active' })
      .eq('stripe_subscription_id', subId)
      .eq('status', 'past_due')
  }
}

async function handleInvoiceFailed(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'failed')

  if (invoice.subscription) {
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', subId)
  }
}

async function handleInvoiceVoided(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'void')
}

// ============================================================
// Customer / payment method handlers
// ============================================================

async function handleCustomerUpdated(supabase: AdminClient, customer: Stripe.Customer) {
  // Mirror email / default payment method onto billing_customers.
  const defaultPm = typeof customer.invoice_settings?.default_payment_method === 'string'
    ? customer.invoice_settings.default_payment_method
    : customer.invoice_settings?.default_payment_method?.id ?? null

  await supabase
    .from('billing_customers')
    .update({ default_payment_method_id: defaultPm })
    .eq('stripe_customer_id', customer.id)
}

async function handlePaymentMethodAttached(
  supabase: AdminClient,
  pm: Stripe.PaymentMethod,
) {
  const customerId = typeof pm.customer === 'string' ? pm.customer : pm.customer?.id
  if (!customerId) return

  const card = pm.card
  await supabase
    .from('billing_customers')
    .update({
      default_payment_method_id: pm.id,
      payment_method_brand: card?.brand ?? null,
      payment_method_last4: card?.last4 ?? null,
    })
    .eq('stripe_customer_id', customerId)
}

// ============================================================
// Legacy: checkout.session.completed (self-serve /dashboard/orders flow)
// ============================================================
// Preserves the existing orders -> work_briefs -> notifications -> grants
// pipeline. The new admin retainer flow doesn't go through Checkout so
// this handler only fires for /dashboard/orders purchases.

async function handleCheckoutComplete(
  supabase: AdminClient,
  session: Stripe.Checkout.Session,
) {
  const businessId = session.metadata?.business_id
  if (!businessId) return

  // Mark the matching orders as confirmed.
  await supabase
    .from('orders')
    .update({ status: 'confirmed', stripe_checkout_session_id: session.id })
    .eq('stripe_checkout_session_id', session.id)
    .eq('status', 'pending')

  // Grants on one-time purchases (non-subscription Checkouts).
  if (session.mode !== 'subscription') {
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
    if (customerId) {
      const clientId = await ensureClientForStripeCustomer(supabase, {
        stripeCustomerId: customerId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        name: session.customer_details?.name ?? null,
      })
      if (clientId) {
        const items = await stripe.checkout.sessions.listLineItems(session.id, {
          expand: ['data.price.product'],
        })
        for (const li of items.data) {
          const product = li.price?.product as Stripe.Product | undefined
          const catalogId = product?.metadata?.service_id
          if (catalogId) {
            await grantFromCatalogItem(supabase, clientId, catalogId)
          }
        }
      }
    }
  }

  // Subscription mode from Checkout (legacy -- new admin flow bypasses
  // Checkout). Let customer.subscription.created fire the mirror; we just
  // grant access and create briefs here.
  if (session.mode === 'subscription' && session.subscription) {
    const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id
    const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id
    if (customerId) {
      const clientId = await ensureClientForStripeCustomer(supabase, {
        stripeCustomerId: customerId,
        email: session.customer_details?.email ?? session.customer_email ?? null,
        name: session.customer_details?.name ?? null,
      })
      if (clientId) {
        const sub = await stripe.subscriptions.retrieve(subId, {
          expand: ['items.data.price.product'],
        })
        for (const item of sub.items.data) {
          const product = item.price.product as Stripe.Product
          const catalogId = product?.metadata?.service_id
          if (catalogId) {
            await grantFromCatalogItem(supabase, clientId, catalogId)
          }
        }
      }
    }
  }

  // Auto-generate work briefs for confirmed orders (unchanged).
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
        console.error('[stripe webhook] work brief insert failed:', briefErr.message)
      }
    }
  }

  // Notify the client.
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
