'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  Plus, ChevronRight, ListTodo, Search,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { ContentQueueItem, QueueStatus } from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Submitted',
  drafting: 'In Production',
  in_review: 'Ready for Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Posted',
}

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  drafting: 'bg-purple-50 text-purple-700',
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  posted: 'bg-green-50 text-green-700',
}

export default function ClientRequestsListPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params)
  const supabase = createClient()

  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState<QueueStatus | 'all'>('all')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .single()

    if (!client) { setLoading(false); return }

    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', client.id)
      .order('updated_at', { ascending: false })

    setRequests((data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [slug, supabase])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(['content_queue'], load)

  const filtered = requests.filter(r => {
    if (statusFilter !== 'all' && r.status !== statusFilter) return false
    if (search && !(r.input_text ?? '').toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">All Requests</h1>
          <p className="text-ink-3 text-sm mt-1">Track every request from submission to publish.</p>
        </div>
        <Link
          href={`/client/${slug}/requests/new`}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> New Request
        </Link>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-8 pr-3 py-1.5 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
        <select
          value={statusFilter}
          onChange={e => setStatusFilter(e.target.value as QueueStatus | 'all')}
          className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
        >
          <option value="all">All statuses</option>
          {Object.entries(STATUS_LABEL).map(([val, label]) => (
            <option key={val} value={val}>{label}</option>
          ))}
        </select>
        <span className="text-xs text-ink-4 ml-auto">{filtered.length} requests</span>
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <ListTodo className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">
            {requests.length === 0 ? 'No requests yet' : 'No requests match your filters'}
          </p>
          {requests.length === 0 && (
            <p className="text-xs text-ink-4 mt-1">Click &ldquo;New Request&rdquo; above to get started.</p>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          {filtered.map((req, i) => (
            <Link
              key={req.id}
              href={`/client/${slug}/requests/${req.id}`}
              className={`flex items-center gap-3 px-4 py-4 hover:bg-bg-2 transition-colors ${
                i > 0 ? 'border-t border-ink-6' : ''
              } ${req.status === 'in_review' ? 'bg-amber-50/30' : ''}`}
            >
              <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[req.status]}`}>
                {STATUS_LABEL[req.status]}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm text-ink truncate">{req.input_text || 'Untitled request'}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[10px] text-ink-4">
                  {req.template_type && <span className="capitalize">{req.template_type}</span>}
                  {req.platform && <><span>·</span><span className="capitalize">{req.platform}</span></>}
                  <span>·</span>
                  <span>Updated {new Date(req.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                </div>
              </div>
              <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
