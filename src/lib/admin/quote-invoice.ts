'use server'

/**
 * Stripe invoice lifecycle for an approved content_quote.
 *
 *   createQuoteInvoice(quoteId)
 *     - Reads the quote + its line items
 *     - Reads/creates a billing_customers row for the client
 *     - Creates a Stripe Customer if one doesn't exist
 *     - Creates one Stripe InvoiceItem per quote line item
 *     - Creates the Invoice in 'send_invoice' mode (hosted URL)
 *     - Finalizes the invoice (locks in the items + makes the
 *       hosted URL real)
 *     - Stores stripe_invoice_id + hosted_url + pdf_url on the quote
 *     - Sets payment_status = 'pending'
 *
 *   markQuotePaid(stripeInvoiceId, paidAt)
 *     - Webhook calls this when Stripe says the invoice is paid
 *     - Sets payment_status = 'paid', paid_at = now
 *     - Writes a quote.paid event
 *
 *   markQuoteFailed(stripeInvoiceId, reason)
 *     - Webhook calls this when payment fails
 *     - Sets payment_status = 'failed', records reason
 *     - Writes a quote.payment_failed event
 *
 * All three are idempotent — safe to call twice.
 */

import { stripe, dollarsToCents } from '@/lib/stripe'
import { createAdminClient } from '@/lib/supabase/admin'

interface QuoteLineItem {
  label: string
  qty: number
  unit_price?: number
  unitPrice?: number
  total: number
  notes?: string
}

/**
 * Build (or look up) a Stripe customer for the client, returning their
 * stripe_customer_id. Mirrors the existing billing_customers pattern.
 */
async function ensureStripeCustomer(clientId: string): Promise<string> {
  const admin = createAdminClient()

  // 1) Existing billing_customers row?
  const { data: existing } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', clientId)
    .maybeSingle()
  if (existing?.stripe_customer_id) {
    return existing.stripe_customer_id as string
  }

  // 2) Need to create one. Pull client identity for the Stripe customer.
  const { data: client } = await admin
    .from('clients')
    .select('name, email')
    .eq('id', clientId)
    .maybeSingle()
  if (!client) throw new Error(`Client ${clientId} not found`)

  const customer = await stripe.customers.create({
    name: (client.name as string) ?? undefined,
    email: (client.email as string) ?? undefined,
    metadata: { apnosh_client_id: clientId },
  })

  // 3) Mirror it locally
  await admin.from('billing_customers').upsert({
    client_id: clientId,
    stripe_customer_id: customer.id,
  }, { onConflict: 'client_id' })

  return customer.id
}

interface CreateInvoiceResult {
  invoiceId: string
  hostedInvoiceUrl: string | null
  invoicePdf: string | null
  amountDueCents: number
}

/**
 * Create + finalize a Stripe invoice for a quote. Idempotent: if the
 * quote already has stripe_invoice_id, returns that without re-creating.
 */
export async function createQuoteInvoice(quoteId: string): Promise<CreateInvoiceResult | null> {
  const admin = createAdminClient()

  const { data: quote, error } = await admin
    .from('content_quotes')
    .select('id, client_id, title, line_items, total, stripe_invoice_id, payment_status')
    .eq('id', quoteId)
    .maybeSingle()
  if (error || !quote) {
    throw new Error(`Quote ${quoteId} not found`)
  }

  // Idempotency: already has an invoice.
  if (quote.stripe_invoice_id) {
    const inv = await stripe.invoices.retrieve(quote.stripe_invoice_id as string)
    return {
      invoiceId: inv.id ?? (quote.stripe_invoice_id as string),
      hostedInvoiceUrl: inv.hosted_invoice_url ?? null,
      invoicePdf: inv.invoice_pdf ?? null,
      amountDueCents: inv.amount_due ?? 0,
    }
  }

  const total = Number(quote.total ?? 0)
  if (total <= 0) {
    // Nothing to charge — mark not_required and return null.
    await admin
      .from('content_quotes')
      .update({ payment_status: 'not_required' })
      .eq('id', quoteId)
    return null
  }

  const customerId = await ensureStripeCustomer(quote.client_id as string)
  const lineItems = (quote.line_items as QuoteLineItem[] | null) ?? []

  // 1) Add one InvoiceItem per line. Stripe attaches them to the
  // customer's next-finalized invoice when no invoice id is supplied.
  for (const item of lineItems) {
    const unit = Number(item.unit_price ?? item.unitPrice ?? 0)
    const qty = Math.max(1, Math.floor(Number(item.qty ?? 1)))
    if (unit <= 0) continue
    await stripe.invoiceItems.create({
      customer: customerId,
      currency: 'usd',
      unit_amount: dollarsToCents(unit),
      quantity: qty,
      description: item.notes ? `${item.label} — ${item.notes}` : item.label,
      metadata: { apnosh_quote_id: quoteId },
    })
  }

  // 2) Create the invoice. send_invoice = client pays via hosted page.
  const invoice = await stripe.invoices.create({
    customer: customerId,
    collection_method: 'send_invoice',
    days_until_due: 14,
    description: quote.title as string,
    auto_advance: false, // we finalize manually next
    metadata: {
      apnosh_quote_id: quoteId,
      apnosh_client_id: quote.client_id as string,
    },
  })

  // 3) Finalize so the hosted URL + PDF become real.
  if (!invoice.id) {
    throw new Error('Stripe invoice missing id')
  }
  const finalized = await stripe.invoices.finalizeInvoice(invoice.id)

  // 4) Mirror back to the quote.
  await admin
    .from('content_quotes')
    .update({
      stripe_invoice_id: finalized.id,
      stripe_invoice_hosted_url: finalized.hosted_invoice_url ?? null,
      stripe_invoice_pdf_url: finalized.invoice_pdf ?? null,
      amount_due_cents: finalized.amount_due ?? dollarsToCents(total),
      payment_status: 'pending',
    })
    .eq('id', quoteId)

  // 5) Audit event
  await admin.from('events').insert({
    client_id: quote.client_id,
    event_type: 'quote.invoice_created',
    subject_type: 'content_quote',
    subject_id: quoteId,
    actor_role: 'system',
    summary: `Invoice created for "${quote.title}" — $${total.toFixed(0)}`,
    payload: {
      stripe_invoice_id: finalized.id,
      amount_due_cents: finalized.amount_due,
    },
  })

  return {
    invoiceId: finalized.id ?? '',
    hostedInvoiceUrl: finalized.hosted_invoice_url ?? null,
    invoicePdf: finalized.invoice_pdf ?? null,
    amountDueCents: finalized.amount_due ?? dollarsToCents(total),
  }
}

/**
 * Webhook hook: invoice.payment_succeeded / invoice.paid.
 * Idempotent — checks current state before updating.
 */
export async function markQuotePaid(stripeInvoiceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('content_quotes')
    .select('id, client_id, title, payment_status, total')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle()
  if (!quote) return // not a quote invoice; ignore
  if (quote.payment_status === 'paid') return // idempotent

  await admin
    .from('content_quotes')
    .update({
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    })
    .eq('id', quote.id as string)

  await admin.from('events').insert({
    client_id: quote.client_id,
    event_type: 'quote.paid',
    subject_type: 'content_quote',
    subject_id: quote.id,
    actor_role: 'webhook',
    summary: `Paid: "${quote.title}" — $${Number(quote.total).toFixed(0)}`,
    payload: { stripe_invoice_id: stripeInvoiceId },
  })
}

/**
 * Webhook hook: invoice.payment_failed.
 */
export async function markQuoteFailed(
  stripeInvoiceId: string,
  reason: string | null,
): Promise<void> {
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('content_quotes')
    .select('id, client_id, title, payment_status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle()
  if (!quote) return

  await admin
    .from('content_quotes')
    .update({
      payment_status: 'failed',
      payment_failed_at: new Date().toISOString(),
      payment_failure_reason: reason ?? null,
    })
    .eq('id', quote.id as string)

  await admin.from('events').insert({
    client_id: quote.client_id,
    event_type: 'quote.payment_failed',
    subject_type: 'content_quote',
    subject_id: quote.id,
    actor_role: 'webhook',
    summary: `Payment failed for "${quote.title}"${reason ? ': ' + reason : ''}`,
    payload: { stripe_invoice_id: stripeInvoiceId, reason },
  })
}

/**
 * Webhook hook: invoice.voided.
 */
export async function markQuoteVoided(stripeInvoiceId: string): Promise<void> {
  const admin = createAdminClient()
  const { data: quote } = await admin
    .from('content_quotes')
    .select('id, payment_status')
    .eq('stripe_invoice_id', stripeInvoiceId)
    .maybeSingle()
  if (!quote || quote.payment_status === 'voided') return
  await admin
    .from('content_quotes')
    .update({ payment_status: 'voided' })
    .eq('id', quote.id as string)
}
