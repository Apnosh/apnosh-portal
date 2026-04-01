'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ShoppingBag, Clock, Loader2, CheckCircle2, Search,
  ArrowUpDown, UserPlus, Eye
} from 'lucide-react'

type OrderStatus = 'Pending' | 'In Progress' | 'Client Review' | 'Completed' | 'Cancelled'
type OrderType = 'Subscription' | 'One-Time' | 'A La Carte'

interface Order {
  id: string
  orderNumber: string
  client: string
  service: string
  type: OrderType
  status: OrderStatus
  amount: string
  date: string
  sortDate: number
}

const orders: Order[] = [
  { id: '1', orderNumber: 'APN-2024-001', client: 'Casa Priya', service: 'Social Media Growth Package', type: 'Subscription', status: 'In Progress', amount: '$449/mo', date: 'Mar 22, 2024', sortDate: 20240322 },
  { id: '2', orderNumber: 'APN-2024-002', client: 'Vesta Bakery', service: '4x Instagram Feed Posts', type: 'A La Carte', status: 'Pending', amount: '$140', date: 'Mar 21, 2024', sortDate: 20240321 },
  { id: '3', orderNumber: 'APN-2024-003', client: 'Lumina Boutique', service: 'Website Redesign', type: 'One-Time', status: 'Client Review', amount: '$1,299', date: 'Mar 20, 2024', sortDate: 20240320 },
  { id: '4', orderNumber: 'APN-2024-004', client: 'Peak Fitness', service: 'Email Campaign Setup', type: 'One-Time', status: 'Completed', amount: '$199', date: 'Mar 19, 2024', sortDate: 20240319 },
  { id: '5', orderNumber: 'APN-2024-005', client: 'Golden Wok', service: 'Logo & Brand Identity', type: 'One-Time', status: 'In Progress', amount: '$499', date: 'Mar 18, 2024', sortDate: 20240318 },
  { id: '6', orderNumber: 'APN-2024-006', client: 'Bloom & Gather', service: 'Content Calendar (Monthly)', type: 'Subscription', status: 'In Progress', amount: '$299/mo', date: 'Mar 17, 2024', sortDate: 20240317 },
  { id: '7', orderNumber: 'APN-2024-007', client: 'Zara Legal', service: 'LinkedIn Thought Leadership', type: 'Subscription', status: 'Pending', amount: '$349/mo', date: 'Mar 16, 2024', sortDate: 20240316 },
  { id: '8', orderNumber: 'APN-2024-008', client: 'TrueNorth Realty', service: '2x Listing Videos', type: 'A La Carte', status: 'Completed', amount: '$320', date: 'Mar 15, 2024', sortDate: 20240315 },
  { id: '9', orderNumber: 'APN-2024-009', client: 'Kin & Dough', service: 'Brand Refresh Package', type: 'One-Time', status: 'Client Review', amount: '$699', date: 'Mar 14, 2024', sortDate: 20240314 },
  { id: '10', orderNumber: 'APN-2024-010', client: 'Solstice Yoga', service: 'Social Media Starter', type: 'Subscription', status: 'Pending', amount: '$199/mo', date: 'Mar 13, 2024', sortDate: 20240313 },
  { id: '11', orderNumber: 'APN-2024-011', client: 'Nourish Kitchen', service: '6x Story Templates', type: 'A La Carte', status: 'Cancelled', amount: '$90', date: 'Mar 12, 2024', sortDate: 20240312 },
  { id: '12', orderNumber: 'APN-2024-012', client: 'Atlas Consulting', service: 'Quarterly Strategy Session', type: 'One-Time', status: 'Completed', amount: '$250', date: 'Mar 11, 2024', sortDate: 20240311 },
]

const statusColors: Record<OrderStatus, string> = {
  'Pending': 'bg-amber-50 text-amber-700 border-amber-200',
  'In Progress': 'bg-blue-50 text-blue-700 border-blue-200',
  'Client Review': 'bg-purple-50 text-purple-700 border-purple-200',
  'Completed': 'bg-green-50 text-green-700 border-green-200',
  'Cancelled': 'bg-red-50 text-red-700 border-red-200',
}

const typeColors: Record<OrderType, string> = {
  'Subscription': 'text-brand-dark',
  'One-Time': 'text-ink-3',
  'A La Carte': 'text-violet-600',
}

const tabs: Array<{ label: string; filter: OrderStatus | 'All' }> = [
  { label: 'All', filter: 'All' },
  { label: 'Pending', filter: 'Pending' },
  { label: 'In Progress', filter: 'In Progress' },
  { label: 'Client Review', filter: 'Client Review' },
  { label: 'Completed', filter: 'Completed' },
]

export default function AdminOrdersPage() {
  const [activeTab, setActiveTab] = useState<OrderStatus | 'All'>('All')
  const [search, setSearch] = useState('')
  const [sortAsc, setSortAsc] = useState(false)

  const filtered = orders
    .filter((o) => activeTab === 'All' || o.status === activeTab)
    .filter((o) => {
      if (!search) return true
      const q = search.toLowerCase()
      return o.client.toLowerCase().includes(q) || o.service.toLowerCase().includes(q)
    })
    .sort((a, b) => sortAsc ? a.sortDate - b.sortDate : b.sortDate - a.sortDate)

  const totalOrders = orders.length
  const pending = orders.filter((o) => o.status === 'Pending').length
  const inProgress = orders.filter((o) => o.status === 'In Progress').length
  const completedThisWeek = orders.filter((o) => o.status === 'Completed').length

  const stats = [
    { label: 'Total Orders', value: totalOrders, icon: ShoppingBag, color: 'bg-brand-tint text-brand-dark' },
    { label: 'Pending', value: pending, icon: Clock, color: 'bg-amber-50 text-amber-600' },
    { label: 'In Progress', value: inProgress, icon: Loader2, color: 'bg-blue-50 text-blue-600' },
    { label: 'Completed (this week)', value: completedThisWeek, icon: CheckCircle2, color: 'bg-green-50 text-green-600' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Orders</h1>
        <p className="text-ink-3 text-sm mt-1">Manage and track all client orders.</p>
      </div>

      {/* Stats Bar */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-ink-6 p-4">
            <div className={`w-8 h-8 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-5 border-b border-ink-6">
          <div className="flex items-center gap-1 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab.filter}
                onClick={() => setActiveTab(tab.filter)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                  activeTab === tab.filter
                    ? 'bg-ink text-white'
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
              <tr className="border-b border-ink-6">
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Order #</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Service</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Type</th>
                <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Amount</th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">
                  <button onClick={() => setSortAsc(!sortAsc)} className="inline-flex items-center gap-1 hover:text-ink-2">
                    Date <ArrowUpDown className="w-3 h-3" />
                  </button>
                </th>
                <th className="text-right font-medium text-ink-4 text-xs px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((order) => (
                <tr key={order.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                  <td className="px-5 py-3">
                    <Link href={`/admin/orders/${order.id}`} className="font-mono text-xs text-ink-3 hover:text-brand-dark">
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="px-5 py-3 font-medium text-ink">{order.client}</td>
                  <td className="px-5 py-3 text-ink-3 max-w-[200px] truncate">{order.service}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs font-medium ${typeColors[order.type]}`}>{order.type}</span>
                  </td>
                  <td className="px-5 py-3">
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full border ${statusColors[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-5 py-3 text-right text-ink-2 font-medium">{order.amount}</td>
                  <td className="px-5 py-3 text-right text-ink-4">{order.date}</td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {order.status === 'Pending' && (
                        <button className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-dark bg-brand-tint px-2 py-1 rounded-md hover:bg-brand/20 transition-colors">
                          <UserPlus className="w-3 h-3" /> Assign
                        </button>
                      )}
                      <Link
                        href={`/admin/orders/${order.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 bg-bg-2 px-2 py-1 rounded-md hover:bg-ink-6 transition-colors"
                      >
                        <Eye className="w-3 h-3" /> View
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-5 py-12 text-center text-ink-4 text-sm">
                    No orders found matching your criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
