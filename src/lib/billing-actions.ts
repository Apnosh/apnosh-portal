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
  /** Optional override for where invoices go. Persisted to
   *  clients.billing_email if provided. Falls back to clients.email. */
  billingEmail?: string
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
    .select('id, name, email, phone, billing_email')
    .eq('id', args.clientId)
    .maybeSingle()

  if (clientErr || !client) {
    return { success: false, error: clientErr?.message || 'Client not found' }
  }

  // Persist the override when provided (or clear it when explicitly empty).
  if (args.billingEmail !== undefined) {
    const trimmed = args.billingEmail.trim()
    await admin.from('clients').update({ billing_email: trimmed || null }).eq('id', client.id)
    client.billing_email = trimmed || null
  }

  // Priority: explicit override > clients.billing_email > clients.email.
  const invoiceEmail = (args.billingEmail?.trim())
    || client.billing_email
    || client.email

  if (!invoiceEmail) {
    return { success: false, error: 'No email on file -- enter a billing email or add one to the client record first.' }
  }

  try {
    const stripeCustomerId = await getOrCreateStripeCustomerForClient({
      clientId: client.id,
      email: invoiceEmail,
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
// updateBillingEmail -- change where invoices go without re-running setup.
// Also syncs the change to the existing Stripe customer.
// ---------------------------------------------------------------------------

export async function updateBillingEmail(
  clientId: string,
  billingEmail: string,
): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const trimmed = billingEmail.trim()
  const admin = getAdminSupabase()

  // Persist to clients row
  const { error: updateErr } = await admin
    .from('clients')
    .update({ billing_email: trimmed || null })
    .eq('id', clientId)
  if (updateErr) return { success: false, error: updateErr.message }

  // Sync to Stripe if a customer exists
  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', clientId)
    .maybeSingle()
  const stripeId = (bc as { stripe_customer_id?: string } | null)?.stripe_customer_id

  if (stripeId) {
    const { data: client } = await admin
      .from('clients')
      .select('email')
      .eq('id', clientId)
      .maybeSingle()
    const fallback = (client as { email?: string } | null)?.email ?? ''
    const target = trimmed || fallback
    if (target) {
      try {
        await stripe.customers.update(stripeId, { email: target })
      } catch (err) {
        return {
          success: false,
          error: 'Saved locally but Stripe sync failed: ' + (err instanceof Error ? err.message : 'unknown'),
        }
      }
    }
  }

  revalidatePath(`/admin/clients/${clientId}`)
  return { success: true }
}

// ---------------------------------------------------------------------------
// startMonthlyRetainer -- creates a Stripe subscription with send_invoice
// ---------------------------------------------------------------------------

export interface DiscountInput {
  /** 'percent' = percent_off (e.g. 15), 'fixed' = fixed dollar amount_off */
  type: 'percent' | 'fixed'
  /** Percent value 1-100 for 'percent', dollars for 'fixed' */
  value: number
  /** 'once' = single invoice, 'forever' = permanent, 'repeating' = N months */
  duration: 'once' | 'forever' | 'repeating'
  /** Months for 'repeating'; ignored otherwise */
  durationMonths?: number
  /** Admin-facing label shown on the invoice ('Founding rate', 'Loyalty', etc.) */
  name?: string
}

async function createCouponFromDiscount(d: DiscountInput): Promise<string> {
  const params: Stripe.CouponCreateParams = {
    duration: d.duration,
    name: d.name ?? (d.type === 'percent' ? `${d.value}% off` : `$${d.value} off`),
  }
  if (d.type === 'percent') {
    if (d.value <= 0 || d.value > 100) throw new Error('Percent discount must be between 1 and 100')
    params.percent_off = d.value
  } else {
    if (d.value <= 0) throw new Error('Fixed discount must be positive')
    params.amount_off = Math.round(d.value * 100)
    params.currency = 'usd'
  }
  if (d.duration === 'repeating') {
    if (!d.durationMonths || d.durationMonths < 1) throw new Error('Duration in months required for repeating discount')
    params.duration_in_months = d.durationMonths
  }
  const coupon = await stripe.coupons.create(params)
  return coupon.id
}

export async function startMonthlyRetainer(args: {
  clientId: string
  monthlyAmountDollars: number
  billingAnchorDate?: string // ISO date; defaults to next 15th
  planNameOverride?: string
  discount?: DiscountInput
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

    // Optional discount coupon (admin-only; applied to the subscription
    // so it follows through to every invoice Stripe generates).
    const couponId = args.discount ? await createCouponFromDiscount(args.discount) : undefined

    const sub = await startMonthlyRetainerStripe({
      customerId: bc.stripe_customer_id,
      clientId: args.clientId,
      amountCents: dollarsToCents(args.monthlyAmountDollars),
      planName: args.planNameOverride ?? 'Monthly Retainer',
      retainerProductId: retainerProduct.stripe_product_id,
      billingAnchor: anchor,
      couponId,
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
  /**
   * Optional discount applied to the whole invoice. 'once' duration only
   * here since one-time invoices have no future billing period.
   */
  discount?: Omit<DiscountInput, 'duration' | 'durationMonths'>
  /**
   * Server-side callers only (never crosses the client boundary): runs after the
   * draft invoice exists but BEFORE it finalizes. The campaign-charge bridge
   * stamps its charge rows with the invoice id here, so an invoice can only
   * become collectible once the work it bills is linked to it — a throw aborts
   * the run and the catch below deletes the still-draft invoice.
   */
  beforeFinalize?: (stripeInvoiceId: string) => Promise<void>
}): Promise<ActionResult<{
  invoiceId: string
  stripeInvoiceId: string
  hostedUrl: string | null
  totalCents: number
  taxCents: number
  subtotalCents: number
}>> {
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

  // Tracked outside the try so the catch can clean up its own orphan: a run that
  // dies after creating the invoice must not leave it behind — a still-draft
  // invoice is deleted, a finalized one voided. Otherwise a transient failure
  // strands a collectible invoice the admin never saw (and, for the bridge
  // caller, opens a double-billing window when the charges are re-invoiced).
  let createdInvoiceId: string | null = null
  let didFinalize = false
  try {
    // Step 1: create the invoice in Stripe (draft state) so we can attach
    // line items to it. payment_settings lets the client choose card OR
    // ACH (us_bank_account) on the hosted pay page; ACH is much cheaper
    // for larger one-time invoices ($5 flat vs ~3%).
    // Optional one-time discount coupon (duration forced to 'once').
    const couponId = args.discount
      ? await createCouponFromDiscount({ ...args.discount, duration: 'once' })
      : undefined

    // Fetch client name for personalized memo + custom fields
    const { data: clientNameRow } = await admin
      .from('clients')
      .select('name')
      .eq('id', args.clientId)
      .maybeSingle()
    const clientName = (clientNameRow as { name?: string } | null)?.name ?? null

    // Warmer branded footer (replaces the old "Pay by ACH" one-liner)
    const footer = [
      'Thank you for partnering with Apnosh.',
      '',
      'Bank transfer (ACH) is preferred — no processing fees. Credit card also accepted.',
      'Questions about this invoice? Reply to this email or reach out to your account manager.',
    ].join('\n')

    // Professional default description if admin didn't write one
    const description = args.notes?.trim()
      || (clientName ? `Services for ${clientName}` : 'Services from Apnosh')

    const invoice = await stripe.invoices.create({
      customer: bc.stripe_customer_id,
      collection_method: 'send_invoice',
      days_until_due: args.dueDateDays ?? 14,
      auto_advance: false,
      automatic_tax: { enabled: true },
      payment_settings: {
        payment_method_types: ['us_bank_account', 'card'],
      },
      footer,
      description,
      // Stripe displays up to 4 custom fields on the hosted invoice as a
      // labeled strip near the top. Good spot for context the client needs
      // (Project, Period) that isn't a line item.
      custom_fields: [
        ...(clientName ? [{ name: 'Client', value: clientName.slice(0, 30) }] : []),
        { name: 'From', value: 'Apnosh — Content & Growth' },
      ],
      metadata: { client_id: args.clientId, source: 'admin_portal_one_time' },
      ...(couponId ? { discounts: [{ coupon: couponId }] } : {}),
    })
    createdInvoiceId = invoice.id

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

    // Let a server-side caller link its own rows to the invoice while it is
    // still an uncollectible draft — a throw here aborts to the catch, which
    // deletes the draft, so nothing half-linked can ever be sent or paid.
    if (args.beforeFinalize) await args.beforeFinalize(invoice.id)

    // Step 3: finalize WITHOUT sending. This moves status draft -> open,
    // assigns a permanent invoice number, and runs tax calculation so
    // the hosted URL shows final numbers. Admin gets to review before
    // the client receives the email via a separate sendInvoicePreview call.
    const finalized = await stripe.invoices.finalizeInvoice(invoice.id, {
      auto_advance: false,
    })
    didFinalize = true

    // Step 4: re-fetch to get the authoritative finalized invoice.
    // Stripe's tax calculation + discount application happen during
    // finalize and are sometimes stale on the finalize response itself;
    // a fresh GET always gives the final numbers.
    const authoritative = await stripe.invoices.retrieve(finalized.id, {
      expand: ['lines'],
    })

    // Proactively upsert so the admin UI reflects real state immediately
    // without waiting on the invoice.finalized webhook. The webhook will
    // later arrive with the same data (idempotent) -- and thanks to the
    // regress-protection guard in the webhook, it won't overwrite this
    // with an out-of-order invoice.created payload that has total=0.
    await admin.from('invoices').upsert(
      {
        client_id: args.clientId,
        stripe_invoice_id: authoritative.id,
        type: 'one_time' as const,
        status: 'open' as const,
        amount_due_cents: authoritative.amount_due ?? 0,
        amount_paid_cents: 0,
        subtotal_cents: authoritative.subtotal ?? 0,
        tax_cents: authoritative.tax ?? 0,
        total_cents: authoritative.total ?? 0,
        currency: (authoritative.currency ?? 'usd').toLowerCase(),
        issued_at: authoritative.created ? new Date(authoritative.created * 1000).toISOString() : null,
        due_at: authoritative.due_date ? new Date(authoritative.due_date * 1000).toISOString() : null,
        hosted_invoice_url: authoritative.hosted_invoice_url ?? null,
        invoice_pdf_url: authoritative.invoice_pdf ?? null,
        description: authoritative.description ?? null,
      },
      { onConflict: 'stripe_invoice_id' },
    )

    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath('/admin/billing')

    // Resolve our local DB row so the UI can find it for Send / Void actions
    const { data: dbRow } = await admin
      .from('invoices')
      .select('id')
      .eq('stripe_invoice_id', authoritative.id)
      .maybeSingle()

    return {
      success: true,
      data: {
        invoiceId: (dbRow as { id: string } | null)?.id ?? authoritative.id,
        stripeInvoiceId: authoritative.id,
        hostedUrl: authoritative.hosted_invoice_url ?? null,
        totalCents: authoritative.total ?? 0,
        taxCents: authoritative.tax ?? 0,
        subtotalCents: authoritative.subtotal ?? 0,
      },
    }
  } catch (err) {
    // Best-effort orphan cleanup (see the tracking vars above the try). A void
    // still emits invoice.voided, so any rows a caller linked pre-finalize are
    // released by the normal webhook machinery.
    if (createdInvoiceId) {
      if (didFinalize) await stripe.invoices.voidInvoice(createdInvoiceId).then(() => undefined, () => undefined)
      else await stripe.invoices.del(createdInvoiceId).then(() => undefined, () => undefined)
    }
    const msg = err instanceof Error ? err.message : 'Failed to create invoice'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// Campaign-charge bridge -- turn accrued campaign work into a reviewable invoice
// ---------------------------------------------------------------------------

/**
 * The accrual→invoice bridge: collect every accrued campaign charge for a client
 * onto ONE finalized-but-unsent Stripe invoice (the same admin-review posture as
 * createOneTimeInvoice above — nothing reaches the client until the admin clicks
 * Send in the billing card).
 *
 * Ordering is the whole design:
 *   1. CLAIM the charges (accrued→invoiced, conditional) before Stripe is
 *      touched — two admins racing can't put one piece of work on two invoices.
 *   2. Stamp stripe_invoice_id on the rows BEFORE the invoice finalizes (the
 *      beforeFinalize hook), so an invoice only ever becomes collectible with
 *      its charges already linked. No failure window can leave an open invoice
 *      whose work has quietly returned to 'accrued' (the double-billing orphan).
 *   3. On any failure, createOneTimeInvoice deletes its draft / voids a
 *      finalized invoice, and the claim is released here. A claim stranded by a
 *      hard crash reverts via the reconcileAccruals backstop within a few hours
 *      (the reconcile cron runs every 6).
 * The stamped id is what the webhook uses to flip rows paid (invoice.paid) or
 * release them back to accrued (invoice.voided — the admin discarded the draft).
 */
export async function createInvoiceFromAccruedCharges(clientId: string): Promise<ActionResult<{
  invoiceId: string
  stripeInvoiceId: string
  hostedUrl: string | null
  totalCents: number
  chargeCount: number
}>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }
  const admin = getAdminSupabase()

  const { data: accrued, error: readErr } = await admin
    .from('campaign_charges')
    .select('id, amount_cents, campaign_id, work_order_id, source')
    .eq('client_id', clientId)
    .eq('status', 'accrued')
    .gt('amount_cents', 0)
    .order('created_at', { ascending: true })
    .limit(100)
  if (readErr) return { success: false, error: readErr.message }
  const accruedRows = (accrued ?? []) as { id: string; amount_cents: number; campaign_id: string | null; work_order_id: string | null; source: string }[]
  if (accruedRows.length === 0) return { success: false, error: 'Nothing is accrued for this client.' }

  const ids = accruedRows.map((c) => c.id)
  const { data: claimed, error: claimErr } = await admin
    .from('campaign_charges')
    .update({ status: 'invoiced', invoiced_at: new Date().toISOString() })
    .in('id', ids)
    .eq('status', 'accrued')
    .select('id')
  if (claimErr) return { success: false, error: claimErr.message }
  const claimedIds = new Set(((claimed ?? []) as { id: string }[]).map((r) => r.id))
  const charges = accruedRows.filter((c) => claimedIds.has(c.id))
  if (!charges.length) return { success: false, error: 'These charges were just claimed by another invoice. Refresh and retry.' }

  // Human-readable lines: the campaign's name plus the piece's work-order title
  // when it has one, so the client recognizes every dollar on the hosted page.
  const campaignIds = [...new Set(charges.map((c) => c.campaign_id).filter((v): v is string => !!v))]
  const orderIds = charges.map((c) => c.work_order_id).filter((v): v is string => !!v)
  const [campsRes, ordersRes] = await Promise.all([
    campaignIds.length ? admin.from('campaigns').select('id, name').in('id', campaignIds) : Promise.resolve({ data: [] }),
    orderIds.length ? admin.from('creator_work_orders').select('id, title').in('id', orderIds) : Promise.resolve({ data: [] }),
  ])
  const campName = new Map(((campsRes.data ?? []) as { id: string; name: string | null }[]).map((c) => [c.id, c.name || 'Campaign']))
  const orderTitle = new Map(((ordersRes.data ?? []) as { id: string; title: string | null }[]).map((o) => [o.id, o.title || '']))

  const lines: InvoiceLineInput[] = charges.map((c) => {
    const camp = campName.get(c.campaign_id ?? '') ?? 'Campaign work'
    const piece = orderTitle.get(c.work_order_id ?? '') || (c.source === 'creator' ? 'creator piece' : 'published content piece')
    return { description: `${camp} — ${piece}`, quantity: 1, unitAmountDollars: c.amount_cents / 100, serviceCategory: 'custom' }
  })

  let stampedInvoiceId: string | null = null
  const created = await createOneTimeInvoice({
    clientId,
    lines,
    notes: 'Campaign work — delivered and published pieces',
    // Link the claimed rows while the invoice is still an uncollectible draft;
    // a failure here aborts the run and the draft is deleted.
    beforeFinalize: async (stripeInvoiceId) => {
      stampedInvoiceId = stripeInvoiceId
      const { error } = await admin
        .from('campaign_charges')
        .update({ stripe_invoice_id: stripeInvoiceId })
        .in('id', [...claimedIds])
        .eq('status', 'invoiced')
      if (error) throw new Error(`linking the charges to the invoice failed: ${error.message}`)
    },
  })
  if (!created.success || !created.data) {
    // No collectible invoice survives a failure (the draft was deleted, or a
    // finalized invoice voided), so release the claim. Scoped to THIS run's
    // stamp (or no stamp): a row the voided-webhook already released and a
    // faster admin re-claimed onto a new invoice carries the new invoice's id
    // and is untouched. Best-effort — the reconcile backstop reverts the rest.
    const release = admin
      .from('campaign_charges')
      .update({ status: 'accrued', stripe_invoice_id: null, invoiced_at: null })
      .in('id', [...claimedIds])
      .eq('status', 'invoiced')
    await (stampedInvoiceId
      ? release.or(`stripe_invoice_id.is.null,stripe_invoice_id.eq.${stampedInvoiceId}`)
      : release.is('stripe_invoice_id', null)
    ).then(() => undefined, () => undefined)
    return { success: false, error: created.success ? 'Invoice creation failed' : created.error }
  }

  return {
    success: true,
    data: {
      invoiceId: created.data.invoiceId,
      stripeInvoiceId: created.data.stripeInvoiceId,
      hostedUrl: created.data.hostedUrl,
      totalCents: created.data.totalCents,
      chargeCount: charges.length,
    },
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

/**
 * Permanently delete a DRAFT invoice. Cannot be used on finalized invoices
 * (open, paid, void) -- use voidInvoice() for those.
 */
export async function deleteDraftInvoice(invoiceId: string): Promise<ActionResult> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: inv } = await admin
    .from('invoices')
    .select('stripe_invoice_id, client_id, status')
    .eq('id', invoiceId)
    .maybeSingle()

  if (!inv?.stripe_invoice_id) {
    return { success: false, error: 'Invoice not found' }
  }
  if (inv.status !== 'draft') {
    return { success: false, error: `Cannot delete a ${inv.status} invoice. Use 'Cancel' to void it instead.` }
  }

  try {
    await stripe.invoices.del(inv.stripe_invoice_id)
    // Remove our mirror too -- Stripe won't send any events for a deletion.
    await admin.from('invoices').delete().eq('id', invoiceId)
    // No event also means no webhook release: free any bridge campaign charges
    // stamped to this draft (only possible if a bridge run died between its
    // stamp and finalize) so the work stays billable.
    await admin.from('campaign_charges')
      .update({ status: 'accrued', stripe_invoice_id: null, invoiced_at: null })
      .eq('stripe_invoice_id', inv.stripe_invoice_id)
      .eq('status', 'invoiced')
      .then(() => undefined, () => undefined)
    revalidatePath(`/admin/clients/${inv.client_id}`)
    revalidatePath('/admin/billing')
    return { success: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to delete draft'
    return { success: false, error: msg }
  }
}

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
    // Optimistic mirror + bridge-charge release: the invoice.voided webhook does
    // both idempotently, but the admin's card reloads immediately after this
    // action — without these the voided invoice still reads 'open' and any
    // bridged campaign charges look vanished until the webhook lands.
    await admin.from('invoices').update({ status: 'void' }).eq('id', invoiceId)
      .then(() => undefined, () => undefined)
    await admin.from('campaign_charges')
      .update({ status: 'accrued', stripe_invoice_id: null, invoiced_at: null })
      .eq('stripe_invoice_id', inv.stripe_invoice_id)
      .eq('status', 'invoiced')
      .then(() => undefined, () => undefined)
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

// ---------------------------------------------------------------------------
// previewConsolidate / consolidateOpenInvoices
// ---------------------------------------------------------------------------
//
// When a client has multiple open (finalized + unpaid) invoices, the
// default Stripe behavior is one pay-link per invoice. The client gets
// two emails and pays twice. These actions let an admin merge all open
// invoices for a client into a single new invoice + single pay link.
//
// Safety:
//   - Only acts on invoices with stripe status 'open'. Draft, paid,
//     void, uncollectible are ignored.
//   - Refuses if any open invoice has amount_paid > 0 (mid-payment).
//   - Always previews first; the consolidate action takes the list of
//     stripe_invoice_ids to merge so the admin sees exactly what changes.
//
// Mechanics:
//   1. For each old open invoice: copy its line items into a single
//      summary description (we lose per-line detail by design — the
//      consolidated invoice has one line per source invoice).
//   2. Void each old open invoice in Stripe.
//   3. Create a new invoice with the combined line items.
//   4. Finalize + send so the client gets one new pay link.
//   5. The Stripe webhook mirrors all status changes into our DB.

export interface ConsolidatePreview {
  clientId: string
  invoices: Array<{
    stripeInvoiceId: string
    invoiceNumber: string | null
    totalCents: number
    description: string | null
  }>
  totalCents: number
  blockedReason?: string
}

export async function previewConsolidate(args: { clientId: string }): Promise<ActionResult<ConsolidatePreview>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: rows } = await admin
    .from('invoices')
    .select('stripe_invoice_id, invoice_number, total_cents, amount_paid_cents, description, status')
    .eq('client_id', args.clientId)
    .eq('status', 'open')
    .order('issued_at', { ascending: true })

  const invoices = (rows ?? []) as Array<{
    stripe_invoice_id: string | null
    invoice_number: string | null
    total_cents: number
    amount_paid_cents: number | null
    description: string | null
    status: string
  }>

  // Filter to invoices that actually have a Stripe ID we can act on.
  const actionable = invoices.filter(i => !!i.stripe_invoice_id)
  if (actionable.length < 2) {
    return { success: false, error: 'Need at least 2 open invoices with Stripe IDs to consolidate.' }
  }

  // Refuse to touch partially-paid invoices.
  const partiallyPaid = actionable.find(i => (i.amount_paid_cents ?? 0) > 0)
  if (partiallyPaid) {
    return {
      success: false,
      error: `Cannot consolidate — invoice ${partiallyPaid.invoice_number ?? partiallyPaid.stripe_invoice_id} already has a partial payment. Resolve it first.`,
    }
  }

  return {
    success: true,
    data: {
      clientId: args.clientId,
      invoices: actionable.map(i => ({
        stripeInvoiceId: i.stripe_invoice_id as string,
        invoiceNumber: i.invoice_number,
        totalCents: i.total_cents,
        description: i.description,
      })),
      totalCents: actionable.reduce((s, i) => s + i.total_cents, 0),
    },
  }
}

export async function consolidateOpenInvoices(args: {
  clientId: string
  stripeInvoiceIds: string[]   // must match preview to avoid race conditions
}): Promise<ActionResult<{ newStripeInvoiceId: string; hostedUrl: string | null; totalCents: number }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (args.stripeInvoiceIds.length < 2) {
    return { success: false, error: 'Need at least 2 invoices to consolidate.' }
  }

  const admin = getAdminSupabase()
  /* Resolve the Stripe customer id. */
  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', args.clientId)
    .maybeSingle() as { data: { stripe_customer_id: string | null } | null }
  if (!bc?.stripe_customer_id) {
    return { success: false, error: 'Client has no Stripe customer.' }
  }

  try {
    /* 1. Pull each source invoice from Stripe, build the consolidated
          description, total, and a per-source line. Refuse if any source
          isn't 'open' or has been partially paid. */
    type SourceLine = { amountCents: number; description: string; currency: string }
    const sourceLines: SourceLine[] = []
    let currency = 'usd'

    for (const id of args.stripeInvoiceIds) {
      const inv = await stripe.invoices.retrieve(id, { expand: ['lines'] })
      if (inv.status !== 'open') {
        return { success: false, error: `Invoice ${inv.number ?? id} is not 'open' (status: ${inv.status}). Refresh and try again.` }
      }
      if ((inv.amount_paid ?? 0) > 0) {
        return { success: false, error: `Invoice ${inv.number ?? id} has a partial payment. Refuse.` }
      }
      currency = (inv.currency ?? 'usd').toLowerCase()
      const periodLabel = inv.number ?? `inv ${id.slice(-6)}`
      const desc = inv.description
        ? `${periodLabel} — ${inv.description}`
        : `${periodLabel}`
      sourceLines.push({
        amountCents: inv.total ?? 0,
        description: desc,
        currency,
      })
    }

    /* 2. Create the consolidated invoice FIRST in draft mode, then
          attach each line item to it explicitly via `invoice: <id>`.
          IMPORTANT: this used to call invoiceItems.create() without an
          invoice id and then invoices.create() separately — but that
          path made the items "pending on the customer" and the new
          invoice didn't pick them up (Stripe default is
          pending_invoice_items_behavior='exclude'), producing a $0
          consolidated invoice. Explicit attachment is safer than
          relying on the include behavior because it can't accidentally
          pull in unrelated pending items. */
    const consolidated = await stripe.invoices.create({
      customer: bc.stripe_customer_id,
      collection_method: 'send_invoice',
      days_until_due: 14,
      description: `Consolidated invoice covering ${args.stripeInvoiceIds.length} prior open invoices.`,
      auto_advance: false,
    })

    for (const line of sourceLines) {
      await stripe.invoiceItems.create({
        customer: bc.stripe_customer_id,
        invoice: consolidated.id,        // attach to THIS invoice explicitly
        amount: line.amountCents,
        currency: line.currency,
        description: line.description,
      })
    }

    /* 3. Finalize the new invoice. Re-retrieve afterwards so the
          returned object reflects the now-populated total + lines. */
    const finalizedRaw = await stripe.invoices.finalizeInvoice(consolidated.id)
    const finalized = await stripe.invoices.retrieve(finalizedRaw.id, { expand: ['lines'] })

    /* Sanity check: refuse to proceed (and skip voiding originals) if
       the new invoice still totals $0. Caller will see a clear error
       and the originals stay live + payable. */
    const expectedTotal = sourceLines.reduce((s, l) => s + l.amountCents, 0)
    if ((finalized.total ?? 0) === 0 && expectedTotal > 0) {
      // Abort: void the (broken) new invoice, leave originals alone.
      try { await stripe.invoices.voidInvoice(finalized.id) } catch { /* ignore */ }
      return {
        success: false,
        error: `Consolidated invoice finalized at $0 (expected ${(expectedTotal / 100).toFixed(2)}). The original invoices were left intact. Please retry.`,
      }
    }

    /* 4. Send the new invoice to the client (gives them the pay link). */
    try {
      await stripe.invoices.sendInvoice(finalized.id)
    } catch (sendErr) {
      // Non-fatal — the hosted URL is still available; admin can re-send manually.
      console.warn('[consolidate] sendInvoice failed:', (sendErr as Error).message)
    }

    /* 5. Void the old invoices ONLY after the new one is finalized.
          Order matters: if step 4 fails, we still have the old ones live. */
    const voidErrors: string[] = []
    for (const id of args.stripeInvoiceIds) {
      try {
        await stripe.invoices.voidInvoice(id)
      } catch (err) {
        voidErrors.push(`${id}: ${(err as Error).message}`)
      }
    }
    if (voidErrors.length > 0) {
      /* Don't fail the whole action — the new invoice exists, but warn
         that some old ones are still live and need manual void. The
         admin will see this in the UI. */
      console.warn('[consolidate] some old invoices failed to void:', voidErrors)
    }

    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath('/admin/billing')

    return {
      success: true,
      data: {
        newStripeInvoiceId: finalized.id,
        hostedUrl: finalized.hosted_invoice_url ?? null,
        totalCents: finalized.total ?? sourceLines.reduce((s, l) => s + l.amountCents, 0),
      },
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Failed to consolidate invoices'
    return { success: false, error: msg }
  }
}

// ---------------------------------------------------------------------------
// recreateConsolidatedInvoice
// ---------------------------------------------------------------------------
//
// Recovery action for the v1 consolidate bug that finalized $0 invoices.
// Takes a client + a list of voided stripe invoice ids whose amounts
// should be put on a NEW consolidated invoice. Reads the originals'
// totals from our `invoices` DB mirror (Stripe still has them as voided,
// but their totals are preserved in our table) and creates a proper
// consolidated invoice with line items attached explicitly.

export async function recreateConsolidatedInvoice(args: {
  clientId: string
  /** Stripe invoice ids (from our DB) of the voided source invoices
   *  whose totals should be put on the new consolidated invoice. */
  voidedStripeInvoiceIds: string[]
  /** Optional: also void this empty/broken consolidated invoice. */
  brokenStripeInvoiceId?: string
}): Promise<ActionResult<{ newStripeInvoiceId: string; hostedUrl: string | null; totalCents: number }>> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const admin = getAdminSupabase()
  const { data: bc } = await admin
    .from('billing_customers')
    .select('stripe_customer_id')
    .eq('client_id', args.clientId)
    .maybeSingle() as { data: { stripe_customer_id: string | null } | null }
  if (!bc?.stripe_customer_id) return { success: false, error: 'Client has no Stripe customer.' }

  /* Pull the source totals from our DB mirror (Stripe has them voided,
     but the amounts are still in our `invoices` table). */
  const { data: sources } = await admin
    .from('invoices')
    .select('stripe_invoice_id, invoice_number, total_cents, currency')
    .in('stripe_invoice_id', args.voidedStripeInvoiceIds) as {
      data: Array<{ stripe_invoice_id: string; invoice_number: string | null; total_cents: number; currency: string | null }> | null
    }
  const rows = sources ?? []
  if (rows.length === 0) return { success: false, error: 'No matching invoice rows found in DB.' }

  try {
    const currency = rows[0]?.currency ?? 'usd'
    const consolidated = await stripe.invoices.create({
      customer: bc.stripe_customer_id,
      collection_method: 'send_invoice',
      days_until_due: 14,
      description: `Reissued: covering ${rows.length} previously voided invoices.`,
      auto_advance: false,
    })

    for (const r of rows) {
      const label = r.invoice_number ?? `inv ${r.stripe_invoice_id.slice(-6)}`
      await stripe.invoiceItems.create({
        customer: bc.stripe_customer_id,
        invoice: consolidated.id,
        amount: r.total_cents,
        currency: currency.toLowerCase(),
        description: `${label} (reissued)`,
      })
    }

    const finalizedRaw = await stripe.invoices.finalizeInvoice(consolidated.id)
    const finalized = await stripe.invoices.retrieve(finalizedRaw.id, { expand: ['lines'] })

    const expectedTotal = rows.reduce((s, r) => s + r.total_cents, 0)
    if ((finalized.total ?? 0) !== expectedTotal) {
      try { await stripe.invoices.voidInvoice(finalized.id) } catch { /* ignore */ }
      return { success: false, error: `Reissued invoice total ${(finalized.total ?? 0) / 100} != expected ${expectedTotal / 100}. Voided new invoice.` }
    }

    try { await stripe.invoices.sendInvoice(finalized.id) } catch { /* non-fatal */ }

    /* If the caller passed the broken $0 consolidated invoice, void it
       so the client doesn't see it. */
    if (args.brokenStripeInvoiceId) {
      try { await stripe.invoices.voidInvoice(args.brokenStripeInvoiceId) } catch (err) {
        console.warn('[recreate] failed to void broken invoice:', (err as Error).message)
      }
    }

    revalidatePath(`/admin/clients/${args.clientId}`)
    revalidatePath('/admin/billing')

    return {
      success: true,
      data: {
        newStripeInvoiceId: finalized.id,
        hostedUrl: finalized.hosted_invoice_url ?? null,
        totalCents: finalized.total ?? expectedTotal,
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Recreate failed' }
  }
}
