'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { adminCreateManualInvoice } from '@/lib/actions'
import {
  DollarSign, TrendingUp, AlertCircle, Clock,
  Search, Plus, X, Loader2, ChevronDown, ChevronUp,
  FileText, RefreshCw,
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'void'

interface InvoiceRow {
  id: string
  business_id: string
  invoice_number: string | null
  amount: number
  total: number
  status: string
  description: string | null
  due_date: string | null
  paid_at: string | null
  created_at: string
  businesses: { name: string } | null
}

interface SubscriptionRow {
  id: string
  business_id: string
  plan_name: string
  plan_price: number
  billing_interval: string
  status: string
  current_period_end: string | null
  businesses: { name: string } | null
}

interface BusinessOption {
  id: string
  name: string
}

interface LineItem {
  description: string
  quantity: number
  unit_price: number
}

type FilterTab = 'all' | 'draft' | 'sent' | 'paid' | 'overdue'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function formatDate(iso: string | null): string {
  if (!iso) return '--'
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function isOverdue(invoice: InvoiceRow): boolean {
  if (invoice.status !== 'sent' || !invoice.due_date) return false
  return new Date(invoice.due_date) < new Date()
}

function resolveStatus(invoice: InvoiceRow): InvoiceStatus {
  if (isOverdue(invoice)) return 'overdue'
  return invoice.status as InvoiceStatus
}

const STATUS_BADGE: Record<InvoiceStatus, string> = {
  draft: 'bg-ink-6 text-ink-3',
  sent: 'bg-blue-50 text-blue-700',
  paid: 'bg-emerald-50 text-emerald-700',
  overdue: 'bg-red-50 text-red-700',
  void: 'bg-ink-6 text-ink-4',
}

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  paid: 'Paid',
  overdue: 'Overdue',
  void: 'Void',
}

const SUB_STATUS_BADGE: Record<string, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  trialing: 'bg-blue-50 text-blue-700',
  past_due: 'bg-red-50 text-red-700',
  cancelled: 'bg-ink-6 text-ink-4',
}

const tabs: Array<{ label: string; filter: FilterTab }> = [
  { label: 'All', filter: 'all' },
  { label: 'Draft', filter: 'draft' },
  { label: 'Sent', filter: 'sent' },
  { label: 'Paid', filter: 'paid' },
  { label: 'Overdue', filter: 'overdue' },
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
/*  Create Invoice Form                                                */
/* ------------------------------------------------------------------ */

function CreateInvoiceForm({
  businesses,
  onClose,
  onCreated,
}: {
  businesses: BusinessOption[]
  onClose: () => void
  onCreated: () => void
}) {
  const [businessId, setBusinessId] = useState('')
  const [lineItems, setLineItems] = useState<LineItem[]>([
    { description: '', quantity: 1, unit_price: 0 },
  ])
  const [dueDate, setDueDate] = useState('')
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const total = lineItems.reduce((sum, li) => sum + li.quantity * li.unit_price, 0)

  function updateLineItem(index: number, field: keyof LineItem, value: string | number) {
    setLineItems((prev) =>
      prev.map((li, i) => (i === index ? { ...li, [field]: value } : li))
    )
  }

  function addLineItem() {
    setLineItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }])
  }

  function removeLineItem(index: number) {
    if (lineItems.length === 1) return
    setLineItems((prev) => prev.filter((_, i) => i !== index))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!businessId || !dueDate || lineItems.some((li) => !li.description || li.unit_price <= 0)) {
      setError('Please fill in all required fields.')
      return
    }

    setSubmitting(true)
    setError(null)

    const result = await adminCreateManualInvoice(
      businessId,
      lineItems,
      dueDate,
      notes || undefined,
    )

    setSubmitting(false)

    if (!result.success) {
      setError(result.error ?? 'Failed to create invoice.')
      return
    }

    onCreated()
  }

  const inputClass =
    'w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30'

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-ink">Create Invoice</h3>
        <button onClick={onClose} className="text-ink-4 hover:text-ink">
          <X size={18} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Client select */}
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">Client</label>
          <select
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            className={inputClass}
          >
            <option value="">Select a client</option>
            {businesses.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {/* Line items */}
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">Line Items</label>
          <div className="space-y-2">
            {lineItems.map((li, index) => (
              <div key={index} className="flex gap-2 items-start">
                <input
                  type="text"
                  placeholder="Description"
                  value={li.description}
                  onChange={(e) => updateLineItem(index, 'description', e.target.value)}
                  className={`${inputClass} flex-1`}
                />
                <input
                  type="number"
                  placeholder="Qty"
                  min={1}
                  value={li.quantity}
                  onChange={(e) => updateLineItem(index, 'quantity', parseInt(e.target.value) || 1)}
                  className={`${inputClass} w-20`}
                />
                <input
                  type="number"
                  placeholder="Price"
                  min={0}
                  step={0.01}
                  value={li.unit_price || ''}
                  onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                  className={`${inputClass} w-28`}
                />
                {lineItems.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeLineItem(index)}
                    className="mt-2 text-ink-4 hover:text-red-500"
                  >
                    <X size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={addLineItem}
            className="mt-2 text-xs text-brand hover:text-brand-dark font-medium flex items-center gap-1"
          >
            <Plus size={14} /> Add line item
          </button>
        </div>

        {/* Due date */}
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">Due Date</label>
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className={inputClass}
          />
        </div>

        {/* Notes */}
        <div>
          <label className="block text-xs font-medium text-ink-3 mb-1">Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Optional notes"
            className={inputClass}
          />
        </div>

        {/* Total and submit */}
        <div className="flex items-center justify-between pt-2 border-t border-ink-6">
          <span className="text-sm font-medium text-ink">
            Total: {formatCurrency(total)}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="text-sm text-ink-3 hover:text-ink px-3 py-2"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 disabled:opacity-50 flex items-center gap-2"
            >
              {submitting && <Loader2 size={14} className="animate-spin" />}
              Create Invoice
            </button>
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </form>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function AdminBillingPage() {
  const [invoices, setInvoices] = useState<InvoiceRow[]>([])
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  async function fetchData() {
    setLoading(true)
    setError(null)

    const supabase = createClient()

    const [invoiceRes, subRes, bizRes] = await Promise.all([
      supabase
        .from('invoices')
        .select('id, business_id, invoice_number, amount, total, status, description, due_date, paid_at, created_at, businesses(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('subscriptions')
        .select('id, business_id, plan_name, plan_price, billing_interval, status, current_period_end, businesses(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('businesses')
        .select('id, name')
        .order('name'),
    ])

    if (invoiceRes.error) {
      setError(invoiceRes.error.message)
      setLoading(false)
      return
    }

    setInvoices((invoiceRes.data as unknown as InvoiceRow[]) ?? [])
    setSubscriptions((subRes.data as unknown as SubscriptionRow[]) ?? [])
    setBusinesses((bizRes.data as unknown as BusinessOption[]) ?? [])
    setLoading(false)
  }

  useEffect(() => {
    fetchData()
  }, [])

  /* ---- Revenue metrics ---- */
  const totalMRR = subscriptions
    .filter((s) => s.status === 'active')
    .reduce((sum, s) => sum + (s.plan_price ?? 0), 0)

  const totalRevenue = invoices
    .filter((inv) => inv.status === 'paid')
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0)

  const outstanding = invoices
    .filter((inv) => inv.status === 'sent' || inv.status === 'draft')
    .reduce((sum, inv) => sum + (inv.amount ?? 0), 0)

  const overdueCount = invoices.filter((inv) => isOverdue(inv)).length

  const stats = [
    { label: 'Monthly Recurring Revenue', value: formatCurrency(totalMRR), icon: TrendingUp, color: 'bg-brand-tint text-brand-dark' },
    { label: 'Total Revenue', value: formatCurrency(totalRevenue), icon: DollarSign, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Outstanding', value: formatCurrency(outstanding), icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'Overdue Invoices', value: overdueCount.toString(), icon: AlertCircle, color: 'bg-red-50 text-red-600' },
  ]

  /* ---- Filtered invoices ---- */
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return invoices
      .filter((inv) => {
        if (activeTab === 'all') return true
        if (activeTab === 'overdue') return isOverdue(inv)
        return inv.status === activeTab
      })
      .filter((inv) => {
        if (!q) return true
        const clientName = inv.businesses?.name?.toLowerCase() ?? ''
        const invNum = inv.invoice_number?.toLowerCase() ?? ''
        return clientName.includes(q) || invNum.includes(q)
      })
      .sort((a, b) => {
        const da = new Date(a.created_at).getTime()
        const db = new Date(b.created_at).getTime()
        return sortAsc ? da - db : db - da
      })
  }, [invoices, activeTab, search, sortAsc])

  /* ---- Active subscriptions ---- */
  const activeSubs = useMemo(
    () => subscriptions.filter((s) => s.status === 'active' || s.status === 'trialing'),
    [subscriptions]
  )

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Billing &amp; Revenue</h1>
          <p className="text-ink-3 text-sm mt-1">Revenue overview, invoices, and recurring billing.</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2"
        >
          <Plus size={16} />
          Create Invoice
        </button>
      </div>

      {/* Revenue Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((s) => (
              <div key={s.label} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-3 ${s.color}`}>
                  <s.icon size={16} />
                </div>
                <div className="text-xl font-semibold text-ink">{s.value}</div>
                <div className="text-xs text-ink-4 mt-0.5">{s.label}</div>
              </div>
            ))}
      </div>

      {/* Create Invoice Form */}
      {showCreate && (
        <CreateInvoiceForm
          businesses={businesses}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            setShowCreate(false)
            fetchData()
          }}
        />
      )}

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Invoice Management */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
            <FileText size={16} className="text-ink-4" />
            Invoices
          </h2>
          <button
            onClick={fetchData}
            className="text-ink-4 hover:text-ink text-xs flex items-center gap-1"
          >
            <RefreshCw size={12} />
            Refresh
          </button>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center">
          <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5">
            {tabs.map((tab) => (
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
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-ink-6 bg-bg-2 pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        </div>

        {/* Table */}
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Invoice #</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Client</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Description</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-right">Amount</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Status</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">
                    <button
                      onClick={() => setSortAsc(!sortAsc)}
                      className="flex items-center gap-1 hover:text-ink"
                    >
                      Due Date
                      {sortAsc ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                  </th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Paid Date</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} cols={7} />)
                  : filtered.length === 0
                    ? (
                        <tr>
                          <td colSpan={7} className="px-4 py-12 text-center text-sm text-ink-4">
                            No invoices found.
                          </td>
                        </tr>
                      )
                    : filtered.map((inv) => {
                        const status = resolveStatus(inv)
                        return (
                          <tr key={inv.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                            <td className="px-4 py-3 text-sm text-ink font-medium">
                              {inv.invoice_number ?? '--'}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink">
                              {inv.businesses?.name ?? 'Unknown'}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink-3 max-w-[200px] truncate">
                              {inv.description ?? '--'}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink text-right font-medium">
                              {formatCurrency(inv.amount ?? 0)}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[status] ?? ''}`}
                              >
                                {STATUS_LABEL[status] ?? status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-ink">
                              {formatDate(inv.due_date)}
                            </td>
                            <td className="px-4 py-3 text-sm text-ink-3">
                              {formatDate(inv.paid_at)}
                            </td>
                          </tr>
                        )
                      })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Recurring Billing */}
      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <RefreshCw size={16} className="text-ink-4" />
          Recurring Billing
        </h2>

        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Client</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Plan</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-right">Amount</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Status</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Next Billing Date</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 3 }).map((_, i) => <SkeletonRow key={i} cols={5} />)
                  : activeSubs.length === 0
                    ? (
                        <tr>
                          <td colSpan={5} className="px-4 py-12 text-center text-sm text-ink-4">
                            No active subscriptions.
                          </td>
                        </tr>
                      )
                    : activeSubs.map((sub) => (
                        <tr key={sub.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                          <td className="px-4 py-3 text-sm text-ink font-medium">
                            {sub.businesses?.name ?? 'Unknown'}
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">
                            {sub.plan_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-ink text-right font-medium">
                            {formatCurrency(sub.plan_price ?? 0)}
                            <span className="text-ink-4 font-normal">/{sub.billing_interval === 'year' ? 'yr' : 'mo'}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${SUB_STATUS_BADGE[sub.status] ?? 'bg-ink-6 text-ink-4'}`}
                            >
                              {sub.status.charAt(0).toUpperCase() + sub.status.slice(1)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-ink">
                            {formatDate(sub.current_period_end)}
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
