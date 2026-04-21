'use client'

/**
 * Stripe billing card -- drops into the admin client detail page sidebar.
 *
 * Shows the current state of a client's Stripe billing setup and exposes
 * the three actions the admin needs on a retainer client:
 *   1. Set up Stripe billing (creates billing_customers + Stripe customer)
 *   2. Start monthly retainer (creates Stripe subscription)
 *   3. Send one-time invoice (reel / website / custom line items)
 *   4. Share customer-portal link so client can update their card
 *
 * State is loaded on mount via a lightweight Supabase query; actions are
 * routed through src/lib/billing-actions.ts server actions.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  createStripeCustomerForClient,
  updateBillingEmail,
  startMonthlyRetainer,
  cancelSubscription,
  createOneTimeInvoice,
  resendInvoice,
  voidInvoice,
  createCustomerPortalLink,
  deleteDraftInvoice,
  type InvoiceLineInput,
  type DiscountInput,
} from '@/lib/billing-actions'
import {
  CreditCard, Loader2, CheckCircle2, AlertTriangle, X, Plus,
  Link as LinkIcon, ExternalLink, RefreshCw, Trash2, Send, Eye,
} from 'lucide-react'
import { InvoiceDetailModal } from './invoice-detail-modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BillingCustomerRow {
  id: string
  stripe_customer_id: string
  payment_method_brand: string | null
  payment_method_last4: string | null
}

interface SubscriptionRow {
  id: string
  plan_name: string
  amount_cents: number
  status: string
  collection_method: string
  current_period_end: string | null
  cancel_at_period_end: boolean
}

interface InvoiceRow {
  id: string
  invoice_number: string
  type: string
  status: string
  total_cents: number
  issued_at: string | null
  paid_at: string | null
  due_at: string | null
  hosted_invoice_url: string | null
}

interface ProductRow {
  id: string
  name: string
  category: string
  amount_cents: number | null
  billing_type: string
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

const STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  trialing: 'bg-blue-50 text-blue-700',
  past_due: 'bg-red-50 text-red-700',
  canceled: 'bg-ink-6 text-ink-4',
  paused: 'bg-amber-50 text-amber-700',
  incomplete: 'bg-amber-50 text-amber-700',
  open: 'bg-amber-50 text-amber-700',
  paid: 'bg-emerald-50 text-emerald-700',
  void: 'bg-ink-6 text-ink-4',
  draft: 'bg-ink-6 text-ink-3',
  failed: 'bg-red-50 text-red-700',
  uncollectible: 'bg-red-50 text-red-700',
}

// Human-friendly labels for invoice statuses. Admin sees these on the
// recent-invoices list instead of raw Stripe terms.
const INVOICE_STATUS_LABEL: Record<string, string> = {
  draft: 'Draft',
  open: 'Unpaid',
  paid: 'Paid',
  void: 'Canceled',
  uncollectible: 'Written off',
  failed: 'Payment failed',
}

function invoiceStatusLabel(status: string): string {
  return INVOICE_STATUS_LABEL[status] ?? status
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export function StripeBillingCard({ clientId }: { clientId: string }) {
  const [loading, setLoading] = useState(true)
  const [billingCustomer, setBillingCustomer] = useState<BillingCustomerRow | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [products, setProducts] = useState<ProductRow[]>([])

  // Pre-fill data: address from client_profiles, email from clients row.
  // Used to populate the setup form on first open.
  const [prefill, setPrefill] = useState<{
    line1: string
    city: string
    state: string
    zip: string
    contactEmail: string
    billingEmail: string
  } | null>(null)

  const [showRetainerForm, setShowRetainerForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showSetupForm, setShowSetupForm] = useState(false)
  const [detailInvoiceId, setDetailInvoiceId] = useState<string | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [bcRes, subRes, invRes, prodRes, clientRes, profileRes] = await Promise.all([
      supabase.from('billing_customers').select('id, stripe_customer_id, payment_method_brand, payment_method_last4').eq('client_id', clientId).maybeSingle(),
      supabase.from('subscriptions').select('id, plan_name, amount_cents, status, collection_method, current_period_end, cancel_at_period_end').eq('client_id', clientId).in('status', ['active', 'trialing', 'past_due', 'paused', 'incomplete']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('invoices').select('id, invoice_number, type, status, total_cents, issued_at, paid_at, due_at, hosted_invoice_url').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
      supabase.from('products').select('id, name, category, amount_cents, billing_type').eq('active', true).in('category', ['reel', 'addon', 'website', 'gbp']).order('amount_cents', { ascending: false }),
      supabase.from('clients').select('email, billing_email').eq('id', clientId).maybeSingle(),
      supabase.from('client_profiles').select('full_address, city, state, zip').eq('client_id', clientId).maybeSingle(),
    ])

    setBillingCustomer(bcRes.data as BillingCustomerRow | null)
    setSubscription(subRes.data as SubscriptionRow | null)
    setInvoices((invRes.data ?? []) as InvoiceRow[])
    setProducts((prodRes.data ?? []) as ProductRow[])

    // Build prefill object from whatever we have. Defaults kept empty
    // strings (not undefined) so form inputs stay controlled.
    const cl = clientRes.data as { email?: string; billing_email?: string } | null
    const pr = profileRes.data as { full_address?: string; city?: string; state?: string; zip?: string } | null
    setPrefill({
      line1: pr?.full_address ?? '',
      city: pr?.city ?? '',
      state: pr?.state || 'WA',
      zip: pr?.zip ?? '',
      contactEmail: cl?.email ?? '',
      billingEmail: cl?.billing_email ?? '',
    })

    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const hasCustomer = billingCustomer !== null
  const hasActiveSubscription = subscription !== null && ['active', 'trialing', 'past_due'].includes(subscription.status)

  // Overdue detection -- any open invoice whose due_at has passed.
  const overdueInvoices = invoices.filter(inv =>
    inv.status === 'open' && inv.due_at && new Date(inv.due_at) < new Date()
  )
  const overdueCents = overdueInvoices.reduce((s, i) => s + i.total_cents, 0)
  const oldestDaysOverdue = overdueInvoices.reduce((d, i) => {
    if (!i.due_at) return d
    const days = Math.round((Date.now() - new Date(i.due_at).getTime()) / 86400000)
    return Math.max(d, days)
  }, 0)

  // ----- Action handlers -----

  async function onSetupStripe(
    address: { line1?: string; line2?: string; city?: string; state: string; postal_code: string },
    billingEmail: string,
  ) {
    setBusyAction('setup'); setError(null); setNotice(null)
    const result = await createStripeCustomerForClient({ clientId, address, billingEmail })
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Stripe customer created.'); setShowSetupForm(false); load() }
  }

  async function onUpdateBillingEmail(newEmail: string) {
    setBusyAction('billing_email'); setError(null); setNotice(null)
    const result = await updateBillingEmail(clientId, newEmail)
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Billing email updated.'); load() }
  }

  async function onCancelSubscription(atPeriodEnd: boolean) {
    if (!subscription) return
    const confirmMsg = atPeriodEnd
      ? 'Cancel this subscription at the end of the current billing period? The client keeps service until then.'
      : 'Cancel this subscription IMMEDIATELY? The client loses service right now with no refund.'
    if (!confirm(confirmMsg)) return
    setBusyAction('cancel'); setError(null); setNotice(null)
    const result = await cancelSubscription({ subscriptionId: subscription.id, atPeriodEnd })
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice(atPeriodEnd ? 'Scheduled to cancel at period end.' : 'Canceled.'); load() }
  }

  async function onResendInvoice(invoiceId: string) {
    setBusyAction(`resend-${invoiceId}`); setError(null); setNotice(null)
    const result = await resendInvoice(invoiceId)
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else setNotice('Invoice resent.')
  }

  async function onVoidInvoice(invoiceId: string) {
    if (!confirm('Cancel this invoice? The client will no longer be able to pay it. This cannot be undone.')) return
    setBusyAction(`void-${invoiceId}`); setError(null); setNotice(null)
    const result = await voidInvoice(invoiceId)
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Invoice canceled.'); load() }
  }

  async function onDeleteDraft(invoiceId: string) {
    if (!confirm('Delete this draft invoice? The client has not seen it yet.')) return
    setBusyAction(`delete-${invoiceId}`); setError(null); setNotice(null)
    const result = await deleteDraftInvoice(invoiceId)
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Draft deleted.'); load() }
  }

  async function onGetPortalLink() {
    setBusyAction('portal'); setError(null); setNotice(null)
    const result = await createCustomerPortalLink(clientId)
    setBusyAction(null)
    if (!result.success) { setError(result.error); return }
    // Copy to clipboard for the admin to send via whatever channel they prefer
    await navigator.clipboard.writeText(result.data!.url)
    setNotice(`Portal link copied to clipboard. Paste it into an email or text to the client.`)
  }

  // ----- Render -----

  if (loading) {
    return (
      <Card title="Stripe Billing">
        <div className="flex items-center justify-center py-6 text-ink-4">
          <Loader2 className="w-4 h-4 animate-spin" />
        </div>
      </Card>
    )
  }

  return (
    <Card title="Stripe Billing">
      {error && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}><X className="w-3 h-3" /></button>
        </div>
      )}
      {notice && (
        <div className="mb-3 bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-[12px] text-emerald-800 flex items-start gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span className="flex-1">{notice}</span>
          <button onClick={() => setNotice(null)}><X className="w-3 h-3" /></button>
        </div>
      )}

      {/* Overdue alert -- visible whenever any open invoice has passed its due_at */}
      {overdueInvoices.length > 0 && (
        <div className="mb-3 bg-red-50 border border-red-200 rounded-lg p-3 text-[12px] text-red-800 flex items-start gap-2">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">
              {overdueInvoices.length} overdue invoice{overdueInvoices.length === 1 ? '' : 's'} — {formatCents(overdueCents)}
            </p>
            <p className="text-[11px] mt-0.5">
              Oldest is {oldestDaysOverdue} days past due. Click an invoice below to resend the email or cancel.
            </p>
          </div>
        </div>
      )}

      {/* STATE 1: no Stripe customer yet */}
      {!hasCustomer && !showSetupForm && (
        <div className="space-y-3">
          <p className="text-[12px] text-ink-3 leading-snug">
            This client isn&apos;t set up in Stripe yet. We&apos;ll ask for their state
            and ZIP so sales tax is calculated correctly on invoices.
          </p>
          <button
            onClick={() => setShowSetupForm(true)}
            className="w-full bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2"
          >
            <CreditCard className="w-4 h-4" />
            Set up Stripe billing
          </button>
        </div>
      )}
      {!hasCustomer && showSetupForm && (
        <SetupBillingForm
          onClose={() => setShowSetupForm(false)}
          onSubmit={onSetupStripe}
          busy={busyAction === 'setup'}
          prefill={prefill}
        />
      )}

      {/* STATE 2+: has Stripe customer */}
      {hasCustomer && (
        <div className="space-y-4">
          {/* Billing email — click to edit */}
          <BillingEmailRow
            currentBillingEmail={prefill?.billingEmail ?? ''}
            contactEmail={prefill?.contactEmail ?? ''}
            onSave={onUpdateBillingEmail}
            busy={busyAction === 'billing_email'}
          />

          {/* Payment method on file */}
          <div className="bg-bg-2 rounded-lg p-3">
            <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wide">Payment method</span>
            <p className="text-sm text-ink mt-1">
              {billingCustomer!.payment_method_brand
                ? `${billingCustomer!.payment_method_brand.toUpperCase()} ending in ${billingCustomer!.payment_method_last4}`
                : <span className="text-ink-4">None on file yet</span>}
            </p>
            <button
              onClick={onGetPortalLink}
              disabled={busyAction === 'portal'}
              className="mt-2 text-[11px] text-brand hover:text-brand-dark font-medium inline-flex items-center gap-1"
            >
              {busyAction === 'portal' ? <Loader2 className="w-3 h-3 animate-spin" /> : <LinkIcon className="w-3 h-3" />}
              Get payment-method update link
            </button>
          </div>

          {/* Active subscription */}
          {hasActiveSubscription && subscription && (
            <div className="border border-ink-6 rounded-lg p-3">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wide">Active retainer</span>
                  <p className="text-sm font-semibold text-ink mt-0.5">{subscription.plan_name}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[subscription.status] ?? ''}`}>
                  {subscription.status}
                </span>
              </div>
              <div className="text-[12px] text-ink-3 space-y-0.5">
                <p>{formatCents(subscription.amount_cents)}/month</p>
                <p>Next invoice: {formatDate(subscription.current_period_end)}</p>
                {subscription.cancel_at_period_end && (
                  <p className="text-amber-700 font-medium">Scheduled to cancel at period end</p>
                )}
              </div>
              <div className="flex gap-2 mt-3">
                {!subscription.cancel_at_period_end && (
                  <button
                    onClick={() => onCancelSubscription(true)}
                    disabled={busyAction === 'cancel'}
                    className="text-[11px] text-ink-3 hover:text-red-700 font-medium"
                  >
                    Cancel at period end
                  </button>
                )}
              </div>
            </div>
          )}

          {/* No active subscription -> start retainer button */}
          {!hasActiveSubscription && !showRetainerForm && (
            <button
              onClick={() => setShowRetainerForm(true)}
              className="w-full bg-white hover:bg-bg-2 border border-ink-6 text-ink text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Start monthly retainer
            </button>
          )}
          {!hasActiveSubscription && showRetainerForm && (
            <StartRetainerForm
              clientId={clientId}
              onClose={() => setShowRetainerForm(false)}
              onDone={() => { setShowRetainerForm(false); load(); setNotice('Retainer started. Stripe will email the first invoice on the billing anchor date.') }}
            />
          )}

          {/* Invoice history */}
          {invoices.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-medium text-ink-4 uppercase tracking-wide">Recent invoices</span>
                {!showInvoiceForm && (
                  <button
                    onClick={() => setShowInvoiceForm(true)}
                    className="text-[11px] text-brand hover:text-brand-dark font-medium inline-flex items-center gap-1"
                  >
                    <Plus className="w-3 h-3" /> New invoice
                  </button>
                )}
              </div>
              <div className="space-y-1.5">
                {invoices.slice(0, 10).map(inv => (
                  <InvoiceRowItem
                    key={inv.id}
                    invoice={inv}
                    busyAction={busyAction}
                    onView={() => setDetailInvoiceId(inv.id)}
                    onResend={() => onResendInvoice(inv.id)}
                    onVoid={() => onVoidInvoice(inv.id)}
                    onDelete={() => onDeleteDraft(inv.id)}
                  />
                ))}
              </div>
            </div>
          )}

          {invoices.length === 0 && !showInvoiceForm && (
            <button
              onClick={() => setShowInvoiceForm(true)}
              className="w-full bg-white hover:bg-bg-2 border border-ink-6 text-ink text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Send a one-time invoice
            </button>
          )}

          {showInvoiceForm && (
            <CreateInvoiceForm
              clientId={clientId}
              products={products}
              billingEmail={prefill?.billingEmail || prefill?.contactEmail || ''}
              onClose={() => setShowInvoiceForm(false)}
              onDone={() => { setShowInvoiceForm(false); load() }}
              onSent={() => setNotice('Invoice sent. Stripe emailed the client.')}
            />
          )}
        </div>
      )}

      {/* Full invoice details modal */}
      {detailInvoiceId && (
        <InvoiceDetailModal
          invoiceId={detailInvoiceId}
          onClose={() => setDetailInvoiceId(null)}
          onChange={() => load()}
        />
      )}
    </Card>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-ink-6 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">{title}</h3>
      {children}
    </div>
  )
}

// US states -- short list because we're US-only for now
const US_STATES: Array<{ code: string; name: string }> = [
  { code: 'AL', name: 'Alabama' }, { code: 'AK', name: 'Alaska' },
  { code: 'AZ', name: 'Arizona' }, { code: 'AR', name: 'Arkansas' },
  { code: 'CA', name: 'California' }, { code: 'CO', name: 'Colorado' },
  { code: 'CT', name: 'Connecticut' }, { code: 'DE', name: 'Delaware' },
  { code: 'FL', name: 'Florida' }, { code: 'GA', name: 'Georgia' },
  { code: 'HI', name: 'Hawaii' }, { code: 'ID', name: 'Idaho' },
  { code: 'IL', name: 'Illinois' }, { code: 'IN', name: 'Indiana' },
  { code: 'IA', name: 'Iowa' }, { code: 'KS', name: 'Kansas' },
  { code: 'KY', name: 'Kentucky' }, { code: 'LA', name: 'Louisiana' },
  { code: 'ME', name: 'Maine' }, { code: 'MD', name: 'Maryland' },
  { code: 'MA', name: 'Massachusetts' }, { code: 'MI', name: 'Michigan' },
  { code: 'MN', name: 'Minnesota' }, { code: 'MS', name: 'Mississippi' },
  { code: 'MO', name: 'Missouri' }, { code: 'MT', name: 'Montana' },
  { code: 'NE', name: 'Nebraska' }, { code: 'NV', name: 'Nevada' },
  { code: 'NH', name: 'New Hampshire' }, { code: 'NJ', name: 'New Jersey' },
  { code: 'NM', name: 'New Mexico' }, { code: 'NY', name: 'New York' },
  { code: 'NC', name: 'North Carolina' }, { code: 'ND', name: 'North Dakota' },
  { code: 'OH', name: 'Ohio' }, { code: 'OK', name: 'Oklahoma' },
  { code: 'OR', name: 'Oregon' }, { code: 'PA', name: 'Pennsylvania' },
  { code: 'RI', name: 'Rhode Island' }, { code: 'SC', name: 'South Carolina' },
  { code: 'SD', name: 'South Dakota' }, { code: 'TN', name: 'Tennessee' },
  { code: 'TX', name: 'Texas' }, { code: 'UT', name: 'Utah' },
  { code: 'VT', name: 'Vermont' }, { code: 'VA', name: 'Virginia' },
  { code: 'WA', name: 'Washington' }, { code: 'WV', name: 'West Virginia' },
  { code: 'WI', name: 'Wisconsin' }, { code: 'WY', name: 'Wyoming' },
  { code: 'DC', name: 'Washington DC' },
]

/**
 * Inline-editable billing email row. Shows the effective address (with
 * fallback to contact email), lets admin click to edit, saves to
 * billing_email and syncs to Stripe.
 */
function BillingEmailRow({
  currentBillingEmail, contactEmail, onSave, busy,
}: {
  currentBillingEmail: string
  contactEmail: string
  onSave: (email: string) => Promise<void>
  busy: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(currentBillingEmail || contactEmail || '')
  useEffect(() => {
    setDraft(currentBillingEmail || contactEmail || '')
  }, [currentBillingEmail, contactEmail])

  const effective = currentBillingEmail || contactEmail
  const isOverride = currentBillingEmail && currentBillingEmail !== contactEmail

  async function commit() {
    await onSave(draft)
    setEditing(false)
  }

  return (
    <div className="bg-bg-2 rounded-lg p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <span className="text-[10px] font-medium text-ink-4 uppercase tracking-wide">Invoices go to</span>
          {editing ? (
            <div className="flex items-center gap-2 mt-1.5">
              <input
                type="email"
                value={draft}
                onChange={e => setDraft(e.target.value)}
                autoFocus
                onKeyDown={e => {
                  if (e.key === 'Enter') { e.preventDefault(); void commit() }
                  if (e.key === 'Escape') { e.preventDefault(); setEditing(false); setDraft(currentBillingEmail || contactEmail || '') }
                }}
                className="flex-1 min-w-0 px-2 py-1 border border-brand rounded text-sm bg-white"
              />
              <button
                onClick={commit}
                disabled={busy}
                className="text-[11px] font-medium text-brand-dark hover:underline disabled:opacity-50"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Save'}
              </button>
              <button
                onClick={() => { setEditing(false); setDraft(currentBillingEmail || contactEmail || '') }}
                className="text-[11px] text-ink-4 hover:text-ink"
              >
                Cancel
              </button>
            </div>
          ) : (
            <p className="text-sm text-ink mt-0.5 font-mono break-all">
              {effective || <span className="text-ink-4">Not set</span>}
            </p>
          )}
          {!editing && isOverride && (
            <p className="text-[10.5px] text-ink-4 mt-0.5">
              Override · contact email is <span className="font-mono">{contactEmail}</span>
            </p>
          )}
        </div>
        {!editing && (
          <button
            onClick={() => setEditing(true)}
            className="text-[11px] text-ink-4 hover:text-brand-dark font-medium"
          >
            Edit
          </button>
        )}
      </div>
    </div>
  )
}

function SetupBillingForm({
  onClose, onSubmit, busy, prefill,
}: {
  onClose: () => void
  onSubmit: (
    addr: { line1?: string; city?: string; state: string; postal_code: string },
    billingEmail: string,
  ) => Promise<void>
  busy: boolean
  prefill: {
    line1: string; city: string; state: string; zip: string
    contactEmail: string; billingEmail: string
  } | null
}) {
  const [line1, setLine1] = useState(prefill?.line1 ?? '')
  const [city, setCity] = useState(prefill?.city ?? '')
  const [state, setState] = useState(prefill?.state || 'WA')
  const [postal, setPostal] = useState(prefill?.zip ?? '')
  // Billing email defaults to the existing billing_email override if set,
  // otherwise falls back to the general contact email.
  const [billingEmail, setBillingEmail] = useState(
    prefill?.billingEmail || prefill?.contactEmail || ''
  )
  const [err, setErr] = useState<string | null>(null)

  // Re-hydrate whenever the prefill prop arrives (loads async)
  useEffect(() => {
    if (!prefill) return
    setLine1(prev => prev || prefill.line1)
    setCity(prev => prev || prefill.city)
    setState(prev => prev || prefill.state || 'WA')
    setPostal(prev => prev || prefill.zip)
    setBillingEmail(prev => prev || prefill.billingEmail || prefill.contactEmail)
  }, [prefill])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state || !postal) { setErr('State and ZIP are required'); return }
    if (!billingEmail.trim()) { setErr('Billing email is required so Stripe knows where to send invoices'); return }
    setErr(null)
    await onSubmit({
      line1: line1 || undefined,
      city: city || undefined,
      state,
      postal_code: postal,
    }, billingEmail.trim())
  }

  const contactEmail = prefill?.contactEmail
  const isOverridingContact = contactEmail && billingEmail.trim() && billingEmail.trim() !== contactEmail

  return (
    <form onSubmit={handleSubmit} className="border border-ink-6 rounded-lg p-3 space-y-3 bg-bg-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">Set up Stripe billing</span>
        <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-[11px] text-ink-4 leading-snug">
        Fields pre-fill from the client&apos;s profile. Billing email is where Stripe sends invoices — it can
        differ from the main contact email.
      </p>

      {/* Billing email — the new field */}
      <div className="space-y-1">
        <label className="text-[10.5px] font-semibold text-ink-3 uppercase tracking-wide">Billing email</label>
        <input
          type="email"
          value={billingEmail}
          onChange={e => setBillingEmail(e.target.value)}
          placeholder="billing@company.com"
          required
          className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
        />
        {isOverridingContact && (
          <p className="text-[10.5px] text-ink-4">
            Overriding contact email <span className="font-mono">{contactEmail}</span>. Stored on the client
            record so future invoices also use this address.
          </p>
        )}
      </div>

      {/* Address section */}
      <div className="pt-2 border-t border-ink-6 space-y-2">
        <label className="text-[10.5px] font-semibold text-ink-3 uppercase tracking-wide block">Billing address</label>
        <p className="text-[10.5px] text-ink-4 leading-snug">
          State + ZIP are required (sales tax). Street + city appear on the invoice PDF.
        </p>
        <input
          type="text"
          placeholder="Street address"
          value={line1}
          onChange={e => setLine1(e.target.value)}
          className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
        />
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            placeholder="City"
            value={city}
            onChange={e => setCity(e.target.value)}
            className="px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
          />
          <input
            type="text"
            placeholder="ZIP *"
            value={postal}
            onChange={e => setPostal(e.target.value)}
            required
            className="px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
          />
        </div>
        <select
          value={state}
          onChange={e => setState(e.target.value)}
          className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
        >
          {US_STATES.map(s => (
            <option key={s.code} value={s.code}>{s.name}</option>
          ))}
        </select>
      </div>

      {err && <p className="text-[12px] text-red-700">{err}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={busy}
          className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Set up billing
        </button>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">
          Cancel
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Reusable discount fields -- used inside both retainer + invoice forms.
// Admin-only (these components render inside admin-side actions).
// ---------------------------------------------------------------------------

function DiscountFields({
  value, onChange, allowRecurring,
}: {
  value: DiscountInput | null
  onChange: (d: DiscountInput | null) => void
  allowRecurring: boolean  // true for subscriptions; false for one-time invoices
}) {
  // Active state is INDEPENDENT of the committed value -- the checkbox stays
  // on while the user is typing even though the value might not yet parse.
  // Only valid values propagate to the parent via onChange; invalid typing
  // state leaves the parent at null and the form submit will fail cleanly.
  const [active, setActive] = useState(value !== null)
  const [localType, setLocalType] = useState<'percent' | 'fixed'>(value?.type ?? 'percent')
  const [localValue, setLocalValue] = useState(value?.value?.toString() ?? '')
  const [localDuration, setLocalDuration] = useState<'once' | 'forever' | 'repeating'>(
    value?.duration ?? 'once',
  )
  const [localMonths, setLocalMonths] = useState(value?.durationMonths?.toString() ?? '3')
  const [localName, setLocalName] = useState(value?.name ?? '')

  // Push up whenever the local state changes. Uses effect so we can always
  // emit the latest valid value (or null) without callback plumbing inside
  // every onChange handler.
  useEffect(() => {
    if (!active) {
      onChange(null)
      return
    }
    const numValue = parseFloat(localValue)
    if (!Number.isFinite(numValue) || numValue <= 0) {
      onChange(null) // not yet valid -- form submit will block
      return
    }
    onChange({
      type: localType,
      value: numValue,
      duration: allowRecurring ? localDuration : 'once',
      durationMonths: localDuration === 'repeating' ? parseInt(localMonths) || 3 : undefined,
      name: localName || undefined,
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, localType, localValue, localDuration, localMonths, localName])

  return (
    <div className="border border-ink-6 rounded-lg p-3 bg-white space-y-2">
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={active}
          onChange={e => setActive(e.target.checked)}
          className="flex-shrink-0"
        />
        <span className="text-[12px] font-medium text-ink-2">Apply discount</span>
        {active && !value && (
          <span className="text-[10px] text-amber-700">enter a value below</span>
        )}
      </label>

      {active && (
        <div className="space-y-2 pl-6">
          <div className="flex gap-1.5">
            <select
              value={localType}
              onChange={e => setLocalType(e.target.value as 'percent' | 'fixed')}
              className="px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
            >
              <option value="percent">Percent</option>
              <option value="fixed">Dollar amount</option>
            </select>
            <div className="relative flex-1">
              {localType === 'fixed' && (
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-4 text-xs">$</span>
              )}
              <input
                type="number"
                min="0"
                step={localType === 'percent' ? '1' : '0.01'}
                max={localType === 'percent' ? '100' : undefined}
                placeholder={localType === 'percent' ? '15' : '50.00'}
                value={localValue}
                onChange={e => setLocalValue(e.target.value)}
                className={`w-full px-2 py-1.5 border border-ink-6 rounded text-sm bg-white ${localType === 'fixed' ? 'pl-5' : ''}`}
                autoFocus
              />
              {localType === 'percent' && (
                <span className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-4 text-xs">%</span>
              )}
            </div>
          </div>

          {allowRecurring && (
            <div className="flex gap-1.5 items-center">
              <select
                value={localDuration}
                onChange={e => setLocalDuration(e.target.value as 'once' | 'forever' | 'repeating')}
                className="px-2 py-1.5 border border-ink-6 rounded text-sm bg-white flex-1"
              >
                <option value="once">First invoice only</option>
                <option value="repeating">For N months</option>
                <option value="forever">Forever (permanent)</option>
              </select>
              {localDuration === 'repeating' && (
                <>
                  <input
                    type="number"
                    min="1"
                    max="36"
                    value={localMonths}
                    onChange={e => setLocalMonths(e.target.value)}
                    className="w-16 px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
                  />
                  <span className="text-[11px] text-ink-4">months</span>
                </>
              )}
            </div>
          )}

          <input
            type="text"
            placeholder="Label (optional, e.g., &apos;Founding rate&apos;)"
            value={localName}
            onChange={e => setLocalName(e.target.value)}
            className="w-full px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
          />
        </div>
      )}
    </div>
  )
}

function StartRetainerForm({
  clientId, onClose, onDone,
}: { clientId: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [addBuffer, setAddBuffer] = useState(false)
  const [discount, setDiscount] = useState<DiscountInput | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const parsedAmount = parseFloat(amount)
  // 3% + 30¢ buffer to cover card fees.
  // Formula: final = (desired + 0.30) / (1 - 0.029) so desired nets exactly.
  const billedAmount = Number.isFinite(parsedAmount) && parsedAmount > 0 && addBuffer
    ? Math.round(((parsedAmount + 0.30) / (1 - 0.029)) * 100) / 100
    : parsedAmount

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!Number.isFinite(billedAmount) || billedAmount <= 0) {
      setError('Enter a positive monthly amount'); return
    }
    setSubmitting(true); setError(null)
    const result = await startMonthlyRetainer({
      clientId,
      monthlyAmountDollars: billedAmount,
      discount: discount ?? undefined,
    })
    setSubmitting(false)
    if (!result.success) setError(result.error)
    else onDone()
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink-6 rounded-lg p-3 space-y-3 bg-bg-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">New monthly retainer</span>
        <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-3.5 h-3.5" /></button>
      </div>
      <label className="block">
        <span className="text-[11px] text-ink-4">
          {addBuffer ? 'Desired net amount per month' : 'Amount (USD per month)'}
        </span>
        <div className="relative mt-1">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4 text-sm">$</span>
          <input
            type="number"
            min="1"
            step="0.01"
            placeholder="425.00"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="w-full pl-7 pr-3 py-2 border border-ink-6 rounded-lg text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            autoFocus
          />
        </div>
      </label>

      {/* Card fee buffer toggle */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={addBuffer}
          onChange={e => setAddBuffer(e.target.checked)}
          className="mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-medium text-ink-2">Add 3% card fee buffer</span>
          <p className="text-[11px] text-ink-4 leading-snug mt-0.5">
            Billing amount increases so you net your target after card fees. Recommended for
            new clients. Leave off for existing clients on a known rate.
          </p>
        </div>
      </label>

      {/* Live preview of what the client will be billed */}
      {addBuffer && Number.isFinite(parsedAmount) && parsedAmount > 0 && (
        <div className="bg-white border border-ink-6 rounded-lg p-3 text-[12px]">
          <div className="flex justify-between mb-1">
            <span className="text-ink-4">Client billed</span>
            <span className="font-semibold text-ink tabular-nums">${billedAmount.toFixed(2)}/mo</span>
          </div>
          <div className="flex justify-between text-ink-4">
            <span>If paid by card (2.9% + $0.30)</span>
            <span className="tabular-nums">~${parsedAmount.toFixed(2)} net</span>
          </div>
          <div className="flex justify-between text-ink-4">
            <span>If paid by ACH (0.8% capped $5)</span>
            <span className="tabular-nums">~${(billedAmount - Math.min(5, billedAmount * 0.008)).toFixed(2)} net</span>
          </div>
        </div>
      )}

      {/* Discount (admin-only) */}
      <DiscountFields value={discount} onChange={setDiscount} allowRecurring={true} />

      <p className="text-[11px] text-ink-4 leading-snug">
        First invoice sent by Stripe on the 15th of next month. Retainer uses
        &ldquo;send invoice&rdquo; by default (no auto-charge).
      </p>
      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Start retainer
        </button>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">
          Cancel
        </button>
      </div>
    </form>
  )
}

function CreateInvoiceForm({
  clientId, products, billingEmail, onClose, onDone, onSent,
}: {
  clientId: string
  products: ProductRow[]
  billingEmail: string
  onClose: () => void
  onDone: () => void
  onSent: () => void
}) {
  const [lines, setLines] = useState<InvoiceLineInput[]>([
    { description: '', quantity: 1, unitAmountDollars: 0, serviceCategory: 'custom' },
  ])
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')
  const [addBuffer, setAddBuffer] = useState(false)
  const [discount, setDiscount] = useState<DiscountInput | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Preview state: once the invoice is created in Stripe (finalized but
  // not sent), we swap the form UI for a review pane with the hosted URL
  // and Send / Discard buttons.
  const [preview, setPreview] = useState<{
    invoiceId: string
    stripeInvoiceId: string
    hostedUrl: string | null
    totalCents: number
    taxCents: number
    subtotalCents: number
  } | null>(null)
  const [busyAction, setBusyAction] = useState<'send' | 'discard' | null>(null)
  // After "Send to client" we keep the preview open in a "sent" mode
  // so the admin can still click through to the hosted URL to verify
  // the email looks right.
  const [sent, setSent] = useState(false)
  const [copied, setCopied] = useState(false)

  const subtotal = useMemo(
    () => lines.reduce((sum, l) => sum + (l.unitAmountDollars || 0) * (l.quantity || 0), 0),
    [lines],
  )

  // When the buffer is enabled we add a single "Card processing buffer"
  // line at +3% + 30c so the net after card fees matches the subtotal.
  const bufferDollars = addBuffer && subtotal > 0
    ? Math.round(((subtotal / (1 - 0.029) - subtotal) + 0.30) * 100) / 100
    : 0
  const preDiscountSubtotal = subtotal + bufferDollars

  // Discount math (client-side preview -- Stripe computes authoritatively
  // at invoice creation but we show the expected breakdown live).
  const discountDollars = discount
    ? discount.type === 'percent'
      ? Math.round((preDiscountSubtotal * discount.value / 100) * 100) / 100
      : Math.min(discount.value, preDiscountSubtotal) // fixed can't exceed subtotal
    : 0

  const total = Math.max(0, preDiscountSubtotal - discountDollars)

  function updateLine(i: number, update: Partial<InvoiceLineInput>) {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, ...update } : l))
  }

  function addLine(prefill?: ProductRow) {
    if (prefill) {
      setLines(prev => [...prev, {
        description: prefill.name,
        quantity: 1,
        unitAmountDollars: (prefill.amount_cents ?? 0) / 100,
        productId: prefill.id,
        serviceCategory: prefill.category as InvoiceLineInput['serviceCategory'],
      }])
    } else {
      setLines(prev => [...prev, { description: '', quantity: 1, unitAmountDollars: 0, serviceCategory: 'custom' }])
    }
  }

  function removeLine(i: number) {
    if (lines.length === 1) return
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (lines.some(l => !l.description || l.unitAmountDollars <= 0)) {
      setError('Every line needs a description and positive price'); return
    }
    const linesToSend = addBuffer && bufferDollars > 0
      ? [
          ...lines,
          {
            description: 'Card processing buffer (3%)',
            quantity: 1,
            unitAmountDollars: bufferDollars,
            serviceCategory: 'custom' as const,
          },
        ]
      : lines
    setSubmitting(true); setError(null)
    const result = await createOneTimeInvoice({
      clientId,
      lines: linesToSend,
      dueDateDays: dueDays,
      notes: notes || undefined,
      discount: discount ? { type: discount.type, value: discount.value, name: discount.name } : undefined,
    })
    setSubmitting(false)
    if (!result.success) { setError(result.error); return }
    // Enter preview mode — invoice exists in Stripe but client hasn't been
    // emailed yet. Admin reviews + approves or discards.
    setPreview(result.data!)
  }

  async function handleSendPreview() {
    if (!preview) return
    setBusyAction('send'); setError(null)
    const r = await resendInvoice(preview.invoiceId)
    setBusyAction(null)
    if (!r.success) { setError(r.error); return }
    setSent(true)
    onSent()
  }

  async function copyLink() {
    if (!preview?.hostedUrl) return
    try {
      await navigator.clipboard.writeText(preview.hostedUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard may be blocked; ignore */
    }
  }

  async function handleDiscardPreview() {
    if (!preview) return
    if (!confirm('Discard this invoice? It will be voided in Stripe. The client was never notified.')) return
    setBusyAction('discard'); setError(null)
    const r = await voidInvoice(preview.invoiceId)
    setBusyAction(null)
    if (!r.success) { setError(r.error); return }
    onDone()
  }

  // ── Preview / sent mode ──────────────────────────────────────────
  // Before send: review pane with Send / Discard.
  // After send: confirmation pane with the hosted link preserved so
  // the admin can click through and verify the client's experience.
  if (preview) {
    return (
      <div className="border border-ink-6 rounded-lg p-4 space-y-4 bg-white">
        <div className="flex items-start gap-3">
          <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
            sent ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'
          }`}>
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-ink">
              {sent ? 'Sent — invoice is in the client\u2019s inbox' : 'Preview ready · not sent yet'}
            </h3>
            <p className="text-[12px] text-ink-3 mt-0.5">
              {sent
                ? billingEmail
                  ? <>Stripe emailed <span className="font-mono">{billingEmail}</span>. The hosted invoice link below stays valid as long as the invoice is open — use it to verify the email looks right.</>
                  : 'Stripe emailed the client. The link below stays valid until paid.'
                : 'The invoice exists in Stripe but the client hasn\u2019t been emailed. Review it, then send or discard.'}
            </p>
          </div>
        </div>

        {/* Numbers summary from Stripe's authoritative calculation */}
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-bg-2 rounded-lg p-3">
            <div className="text-[10px] text-ink-4 uppercase tracking-wide">Subtotal</div>
            <div className="text-[15px] font-semibold text-ink tabular-nums mt-1">
              ${(preview.subtotalCents / 100).toFixed(2)}
            </div>
          </div>
          <div className="bg-bg-2 rounded-lg p-3">
            <div className="text-[10px] text-ink-4 uppercase tracking-wide">Tax</div>
            <div className="text-[15px] font-semibold text-ink tabular-nums mt-1">
              ${(preview.taxCents / 100).toFixed(2)}
            </div>
          </div>
          <div className="bg-brand-tint/40 rounded-lg p-3 border border-brand/20">
            <div className="text-[10px] text-brand-dark uppercase tracking-wide font-semibold">Total</div>
            <div className="text-[15px] font-semibold text-brand-dark tabular-nums mt-1">
              ${(preview.totalCents / 100).toFixed(2)}
            </div>
          </div>
        </div>

        {/* Hosted link: opens in a new tab, always available pre + post send */}
        {preview.hostedUrl && (
          <div className="flex gap-2">
            <a
              href={preview.hostedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 text-center bg-white hover:bg-bg-2 border border-ink-6 rounded-lg px-3 py-2.5 text-sm font-medium text-ink transition-colors"
            >
              {sent ? 'View sent invoice in Stripe ↗' : 'Open preview in Stripe ↗'}
            </a>
            <button
              type="button"
              onClick={copyLink}
              title="Copy hosted link to clipboard"
              className="border border-ink-6 hover:border-ink-4 bg-white hover:bg-bg-2 rounded-lg px-3 text-[12px] text-ink-3 font-medium transition-colors"
            >
              {copied ? 'Copied' : 'Copy link'}
            </button>
          </div>
        )}

        {!sent && billingEmail && (
          <p className="text-[12px] text-ink-3 leading-snug text-center">
            On &ldquo;Send to client&rdquo; Stripe will email <span className="font-mono">{billingEmail}</span>.
          </p>
        )}

        {error && (
          <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
            <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
            {error}
          </div>
        )}

        {sent ? (
          <button
            type="button"
            onClick={onDone}
            className="w-full bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2.5 flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Done
          </button>
        ) : (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleSendPreview}
              disabled={busyAction !== null}
              className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2.5 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busyAction === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
              Send to client
            </button>
            <button
              type="button"
              onClick={handleDiscardPreview}
              disabled={busyAction !== null}
              className="border border-ink-6 hover:border-red-300 text-red-600 hover:bg-red-50 text-sm font-medium rounded-lg px-3 py-2.5 flex items-center gap-2 disabled:opacity-50"
            >
              {busyAction === 'discard' ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
              Discard
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink-6 rounded-lg p-3 space-y-3 bg-bg-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">New one-time invoice</span>
        <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-3.5 h-3.5" /></button>
      </div>

      {/* Quick-add product buttons */}
      {products.length > 0 && (
        <div>
          <span className="text-[10px] text-ink-4">Quick add:</span>
          <div className="flex flex-wrap gap-1.5 mt-1">
            {products.map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => addLine(p)}
                className="text-[11px] px-2 py-1 bg-white border border-ink-6 rounded-md hover:border-brand/40 text-ink-2"
              >
                {p.name} · {p.amount_cents ? formatCents(p.amount_cents) : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Line items */}
      <div className="space-y-1.5">
        {lines.map((l, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input
              type="text"
              placeholder="Description"
              value={l.description}
              onChange={e => updateLine(i, { description: e.target.value })}
              className="flex-1 min-w-0 px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
            />
            <input
              type="number"
              min="1"
              value={l.quantity}
              onChange={e => updateLine(i, { quantity: parseInt(e.target.value) || 1 })}
              className="w-14 px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
            />
            <div className="relative w-24">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-4 text-xs">$</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={l.unitAmountDollars || ''}
                onChange={e => updateLine(i, { unitAmountDollars: parseFloat(e.target.value) || 0 })}
                className="w-full pl-5 pr-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
              />
            </div>
            {lines.length > 1 && (
              <button type="button" onClick={() => removeLine(i)} className="text-ink-4 hover:text-red-500">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        <button type="button" onClick={() => addLine()} className="text-[11px] text-brand hover:text-brand-dark font-medium inline-flex items-center gap-1">
          <Plus className="w-3 h-3" /> Add custom line
        </button>
      </div>

      <label className="block">
        <span className="text-[11px] text-ink-4">Due in (days)</span>
        <input
          type="number"
          min="1"
          max="90"
          value={dueDays}
          onChange={e => setDueDays(parseInt(e.target.value) || 14)}
          className="w-full px-2 py-1.5 border border-ink-6 rounded text-sm bg-white mt-1"
        />
      </label>

      {/* Live price breakdown -- shows exactly what the client will see on
          their hosted invoice, so admin can sanity-check before sending. */}
      {subtotal > 0 && (
        <div className="bg-white border border-ink-6 rounded-lg p-3 text-[12px] space-y-1">
          <div className="text-[10px] font-semibold text-ink-4 uppercase tracking-wide mb-1">
            What the client will see
          </div>
          <div className="flex justify-between tabular-nums">
            <span className="text-ink-3">Subtotal</span>
            <span className="text-ink-2">{formatCents(subtotal * 100)}</span>
          </div>
          {bufferDollars > 0 && (
            <div className="flex justify-between tabular-nums">
              <span className="text-ink-3">Card processing buffer (3%)</span>
              <span className="text-ink-2">+{formatCents(bufferDollars * 100)}</span>
            </div>
          )}
          {discount && discountDollars > 0 && (
            <div className="flex justify-between tabular-nums text-emerald-700">
              <span>Discount{discount.name ? ` (${discount.name})` : ''}</span>
              <span>-{formatCents(discountDollars * 100)}</span>
            </div>
          )}
          <div className="flex justify-between tabular-nums text-ink-4">
            <span>Sales tax</span>
            <span>calculated by Stripe</span>
          </div>
          <div className="flex justify-between tabular-nums pt-1 mt-1 border-t border-ink-6">
            <span className="font-semibold text-ink">Total</span>
            <span className="font-semibold text-ink text-base">{formatCents(total * 100)}</span>
          </div>
          <div className="text-[10px] text-ink-4 pt-1">
            {addBuffer && bufferDollars > 0
              ? `Net after card fees: ~${formatCents(subtotal * 100)} · net by ACH: ~${formatCents((total - Math.min(5, total * 0.008)) * 100)}`
              : `Net after card fees: ~${formatCents((total * (1 - 0.029) - 0.30) * 100)} · net by ACH: ~${formatCents((total - Math.min(5, total * 0.008)) * 100)}`}
          </div>
        </div>
      )}

      {/* Card fee buffer toggle */}
      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={addBuffer}
          onChange={e => setAddBuffer(e.target.checked)}
          className="mt-0.5 flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <span className="text-[12px] font-medium text-ink-2">Add 3% card fee buffer</span>
          <p className="text-[11px] text-ink-4 leading-snug mt-0.5">
            Adds a &ldquo;Card processing buffer&rdquo; line so you net the subtotal after
            card fees. Recommended for new clients; skip if you want to absorb the fee.
          </p>
        </div>
      </label>

      {/* Discount (admin-only, applies once to this invoice) */}
      <DiscountFields value={discount} onChange={setDiscount} allowRecurring={false} />

      <textarea
        placeholder="Internal notes (not shown to client)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        className="w-full px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
      />

      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <p className="text-[11px] text-ink-4 leading-snug">
        Creates a preview in Stripe — you&apos;ll review the final invoice before the client is emailed.
      </p>
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
          Create preview
        </button>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">
          Cancel
        </button>
      </div>
    </form>
  )
}

function InvoiceRowItem({
  invoice, busyAction, onView, onResend, onVoid, onDelete,
}: {
  invoice: InvoiceRow
  busyAction: string | null
  onView: () => void
  onResend: () => void
  onVoid: () => void
  onDelete: () => void
}) {
  const isOverdue = invoice.status === 'open' && invoice.due_at && new Date(invoice.due_at) < new Date()
  const daysOverdue = isOverdue && invoice.due_at
    ? Math.round((Date.now() - new Date(invoice.due_at).getTime()) / 86400000)
    : 0

  return (
    <button
      type="button"
      onClick={onView}
      className="w-full text-left border border-ink-6 rounded-lg p-3 hover:border-brand/40 hover:bg-bg-2/50 transition-colors"
    >
      <div className="flex items-center justify-between gap-3 mb-1 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[13px] font-semibold text-ink">{invoice.invoice_number}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${STATUS_BADGE[invoice.status] ?? 'bg-ink-6 text-ink-4'}`}>
            {invoiceStatusLabel(invoice.status)}
          </span>
          {isOverdue && (
            <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold bg-red-50 text-red-700 border border-red-200">
              {daysOverdue}d overdue
            </span>
          )}
          {invoice.type === 'subscription' && (
            <span className="text-[10px] text-ink-4">retainer</span>
          )}
        </div>
        <span className="text-sm font-semibold text-ink tabular-nums">{formatCents(invoice.total_cents)}</span>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-4">
        <span>
          {invoice.status === 'paid' && invoice.paid_at
            ? `Paid ${formatDate(invoice.paid_at)}`
            : invoice.status === 'open' && invoice.due_at
            ? `Due ${formatDate(invoice.due_at)}`
            : `Issued ${formatDate(invoice.issued_at ?? invoice.due_at)}`}
        </span>
        <span className="text-[11px] text-ink-3 inline-flex items-center gap-1">
          <Eye className="w-3 h-3" />
          View details
        </span>
      </div>

      {/* Quick action row -- only for active invoices (open/failed/draft) */}
      {['open', 'failed', 'draft'].includes(invoice.status) && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-ink-6">
          {invoice.status === 'open' && invoice.hosted_invoice_url && (
            <button
              onClick={e => { e.stopPropagation(); onResend() }}
              disabled={busyAction === `resend-${invoice.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-ink-3 hover:text-brand-dark font-medium"
            >
              {busyAction === `resend-${invoice.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Resend email
            </button>
          )}
          {invoice.status === 'draft' && (
            <button
              onClick={e => { e.stopPropagation(); onDelete() }}
              disabled={busyAction === `delete-${invoice.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-red-700 hover:text-red-800 font-medium"
            >
              {busyAction === `delete-${invoice.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
              Delete draft
            </button>
          )}
          {['open', 'failed'].includes(invoice.status) && (
            <button
              onClick={e => { e.stopPropagation(); onVoid() }}
              disabled={busyAction === `void-${invoice.id}`}
              className="inline-flex items-center gap-1 text-[11px] text-red-700 hover:text-red-800 font-medium ml-auto"
            >
              {busyAction === `void-${invoice.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <X className="w-3 h-3" />}
              Cancel invoice
            </button>
          )}
        </div>
      )}
    </button>
  )
}
