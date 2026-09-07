/**
 * Stripe webhook -- Apnosh billing v2.
 *
 * Handles the 18 events the spec requires plus 2 legacy events
 * (checkout.session.completed, invoice.payment_succeeded) needed by the
 * existing /dashboard/orders self-serve flow.
 *
 * REQUIRED EVENTS ON THE STRIPE ENDPOINT. Three of these are money going BACKWARDS, and if the
 * endpoint is not subscribed to them nothing here ever runs: the campaign keeps its 'paid' row, the
 * work keeps minting, the subscription keeps billing, and nobody is told. Add all four below in
 * the Stripe dashboard (Developers -> Webhooks -> this endpoint -> Select events):
 *
 *   charge.refunded         a refund, ours or one taken by hand in the dashboard
 *   charge.dispute.created  a chargeback opened
 *   charge.dispute.closed   the bank decided (won -> restore the status; lost -> settle as a
 *                           full refund, without calling Stripe refunds)
 *
 * A fourth is easy to leave off because nothing is charged on it:
 *
 *   setup_intent.succeeded   a MONTHLY-only desk order takes no money today — its payment row is
 *                            keyed to a SetupIntent, so payment_intent.succeeded never fires for
 *                            it. Without this event that order stays 'pending' forever, the owner
 *                            is offered a second card, and nobody is told the work is unmade.
 *
 * The rest: customer.subscription.created/updated/deleted, invoice.created, invoice.finalized,
 * invoice.paid, invoice.payment_failed, invoice.voided, invoice.marked_uncollectible,
 * customer.updated, payment_method.attached, payment_intent.succeeded,
 * payment_intent.payment_failed, payment_intent.processing.
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
import { stripe } from '@/lib/stripe'  // lazy client — not constructed at build time
import {
  ensureClientForStripeCustomer,
  grantFromCatalogItem,
  revokeFromCatalogItem,
} from '@/lib/billing-grants'

export const runtime = 'nodejs'
// Headroom. One handler (settleDeskPayment) waits a few seconds for the happy path to finish
// before it calls a paid order orphaned; a timeout there would make Stripe retry the whole event.
export const maxDuration = 60

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
    case 'invoice.marked_uncollectible':
      return handleInvoiceUncollectible(supabase, event.data.object as Stripe.Invoice)

    // --- Customer / payment method ---
    case 'customer.updated':
      return handleCustomerUpdated(supabase, event.data.object as Stripe.Customer)
    case 'payment_method.attached':
      return handlePaymentMethodAttached(supabase, event.data.object as Stripe.PaymentMethod)

    // --- Campaign checkout (charge-at-checkout) ---
    case 'payment_intent.succeeded':
      return handleCampaignPaymentSucceeded(supabase, event.data.object as Stripe.PaymentIntent)
    case 'payment_intent.payment_failed':
      return handleCampaignPaymentFailed(supabase, event.data.object as Stripe.PaymentIntent)
    case 'setup_intent.succeeded':
      return handleDeskSetupSucceeded(supabase, event.data.object as Stripe.SetupIntent)
    case 'payment_intent.processing':
      return handleInvoicePaymentProcessing(supabase, event.data.object as Stripe.PaymentIntent)

    // --- Money going BACKWARDS (refunds + chargebacks) ---
    case 'charge.refunded':
      return handleChargeRefunded(supabase, event.data.object as Stripe.Charge)
    case 'charge.dispute.created':
      return handleDisputeCreated(supabase, event.data.object as Stripe.Dispute)
    case 'charge.dispute.closed':
      return handleDisputeClosed(supabase, event.data.object as Stripe.Dispute)

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

  // Sync clients.tier from the agent-tier metadata. The sync script tags
  // both Product.metadata.tier_id and Price.metadata.tier_id; the checkout
  // endpoint also sets it on subscription.metadata as a third fallback so
  // the wire-up survives even if a price is recreated.
  const tierFromSub = (sub.metadata?.tier_id as string | undefined)?.toLowerCase()
  let tierFromPrice: string | undefined
  if (!tierFromSub && price?.id) {
    const priceMeta = price.metadata?.tier_id as string | undefined
    if (priceMeta) {
      tierFromPrice = priceMeta.toLowerCase()
    } else {
      // Fall back to product metadata (one network round-trip; rare path).
      try {
        const productId = typeof price.product === 'string' ? price.product : price.product?.id
        if (productId) {
          const product = await stripe.products.retrieve(productId)
          const productTier = (product.metadata?.tier_id as string | undefined)?.toLowerCase()
          if (productTier) tierFromPrice = productTier
        }
      } catch {
        // Non-fatal — we just skip tier sync when product lookup fails.
      }
    }
  }
  const tier = tierFromSub ?? tierFromPrice
  if (tier && ['starter', 'basic', 'standard', 'pro'].includes(tier)) {
    clientUpdate.tier = tier
  }

  // Detect the Apnosh Website Hosting product. When subscribed to it,
  // flip has_apnosh_website=true so the website-editing tools unlock.
  // Read product metadata once if not already attached to the price.
  let apnoshProduct: string | undefined =
    (price?.metadata?.apnosh_product as string | undefined)
    ?? (sub.metadata?.apnosh_product as string | undefined)
  if (!apnoshProduct && price?.product) {
    try {
      const productId = typeof price.product === 'string' ? price.product : price.product.id
      const product = await stripe.products.retrieve(productId)
      apnoshProduct = product.metadata?.apnosh_product as string | undefined
    } catch {
      /* non-fatal */
    }
  }
  if (apnoshProduct === 'website_hosting'
    && (sub.status === 'active' || sub.status === 'trialing')) {
    clientUpdate.has_apnosh_website = true
    if (!('website_started_at' in clientUpdate)) {
      // Stamp the first time only — don't overwrite the original start on renewals.
      const { data: existing } = await supabase
        .from('clients').select('website_started_at').eq('id', clientId).maybeSingle() as
          { data: { website_started_at: string | null } | null }
      if (!existing?.website_started_at) {
        clientUpdate.website_started_at = new Date().toISOString()
      }
    }
  }

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
  // Revert tier to 'starter' (free trial / read-only) so the agent immediately
  // stops honoring paid-tier limits and tools. If the cancelled subscription
  // was specifically the Website Hosting product, flip has_apnosh_website=false
  // so the website-editing tools re-lock immediately.
  if (clientId) {
    const cancelUpdate: Record<string, unknown> = {
      billing_status: 'cancelled',
      tier: 'starter',
    }
    try {
      const full = await stripe.subscriptions.retrieve(sub.id, {
        expand: ['items.data.price.product'],
      })
      const wasWebsite = full.items.data.some(item => {
        const product = item.price.product as Stripe.Product | undefined
        return product?.metadata?.apnosh_product === 'website_hosting'
      })
      if (wasWebsite) cancelUpdate.has_apnosh_website = false
    } catch {
      /* non-fatal */
    }
    await supabase.from('clients').update(cancelUpdate).eq('id', clientId)
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

/* An ACH/bank payment takes days to settle. Stripe announces the in-flight
 * window via payment_intent.processing; stamping the invoice lets admin show
 * "Payment in transit" instead of "Unpaid" (the Anchovies scare, 2026-08-19).
 * No-op for PaymentIntents that are not paying an invoice (campaign checkout),
 * and pre-242 the column is absent (42703) → skip silently. */
async function handleInvoicePaymentProcessing(supabase: AdminClient, pi: Stripe.PaymentIntent) {
  const raw = (pi as unknown as { invoice?: string | { id: string } | null }).invoice
  const invoiceId = typeof raw === 'string' ? raw : raw?.id
  if (!invoiceId) return
  const method = pi.payment_method_types?.includes('us_bank_account') ? 'ach' : pi.payment_method_types?.[0] ?? null
  const { error } = await supabase
    .from('invoices')
    .update({ payment_processing_at: new Date().toISOString(), ...(method ? { payment_method: method } : {}) })
    .eq('stripe_invoice_id', invoiceId)
  if (error && error.code !== '42703') {
    console.warn('[stripe webhook] processing stamp failed:', error.message)
  }
}

/* The in-flight stamp must not outlive the outcome: cleared the moment the
 * invoice resolves either way. Best-effort; pre-242 (42703) is silent. */
async function clearProcessingStamp(supabase: AdminClient, invoice: Stripe.Invoice) {
  if (!invoice.id) return
  const { error } = await supabase
    .from('invoices')
    .update({ payment_processing_at: null })
    .eq('stripe_invoice_id', invoice.id)
  if (error && error.code !== '42703') {
    console.warn('[stripe webhook] processing clear failed:', error.message)
  }
}

async function handleInvoicePaid(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'paid')
  await clearProcessingStamp(supabase, invoice)

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

  // If this invoice was created for a content_quote, mirror "paid"
  // onto the quote row + log a quote.paid event.
  if (invoice.metadata?.apnosh_quote_id && invoice.id) {
    const { markQuotePaid } = await import('@/lib/admin/quote-invoice')
    await markQuotePaid(invoice.id)
  }

  // Campaign-charge bridge: an invoice generated from accrued campaign work flips
  // its charges paid, and each paid creator-lane piece unlocks its payout
  // (accrued→payable) — money-out only ever follows money-in. Status-conditional,
  // so the invoice.paid / invoice.payment_succeeded double-fire is a no-op the
  // second time. Pre-197 the filter column is absent (42703) → skip silently.
  if (invoice.id) {
    const { data: flipped, error } = await supabase
      .from('campaign_charges')
      .update({ status: 'paid', paid_at: new Date().toISOString() })
      .eq('stripe_invoice_id', invoice.id)
      .eq('status', 'invoiced')
      .select('work_order_id')
    if (error && error.code !== '42703') {
      console.warn('[stripe webhook] campaign_charges paid-flip failed:', error.message)
    }
    const orderIds = ((flipped ?? []) as { work_order_id: string | null }[])
      .map((r) => r.work_order_id)
      .filter((v): v is string => !!v)
    if (orderIds.length) {
      await supabase
        .from('creator_payouts')
        .update({ status: 'payable' })
        .in('work_order_id', orderIds)
        .eq('status', 'accrued')
    }
  }
}

async function handleInvoiceFailed(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'failed')
  await clearProcessingStamp(supabase, invoice)

  if (invoice.subscription) {
    const subId = typeof invoice.subscription === 'string' ? invoice.subscription : invoice.subscription.id
    await supabase
      .from('subscriptions')
      .update({ status: 'past_due' })
      .eq('stripe_subscription_id', subId)
  }

  // Mirror failure onto the quote.
  if (invoice.metadata?.apnosh_quote_id && invoice.id) {
    const { markQuoteFailed } = await import('@/lib/admin/quote-invoice')
    const reason = invoice.last_finalization_error?.message
      ?? 'Payment failed — see Stripe dashboard for details.'
    await markQuoteFailed(invoice.id, reason)
  }
}

async function handleInvoiceVoided(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'void')
  await clearProcessingStamp(supabase, invoice)

  if (invoice.metadata?.apnosh_quote_id && invoice.id) {
    const { markQuoteVoided } = await import('@/lib/admin/quote-invoice')
    await markQuoteVoided(invoice.id)
  }

  // Campaign-charge bridge: a voided (discarded) invoice releases its claimed
  // charges back to accrued so the work can be invoiced again. Paid charges are
  // untouched — Stripe cannot void a paid invoice.
  if (invoice.id) {
    const { error } = await supabase
      .from('campaign_charges')
      .update({ status: 'accrued', stripe_invoice_id: null, invoiced_at: null })
      .eq('stripe_invoice_id', invoice.id)
      .eq('status', 'invoiced')
    if (error && error.code !== '42703') {
      console.warn('[stripe webhook] campaign_charges void-release failed:', error.message)
    }
  }
}

async function handleInvoiceUncollectible(supabase: AdminClient, invoice: Stripe.Invoice) {
  await upsertInvoice(supabase, invoice, 'uncollectible')

  // A write-off is a deliberate decision NOT to collect: bridge charges go
  // terminally 'void' — releasing them to 'accrued' would re-bill work the
  // admin just wrote off. Payouts are left where they are; whether creators
  // still get paid for written-off work is a human policy call, not a webhook's.
  if (invoice.id) {
    const { error } = await supabase
      .from('campaign_charges')
      .update({ status: 'void' })
      .eq('stripe_invoice_id', invoice.id)
      .eq('status', 'invoiced')
    if (error && error.code !== '42703') {
      console.warn('[stripe webhook] campaign_charges uncollectible-void failed:', error.message)
    }
  }
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
// Campaign checkout (charge-at-checkout) — PaymentIntent backstop
// ============================================================
// The happy path is reconciled synchronously by /api/checkout/complete (verify → ship → link).
// These handlers are a safety net for the paid-but-tab-closed edge: they only advance a row that
// is STILL pending, so they never clobber a completed+linked payment. An unshipped paid row keeps
// its draft snapshot for recovery.

async function handleCampaignPaymentSucceeded(
  supabase: AdminClient,
  pi: Stripe.PaymentIntent,
) {
  const kind = String(pi.metadata?.kind ?? '')
  // The DESK pays through the same route with its own kinds. This backstop only knew the cart's,
  // so a desk order whose tab closed after the card cleared stayed 'pending' forever: paid at
  // Stripe, unpaid here, no work order, and nobody told.
  const isDesk = kind === 'desk_checkout' || kind === 'desk_checkout_setup'
  if (kind !== 'campaign_checkout' && !isDesk) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('campaign_payments')
    .update({ status: 'paid', paid_at: unixToIso(pi.created) })
    .eq('stripe_payment_intent_id', pi.id)
    .eq('status', 'pending')
    .select('*')
  const row = Array.isArray(rows) ? rows[0] as { id: string; client_id: string; campaign_id: string | null; request_id?: string | null; total_cents: number } | undefined : undefined
  if (!row) return

  if (isDesk) {
    await settleDeskPayment(supabase, row, pi.metadata?.requestId ?? null, unixToIso(pi.created))
    return
  }

  // A charged card with no shipped order is real money with nobody's name on it. The happy path
  // links the campaign at ship; when the tab closed first, this row lands paid and orphaned. Page
  // every admin so a person ships it from the draft snapshot. Best-effort.
  if (!row.campaign_id) {
    try {
      const { getAdminUserIds, createNotification } = await import('@/lib/notify')
      const { data: client } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
      const name = ((client as { name?: string } | null)?.name) ?? 'A client'
      for (const adminId of await getAdminUserIds(supabase)) {
        await createNotification({ supabase, userId: adminId, type: 'order_confirmed', title: 'Paid, not shipped', body: `${name} was charged $${(row.total_cents / 100).toFixed(2)} and the order did not ship (tab closed before checkout finished). Ship it from the payment's draft snapshot.`, link: '/admin/campaign-orders' })
      }
    } catch (e) { console.warn('[stripe] orphan-payment page failed', (e as Error)?.message) }
  }
}


/**
 * A DESK order whose card cleared with nobody watching.
 *
 * The happy path (/api/checkout/complete) stamps the order and mints the work. When the tab closed
 * first, this is the only thing that ever runs — so it does the two parts that cannot wait: the
 * order row says it is paid (or /checkout/prepare offers a second card for an order already paid
 * for), and a paid order with nothing being made pages every admin.
 *
 * The mint itself is deliberately NOT done here. It is the same idempotent finalize the happy path
 * calls, and a webhook is not the place to start work orders behind a person's back; the page is.
 *
 * IT WAITS BEFORE IT PAGES. Stripe fires this a second or two after the card clears, while
 * /checkout/complete is usually still working — so "no work order yet" was almost always a race,
 * not an orphan, and every ordinary desk order paged every admin with "Paid, nothing made". So the
 * work-order read is re-tried for a few seconds first. We do NOT drop the page for anything fresh
 * instead: Stripe ALWAYS arrives fresh, so an age gate here would mean nobody is ever told, and a
 * paid order nobody makes is the worse of the two mistakes. A page that turns out to be a lost race
 * costs an admin one click on /admin/requests, where the work order is already sitting.
 */
/** Wait a beat. Only used to give the happy path time to finish before we call an order orphaned. */
const beat = (ms: number) => new Promise((r) => setTimeout(r, ms))
async function settleDeskPayment(
  supabase: AdminClient,
  row: { id: string; client_id: string; request_id?: string | null; total_cents: number },
  metaRequestId: string | null,
  /** Stripe's own timestamp for the event. Null only if Stripe sent no created time. */
  paidAtISO: string | null,
) {
  const requestId = typeof row.request_id === 'string' && row.request_id ? row.request_id : metaRequestId
  if (!requestId) return
  const { error: stampErr } = await supabase
    .from('creative_requests')
    .update({ paid_at: paidAtISO ?? new Date().toISOString(), payment_id: row.id })
    .eq('id', requestId)
  if (stampErr) console.warn('[stripe webhook] desk paid stamp failed (apply migration 258):', stampErr.message)

  // Three looks over about six seconds. finalizePaidDeskOrder writes work_order_id on the row the
  // moment its mint lands, so the first look that finds one ends this quietly.
  for (let look = 0; look < 3; look++) {
    if (look > 0) await beat(3000)
    const { data: req } = await supabase.from('creative_requests').select('work_order_id').eq('id', requestId).maybeSingle()
    if ((req as { work_order_id?: string | null } | null)?.work_order_id) return
  }
  try {
    const { getAdminUserIds, createNotification } = await import('@/lib/notify')
    const { data: client } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
    const name = ((client as { name?: string } | null)?.name) ?? 'A client'
    for (const adminId of await getAdminUserIds(supabase)) {
      await createNotification({ supabase, userId: adminId, type: 'order_confirmed', title: 'Paid, nothing made', body: `${name} paid $${(row.total_cents / 100).toFixed(2)} for a desk order and no work order was created (the tab closed before checkout finished). Make it from the request.`, link: '/admin/requests' })
    }
  } catch (e) { console.warn('[stripe] orphan desk-order page failed', (e as Error)?.message) }
}

/**
 * setup_intent.succeeded — the MONTHLY desk order's version of the same edge.
 *
 * A monthly-only desk line takes no money today: its row is keyed to a SetupIntent, so
 * payment_intent.succeeded never fires for it and nothing here would have heard about it at all.
 */
async function handleDeskSetupSucceeded(supabase: AdminClient, si: Stripe.SetupIntent) {
  if (String(si.metadata?.kind ?? '') !== 'desk_checkout_setup') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rows } = await (supabase as any)
    .from('campaign_payments')
    .update({ status: 'paid', paid_at: unixToIso(si.created) })
    .eq('stripe_payment_intent_id', si.id)
    .eq('status', 'pending')
    .select('*')
  const row = Array.isArray(rows) ? rows[0] as { id: string; client_id: string; request_id?: string | null; total_cents: number } | undefined : undefined
  if (!row) return
  await settleDeskPayment(supabase, row, si.metadata?.requestId ?? null, unixToIso(si.created))
}

// ============================================================
// Money going BACKWARDS: refunds + chargebacks
// ============================================================
// A refund taken in the Stripe dashboard used to write NOTHING back here: the campaign_payments
// row stayed 'paid' forever, so isCampaignCheckoutPaid kept saying the campaign was covered, every
// piece delivered afterwards was stamped 'covered_by_checkout', and none of it could ever be
// invoiced. These two handlers make Stripe the source of truth for money that goes back.

/**
 * charge.refunded — sync what Stripe has actually refunded onto the payment row.
 *
 * Idempotent by amount: Stripe sends amount_refunded as a RUNNING TOTAL, so a replayed event, or
 * an event that lands after our own refunds-server already stamped the row, is a no-op. Only a
 * genuinely larger total is written.
 */
async function handleChargeRefunded(supabase: AdminClient, charge: Stripe.Charge) {
  const piId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id
  if (!piId) return

  // select('*') so the refund columns being absent (pre-migration 254) cannot error the read.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from('campaign_payments')
    .select('*')
    .eq('stripe_payment_intent_id', piId)
    .maybeSingle()
  if (!row) return                                   // not a campaign checkout charge

  const refunded = charge.amount_refunded || 0
  const known = Number(row.refunded_cents) || 0
  if (refunded <= known) return                      // already recorded (or a replay)

  const total = Number(row.total_cents) || 0
  const status = refunded >= total && total > 0 ? 'refunded' : refunded > 0 ? 'partially_refunded' : row.status
  const isFull = total > 0 && refunded >= total
  const campaignId = String(row.campaign_id ?? '')
  const clientId = String(row.client_id ?? '')
  // Did OUR refund path send this? It stamps stripe_refund_id, so a match means the settlement has
  // already run and this event is only the echo. Pre-254 that column does not exist, so we cannot
  // tell — and then we treat it as external (settle it) but check whether the owner has already
  // been told, so they never read "We sent back $X" twice for one refund.
  const weStartedIt = !!row.stripe_refund_id

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('campaign_payments')
    .update({ status, refunded_cents: refunded, refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', piId)
  if (error) {
    // Pre-254 the columns are missing. The STATUS is the part that matters — without it a fully
    // refunded order still counts as paid — so write it on its own.
    console.warn('[stripe] refund columns missing, writing status only (apply migration 254):', error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('campaign_payments').update({ status }).eq('stripe_payment_intent_id', piId)
  }

  const dollars = `$${(refunded / 100).toFixed(2)}`
  try {
    const { getAdminUserIds, createNotification } = await import('@/lib/notify')
    for (const adminId of await getAdminUserIds(supabase)) {
      await createNotification({ supabase, userId: adminId, type: 'payment', title: 'Refund recorded', body: `${dollars} was refunded on a campaign charge (${piId}). The order is now ${status.replace('_', ' ')}.`, link: '/admin/campaign-orders' })
    }
  } catch (e) { console.warn('[stripe] refund notify failed', (e as Error)?.message) }

  // A refund we did not make is a refund all the same: someone in the Stripe dashboard just took
  // money back on a campaign that is still running. Flipping a status column and stopping there
  // left the work minted, the subscription billing, the ledger rows standing and the tax
  // transaction reported. So it gets the SAME settlement our own path runs.
  if (weStartedIt) return
  await settleExternalRefund({ campaignId, clientId, piId, refundedNow: refunded - known, isFull })
}

/**
 * The settlement for a refund that did not come from refundCampaignPayment: taken by hand in the
 * Stripe dashboard, or the bank's own pull on a lost dispute.
 *
 * FULL → the campaign is over: void the undelivered charge rows, stop production, cancel the
 * subscription, reverse the tax, tell everyone.
 * PARTIAL → a credit for one piece. The row is already stamped above; this only tells the people,
 * because stopping a campaign the owner is still paying for would be the wrong repair.
 */
async function settleExternalRefund(opts: {
  campaignId: string
  clientId: string
  piId: string
  refundedNow: number
  isFull: boolean
}) {
  try {
    const { getChargeByPaymentIntent, settleRefund, staleChargeIds, refundAlreadyAnnounced } =
      await import('@/lib/campaigns/refunds-server')
    const paid = await getChargeByPaymentIntent(opts.piId)
    if (!paid) return
    // Pre-254 we cannot prove this was not our own refund, so we check the owner's own inbox
    // rather than risk saying "We sent back $X" a second time for one event.
    const notifyOwner = !(await refundAlreadyAnnounced(opts.campaignId))
    await settleRefund({
      paid,
      refundedNowCents: opts.refundedNow,
      isFull: opts.isFull,
      refundId: null,
      reason: 'A refund was made on this order.',
      // Only a FULL refund voids work: on a partial, the rest of the order stands.
      staleIds: opts.isFull ? await staleChargeIds(opts.campaignId) : [],
      notifyOwner,
    })
  } catch (e) { console.warn('[stripe] external refund settlement failed', (e as Error)?.message) }
}

/**
 * charge.dispute.created — a chargeback. The bank has taken the money back and is asking us to
 * justify the charge.
 *
 * What this does today, honestly: it marks the payment row 'disputed' with the amount and the
 * time, and pages EVERY admin with the campaign and the number, so a person stops the work and
 * gathers the proof within the bank's window.
 *
 * What it does NOT do: it does not automatically pause production. Pausing for real needs a state
 * the whole execution spine reads — the creator lane (work-orders), the team lane (content_drafts
 * publish path) and the service lane (service_work_orders) each mint and advance on their own, and
 * a flag none of them check would be a promise the code does not keep. The honest version is this
 * page plus disputed_at; a later move can add a campaign-level hold that all three lanes read
 * before they start anything new.
 */
async function handleDisputeCreated(supabase: AdminClient, dispute: Stripe.Dispute) {
  const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!piId) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from('campaign_payments')
    .select('*')
    .eq('stripe_payment_intent_id', piId)
    .maybeSingle()
  if (!row) return
  if (row.disputed_at) return                        // already recorded (replay)

  const amount = dispute.amount || 0
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('campaign_payments')
    .update({ status: 'disputed', disputed_at: new Date().toISOString(), dispute_cents: amount })
    .eq('stripe_payment_intent_id', piId)
  if (error) {
    console.warn('[stripe] dispute columns missing, writing status only (apply migration 254):', error.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('campaign_payments').update({ status: 'disputed' }).eq('stripe_payment_intent_id', piId)
  }

  // Nobody may find out about a chargeback late. Page every admin, with the number and the campaign.
  try {
    const { getAdminUserIds } = await import('@/lib/notify')
    const { createNotification } = await import('@/lib/notify')
    const { data: client } = await supabase.from('clients').select('name').eq('id', row.client_id).maybeSingle()
    const name = ((client as { name?: string } | null)?.name) ?? 'A client'
    const campaignId = (row.campaign_id as string | null) ?? null
    for (const adminId of await getAdminUserIds(supabase)) {
      await createNotification({
        supabase,
        userId: adminId,
        type: 'payment',
        title: `Chargeback: $${(amount / 100).toFixed(2)}`,
        body: `${name}'s bank pulled back $${(amount / 100).toFixed(2)} on campaign ${campaignId ?? '(unlinked)'}. Stop new work on it and send Stripe the proof before the deadline.`,
        link: campaignId ? `/admin/campaign-orders?focus=${campaignId}` : '/admin/campaign-orders',
      })
    }
  } catch (e) { console.warn('[stripe] dispute page failed', (e as Error)?.message) }
}

/**
 * charge.dispute.closed — the bank decided.
 *
 * WON: the money stays with us. The row was parked on 'disputed', which reads as "contested" on
 * every money surface, so it goes back to the collected status the refund history says it should
 * be — 'paid' when nothing was ever refunded, 'partially_refunded' when something was — and
 * disputed_at is cleared. dispute_cents is KEPT: it happened, and the history should say so.
 *
 * LOST: the bank has taken the money. That is a full refund in everything but name, so it gets the
 * same settlement — void the undelivered charge rows, stop production, cancel the subscription,
 * reverse the tax, tell everyone — WITHOUT calling Stripe refunds, because refunding a charge the
 * bank already pulled would send the same money twice.
 */
async function handleDisputeClosed(supabase: AdminClient, dispute: Stripe.Dispute) {
  const piId = typeof dispute.payment_intent === 'string' ? dispute.payment_intent : dispute.payment_intent?.id
  if (!piId) return

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: row } = await (supabase as any)
    .from('campaign_payments')
    .select('*')
    .eq('stripe_payment_intent_id', piId)
    .maybeSingle()
  if (!row) return
  if (dispute.status !== 'won' && dispute.status !== 'lost') return   // warning_closed and friends

  const total = Number(row.total_cents) || 0
  const refunded = Number(row.refunded_cents) || 0
  const amount = dispute.amount || 0
  const campaignId = String(row.campaign_id ?? '')
  const clientId = String(row.client_id ?? '')

  if (dispute.status === 'won') {
    // Back to what the refund history says, not blindly to 'paid' (the row may have been partly
    // refunded before the dispute was opened, and winning does not un-refund that).
    const { statusAfterDisputeWon } = await import('@/lib/campaigns/refund-math')
    const restored = statusAfterDisputeWon(total, refunded)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('campaign_payments')
      .update({ status: restored, disputed_at: null })
      .eq('stripe_payment_intent_id', piId)
    if (error) {
      console.warn('[stripe] dispute columns missing, writing status only (apply migration 254):', error.message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any).from('campaign_payments').update({ status: restored }).eq('stripe_payment_intent_id', piId)
    }
    try {
      const { pageAdmins } = await import('@/lib/campaigns/refunds-server')
      await pageAdmins(clientId, `Chargeback won: $${(amount / 100).toFixed(2)}`, `The bank decided in our favour on campaign ${campaignId || '(unlinked)'}. The order reads ${restored.replace('_', ' ')} again.`, campaignId ? `/admin/campaign-orders?focus=${campaignId}` : '/admin/campaign-orders')
    } catch (e) { console.warn('[stripe] dispute-won page failed', (e as Error)?.message) }
    return
  }

  // LOST. The money is gone; settle the campaign as if we had refunded it in full.
  //
  // refunded_cents is stamped too, not just the status. The money reports read that column, so a
  // chargeback that only flipped the status showed as a $0 reversal — a full charge still counted
  // as revenue we kept. It is the whole charge minus anything we had already sent back by hand
  // (the bank pulls what is left), never more than the total. dispute_cents is untouched: the two
  // numbers answer different questions and the history should keep both.
  const bankTookCents = Math.max(0, total - refunded)          // the bank pulls what is left
  const totalBackCents = Math.min(total, refunded + bankTookCents)   // everything that has gone back
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error: lostErr } = await (supabase as any)
    .from('campaign_payments')
    .update({ status: 'refunded', refunded_cents: totalBackCents, refunded_at: new Date().toISOString() })
    .eq('stripe_payment_intent_id', piId)
  if (lostErr) {
    // Pre-254 the refund columns are absent. The status flip is the part that MATTERS (it stops the
    // order reading as covered), so it goes on its own rather than being lost with them.
    console.warn('[stripe] refund columns missing, writing status only (apply migration 254):', lostErr.message)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).from('campaign_payments').update({ status: 'refunded' }).eq('stripe_payment_intent_id', piId)
  }
  try {
    const { getChargeByPaymentIntent, settleRefund, staleChargeIds } = await import('@/lib/campaigns/refunds-server')
    const paid = await getChargeByPaymentIntent(piId)
    if (!paid) return
    await settleRefund({
      paid,
      refundedNowCents: amount,
      isFull: true,
      refundId: null,                     // no refund object exists; the bank did this
      reason: 'Your bank reversed this charge, so we stopped the campaign.',
      staleIds: await staleChargeIds(campaignId),
      notifyOwner: true,
    })
  } catch (e) { console.warn('[stripe] dispute-lost settlement failed', (e as Error)?.message) }
}

async function handleCampaignPaymentFailed(
  supabase: AdminClient,
  pi: Stripe.PaymentIntent,
) {
  if (pi.metadata?.kind !== 'campaign_checkout') return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from('campaign_payments')
    .update({ status: 'failed' })
    .eq('stripe_payment_intent_id', pi.id)
    .eq('status', 'pending')
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
