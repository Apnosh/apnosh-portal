'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  FileText, Plus, Send, Eye, CheckCircle, Clock, XCircle, AlertCircle, Search
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface AgreementRow {
  id: string
  business_id: string
  agreement_type: string
  status: string
  sent_at: string | null
  signed_at: string | null
  expires_at: string | null
  created_at: string
  custom_fields: Record<string, string>
  business: { name: string; primary_contact_name: string | null }
}

const statusConfig: Record<string, { label: string; className: string; icon: typeof CheckCircle }> = {
  draft: { label: 'Draft', className: 'bg-gray-50 text-gray-600', icon: Clock },
  sent: { label: 'Sent', className: 'bg-amber-50 text-amber-700', icon: Send },
  viewed: { label: 'Viewed', className: 'bg-blue-50 text-blue-700', icon: Eye },
  signed: { label: 'Signed', className: 'bg-emerald-50 text-emerald-700', icon: CheckCircle },
  expired: { label: 'Expired', className: 'bg-red-50 text-red-600', icon: AlertCircle },
  cancelled: { label: 'Cancelled', className: 'bg-gray-50 text-gray-500', icon: XCircle },
}

export default function AgreementsPage() {
  const [agreements, setAgreements] = useState<AgreementRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')
  const [search, setSearch] = useState('')

  useEffect(() => {
    async function fetch() {
      const supabase = createClient()
      const { data } = await supabase
        .from('agreements')
        .select('*, business:businesses(name, primary_contact_name)')
        .order('created_at', { ascending: false })
      setAgreements((data as AgreementRow[]) || [])
      setLoading(false)
    }
    fetch()
  }, [])

  const filtered = agreements.filter((a) => {
    if (filter !== 'all' && a.status !== filter) return false
    if (search) {
      const s = search.toLowerCase()
      return (
        a.business?.name?.toLowerCase().includes(s) ||
        a.custom_fields?.client_legal_name?.toLowerCase().includes(s)
      )
    }
    return true
  })

  const counts = {
    all: agreements.length,
    draft: agreements.filter((a) => a.status === 'draft').length,
    sent: agreements.filter((a) => a.status === 'sent').length,
    signed: agreements.filter((a) => a.status === 'signed').length,
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-64 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Agreements</h1>
          <p className="text-ink-3 text-sm mt-1">Manage contracts and service agreements.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/admin/agreements/templates"
            className="px-4 py-2 rounded-lg border border-ink-6 text-sm font-medium text-ink-2 hover:bg-bg-2 transition-colors"
          >
            Templates
          </Link>
          <Link
            href="/admin/agreements/send"
            className="px-4 py-2 rounded-lg bg-brand hover:bg-brand-dark text-white text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" /> New Agreement
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: 'Total', value: counts.all, color: 'text-ink' },
          { label: 'Drafts', value: counts.draft, color: 'text-gray-600' },
          { label: 'Awaiting Signature', value: counts.sent, color: 'text-amber-600' },
          { label: 'Signed', value: counts.signed, color: 'text-emerald-600' },
        ].map((card) => (
          <div key={card.label} className="bg-white rounded-xl border border-ink-6 p-4">
            <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">{card.label}</p>
            <p className={`font-[family-name:var(--font-display)] text-2xl mt-1 ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters + Search */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by business name..."
            className="w-full pl-9 pr-4 py-2 rounded-lg border border-ink-6 bg-white text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        </div>
        <div className="flex gap-1.5">
          {(['all', 'draft', 'sent', 'signed'] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                filter === f ? 'bg-brand-tint text-brand-dark' : 'text-ink-3 hover:bg-bg-2'
              }`}
            >
              {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-8 text-center">
            <FileText className="w-10 h-10 text-ink-4 mx-auto mb-3" />
            <p className="text-ink-3 text-sm">No agreements found.</p>
            <Link
              href="/admin/agreements/send"
              className="inline-block mt-3 text-sm text-brand-dark font-medium hover:underline"
            >
              Create your first agreement
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-ink-6">
                  <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Client</th>
                  <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Type</th>
                  <th className="text-center text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Status</th>
                  <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Sent</th>
                  <th className="text-left text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Signed</th>
                  <th className="text-right text-[11px] text-ink-4 font-medium uppercase tracking-wide px-5 py-3">Rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-ink-6">
                {filtered.map((a) => {
                  const status = statusConfig[a.status] || statusConfig.draft
                  const StatusIcon = status.icon
                  return (
                    <tr key={a.id} className="hover:bg-bg-2/50 transition-colors">
                      <td className="px-5 py-3">
                        <Link href={`/admin/clients/${a.business_id}`} className="text-sm font-medium text-ink hover:text-brand-dark">
                          {a.business?.name || 'Unknown'}
                        </Link>
                      </td>
                      <td className="px-5 py-3 text-sm text-ink-3">
                        {a.agreement_type === 'master_service_agreement' ? 'MSA' : a.agreement_type === 'scope_amendment' ? 'Amendment' : 'Addendum'}
                      </td>
                      <td className="px-5 py-3 text-center">
                        <span className={`inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full ${status.className}`}>
                          <StatusIcon className="w-3 h-3" />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-5 py-3 text-sm text-ink-3">
                        {a.sent_at ? new Date(a.sent_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-ink-3">
                        {a.signed_at ? new Date(a.signed_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-sm text-ink font-medium text-right">
                        {a.custom_fields?.monthly_rate || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
