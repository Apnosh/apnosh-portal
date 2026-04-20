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
  startMonthlyRetainer,
  cancelSubscription,
  createOneTimeInvoice,
  resendInvoice,
  voidInvoice,
  createCustomerPortalLink,
  type InvoiceLineInput,
} from '@/lib/billing-actions'
import {
  CreditCard, Loader2, CheckCircle2, AlertTriangle, X, Plus,
  Link as LinkIcon, ExternalLink, RefreshCw, Trash2, Send,
} from 'lucide-react'

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
  open: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  void: 'bg-ink-6 text-ink-4',
  draft: 'bg-ink-6 text-ink-3',
  failed: 'bg-red-50 text-red-700',
  uncollectible: 'bg-red-50 text-red-700',
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

  const [showRetainerForm, setShowRetainerForm] = useState(false)
  const [showInvoiceForm, setShowInvoiceForm] = useState(false)
  const [showSetupForm, setShowSetupForm] = useState(false)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    const [bcRes, subRes, invRes, prodRes] = await Promise.all([
      supabase.from('billing_customers').select('id, stripe_customer_id, payment_method_brand, payment_method_last4').eq('client_id', clientId).maybeSingle(),
      supabase.from('subscriptions').select('id, plan_name, amount_cents, status, collection_method, current_period_end, cancel_at_period_end').eq('client_id', clientId).in('status', ['active', 'trialing', 'past_due', 'paused', 'incomplete']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('invoices').select('id, invoice_number, type, status, total_cents, issued_at, paid_at, due_at, hosted_invoice_url').eq('client_id', clientId).order('created_at', { ascending: false }).limit(20),
      supabase.from('products').select('id, name, category, amount_cents, billing_type').eq('active', true).in('category', ['reel', 'addon', 'website', 'gbp']).order('amount_cents', { ascending: false }),
    ])

    setBillingCustomer(bcRes.data as BillingCustomerRow | null)
    setSubscription(subRes.data as SubscriptionRow | null)
    setInvoices((invRes.data ?? []) as InvoiceRow[])
    setProducts((prodRes.data ?? []) as ProductRow[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const hasCustomer = billingCustomer !== null
  const hasActiveSubscription = subscription !== null && ['active', 'trialing', 'past_due'].includes(subscription.status)

  // ----- Action handlers -----

  async function onSetupStripe(address: {
    line1?: string
    line2?: string
    city?: string
    state: string
    postal_code: string
  }) {
    setBusyAction('setup'); setError(null); setNotice(null)
    const result = await createStripeCustomerForClient({ clientId, address })
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Stripe customer created.'); setShowSetupForm(false); load() }
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
    if (!confirm('Void this invoice? The client can no longer pay it.')) return
    setBusyAction(`void-${invoiceId}`); setError(null); setNotice(null)
    const result = await voidInvoice(invoiceId)
    setBusyAction(null)
    if (!result.success) setError(result.error)
    else { setNotice('Invoice voided.'); load() }
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
        />
      )}

      {/* STATE 2+: has Stripe customer */}
      {hasCustomer && (
        <div className="space-y-4">
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
                    onResend={() => onResendInvoice(inv.id)}
                    onVoid={() => onVoidInvoice(inv.id)}
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
              onClose={() => setShowInvoiceForm(false)}
              onDone={() => { setShowInvoiceForm(false); load(); setNotice('Invoice sent. Stripe emailed the client.') }}
            />
          )}
        </div>
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

function SetupBillingForm({
  onClose, onSubmit, busy,
}: {
  onClose: () => void
  onSubmit: (addr: { line1?: string; city?: string; state: string; postal_code: string }) => Promise<void>
  busy: boolean
}) {
  const [line1, setLine1] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('WA') // default to WA since most clients here
  const [postal, setPostal] = useState('')
  const [err, setErr] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!state || !postal) { setErr('State and ZIP are required'); return }
    setErr(null)
    await onSubmit({
      line1: line1 || undefined,
      city: city || undefined,
      state,
      postal_code: postal,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="border border-ink-6 rounded-lg p-3 space-y-3 bg-bg-2">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium text-ink-3 uppercase tracking-wide">Billing address</span>
        <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink"><X className="w-3.5 h-3.5" /></button>
      </div>
      <p className="text-[11px] text-ink-4 leading-snug">
        Used for sales tax calculation on invoices. State + ZIP are required; line 1 and city are optional
        but show on the invoice PDF.
      </p>
      <input
        type="text"
        placeholder="Street address (optional)"
        value={line1}
        onChange={e => setLine1(e.target.value)}
        className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="City (optional)"
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

function StartRetainerForm({
  clientId, onClose, onDone,
}: { clientId: string; onClose: () => void; onDone: () => void }) {
  const [amount, setAmount] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const dollars = parseFloat(amount)
    if (!Number.isFinite(dollars) || dollars <= 0) {
      setError('Enter a positive monthly amount'); return
    }
    setSubmitting(true); setError(null)
    const result = await startMonthlyRetainer({ clientId, monthlyAmountDollars: dollars })
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
        <span className="text-[11px] text-ink-4">Amount (USD per month)</span>
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
      <p className="text-[11px] text-ink-4 leading-snug">
        First invoice will be sent by Stripe on the 15th of next month. The client gets an
        email with a hosted payment link. Retainers are on &ldquo;send invoice&rdquo; by default
        (no auto-charge) until the client adds a payment method.
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
  clientId, products, onClose, onDone,
}: {
  clientId: string
  products: ProductRow[]
  onClose: () => void
  onDone: () => void
}) {
  const [lines, setLines] = useState<InvoiceLineInput[]>([
    { description: '', quantity: 1, unitAmountDollars: 0, serviceCategory: 'custom' },
  ])
  const [dueDays, setDueDays] = useState(14)
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = useMemo(
    () => lines.reduce((sum, l) => sum + (l.unitAmountDollars || 0) * (l.quantity || 0), 0),
    [lines],
  )

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
    setSubmitting(true); setError(null)
    const result = await createOneTimeInvoice({ clientId, lines, dueDateDays: dueDays, notes: notes || undefined })
    setSubmitting(false)
    if (!result.success) setError(result.error)
    else onDone()
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

      <div className="grid grid-cols-2 gap-2">
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
        <div className="text-right">
          <span className="text-[11px] text-ink-4">Total</span>
          <p className="text-lg font-semibold text-ink">{formatCents(total * 100)}</p>
        </div>
      </div>

      <textarea
        placeholder="Internal notes (not shown to client)"
        value={notes}
        onChange={e => setNotes(e.target.value)}
        rows={2}
        className="w-full px-2 py-1.5 border border-ink-6 rounded text-sm bg-white"
      />

      {error && <p className="text-[12px] text-red-700">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="flex-1 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          Send invoice
        </button>
        <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">
          Cancel
        </button>
      </div>
    </form>
  )
}

function InvoiceRowItem({
  invoice, busyAction, onResend, onVoid,
}: {
  invoice: InvoiceRow
  busyAction: string | null
  onResend: () => void
  onVoid: () => void
}) {
  const canVoid = ['open', 'draft', 'failed'].includes(invoice.status)
  const canResend = invoice.status === 'open' && invoice.hosted_invoice_url

  return (
    <div className="flex items-center justify-between gap-2 py-2 px-2 rounded hover:bg-bg-2">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[12px] font-medium text-ink">{invoice.invoice_number}</span>
          <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${STATUS_BADGE[invoice.status] ?? 'bg-ink-6 text-ink-4'}`}>
            {invoice.status}
          </span>
          {invoice.type === 'subscription' && (
            <span className="text-[10px] text-ink-4">retainer</span>
          )}
        </div>
        <p className="text-[11px] text-ink-4 mt-0.5">
          {formatCents(invoice.total_cents)} · {formatDate(invoice.issued_at ?? invoice.due_at)}
        </p>
      </div>
      <div className="flex items-center gap-1">
        {invoice.hosted_invoice_url && (
          <a
            href={invoice.hosted_invoice_url}
            target="_blank"
            rel="noopener noreferrer"
            title="Open hosted invoice"
            className="p-1 text-ink-4 hover:text-ink"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        )}
        {canResend && (
          <button
            onClick={onResend}
            disabled={busyAction === `resend-${invoice.id}`}
            title="Resend invoice email"
            className="p-1 text-ink-4 hover:text-brand-dark"
          >
            {busyAction === `resend-${invoice.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
          </button>
        )}
        {canVoid && (
          <button
            onClick={onVoid}
            disabled={busyAction === `void-${invoice.id}`}
            title="Void invoice"
            className="p-1 text-ink-4 hover:text-red-700"
          >
            {busyAction === `void-${invoice.id}` ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        )}
      </div>
    </div>
  )
}
