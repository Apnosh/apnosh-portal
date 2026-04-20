'use client'

/**
 * Admin billing overview -- all invoices + recurring subscriptions
 * across all clients. Reads from the new billing v2 schema (migration 055).
 *
 * To create a new invoice or start a retainer, admins use the Stripe
 * Billing card on each client's detail page. This page is for the
 * across-all-clients audit view.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  DollarSign, TrendingUp, AlertCircle, Clock, Search,
  FileText, RefreshCw, ExternalLink, ChevronDown, ChevronUp,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types (mirror billing v2 schema)                                   */
/* ------------------------------------------------------------------ */

type InvoiceStatus = 'draft' | 'open' | 'paid' | 'void' | 'uncollectible' | 'failed'

interface InvoiceRow {
  id: string
  client_id: string
  invoice_number: string
  type: 'subscription' | 'one_time'
  status: string
  total_cents: number
  amount_paid_cents: number
  issued_at: string | null
  due_at: string | null
  paid_at: string | null
  description: string | null
  hosted_invoice_url: string | null
  clients: { name: string; slug: string } | null
}

interface SubscriptionRow {
  id: string
  client_id: string
  plan_name: string
  amount_cents: number
  interval: string
  status: string
  current_period_end: string | null
  cancel_at_period_end: boolean
  clients: { name: string; slug: string } | null
}

type FilterTab = 'all' | 'open' | 'paid' | 'failed' | 'draft'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100)
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function isOverdue(inv: InvoiceRow): boolean {
  if (inv.status !== 'open' || !inv.due_at) return false
  return new Date(inv.due_at) < new Date()
}

const STATUS_BADGE: Record<string, string> = {
  draft: 'bg-ink-6 text-ink-3',
  open: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  failed: 'bg-red-50 text-red-700',
  void: 'bg-ink-6 text-ink-4',
  uncollectible: 'bg-red-50 text-red-700',
  active: 'bg-emerald-50 text-emerald-700',
  trialing: 'bg-blue-50 text-blue-700',
  past_due: 'bg-red-50 text-red-700',
  canceled: 'bg-ink-6 text-ink-4',
  paused: 'bg-amber-50 text-amber-700',
  incomplete: 'bg-amber-50 text-amber-700',
}

const tabs: Array<{ label: string; filter: FilterTab }> = [
  { label: 'All', filter: 'all' },
  { label: 'Open', filter: 'open' },
  { label: 'Paid', filter: 'paid' },
  { label: 'Failed', filter: 'failed' },
  { label: 'Draft', filter: 'draft' },
]

/* ------------------------------------------------------------------ */
/*  Skeletons                                                          */
/* ------------------------------------------------------------------ */

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="w-8 h-8 rounded-lg bg-bg-2 animate-pulse mb-3" />
      <div className="h-7 w-20 bg-bg-2 rounded animate-pulse mb-1" />
      <div className="h-3 w-24 bg-bg-2 rounded animate-pulse" />
    </div>
  )
}

function SkeletonRow({ cols }: { cols: number }) {
  return (
    <tr className="border-b border-ink-6 last:border-0">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-bg-2 rounded animate-pulse w-20" />
        </td>
      ))}
    </tr>
  )
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const [invoiceRes, subRes] = await Promise.all([
      supabase
        .from('invoices')
        .select(`
          id, client_id, invoice_number, type, status, total_cents,
          amount_paid_cents, issued_at, due_at, paid_at, description,
          hosted_invoice_url,
          clients!inner(name, slug)
        `)
        .order('created_at', { ascending: false })
        .limit(500),
      supabase
        .from('subscriptions')
        .select(`
          id, client_id, plan_name, amount_cents, interval, status,
          current_period_end, cancel_at_period_end,
          clients!inner(name, slug)
        `)
        .order('created_at', { ascending: false })
        .limit(200),
    ])

    if (invoiceRes.error) {
      setError(invoiceRes.error.message)
      setLoading(false)
      return
    }

    setInvoices((invoiceRes.data as unknown as InvoiceRow[]) ?? [])
    setSubscriptions((subRes.data as unknown as SubscriptionRow[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  /* ---- Revenue metrics (all in cents internally) ---- */
  const mrrCents = subscriptions
    .filter(s => s.status === 'active' || s.status === 'trialing')
    .reduce((sum, s) => sum + (s.amount_cents ?? 0), 0)

  const totalPaidCents = invoices
    .filter(inv => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.amount_paid_cents ?? 0), 0)

  const outstandingCents = invoices
    .filter(inv => inv.status === 'open' || inv.status === 'draft' || inv.status === 'failed')
    .reduce((sum, inv) => sum + (inv.total_cents ?? 0), 0)

  const overdueCount = invoices.filter(isOverdue).length

  const stats = [
    { label: 'MRR', value: formatCents(mrrCents), hint: `ARR: ${formatCents(mrrCents * 12)}`, icon: TrendingUp, color: 'bg-brand-tint text-brand-dark' },
    { label: 'Revenue collected', value: formatCents(totalPaidCents), hint: `${invoices.filter(i => i.status === 'paid').length} paid`, icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Outstanding', value: formatCents(outstandingCents), hint: `${invoices.filter(i => ['open', 'draft', 'failed'].includes(i.status)).length} invoices`, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Overdue', value: String(overdueCount), hint: overdueCount > 0 ? 'Needs attention' : 'All current', icon: AlertCircle, color: overdueCount > 0 ? 'bg-red-50 text-red-600' : 'bg-ink-6 text-ink-4' },
  ]

  /* ---- Filtered invoices ---- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return invoices
      .filter(inv => {
        if (activeTab === 'all') return true
        return inv.status === activeTab
      })
      .filter(inv => {
        if (!q) return true
        const clientName = inv.clients?.name?.toLowerCase() ?? ''
        const invNum = inv.invoice_number.toLowerCase()
        return clientName.includes(q) || invNum.includes(q)
      })
      .sort((a, b) => {
        const da = new Date(a.issued_at ?? a.due_at ?? 0).getTime()
        const db = new Date(b.issued_at ?? b.due_at ?? 0).getTime()
        return sortAsc ? da - db : db - da
      })
  }, [invoices, activeTab, search, sortAsc])

  const activeSubs = useMemo(
    () => subscriptions.filter(s => s.status === 'active' || s.status === 'trialing'),
    [subscriptions],
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Billing &amp; Revenue</h1>
          <p className="text-ink-3 text-sm mt-1">
            Revenue overview across all clients. To start a retainer or send a new invoice,
            open the client&apos;s detail page.
          </p>
        </div>
        <button
          onClick={fetchData}
          className="text-ink-4 hover:text-ink text-sm font-medium flex items-center gap-1.5"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map(s => (
              <div key={s.label} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                  <s.icon size={16} />
                </div>
                <div className="text-xl font-semibold text-ink">{s.value}</div>
                <div className="text-xs text-ink-4 mt-0.5">{s.label}</div>
                <div className="text-[10px] text-ink-4 mt-1">{s.hint}</div>
              </div>
            ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Invoices section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileText size={16} className="text-ink-4" />
            Invoices
          </h2>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5">
            {tabs.map(tab => (
              <button
                key={tab.filter}
                onClick={() => setActiveTab(tab.filter)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                  activeTab === tab.filter
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-4 hover:text-ink'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-xs">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-4" />
            <input
              type="text"
              placeholder="Search client or invoice #"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full rounded-lg border border-ink-6 bg-bg-2 pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>

        {/* Invoices table */}
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Invoice #</Th>
                  <Th>Client</Th>
                  <Th>Type</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                  <Th>
                    <button
                      onClick={() => setSortAsc(!sortAsc)}
                      className="flex items-center gap-1 hover:text-ink"
                    >
                      Issued
                      {sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </Th>
                  <Th>Paid</Th>
                  <Th></Th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={8} />)
                  : filtered.length === 0
                    ? (
                      <tr>
                        <td colSpan={8} className="px-4 py-12 text-center text-sm text-ink-4">
                          No invoices yet. Start a retainer or send a one-time invoice from a client&apos;s page.
                        </td>
                      </tr>
                    )
                    : filtered.map(inv => {
                        const overdue = isOverdue(inv)
                        const displayStatus = overdue ? 'failed' : inv.status
                        return (
                          <tr key={inv.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                            <td className="px-4 py-3 text-sm text-ink font-medium">
                              {inv.invoice_number}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink">
                              {inv.clients?.slug ? (
                                <Link href={`/admin/clients/${inv.clients.slug}`} className="hover:text-brand-dark">
                                  {inv.clients.name}
                                </Link>
                              ) : 'Unknown'}
                            </td>
                            <td className="px-4 py-3 text-[11px] text-ink-4 capitalize">
                              {inv.type === 'subscription' ? 'Retainer' : 'One-time'}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink text-right font-medium tabular-nums">
                              {formatCents(inv.total_cents)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[displayStatus] ?? ''}`}>
                                {overdue ? 'overdue' : inv.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-ink-3">
                              {formatDate(inv.issued_at)}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink-3">
                              {formatDate(inv.paid_at)}
                            </td>
                            <td className="px-4 py-3">
                              {inv.hosted_invoice_url && (
                                <a
                                  href={inv.hosted_invoice_url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-ink-4 hover:text-brand-dark"
                                  title="Open hosted invoice"
                                >
                                  <ExternalLink size={14} />
                                </a>
                              )}
                            </td>
                          </tr>
                        )
                      })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Active subscriptions */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <RefreshCw size={16} className="text-ink-4" />
          Active retainers
        </h2>

        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th>Plan</Th>
                  <Th align="right">Amount</Th>
                  <Th>Status</Th>
                  <Th>Next billing</Th>
                  <Th>Flag</Th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={6} />)
                  : activeSubs.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-12 text-center text-sm text-ink-4">
                          No active retainers. Start one from a client&apos;s detail page.
                        </td>
                      </tr>
                    )
                    : activeSubs.map(sub => (
                        <tr key={sub.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                          <td className="px-4 py-3 text-sm text-ink font-medium">
                            {sub.clients?.slug ? (
                              <Link href={`/admin/clients/${sub.clients.slug}`} className="hover:text-brand-dark">
                                {sub.clients.name}
                              </Link>
                            ) : 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">
                            {sub.plan_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-ink text-right font-medium tabular-nums">
                            {formatCents(sub.amount_cents)}
                            <span className="text-ink-4 font-normal">/{sub.interval === 'year' ? 'yr' : 'mo'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[sub.status] ?? 'bg-ink-6 text-ink-4'}`}>
                              {sub.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink-3">
                            {formatDate(sub.current_period_end)}
                          </td>
                          <td className="px-4 py-3 text-[11px] text-amber-700">
                            {sub.cancel_at_period_end ? 'Canceling' : ''}
                          </td>
                        </tr>
                      ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}

function Th({ children, align = 'left' }: { children?: React.ReactNode; align?: 'left' | 'right' }) {
  return (
    <th
      className={`px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6`}
      style={{ textAlign: align }}
    >
      {children}
    </th>
  )
}
