'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Loader2, Plus, Pencil, Eye, Check, Send, Clock, ChevronRight,
  ListTodo, Search, ExternalLink, X,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { ContentQueueItem, QueueStatus, TemplateType, PostPlatform, Client } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STATUS_CONFIG: Record<QueueStatus, { label: string; color: string; icon: typeof ListTodo }> = {
  new: { label: 'Awaiting Confirmation', color: 'bg-cyan-50 text-cyan-700', icon: Eye },
  confirmed: { label: 'Confirmed', color: 'bg-blue-50 text-blue-700', icon: Check },
  drafting: { label: 'In Production', color: 'bg-purple-50 text-purple-700', icon: Pencil },
  in_review: { label: 'Client Reviewing', color: 'bg-amber-50 text-amber-700', icon: Eye },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700', icon: Check },
  scheduled: { label: 'Scheduled', color: 'bg-indigo-50 text-indigo-700', icon: Clock },
  posted: { label: 'Posted', color: 'bg-green-50 text-green-700', icon: Send },
  cancelled: { label: 'Cancelled', color: 'bg-ink-6 text-ink-3', icon: X },
}

const TEMPLATE_LABELS: Record<TemplateType, string> = {
  insight: 'Insight', stat: 'Stat', tip: 'Tip', compare: 'Compare',
  result: 'Result', photo: 'Photo', custom: 'Custom',
}

const PLATFORM_LABELS: Record<PostPlatform, string> = {
  instagram: 'IG', tiktok: 'TT', linkedin: 'LI',
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function GlobalQueuePage() {
  const supabase = createClient()

  const [items, setItems] = useState<(ContentQueueItem & { client_name: string; client_slug: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')

  const fetchQueue = useCallback(async () => {
    setLoading(true)

    const { data: queueData } = await supabase
      .from('content_queue')
      .select('*')
      .order('created_at', { ascending: false })

    if (!queueData || queueData.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    // Get client names
    const clientIds = [...new Set(queueData.map(q => q.client_id))]
    const { data: clients } = await supabase
      .from('clients')
      .select('id, name, slug')
      .in('id', clientIds)

    const clientMap = new Map<string, { name: string; slug: string }>()
    for (const c of clients ?? []) {
      clientMap.set(c.id, { name: c.name, slug: c.slug })
    }

    const enriched = queueData.map(q => ({
      ...q,
      client_name: clientMap.get(q.client_id)?.name ?? 'Unknown',
      client_slug: clientMap.get(q.client_id)?.slug ?? '',
    })) as (ContentQueueItem & { client_name: string; client_slug: string })[]

    setItems(enriched)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    fetchQueue()
  }, [fetchQueue])

  useRealtimeRefresh(['content_queue', 'client_feedback'], fetchQueue)

  const uniqueClients = useMemo(() => {
    const map = new Map<string, string>()
    items.forEach(i => map.set(i.client_id, i.client_name))
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1]))
  }, [items])

  const filtered = useMemo(() => {
    return items.filter(i => {
      if (statusFilter !== 'all' && i.status !== statusFilter) return false
      if (clientFilter !== 'all' && i.client_id !== clientFilter) return false
      if (platformFilter !== 'all' && i.platform !== platformFilter) return false
      return true
    })
  }, [items, statusFilter, clientFilter, platformFilter])

  // Sort by status priority
  const statusPriority: QueueStatus[] = ['new', 'in_review', 'drafting', 'approved', 'scheduled', 'posted']
  const sorted = [...filtered].sort((a, b) => {
    const aPri = statusPriority.indexOf(a.status)
    const bPri = statusPriority.indexOf(b.status)
    if (aPri !== bPri) return aPri - bPri
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  // Counts
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1
    return acc
  }, {})

  const newClientRequestCount = items.filter(
    i => i.submitted_by === 'client' && i.status === 'new'
  ).length

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Content Queue</h1>
        <p className="text-ink-3 text-sm mt-1">All content across all clients.</p>
      </div>

      {/* Counter badges */}
      <div className="flex flex-wrap gap-2 text-xs">
        {newClientRequestCount > 0 && (
          <span className="font-medium text-cyan-700 bg-cyan-50 border border-cyan-200 px-2.5 py-1 rounded-full flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
            {newClientRequestCount} new client request{newClientRequestCount === 1 ? '' : 's'}
          </span>
        )}
        {counts.new ? <span className="font-medium text-blue-600 bg-blue-50 px-2.5 py-1 rounded-full">{counts.new} new</span> : null}
        {counts.in_review ? <span className="font-medium text-amber-600 bg-amber-50 px-2.5 py-1 rounded-full">{counts.in_review} in review</span> : null}
        {counts.drafting ? <span className="font-medium text-purple-600 bg-purple-50 px-2.5 py-1 rounded-full">{counts.drafting} drafting</span> : null}
        {counts.approved ? <span className="font-medium text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">{counts.approved} approved</span> : null}
        {counts.scheduled ? <span className="font-medium text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">{counts.scheduled} scheduled</span> : null}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={clientFilter} onChange={e => setClientFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="all">All Clients</option>
          {uniqueClients.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="all">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
        </select>
        <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)} className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white">
          <option value="all">All Platforms</option>
          {Object.entries(PLATFORM_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      {/* Queue list */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 animate-pulse flex gap-3">
              <div className="h-5 w-16 bg-ink-6 rounded-full" />
              <div className="h-5 w-24 bg-ink-6 rounded" />
              <div className="flex-1 h-5 bg-ink-6 rounded" />
            </div>
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No items in queue.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-bg-2 border-b border-ink-6">
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Client</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Status</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">By</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Request</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Type</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Platform</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-left">Date</th>
                  <th className="px-4 py-3 text-[11px] text-ink-4 font-medium uppercase tracking-wide text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(item => {
                  const statusCfg = STATUS_CONFIG[item.status]
                  const StatusIcon = statusCfg.icon

                  return (
                    <tr key={item.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors">
                      <td className="px-4 py-3">
                        <Link
                          href={`/admin/clients/${item.client_slug}`}
                          className="text-sm font-medium text-ink hover:text-brand-dark transition-colors"
                        >
                          {item.client_name}
                        </Link>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex items-center gap-1 w-fit ${statusCfg.color}`}>
                          <StatusIcon className="w-3 h-3" />
                          {statusCfg.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                          item.submitted_by === 'client' ? 'bg-cyan-50 text-cyan-700' : 'bg-ink-6 text-ink-3'
                        }`}>
                          {item.submitted_by}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-ink-2 text-sm max-w-xs truncate">
                        {item.input_text || '--'}
                      </td>
                      <td className="px-4 py-3">
                        {item.template_type ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink-6 text-ink-3">
                            {TEMPLATE_LABELS[item.template_type] ?? item.template_type}
                          </span>
                        ) : '--'}
                      </td>
                      <td className="px-4 py-3">
                        {item.platform ? (
                          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-ink-6 text-ink-3">
                            {PLATFORM_LABELS[item.platform] ?? item.platform}
                          </span>
                        ) : '--'}
                      </td>
                      <td className="px-4 py-3 text-ink-4 text-sm">
                        {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Link
                          href={`/admin/clients/${item.client_slug}?tab=queue`}
                          className="text-brand hover:text-brand-dark transition-colors"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </Link>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
