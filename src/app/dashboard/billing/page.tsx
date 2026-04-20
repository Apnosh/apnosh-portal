'use client'

/**
 * Client-facing billing page. Shows the client:
 *   - Their active retainer plan and next billing date
 *   - Invoice history with paid/open/failed status + Stripe hosted pay links
 *   - A button to manage their payment method via Stripe Customer Portal
 *
 * Reads from billing v2 schema (migration 055) via the client_users bridge.
 */

import { useEffect, useState, useCallback } from 'react'
import {
  Calendar, CheckCircle, Clock, XCircle, Zap, ExternalLink, CreditCard,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface BillingCustomerRow {
  stripe_customer_id: string
  payment_method_brand: string | null
  payment_method_last4: string | null
}

interface SubscriptionRow {
  id: string
  plan_name: string
  amount_cents: number
  interval: string
  status: string
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
  due_at: string | null
  paid_at: string | null
  hosted_invoice_url: string | null
  invoice_pdf_url: string | null
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  open: { label: 'Open', className: 'bg-blue-50 text-blue-700', icon: Clock },
  failed: { label: 'Payment failed', className: 'bg-red-50 text-red-700', icon: XCircle },
  void: { label: 'Void', className: 'bg-gray-50 text-gray-500', icon: XCircle },
  draft: { label: 'Draft', className: 'bg-gray-50 text-gray-500', icon: Clock },
  uncollectible: { label: 'Uncollectible', className: 'bg-red-50 text-red-700', icon: XCircle },
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function BillingPage() {
  const [billingCustomer, setBillingCustomer] = useState<BillingCustomerRow | null>(null)
  const [subscription, setSubscription] = useState<SubscriptionRow | null>(null)
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [portalError, setPortalError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // Resolve this auth user's client_id via client_users bridge.
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    const clientId = cu?.client_id
    if (!clientId) { setLoading(false); return }

    const [bcRes, subRes, invRes] = await Promise.all([
      supabase.from('billing_customers').select('stripe_customer_id, payment_method_brand, payment_method_last4').eq('client_id', clientId).maybeSingle(),
      supabase.from('subscriptions').select('id, plan_name, amount_cents, interval, status, current_period_end, cancel_at_period_end').eq('client_id', clientId).in('status', ['active', 'trialing', 'past_due', 'paused']).order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('invoices').select('id, invoice_number, type, status, total_cents, issued_at, due_at, paid_at, hosted_invoice_url, invoice_pdf_url').eq('client_id', clientId).order('created_at', { ascending: false }).limit(24),
    ])

    setBillingCustomer(bcRes.data as BillingCustomerRow | null)
    setSubscription(subRes.data as SubscriptionRow | null)
    setInvoices((invRes.data ?? []) as InvoiceRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      window.history.replaceState({}, '', '/dashboard/billing')
    }
    load()
  }, [load])

  async function handleManageBilling() {
    setPortalLoading(true)
    setPortalError(null)
    try {
      // Hit a server action that returns a Stripe Customer Portal URL.
      const res = await fetch('/api/billing/portal', { method: 'POST' })
      const json = await res.json()
      if (json.url) {
        window.location.href = json.url
      } else {
        setPortalError(json.error || 'Could not open billing portal')
        setPortalLoading(false)
      }
    } catch (err) {
      setPortalError(err instanceof Error ? err.message : 'Unknown error')
      setPortalLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-24 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-48 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Billing</h1>
          <p className="text-ink-3 text-sm mt-1">Your plan, invoices, and payment method.</p>
        </div>
        {billingCustomer && (
          <button
            onClick={handleManageBilling}
            disabled={portalLoading}
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium disabled:opacity-50 flex items-center gap-1.5"
          >
            {portalLoading
              ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <CreditCard className="w-3.5 h-3.5" />}
            Update payment method
          </button>
        )}
      </div>

      {portalError && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {portalError}
        </div>
      )}

      {/* No billing set up yet */}
      {!billingCustomer && (
        <div className="bg-white rounded-xl border border-ink-6 p-8 text-center">
          <CreditCard className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">Billing not set up yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team manages billing. Once your first invoice is sent,
            it will show up here.
          </p>
        </div>
      )}

      {/* Active plan card */}
      {subscription && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
                <Zap className="w-6 h-6 text-brand-dark" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{subscription.plan_name}</h2>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full uppercase tracking-wide ${
                    subscription.status === 'active' ? 'bg-emerald-50 text-emerald-700'
                    : subscription.status === 'past_due' ? 'bg-red-50 text-red-700'
                    : 'bg-amber-50 text-amber-700'
                  }`}>
                    {subscription.status}
                  </span>
                </div>
                <p className="text-sm text-ink-3 mt-0.5">
                  <span className="font-medium text-ink tabular-nums">{formatCents(subscription.amount_cents)}</span>
                  <span>/{subscription.interval === 'year' ? 'year' : 'month'}</span>
                </p>
                {subscription.current_period_end && (
                  <p className="text-[11px] text-ink-4 mt-1 flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {subscription.cancel_at_period_end
                      ? `Cancels on ${formatDate(subscription.current_period_end)}`
                      : `Next invoice: ${formatDate(subscription.current_period_end)}`}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Payment method on file */}
      {billingCustomer && (
        <div className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CreditCard className="w-5 h-5 text-ink-4" />
            <div>
              <p className="text-sm font-medium text-ink">Payment method</p>
              <p className="text-xs text-ink-3">
                {billingCustomer.payment_method_brand && billingCustomer.payment_method_last4
                  ? `${billingCustomer.payment_method_brand.toUpperCase()} ending in ${billingCustomer.payment_method_last4}`
                  : 'None on file -- add one via Update payment method.'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Invoice history */}
      {invoices.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-4 border-b border-ink-6">
            <h2 className="text-sm font-semibold text-ink">Invoices</h2>
          </div>
          <div className="divide-y divide-ink-6">
            {invoices.map(inv => {
              const cfg = statusConfig[inv.status] ?? statusConfig.draft
              const Icon = cfg.icon
              return (
                <div key={inv.id} className="px-5 py-3 flex items-center justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-ink">{inv.invoice_number}</span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${cfg.className}`}>
                        <Icon className="w-2.5 h-2.5" />
                        {cfg.label}
                      </span>
                      {inv.type === 'subscription' && (
                        <span className="text-[10px] text-ink-4">retainer</span>
                      )}
                    </div>
                    <p className="text-[11px] text-ink-4 mt-0.5 tabular-nums">
                      {formatCents(inv.total_cents)} &middot; {formatDate(inv.issued_at ?? inv.due_at)}
                      {inv.paid_at && ` · paid ${formatDate(inv.paid_at)}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {inv.hosted_invoice_url && (inv.status === 'open' || inv.status === 'failed') && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-3 py-1.5 rounded-lg bg-brand hover:bg-brand-dark text-white text-xs font-medium inline-flex items-center gap-1"
                      >
                        <ExternalLink className="w-3 h-3" />
                        Pay now
                      </a>
                    )}
                    {inv.invoice_pdf_url && (
                      <a
                        href={inv.invoice_pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 text-ink-4 hover:text-ink"
                        title="Download PDF"
                      >
                        <ArrowUpRight className="w-3.5 h-3.5" />
                      </a>
                    )}
                    {inv.hosted_invoice_url && inv.status === 'paid' && (
                      <a
                        href={inv.hosted_invoice_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] text-ink-3 hover:text-ink"
                      >
                        View
                      </a>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// Minimal ArrowUpRight icon component (lucide already exports this, but keeping the import list tidy above)
function ArrowUpRight({ className }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <line x1="7" y1="17" x2="17" y2="7"></line>
      <polyline points="7 7 17 7 17 17"></polyline>
    </svg>
  )
}
