'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Search, Plus, MessageSquare, FileText, Send, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type ClientStatus = 'pending_agreement' | 'agreement_sent' | 'agreement_signed' | 'active' | 'paused' | 'offboarded'

interface ClientRow {
  id: string
  name: string
  dba_name: string | null
  primary_contact_name: string | null
  client_status: ClientStatus
  industry: string | null
  created_at: string
  plan_name: string | null
  mrr: number
  agreement_status: string | null
  last_activity: string | null
}

type SortKey = 'name' | 'client_status' | 'plan_name' | 'mrr' | 'agreement_status' | 'last_activity'
type SortDir = 'asc' | 'desc'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const STATUS_LABELS: Record<ClientStatus, string> = {
  pending_agreement: 'Pending Agreement',
  agreement_sent: 'Agreement Sent',
  agreement_signed: 'Agreement Signed',
  active: 'Active',
  paused: 'Paused',
  offboarded: 'Offboarded',
}

const STATUS_STYLES: Record<ClientStatus, string> = {
  active: 'bg-emerald-50 text-emerald-700',
  paused: 'bg-amber-50 text-amber-700',
  offboarded: 'bg-red-50 text-red-700',
  pending_agreement: 'bg-blue-50 text-blue-700',
  agreement_sent: 'bg-blue-50 text-blue-700',
  agreement_signed: 'bg-purple-50 text-purple-700',
}

function initials(name: string) {
  return name
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(amount)
}

function formatDate(dateStr: string | null) {
  if (!dateStr) return '--'
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function healthColor(client: ClientRow): string {
  if (client.client_status === 'offboarded') return 'bg-red-400'
  if (client.client_status === 'paused') return 'bg-amber-400'
  if (!client.last_activity) return 'bg-ink-5'
  const daysSince = Math.floor((Date.now() - new Date(client.last_activity).getTime()) / 86_400_000)
  if (daysSince <= 7) return 'bg-emerald-400'
  if (daysSince <= 30) return 'bg-amber-400'
  return 'bg-red-400'
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function AdminClientsPage() {
  const [clients, setClients] = useState<ClientRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [agreementFilter, setAgreementFilter] = useState<string>('all')
  const [billingFilter, setBillingFilter] = useState<string>('all')
  const [sortKey, setSortKey] = useState<SortKey>('name')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  /* ---- Fetch data ---- */
  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // 1. All businesses
      const { data: businesses } = await supabase
        .from('businesses')
        .select('id, name, dba_name, primary_contact_name, client_status, industry, created_at')
        .order('name')

      if (!businesses || businesses.length === 0) {
        setClients([])
        setLoading(false)
        return
      }

      const ids = businesses.map((b) => b.id)

      // 2. Active subscriptions (for MRR + plan)
      const { data: subs } = await supabase
        .from('subscriptions')
        .select('business_id, plan_name, plan_price, status')
        .in('business_id', ids)
        .eq('status', 'active')

      // 3. Latest agreement per business
      const { data: agreements } = await supabase
        .from('agreements')
        .select('business_id, status, created_at')
        .in('business_id', ids)
        .order('created_at', { ascending: false })

      // 4. Latest activity per business
      const { data: activities } = await supabase
        .from('client_activity_log')
        .select('business_id, created_at')
        .in('business_id', ids)
        .order('created_at', { ascending: false })

      // Build lookup maps
      const mrrMap = new Map<string, number>()
      const planMap = new Map<string, string>()
      for (const s of subs ?? []) {
        mrrMap.set(s.business_id, (mrrMap.get(s.business_id) ?? 0) + (s.plan_price ?? 0))
        if (!planMap.has(s.business_id)) planMap.set(s.business_id, s.plan_name)
      }

      const agreementMap = new Map<string, string>()
      for (const a of agreements ?? []) {
        if (!agreementMap.has(a.business_id)) agreementMap.set(a.business_id, a.status)
      }

      const activityMap = new Map<string, string>()
      for (const a of activities ?? []) {
        if (!activityMap.has(a.business_id)) activityMap.set(a.business_id, a.created_at)
      }

      const rows: ClientRow[] = businesses.map((b) => ({
        id: b.id,
        name: b.name,
        dba_name: b.dba_name,
        primary_contact_name: b.primary_contact_name,
        client_status: b.client_status as ClientStatus,
        industry: b.industry,
        created_at: b.created_at,
        plan_name: planMap.get(b.id) ?? null,
        mrr: mrrMap.get(b.id) ?? 0,
        agreement_status: agreementMap.get(b.id) ?? null,
        last_activity: activityMap.get(b.id) ?? null,
      }))

      setClients(rows)
      setLoading(false)
    }

    load()
  }, [])

  /* ---- Filter + search + sort ---- */
  const filtered = useMemo(() => {
    let result = [...clients]

    // Status filter
    if (statusFilter !== 'all') {
      result = result.filter((c) => c.client_status === statusFilter)
    }

    // Agreement filter
    if (agreementFilter !== 'all') {
      if (agreementFilter === 'none') {
        result = result.filter((c) => !c.agreement_status)
      } else {
        result = result.filter((c) => c.agreement_status === agreementFilter)
      }
    }

    // Billing filter
    if (billingFilter === 'has_mrr') {
      result = result.filter((c) => c.mrr > 0)
    } else if (billingFilter === 'no_mrr') {
      result = result.filter((c) => c.mrr === 0)
    }

    // Search
    if (search) {
      const q = search.toLowerCase()
      result = result.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.primary_contact_name ?? '').toLowerCase().includes(q) ||
          (c.dba_name ?? '').toLowerCase().includes(q)
      )
    }

    // Sort
    result.sort((a, b) => {
      let cmp = 0
      switch (sortKey) {
        case 'name':
          cmp = a.name.localeCompare(b.name)
          break
        case 'client_status':
          cmp = a.client_status.localeCompare(b.client_status)
          break
        case 'plan_name':
          cmp = (a.plan_name ?? '').localeCompare(b.plan_name ?? '')
          break
        case 'mrr':
          cmp = a.mrr - b.mrr
          break
        case 'agreement_status':
          cmp = (a.agreement_status ?? '').localeCompare(b.agreement_status ?? '')
          break
        case 'last_activity':
          cmp = new Date(a.last_activity ?? 0).getTime() - new Date(b.last_activity ?? 0).getTime()
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [clients, statusFilter, agreementFilter, billingFilter, search, sortKey, sortDir])

  /* ---- Summary stats ---- */
  const totalClients = clients.length
  const totalMRR = clients.reduce((sum, c) => sum + c.mrr, 0)
  const activeCount = clients.filter((c) => c.client_status === 'active').length
  const needsAttention = clients.filter((c) => {
    if (c.client_status === 'paused' || c.client_status === 'offboarded') return true
    if (!c.last_activity) return false
    const daysSince = Math.floor((Date.now() - new Date(c.last_activity).getTime()) / 86_400_000)
    return daysSince > 30
  }).length

  /* ---- Sort handler ---- */
  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  function SortIcon({ col }: { col: SortKey }) {
    if (sortKey !== col) return <ArrowUpDown className="w-3 h-3 text-ink-5" />
    return sortDir === 'asc' ? <ArrowUp className="w-3 h-3 text-ink-3" /> : <ArrowDown className="w-3 h-3 text-ink-3" />
  }

  /* ---- Render ---- */
  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Clients</h1>
          <p className="text-ink-3 text-sm mt-1">{totalClients} total clients</p>
        </div>
        <Link
          href="/admin/clients/new"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          Add Client
        </Link>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {loading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 animate-pulse">
              <div className="h-3 w-20 bg-ink-6 rounded mb-3" />
              <div className="h-7 w-16 bg-ink-6 rounded" />
            </div>
          ))
        ) : (
          <>
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <p className="text-ink-4 text-xs font-medium uppercase tracking-wide">Total Clients</p>
              <p className="text-2xl font-semibold text-ink mt-1">{totalClients}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <p className="text-ink-4 text-xs font-medium uppercase tracking-wide">Total MRR</p>
              <p className="text-2xl font-semibold text-ink mt-1">{formatCurrency(totalMRR)}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <p className="text-ink-4 text-xs font-medium uppercase tracking-wide">Active</p>
              <p className="text-2xl font-semibold text-emerald-600 mt-1">{activeCount}</p>
            </div>
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <p className="text-ink-4 text-xs font-medium uppercase tracking-wide">Needs Attention</p>
              <p className="text-2xl font-semibold text-amber-600 mt-1">{needsAttention}</p>
            </div>
          </>
        )}
      </div>

      {/* Filters + Search */}
      <div className="bg-white rounded-xl border border-ink-6 p-4 flex flex-col sm:flex-row gap-3 items-start sm:items-center">
        <div className="relative w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
          <input
            type="text"
            placeholder="Search by name, contact, or DBA..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-ink-6 rounded-lg px-3 py-2 text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="all">All Statuses</option>
          <option value="active">Active</option>
          <option value="paused">Paused</option>
          <option value="pending_agreement">Pending Agreement</option>
          <option value="agreement_sent">Agreement Sent</option>
          <option value="agreement_signed">Agreement Signed</option>
          <option value="offboarded">Offboarded</option>
        </select>
        <select
          value={agreementFilter}
          onChange={(e) => setAgreementFilter(e.target.value)}
          className="text-sm border border-ink-6 rounded-lg px-3 py-2 text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="all">All Agreements</option>
          <option value="signed">Signed</option>
          <option value="sent">Sent</option>
          <option value="draft">Draft</option>
          <option value="none">No Agreement</option>
        </select>
        <select
          value={billingFilter}
          onChange={(e) => setBillingFilter(e.target.value)}
          className="text-sm border border-ink-6 rounded-lg px-3 py-2 text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
        >
          <option value="all">All Billing</option>
          <option value="has_mrr">Has MRR</option>
          <option value="no_mrr">No MRR</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-bg-2 border-b border-ink-6">
                {([
                  ['name', 'Client'],
                  ['client_status', 'Status'],
                  ['plan_name', 'Plan'],
                  ['mrr', 'MRR'],
                  ['agreement_status', 'Agreement'],
                  ['last_activity', 'Last Activity'],
                ] as [SortKey, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    onClick={() => toggleSort(key)}
                    className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left cursor-pointer select-none hover:text-ink-2 transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIcon col={key} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Health</th>
                <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-ink-6 last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-ink-6 animate-pulse" />
                        <div className="h-4 w-28 bg-ink-6 rounded animate-pulse" />
                      </div>
                    </td>
                    <td className="px-4 py-3"><div className="h-5 w-16 bg-ink-6 rounded-full animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-24 bg-ink-6 rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-14 bg-ink-6 rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-5 w-14 bg-ink-6 rounded-full animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-ink-6 rounded animate-pulse" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-4 bg-ink-6 rounded-full animate-pulse mx-auto" /></td>
                    <td className="px-4 py-3"><div className="h-4 w-20 bg-ink-6 rounded animate-pulse ml-auto" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-ink-4 text-sm">
                    No clients found.
                  </td>
                </tr>
              ) : (
                filtered.map((client) => (
                  <tr key={client.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                    {/* Name */}
                    <td className="px-4 py-3">
                      <Link href={`/admin/clients/${client.id}`} className="flex items-center gap-3 group">
                        <div className="w-8 h-8 rounded-full bg-brand-tint flex items-center justify-center flex-shrink-0">
                          <span className="text-brand-dark text-[11px] font-bold">{initials(client.name)}</span>
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-ink group-hover:text-brand-dark transition-colors truncate">
                            {client.name}
                          </p>
                          {client.primary_contact_name && (
                            <p className="text-ink-4 text-xs truncate">{client.primary_contact_name}</p>
                          )}
                        </div>
                      </Link>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[client.client_status]}`}>
                        {STATUS_LABELS[client.client_status]}
                      </span>
                    </td>

                    {/* Plan */}
                    <td className="px-4 py-3 text-ink-2">{client.plan_name ?? '--'}</td>

                    {/* MRR */}
                    <td className="px-4 py-3 font-medium text-ink">{client.mrr > 0 ? formatCurrency(client.mrr) : '--'}</td>

                    {/* Agreement */}
                    <td className="px-4 py-3">
                      {client.agreement_status ? (
                        <span className="rounded-full px-2.5 py-0.5 text-xs font-medium bg-ink-6 text-ink-2 capitalize">
                          {client.agreement_status}
                        </span>
                      ) : (
                        <span className="text-ink-5 text-xs">None</span>
                      )}
                    </td>

                    {/* Last Activity */}
                    <td className="px-4 py-3 text-ink-4 text-sm">{formatDate(client.last_activity)}</td>

                    {/* Health */}
                    <td className="px-4 py-3">
                      <div className="flex justify-center">
                        <span className={`w-2.5 h-2.5 rounded-full ${healthColor(client)}`} title="Health indicator" />
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1">
                        <Link
                          href={`/admin/clients/${client.id}/messages`}
                          className="p-1.5 rounded-md text-ink-4 hover:text-brand hover:bg-brand-tint transition-colors"
                          title="Send message"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          href={`/admin/clients/${client.id}/invoices/new`}
                          className="p-1.5 rounded-md text-ink-4 hover:text-brand hover:bg-brand-tint transition-colors"
                          title="Create invoice"
                        >
                          <FileText className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          href={`/admin/clients/${client.id}/agreements/new`}
                          className="p-1.5 rounded-md text-ink-4 hover:text-brand hover:bg-brand-tint transition-colors"
                          title="Send agreement"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </Link>
                      </div>
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
