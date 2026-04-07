'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  ShoppingBag, Clock, Loader2, CheckCircle2, Search,
  ArrowUpDown, Eye
} from 'lucide-react'

type DBStatus = 'pending' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled'
type OrderType = 'subscription' | 'one_time' | 'a_la_carte'

interface OrderRow {
  id: string
  business_id: string
  type: OrderType
  service_name: string
  quantity: number
  unit_price: number
  total_price: number
  status: DBStatus
  created_at: string
  businesses: { name: string } | null
}

type FilterTab = 'all' | 'pending' | 'in_progress' | 'client_review' | 'completed'

const STATUS_LABEL: Record<DBStatus, string> = {
  pending: 'Pending',
  confirmed: 'In Progress',
  in_progress: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
}

const STATUS_BADGE: Record<DBStatus, string> = {
  pending: 'bg-amber-50 text-amber-700',
  confirmed: 'bg-blue-50 text-blue-700',
  in_progress: 'bg-blue-50 text-blue-700',
  completed: 'bg-emerald-50 text-emerald-700',
  cancelled: 'bg-red-50 text-red-700',
}

const TYPE_LABEL: Record<OrderType, string> = {
  subscription: 'Subscription',
  one_time: 'One-Time',
  a_la_carte: 'A La Carte',
}

const TYPE_COLOR: Record<OrderType, string> = {
  subscription: 'text-brand-dark',
  one_time: 'text-ink-3',
  a_la_carte: 'text-violet-600',
}

const tabs: Array<{ label: string; filter: FilterTab }> = [
  { label: 'All', filter: 'all' },
  { label: 'Pending', filter: 'pending' },
  { label: 'In Progress', filter: 'in_progress' },
  { label: 'Client Review', filter: 'client_review' },
  { label: 'Completed', filter: 'completed' },
]

function filterMatches(status: DBStatus, tab: FilterTab): boolean {
  if (tab === 'all') return true
  if (tab === 'pending') return status === 'pending'
  if (tab === 'in_progress') return status === 'in_progress' || status === 'confirmed'
  if (tab === 'client_review') return false // extend when client_review status exists
  if (tab === 'completed') return status === 'completed'
  return true
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function SkeletonRow() {
  return (
    <tr className="border-b border-ink-6 last:border-0">
      {Array.from({ length: 8 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-bg-2 rounded animate-pulse w-20" />
        </td>
      ))}
    </tr>
  )
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="w-8 h-8 rounded-lg bg-bg-2 animate-pulse mb-3" />
      <div className="h-7 w-12 bg-bg-2 rounded animate-pulse mb-1" />
      <div className="h-3 w-20 bg-bg-2 rounded animate-pulse" />
    </div>
  )
}

export default function AdminOrdersPage() {
  const [orders, setOrders] = useState<OrderRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  useEffect(() => {
    async function fetchOrders() {
      setLoading(true)
      setError(null)

      const supabase = createClient()
      const { data, error: fetchError } = await supabase
        .from('orders')
        .select('id, business_id, type, service_name, quantity, unit_price, total_price, status, created_at, businesses(name)')
        .order('created_at', { ascending: false })

      if (fetchError) {
        setError(fetchError.message)
        setLoading(false)
        return
      }

      setOrders((data as unknown as OrderRow[]) ?? [])
      setLoading(false)
    }

    fetchOrders()
  }, [])

  // Summary counts
  const totalOrders = orders.length
  const pendingCount = orders.filter((o) => o.status === 'pending').length
  const inProgressCount = orders.filter((o) => o.status === 'in_progress' || o.status === 'confirmed').length
  const completedCount = orders.filter((o) => o.status === 'completed').length

  const stats = [
    { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: 'bg-brand-tint text-brand-dark' },
    { label: 'Pending', value: pendingCount, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'In Progress', value: inProgressCount, icon: Loader2, color: 'bg-blue-50 text-blue-600' },
    { label: 'Completed', value: completedCount, icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-600' },
  ]

  // Filter, search, sort
  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return orders
      .filter((o) => filterMatches(o.status, activeTab))
      .filter((o) => {
        if (!q) return true
        const clientName = o.businesses?.name?.toLowerCase() ?? ''
        const serviceName = o.service_name?.toLowerCase() ?? ''
        return clientName.includes(q) || serviceName.includes(q)
      })
      .sort((a, b) => {
        const da = new Date(a.created_at).getTime()
        const db = new Date(b.created_at).getTime()
        return sortAsc ? da - db : db - da
      })
  }, [orders, activeTab, search, sortAsc])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Orders</h1>
        <p className="text-ink-3 text-sm mt-1">Manage and track all client orders.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)
          : stats.map((stat) => (
              <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
                <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
              </div>
            ))}
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-4 text-sm">
          Failed to load orders: {error}
        </div>
      )}

      {/* Filters + Search + Table */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 border-b border-ink-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.filter}
                onClick={() => setActiveTab(tab.filter)}
                className={`px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors ${
                  activeTab === tab.filter
                    ? 'bg-brand-tint text-brand-dark font-medium'
                    : 'text-ink-3 hover:bg-bg-2'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
            <input
              type="text"
              placeholder="Search client or service..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-2 border-b border-ink-6">
                <th className="text-left px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Order #</th>
                <th className="text-left px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Client</th>
                <th className="text-left px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Service</th>
                <th className="text-left px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Type</th>
                <th className="text-left px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Status</th>
                <th className="text-right px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Amount</th>
                <th className="text-right px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">
                  <button onClick={() => setSortAsc(!sortAsc)} className="inline-flex items-center gap-1 hover:text-ink-2">
                    Date <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-ink-4 text-sm">
                    No orders found matching your criteria.
                  </td>
                </tr>
              ) : (
                filtered.map((order) => (
                  <tr key={order.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                    <td className="px-4 py-3">
                      <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-ink-3 hover:text-brand-dark">
                        {order.id.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-ink">
                      {order.businesses?.name ?? 'Unknown'}
                    </td>
                    <td className="px-4 py-3 text-ink-3 max-w-[200px] truncate">
                      {order.service_name}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium ${TYPE_COLOR[order.type] ?? 'text-ink-3'}`}>
                        {TYPE_LABEL[order.type] ?? order.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_BADGE[order.status] ?? 'bg-gray-50 text-gray-700'}`}>
                        {STATUS_LABEL[order.status] ?? order.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-ink-2 font-medium">
                      {formatCurrency(order.total_price)}
                    </td>
                    <td className="px-4 py-3 text-right text-ink-4">
                      {formatDate(order.created_at)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 bg-bg-2 px-2 py-1 rounded-md hover:bg-ink-6 transition-colors"
                      >
                        <Eye className="w-3 h-3" /> View
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
