'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { DollarSign, Users, TrendingUp, Calculator, FileBarChart, ChevronRight } from 'lucide-react'

// ── Types ───────────────────────────────────────────────────────────

interface RevenueStats {
  mrr: number
  totalRevenue: number
  activeClients: number
  avgRevenuePerClient: number
}

interface ClientRow {
  id: string
  name: string
  client_status: string
  mrr: number
  agreementStatus: string
  invoicesPaid: number
  invoicesTotal: number
  health: 'green' | 'yellow' | 'red'
}

interface ServiceCount {
  name: string
  count: number
}

interface MonthlyRevenue {
  month: string
  total: number
}

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n)
}

function healthDot(h: 'green' | 'yellow' | 'red') {
  const color = h === 'green' ? 'bg-emerald-500' : h === 'yellow' ? 'bg-amber-500' : 'bg-red-500'
  return <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
}

function healthOrder(h: 'green' | 'yellow' | 'red') {
  return h === 'red' ? 0 : h === 'yellow' ? 1 : 2
}

// ── Skeleton helpers ────────────────────────────────────────────────

function SkeletonCard() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse">
      <div className="w-8 h-8 rounded-lg bg-ink-6 mb-3" />
      <div className="h-7 w-24 bg-ink-6 rounded mb-1" />
      <div className="h-4 w-16 bg-ink-6 rounded" />
    </div>
  )
}

function SkeletonTable() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden animate-pulse">
      <div className="h-10 bg-bg-2 border-b border-ink-6" />
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex gap-4 px-4 py-3 border-b border-ink-6 last:border-0">
          <div className="h-4 w-32 bg-ink-6 rounded" />
          <div className="h-4 w-20 bg-ink-6 rounded" />
          <div className="h-4 w-16 bg-ink-6 rounded" />
          <div className="h-4 w-16 bg-ink-6 rounded" />
          <div className="h-4 w-16 bg-ink-6 rounded" />
          <div className="h-4 w-10 bg-ink-6 rounded" />
        </div>
      ))}
    </div>
  )
}

function SkeletonBars() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-4 animate-pulse">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-4">
          <div className="w-28 h-4 bg-ink-6 rounded" />
          <div className="flex-1 h-2 bg-ink-6 rounded-full" />
        </div>
      ))}
    </div>
  )
}

// ── Component ───────────────────────────────────────────────────────

export default function ReportsPage() {
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState<RevenueStats | null>(null)
  const [clients, setClients] = useState<ClientRow[]>([])
  const [services, setServices] = useState<ServiceCount[]>([])
  const [monthly, setMonthly] = useState<MonthlyRevenue[]>([])

  useEffect(() => {
    const supabase = createClient()

    async function load() {
      setLoading(true)

      const [
        { data: activeSubs },
        { data: paidInvoices },
        { data: allInvoices },
        { data: businesses },
        { data: agreements },
        { data: orders },
      ] = await Promise.all([
        // v2 schema: subscriptions/invoices keyed on client_id with cents.
        // We join to businesses via clients.id to preserve the business_id
        // lookups the rest of this page uses.
        supabase.from('subscriptions')
          .select('client_id, amount_cents, clients!inner(id, businesses(id))')
          .in('status', ['active', 'trialing']),
        supabase.from('invoices')
          .select('client_id, amount_paid_cents, created_at, clients!inner(id, businesses(id))')
          .eq('status', 'paid'),
        supabase.from('invoices')
          .select('client_id, status, due_at, clients!inner(id, businesses(id))'),
        supabase.from('businesses').select('id, name, client_status').in('client_status', ['active', 'paused', 'agreement_sent', 'agreement_signed', 'offboarded']).order('name'),
        supabase.from('agreements').select('business_id, status').order('created_at', { ascending: false }),
        supabase.from('orders').select('service_name'),
      ])

      // Normalize new-schema rows into the shape the rest of this page uses:
      // { business_id, plan_price (dollars) } / { business_id, amount (dollars), status, due_date }.
      // This is a compatibility shim -- the real migration to pure v2 comes later.
      type NewSubRow = { client_id: string; amount_cents: number | null; clients?: { businesses?: Array<{ id: string }> | null } | null }
      type NewInvRow = { client_id: string; amount_paid_cents?: number | null; status?: string; due_at?: string | null; created_at?: string; clients?: { businesses?: Array<{ id: string }> | null } | null }

      const activeSubsCompat = ((activeSubs ?? []) as unknown as NewSubRow[]).flatMap(s => {
        const bizzes = s.clients?.businesses ?? []
        return bizzes.map(b => ({ business_id: b.id, plan_price: (s.amount_cents ?? 0) / 100 }))
      })
      const paidInvoicesCompat = ((paidInvoices ?? []) as unknown as NewInvRow[]).flatMap(i => {
        const bizzes = i.clients?.businesses ?? []
        return bizzes.map(b => ({
          business_id: b.id,
          amount: (i.amount_paid_cents ?? 0) / 100,
          created_at: i.created_at,
        }))
      })
      const allInvoicesCompat = ((allInvoices ?? []) as unknown as NewInvRow[]).flatMap(i => {
        const bizzes = i.clients?.businesses ?? []
        return bizzes.map(b => ({
          business_id: b.id,
          status: i.status,
          due_date: i.due_at,
        }))
      })

      // ── Revenue Stats ──────────────────────────────────────────
      const mrr = activeSubsCompat.reduce((sum, s) => sum + s.plan_price, 0)
      const totalRevenue = paidInvoicesCompat.reduce((sum, inv) => sum + inv.amount, 0)
      const activeCount = (businesses ?? []).filter(b => b.client_status === 'active').length
      const avgRevenue = activeCount > 0 ? totalRevenue / activeCount : 0

      setStats({ mrr, totalRevenue, activeClients: activeCount, avgRevenuePerClient: avgRevenue })

      // ── Client Health ──────────────────────────────────────────
      const bizList = businesses ?? []

      // Build lookup: latest agreement status per business
      const agreementMap = new Map<string, string>()
      for (const a of agreements ?? []) {
        if (!agreementMap.has(a.business_id)) {
          agreementMap.set(a.business_id, a.status)
        }
      }

      // Build lookup: MRR per business
      const mrrMap = new Map<string, number>()
      for (const s of activeSubsCompat) {
        mrrMap.set(s.business_id, (mrrMap.get(s.business_id) || 0) + (Number(s.plan_price) || 0))
      }

      // Build lookup: invoices per business
      const invoicePaidMap = new Map<string, number>()
      const invoiceTotalMap = new Map<string, number>()
      const overdueSet = new Set<string>()
      const now = new Date().toISOString()

      for (const inv of allInvoicesCompat) {
        invoiceTotalMap.set(inv.business_id, (invoiceTotalMap.get(inv.business_id) || 0) + 1)
        if (inv.status === 'paid') {
          invoicePaidMap.set(inv.business_id, (invoicePaidMap.get(inv.business_id) || 0) + 1)
        }
        if ((inv.status === 'pending' || inv.status === 'failed') && inv.due_date && inv.due_date < now) {
          overdueSet.add(inv.business_id)
        }
      }

      const clientRows: ClientRow[] = bizList.map(b => {
        const latestAgreement = agreementMap.get(b.id) || 'none'
        const hasOverdue = overdueSet.has(b.id)
        const agreementSigned = latestAgreement === 'signed' || latestAgreement === 'active'
        const isOffboarded = b.client_status === 'offboarded'

        let health: 'green' | 'yellow' | 'red' = 'green'
        if (hasOverdue || isOffboarded) {
          health = 'red'
        } else if (!agreementSigned || b.client_status === 'paused') {
          health = 'yellow'
        }

        return {
          id: b.id,
          name: b.name,
          client_status: b.client_status,
          mrr: mrrMap.get(b.id) || 0,
          agreementStatus: latestAgreement,
          invoicesPaid: invoicePaidMap.get(b.id) || 0,
          invoicesTotal: invoiceTotalMap.get(b.id) || 0,
          health,
        }
      })

      clientRows.sort((a, b) => healthOrder(a.health) - healthOrder(b.health))
      setClients(clientRows)

      // ── Service Popularity ────────────────────────────────────
      const serviceCounts = new Map<string, number>()
      for (const o of orders ?? []) {
        if (o.service_name) {
          serviceCounts.set(o.service_name, (serviceCounts.get(o.service_name) || 0) + 1)
        }
      }
      const sortedServices = Array.from(serviceCounts.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 8)
      setServices(sortedServices)

      // ── Monthly Revenue Breakdown ─────────────────────────────
      const monthMap = new Map<string, number>()
      for (const inv of paidInvoicesCompat) {
        if (!inv.created_at) continue
        const d = new Date(inv.created_at)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
        monthMap.set(key, (monthMap.get(key) || 0) + (Number(inv.amount) || 0))
      }
      const sortedMonths = Array.from(monthMap.entries())
        .map(([month, total]) => ({ month, total }))
        .sort((a, b) => a.month.localeCompare(b.month))
      setMonthly(sortedMonths)

      setLoading(false)
    }

    load()
  }, [])

  const maxServiceCount = services.length > 0 ? Math.max(...services.map(s => s.count)) : 1
  const maxMonthly = monthly.length > 0 ? Math.max(...monthly.map(m => m.total)) : 1

  const statCards = stats
    ? [
        { label: 'MRR', value: fmt(stats.mrr), icon: DollarSign, color: 'bg-brand-tint text-brand-dark' },
        { label: 'Total Revenue', value: fmt(stats.totalRevenue), icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
        { label: 'Active Clients', value: String(stats.activeClients), icon: Users, color: 'bg-blue-50 text-blue-600' },
        { label: 'Avg Revenue / Client', value: fmt(stats.avgRevenuePerClient), icon: Calculator, color: 'bg-purple-50 text-purple-600' },
      ]
    : []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Reports</h1>
          <p className="text-ink-3 text-sm mt-1">Revenue, client health, and service analytics.</p>
        </div>
        <Link
          href="/admin/reports/client"
          className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-dark transition-colors"
        >
          <FileBarChart className="w-4 h-4" />
          Client Reports
          <ChevronRight className="w-4 h-4" />
        </Link>
      </div>

      {/* Revenue Stats */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Revenue</h2>
        {loading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Array.from({ length: 4 }).map((_, i) => <SkeletonCard key={i} />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {statCards.map(card => (
              <div key={card.label} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className={`w-8 h-8 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
                  <card.icon className="w-4 h-4" />
                </div>
                <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{card.value}</div>
                <div className="text-ink-3 text-sm mt-0.5">{card.label}</div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Client Health */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Client Health</h2>
        {loading ? (
          <SkeletonTable />
        ) : clients.length === 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 p-8 text-center text-ink-3 text-sm">No clients found.</div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Client</th>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Status</th>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-right">MRR</th>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-left">Agreement</th>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-right">Invoices</th>
                    <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide bg-bg-2 border-b border-ink-6 text-center">Health</th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map(c => (
                    <tr key={c.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                      <td className="px-4 py-3 text-sm text-ink font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-sm text-ink">
                        <span className="capitalize">{c.client_status.replace(/_/g, ' ')}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink text-right">{fmt(c.mrr)}</td>
                      <td className="px-4 py-3 text-sm text-ink">
                        <span className="capitalize">{c.agreementStatus === 'none' ? '-' : c.agreementStatus}</span>
                      </td>
                      <td className="px-4 py-3 text-sm text-ink text-right">
                        {c.invoicesTotal > 0 ? `${c.invoicesPaid}/${c.invoicesTotal}` : '-'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="flex items-center justify-center">{healthDot(c.health)}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Service Popularity */}
      <div>
        <h2 className="text-sm font-semibold text-ink mb-3">Service Popularity</h2>
        {loading ? (
          <SkeletonBars />
        ) : services.length === 0 ? (
          <div className="bg-white rounded-xl border border-ink-6 p-8 text-center text-ink-3 text-sm">No orders yet.</div>
        ) : (
          <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
            {services.map(service => (
              <div key={service.name} className="flex items-center gap-4">
                <div className="w-36 flex-shrink-0 truncate">
                  <span className="text-sm font-medium text-ink">{service.name}</span>
                </div>
                <div className="flex-1 h-2 bg-ink-6 rounded-full overflow-hidden">
                  <div
                    className="bg-brand rounded-full h-2 transition-all"
                    style={{ width: `${(service.count / maxServiceCount) * 100}%`, minWidth: '0.5rem' }}
                  />
                </div>
                <span className="text-xs font-medium text-ink-3 w-8 text-right">{service.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Monthly Revenue Breakdown */}
      {!loading && monthly.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-3">Monthly Revenue</h2>
          <div className="bg-white rounded-xl border border-ink-6 p-5 space-y-3">
            {monthly.map(m => {
              const label = new Date(m.month + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
              return (
                <div key={m.month} className="flex items-center gap-4">
                  <div className="w-20 flex-shrink-0">
                    <span className="text-sm font-medium text-ink">{label}</span>
                  </div>
                  <div className="flex-1 h-2 bg-ink-6 rounded-full overflow-hidden">
                    <div
                      className="bg-brand rounded-full h-2 transition-all"
                      style={{ width: `${(m.total / maxMonthly) * 100}%`, minWidth: '0.5rem' }}
                    />
                  </div>
                  <span className="text-xs font-medium text-ink-3 w-16 text-right">{fmt(m.total)}</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
