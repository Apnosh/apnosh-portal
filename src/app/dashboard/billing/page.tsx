'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CreditCard, Calendar, ArrowUpRight, Download,
  CheckCircle, Clock, XCircle, Zap, ExternalLink
} from 'lucide-react'
import { openBillingPortal } from '@/lib/actions'
import { createClient as createBrowserClient } from '@/lib/supabase/client'

interface SubscriptionRow {
  id: string
  plan_name: string
  plan_price: number
  status: string
  billing_interval: string
  started_at: string
  current_period_end: string
}

interface InvoiceRow {
  id: string
  stripe_invoice_id: string
  amount: number
  status: string
  description: string
  invoice_url: string | null
  invoice_pdf: string | null
  paid_at: string | null
  created_at: string
}

const statusConfig = {
  paid: { label: 'Paid', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  pending: { label: 'Pending', className: 'bg-amber-50 text-amber-700', icon: Clock },
  failed: { label: 'Failed', className: 'bg-red-50 text-red-600', icon: XCircle },
  void: { label: 'Void', className: 'bg-gray-50 text-gray-500', icon: XCircle },
  draft: { label: 'Draft', className: 'bg-gray-50 text-gray-500', icon: Clock },
}

export default function BillingPage() {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(true)
  const [portalLoading, setPortalLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  useEffect(() => {
    // Check for success param
    const params = new URLSearchParams(window.location.search)
    if (params.get('success') === 'true') {
      setSuccessMessage('Payment successful! Your services are being set up.')
      window.history.replaceState({}, '', '/dashboard/billing')
    }

    async function fetchData() {
      const supabase = createBrowserClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: business } = await supabase
        .from('businesses')
        .select('id')
        .eq('owner_id', user.id)
        .single()

      if (!business) {
        setLoading(false)
        return
      }

      const [subsResult, invResult] = await Promise.all([
        supabase
          .from('subscriptions')
          .select('*')
          .eq('business_id', business.id)
          .neq('status', 'cancelled')
          .order('created_at', { ascending: false }),
        supabase
          .from('invoices')
          .select('*')
          .eq('business_id', business.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])

      setSubscriptions(subsResult.data || [])
      setInvoices(invResult.data || [])
      setLoading(false)
    }

    fetchData()
  }, [])

  const handleManageBilling = async () => {
    setPortalLoading(true)
    const result = await openBillingPortal()
    if (result.success && result.url) {
      window.location.href = result.url
    } else {
      alert(result.error || 'Could not open billing portal')
      setPortalLoading(false)
    }
  }

  const monthlyTotal = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + Number(s.plan_price), 0)

  if (loading) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-24 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-48 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Success banner */}
      {successMessage && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center gap-2 text-sm text-emerald-700">
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          {successMessage}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Billing & Subscriptions</h1>
          <p className="text-ink-3 text-sm mt-1">Manage your plan, subscriptions, and payment details.</p>
        </div>
        <button
          onClick={handleManageBilling}
          disabled={portalLoading}
          className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-1.5"
        >
          {portalLoading ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <ExternalLink className="w-3.5 h-3.5" />
          )}
          Manage Billing
        </button>
      </div>

      {/* Current Plan Overview */}
      {subscriptions.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-brand-tint flex items-center justify-center">
                <Zap className="w-6 h-6 text-brand-dark" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Your Plan</h2>
                  <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    Active
                  </span>
                </div>
                <p className="text-sm text-ink-3 mt-0.5">
                  <span className="font-medium text-ink">${monthlyTotal.toLocaleString()}/mo</span> &middot; {subscriptions.filter(s => s.status === 'active').length} active service{subscriptions.filter(s => s.status === 'active').length !== 1 ? 's' : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleManageBilling}
                className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors"
              >
                Change Plan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Subscriptions */}
      {subscriptions.length > 0 && (
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Active Subscriptions</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {subscriptions.filter(s => s.status === 'active').map((sub) => (
              <div key={sub.id} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="w-10 h-10 rounded-lg bg-brand-tint text-brand-dark flex items-center justify-center">
                    <Zap className="w-5 h-5" />
                  </div>
                  <span className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded-full uppercase tracking-wide">
                    {sub.status}
                  </span>
                </div>
                <h3 className="text-sm font-medium text-ink">{sub.plan_name}</h3>
                <p className="font-[family-name:var(--font-display)] text-xl text-ink mt-1">
                  ${Number(sub.plan_price).toLocaleString()}<span className="text-sm text-ink-4 font-sans">/mo</span>
                </p>
                <div className="mt-3 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                    <Calendar className="w-3 h-3" /> Started {new Date(sub.started_at).toLocaleDateString()}
                  </div>
                  <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
                    <Clock className="w-3 h-3" /> Renews {new Date(sub.current_period_end).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Payment Method */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Payment Method</h2>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-8 rounded-md bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center">
              <CreditCard className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm text-ink-3">Manage your payment methods through Stripe&apos;s secure portal.</p>
            </div>
          </div>
          <button
            onClick={handleManageBilling}
            className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors"
          >
            Update payment method
          </button>
        </div>
      </div>

      {/* Billing History */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="px-5 py-4 border-b border-ink-6 flex items-center justify-between">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Billing History</h2>
          {invoices.length > 0 && (
            <button
              onClick={handleManageBilling}
              className="text-xs text-brand-dark font-medium hover:underline flex items-center gap-1"
            >
              View all <ArrowUpRight className="w-3 h-3" />
            </button>
          )}
        </div>

        {invoices.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-ink-4 text-sm">No invoices yet.</p>
            <Link
              href="/dashboard/orders"
              className="inline-block mt-3 text-sm text-brand-dark font-medium hover:underline"
            >
              Browse services to get started
            </Link>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden sm:block overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-ink-6">
                    <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Date</th>
                    <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Description</th>
                    <th className="text-right text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Amount</th>
                    <th className="text-center text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Status</th>
                    <th className="text-right text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Invoice</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-6">
                  {invoices.map((inv) => {
                    const status = statusConfig[inv.status as keyof typeof statusConfig] || statusConfig.pending
                    return (
                      <tr key={inv.id} className="hover:bg-bg-2/50 transition-colors">
                        <td className="px-5 py-3 text-sm text-ink-3 whitespace-nowrap">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-5 py-3 text-sm text-ink">{inv.description || 'Invoice'}</td>
                        <td className="px-5 py-3 text-sm text-ink font-medium text-right">
                          ${Number(inv.amount).toLocaleString()}
                        </td>
                        <td className="px-5 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                            <status.icon className="w-3 h-3" />
                            {status.label}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-right">
                          {inv.invoice_pdf ? (
                            <a
                              href={inv.invoice_pdf}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink-4 hover:text-brand-dark transition-colors"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                          ) : inv.invoice_url ? (
                            <a
                              href={inv.invoice_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-ink-4 hover:text-brand-dark transition-colors"
                            >
                              <ExternalLink className="w-4 h-4" />
                            </a>
                          ) : (
                            <span className="text-ink-5">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile cards */}
            <div className="sm:hidden divide-y divide-ink-6">
              {invoices.map((inv) => {
                const status = statusConfig[inv.status as keyof typeof statusConfig] || statusConfig.pending
                return (
                  <div key={inv.id} className="p-4 space-y-2">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="text-sm font-medium text-ink">{inv.description || 'Invoice'}</p>
                        <p className="text-[11px] text-ink-4 mt-0.5">
                          {new Date(inv.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                        <status.icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink">${Number(inv.amount).toLocaleString()}</span>
                      {inv.invoice_pdf && (
                        <a
                          href={inv.invoice_pdf}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-4 hover:text-brand-dark transition-colors flex items-center gap-1 text-[11px]"
                        >
                          <Download className="w-3.5 h-3.5" /> Invoice
                        </a>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
