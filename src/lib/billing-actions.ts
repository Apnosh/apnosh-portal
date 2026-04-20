'use server'

/**
 * Billing server actions for the admin portal.
 *
 * These wrap the Stripe SDK calls that create / modify state so the
 * admin UI only has to say "start a retainer for this client at $X".
 * Webhook handlers still own the source-of-truth mirror; these
 * actions initiate changes and Stripe's events populate our tables.
 */

import { revalidatePath } from 'next/cache'
import {
  stripe,
  getOrCreateStripeCustomerForClient,
  startMonthlyRetainer as startMonthlyRetainerStripe,
  dollarsToCents,
  nextBillingAnchor,
} from '@/lib/stripe'
import { createClient } from '@/lib/supabase/server'
import { createClient as createAdminClient, SupabaseClient } from '@supabase/supabase-js'
import type Stripe from 'stripe'

type ActionResult<T = undefined> =
  | { success: true; data?: T }
  | { success: false; error: string }

// Untyped admin client -- Supabase generated types haven't been regenerated
// against migration 055, so we cast to `any` to access the new tables.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminSupabase = SupabaseClient<any, 'public', any>

function getAdminSupabase(): AdminSupabase {
  return createAdminClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  ) as AdminSupabase
}

// ---------------------------------------------------------------------------
// Admin auth helper
// ---------------------------------------------------------------------------

async function requireAdmin(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Not authenticated' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profile?.role !== 'admin') return { ok: false, error: 'Admin access required' }
  return { ok: true, userId: user.id }
}

// ---------------------------------------------------------------------------
// createStripeCustomerForClient -- first step in onboarding a client to Stripe
// ---------------------------------------------------------------------------

export async function createStripeCustomerForClient(args: {
  clientId: string
  address: {
    line1?: string
    line2?: string
    city?: string
    state: string         // required for Stripe Tax
    postal_code: string   // required for Stripe Tax
    country?: string
  }
}): Promise<ActionResult<{ stripeCustomerId: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  // Minimum validation: need state + postal code for Stripe Tax.
  if (!args.address?.state || !args.address?.postal_code) {
    return { success: false, error: 'State and postal code are required so sales tax can be calculated.' }
  }

  const admin = getAdminSupabase()

  const { data: client, error: clientErr } = await admin
    .from('clients')
    .select('id, name, email, phone')
    .eq('id', args.clientId)
    .maybeSingle()

  if (clientErr || !client) {
    return { success: false, error: clientErr?.message || 'Client not found' }
  }
  if (!client.email) {
    return { success: false, error: 'Client has no email on file -- add one before setting up Stripe.' }
  }

  try {
    const stripeCustomerId = await getOrCreateStripeCustomerForClient({
      clientId: client.id,
      email: client.email,
      name: client.name,
      phone: client.phone ?? undefined,
      address: args.address,
    })

    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath(`/admin/billing`)
    return { success: true, data: { stripeCustomerId } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create Stripe customer'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// startMonthlyRetainer -- creates a Stripe subscription with send_invoice
// ---------------------------------------------------------------------------

export async function startMonthlyRetainer(args: {
  clientId: string
  monthlyAmountDollars: number
  billingAnchorDate?: string // ISO date; defaults to next 15th
  planNameOverride?: string
}): Promise<ActionResult<{ subscriptionId: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (args.monthlyAmountDollars <= 0) {
    return { success: false, error: 'Amount must be greater than zero' }
  }

  const admin = getAdminSupabase()

  // Find the Stripe customer id. Client must already be set up.
  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', args.clientId)
    .maybeSingle()

  if (!bc?.stripe_customer_id) {
    return { success: false, error: 'Client has no Stripe customer yet. Run "Set up Stripe billing" first.' }
  }

  // Check for existing active retainer -- avoid creating a duplicate.
  const { data: existing } = await admin
    .from('subscriptions')
    .select('id, status')
    .eq('client_id', args.clientId)
    .in('status', ['active', 'trialing', 'past_due', 'incomplete'])
    .maybeSingle()

  if (existing) {
    return { success: false, error: `Client already has a ${existing.status} subscription. Cancel it first if you want to replace it.` }
  }

  // The 'Monthly Retainer' product must be seeded (scripts/sync-stripe-products
  // or the initial admin setup does this). Look it up.
  const { data: retainerProduct } = await admin
    .from('products')
    .select('stripe_product_id')
    .eq('category', 'retainer')
    .eq('active', true)
    .maybeSingle()

  if (!retainerProduct?.stripe_product_id) {
    return { success: false, error: 'No Monthly Retainer product found in catalog. Run the Stripe products sync.' }
  }

  try {
    const anchor = args.billingAnchorDate
      ? new Date(args.billingAnchorDate)
      : nextBillingAnchor()

    const sub = await startMonthlyRetainerStripe({
      customerId: bc.stripe_customer_id,
      clientId: args.clientId,
      amountCents: dollarsToCents(args.monthlyAmountDollars),
      planName: args.planNameOverride ?? 'Monthly Retainer',
      retainerProductId: retainerProduct.stripe_product_id,
      billingAnchor: anchor,
    })

    // The webhook will mirror into subscriptions, but we don't want the UI
    // to show blank for a couple of seconds. Proactively upsert a row.
    await admin.from('subscriptions').upsert(
      {
        client_id: args.clientId,
        stripe_subscription_id: sub.id,
        stripe_customer_id: bc.stripe_customer_id,
        plan_name: args.planNameOverride ?? 'Monthly Retainer',
        amount_cents: dollarsToCents(args.monthlyAmountDollars),
        currency: 'usd',
        interval: 'month',
        status: sub.status,
        collection_method: 'send_invoice',
        current_period_start: sub.current_period_start
          ? new Date(sub.current_period_start * 1000).toISOString()
          : null,
        current_period_end: sub.current_period_end
          ? new Date(sub.current_period_end * 1000).toISOString()
          : null,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
      { onConflict: 'stripe_subscription_id' },
    )

    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath('/admin/billing')
    return { success: true, data: { subscriptionId: sub.id } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create subscription'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// cancelSubscription
// ---------------------------------------------------------------------------

export async function cancelSubscription(args: {
  subscriptionId: string
  atPeriodEnd?: boolean  // default true -- client keeps service through billing period
}): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()

  // Look up Stripe subscription id from our mirror.
  const { data: sub } = await admin
    .from('subscriptions')
    .select('stripe_subscription_id, client_id')
    .eq('id', args.subscriptionId)
    .maybeSingle()

  if (!sub?.stripe_subscription_id) {
    return { success: false, error: 'Subscription not found' }
  }

  try {
    if (args.atPeriodEnd ?? true) {
      await stripe.subscriptions.update(sub.stripe_subscription_id, {
        cancel_at_period_end: true,
      })
    } else {
      await stripe.subscriptions.cancel(sub.stripe_subscription_id)
    }
    revalidatePath(`/admin/clients/${sub.client_id}`)
    revalidatePath('/admin/billing')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to cancel subscription'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// createOneTimeInvoice -- for the 4 video add-ons or arbitrary line items
// ---------------------------------------------------------------------------

export interface InvoiceLineInput {
  description: string
  quantity: number
  unitAmountDollars: number
  productId?: string       // optional -- references products.id
  serviceCategory?: 'reel' | 'website' | 'gbp' | 'addon' | 'custom'
}

export async function createOneTimeInvoice(args: {
  clientId: string
  lines: InvoiceLineInput[]
  dueDateDays?: number     // default 14
  notes?: string
}): Promise<ActionResult<{ invoiceId: string; hostedUrl: string | null }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (args.lines.length === 0) {
    return { success: false, error: 'Invoice must have at least one line item' }
  }
  if (args.lines.some(l => !l.description || l.unitAmountDollars <= 0 || l.quantity < 1)) {
    return { success: false, error: 'Every line needs a description, positive price, and quantity \u2265 1' }
  }

  const admin = getAdminSupabase()

  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', args.clientId)
    .maybeSingle()

  if (!bc?.stripe_customer_id) {
    return { success: false, error: 'Client has no Stripe customer yet. Run "Set up Stripe billing" first.' }
  }

  try {
    // Step 1: create the invoice in Stripe (draft state) so we can attach
    // line items to it. payment_settings lets the client choose card OR
    // ACH (us_bank_account) on the hosted pay page; ACH is much cheaper
    // for larger one-time invoices ($5 flat vs ~3%).
    const invoice = await stripe.invoices.create({
      customer: bc.stripe_customer_id,
      collection_method: 'send_invoice',
      days_until_due: args.dueDateDays ?? 14,
      auto_advance: false, // we finalize explicitly below
      // Stripe Tax auto-calculates based on customer address + product
      // tax codes. WA sales tax applies to taxable categories only.
      automatic_tax: { enabled: true },
      payment_settings: {
        // ACH first so it displays as the primary option; saves ~3% vs card.
        payment_method_types: ['us_bank_account', 'card'],
      },
      // Custom footer encouraging ACH. Shows on every hosted invoice PDF + page.
      footer: 'Pay by bank transfer (ACH) for no processing fees. Credit card also accepted.',
      metadata: { client_id: args.clientId, source: 'admin_portal_one_time' },
      description: args.notes,
    })

    // Step 2: attach each line item.
    for (const line of args.lines) {
      await stripe.invoiceItems.create({
        customer: bc.stripe_customer_id,
        invoice: invoice.id,
        description: line.description,
        quantity: line.quantity,
        unit_amount: dollarsToCents(line.unitAmountDollars),
        currency: 'usd',
        metadata: {
          product_id: line.productId ?? '',
          service_category: line.serviceCategory ?? 'custom',
        },
      })
    }

    // Step 3: finalize -- this moves status draft -> open and tells Stripe
    // to send the hosted invoice email.
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: true,
    })

    // Step 4: send it (Stripe emails the client the hosted invoice link).
    const sent = await stripe.invoices.sendInvoice(finalized.id)

    // The webhook will mirror; revalidate so the admin can see it.
    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath('/admin/billing')
    return {
      success: true,
      data: { invoiceId: sent.id, hostedUrl: sent.hosted_invoice_url ?? null },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create invoice'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// resendInvoice -- re-email the hosted invoice link to the client
// ---------------------------------------------------------------------------

export async function resendInvoice(invoiceId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: inv } = await admin
    .from('invoices')
    .select('stripe_invoice_id, client_id')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!inv?.stripe_invoice_id) {
    return { success: false, error: 'Invoice not found or not yet synced to Stripe' }
  }

  try {
    await stripe.invoices.sendInvoice(inv.stripe_invoice_id)
    revalidatePath(`/admin/clients/${inv.client_id}`)
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to resend invoice'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// voidInvoice -- cancels an unpaid invoice
// ---------------------------------------------------------------------------

export async function voidInvoice(invoiceId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: inv } = await admin
    .from('invoices')
    .select('stripe_invoice_id, client_id, status')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!inv?.stripe_invoice_id) {
    return { success: false, error: 'Invoice not found or not yet synced to Stripe' }
  }
  if (inv.status === 'paid') {
    return { success: false, error: 'Cannot void a paid invoice. Issue a refund instead.' }
  }

  try {
    await stripe.invoices.voidInvoice(inv.stripe_invoice_id)
    revalidatePath(`/admin/clients/${inv.client_id}`)
    revalidatePath('/admin/billing')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to void invoice'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// createCustomerPortalLink -- for updating payment method
// ---------------------------------------------------------------------------

export async function createCustomerPortalLink(
  clientId: string,
): Promise<ActionResult<{ url: string }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', clientId)
    .maybeSingle()

  if (!bc?.stripe_customer_id) {
    return { success: false, error: 'Client has no Stripe customer' }
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: bc.stripe_customer_id,
      return_url: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://portal.apnosh.com'}/dashboard/billing`,
    }) as Stripe.BillingPortal.Session
    return { success: true, data: { url: session.url } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to create portal link'
    return { success: false, error: msg }
  }
}
