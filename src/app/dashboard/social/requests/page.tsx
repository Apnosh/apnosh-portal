'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Plus, ChevronRight, ListTodo, ArrowLeft, Eye, Loader2, Check,
  Clock, X as XIcon, AlertCircle, Send, Image as ImageIcon, Sparkles,
  Search, Film, Play,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type {
  ContentQueueItem, QueueStatus, ContentFormat, ContentQueueDraft,
} from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Received — we\'re reviewing it',
  confirmed: 'Confirmed — production starting',
  drafting: 'In progress — your team is on it',
  in_review: 'Draft ready — review now',
  approved: 'Approved',
  scheduled: 'Scheduled to post',
  posted: 'Published',
  cancelled: 'Cancelled',
}

const STATUS_SHORT: Record<QueueStatus, string> = {
  new: 'Received',
  confirmed: 'Confirmed',
  drafting: 'In progress',
  in_review: 'Draft ready',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Published',
  cancelled: 'Cancelled',
}

const STATUS_PILL: Record<QueueStatus, string> = {
  new: 'bg-cyan-50 text-cyan-700',
  confirmed: 'bg-blue-50 text-blue-700',
  drafting: 'bg-purple-50 text-purple-700',
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  posted: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-6 text-ink-3',
}

const STATUS_ICON: Record<QueueStatus, typeof Check> = {
  new: Eye,
  confirmed: Check,
  drafting: Loader2,
  in_review: AlertCircle,
  approved: Check,
  scheduled: Clock,
  posted: Send,
  cancelled: XIcon,
}

const FORMAT_LABEL: Partial<Record<ContentFormat, string>> = {
  feed_post: 'Feed Post',
  reel: 'Reel',
  carousel: 'Carousel',
  story: 'Story',
  graphic: 'Graphic',
  short_form_video: 'Short-form Video',
  custom: 'Custom',
}

const ACTIVE_STATUSES: QueueStatus[] = ['new', 'confirmed', 'drafting', 'in_review']
const HISTORY_STATUSES: QueueStatus[] = ['approved', 'scheduled', 'posted', 'cancelled']

// Order in which statuses appear inside the Active tab
const ACTIVE_GROUP_ORDER: QueueStatus[] = ['in_review', 'drafting', 'confirmed', 'new']

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diffMs / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const days = Math.floor(hr / 24)
  if (days < 7) return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function ContentQueuePage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'active' | 'history'>('active')
  const [search, setSearch] = useState('')

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', client.id)
      .eq('service_area', 'social')
      .order('updated_at', { ascending: false })
    setRequests((data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  const filtered = useMemo(() => {
    const set = tab === 'active' ? ACTIVE_STATUSES : HISTORY_STATUSES
    return requests.filter(r => {
      if (!set.includes(r.status)) return false
      if (search && !(r.input_text ?? '').toLowerCase().includes(search.toLowerCase())) return false
      return true
    })
  }, [requests, tab, search])

  const activeCount = requests.filter(r => ACTIVE_STATUSES.includes(r.status)).length
  const historyCount = requests.filter(r => HISTORY_STATUSES.includes(r.status)).length
  const needsApproval = requests.filter(r => r.status === 'in_review').length

  // Group active requests by status
  const grouped = useMemo(() => {
    if (tab !== 'active') return null
    const m = new Map<QueueStatus, ContentQueueItem[]>()
    for (const s of ACTIVE_GROUP_ORDER) m.set(s, [])
    for (const r of filtered) {
      const arr = m.get(r.status)
      if (arr) arr.push(r)
    }
    return m
  }, [filtered, tab])

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/social" className="text-ink-4 hover:text-ink transition-colors mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">My Requests</h1>
            <p className="text-ink-3 text-sm mt-1">
              Track every request from submitted to posted.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <Link
            href="/dashboard/social/requests/new/graphic"
            className="text-sm text-ink-2 border border-ink-6 hover:border-brand/40 rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors"
          >
            <ImageIcon className="w-4 h-4" /> Request a graphic
          </Link>
          <Link
            href="/dashboard/social/requests/new/video"
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-3 py-2 flex items-center gap-1.5 transition-colors"
          >
            <Film className="w-4 h-4" /> Request a reel
          </Link>
        </div>
      </div>

      {/* Needs approval banner */}
      {needsApproval > 0 && tab === 'active' && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0">
            <AlertCircle className="w-4 h-4 text-amber-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {needsApproval} {needsApproval === 1 ? 'request needs' : 'requests need'} your approval
            </p>
            <p className="text-xs text-amber-700">Find them below under &ldquo;Draft ready — review now&rdquo;.</p>
          </div>
        </div>
      )}

      {/* Tab bar + search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-ink-6">
        <div className="flex items-center gap-1">
          <TabBtn
            active={tab === 'active'}
            onClick={() => setTab('active')}
            label="Active"
            count={activeCount}
            badge={needsApproval}
          />
          <TabBtn
            active={tab === 'history'}
            onClick={() => setTab('history')}
            label="History"
            count={historyCount}
          />
        </div>
        <div className="relative w-full sm:w-64 sm:mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search..."
            className="w-full pl-9 pr-3 py-1.5 text-sm border border-ink-6 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          />
        </div>
      </div>

      {/* Body */}
      {loading || clientLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-24 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState tab={tab} hasAny={requests.length > 0} />
      ) : tab === 'active' && grouped ? (
        <div className="space-y-6">
          {ACTIVE_GROUP_ORDER.map(status => {
            const items = grouped.get(status) || []
            if (items.length === 0) return null
            return (
              <ActiveGroup key={status} status={status} items={items} />
            )
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(r => <HistoryRow key={r.id} request={r} />)}
        </div>
      )}
    </div>
  )
}

/* ─── Tab button ─────────────────────────────────────── */

function TabBtn({
  active, onClick, label, count, badge,
}: {
  active: boolean
  onClick: () => void
  label: string
  count: number
  badge?: number
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium transition-colors flex items-center gap-2 border-b-2 -mb-px ${
        active
          ? 'border-brand text-brand-dark'
          : 'border-transparent text-ink-3 hover:text-ink-2'
      }`}
    >
      {label}
      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
        active ? 'bg-brand-tint text-brand-dark' : 'bg-bg-2 text-ink-4'
      }`}>
        {count}
      </span>
      {badge != null && badge > 0 && (
        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500 text-white">
          {badge}
        </span>
      )}
    </button>
  )
}

/* ─── Active group (status section) ──────────────────── */

function ActiveGroup({ status, items }: { status: QueueStatus; items: ContentQueueItem[] }) {
  const Icon = STATUS_ICON[status]
  const isPriority = status === 'in_review'

  return (
    <div>
      <div className="flex items-center gap-2 mb-2.5">
        <span className={`text-[10px] font-bold uppercase tracking-wider ${
          isPriority ? 'text-amber-700' : 'text-ink-3'
        } flex items-center gap-1.5`}>
          <Icon className={`w-3 h-3 ${status === 'drafting' ? 'animate-spin' : ''}`} />
          {STATUS_LABEL[status]}
        </span>
        <span className="text-[10px] text-ink-4">· {items.length}</span>
      </div>
      <div className="space-y-2">
        {items.map(r => <ActiveCard key={r.id} request={r} priority={isPriority} />)}
      </div>
    </div>
  )
}

/* ─── Active card ────────────────────────────────────── */

function ActiveCard({ request, priority }: { request: ContentQueueItem; priority: boolean }) {
  const draft: ContentQueueDraft | null =
    request.selected_draft != null && request.drafts[request.selected_draft]
      ? (request.drafts[request.selected_draft] as ContentQueueDraft)
      : null

  return (
    <Link
      href={`/dashboard/social/requests/${request.id}`}
      className={`block bg-white rounded-xl border overflow-hidden hover:shadow-sm transition-all ${
        priority ? 'border-amber-300 ring-1 ring-amber-200' : 'border-ink-6 hover:border-brand/30'
      }`}
    >
      <div className="flex items-start gap-4 p-4">
        {/* Thumbnail */}
        <div className="w-16 h-16 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0 overflow-hidden relative">
          {draft?.image_url ? (
            request.content_format === 'short_form_video' ? (
              <>
                <video src={draft.image_url} className="w-full h-full object-cover" muted preload="metadata" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                  <Play className="w-5 h-5 text-white fill-white" />
                </div>
              </>
            ) : (
              <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
            )
          ) : request.content_format === 'short_form_video' ? (
            <Film className="w-5 h-5 text-ink-4" />
          ) : (
            <ImageIcon className="w-5 h-5 text-ink-4" />
          )}
        </div>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[request.status]}`}>
              {STATUS_SHORT[request.status]}
            </span>
            {request.content_format && FORMAT_LABEL[request.content_format] && (
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">
                {FORMAT_LABEL[request.content_format]}
              </span>
            )}
            <span className="text-[10px] text-ink-4">
              {timeAgo(request.updated_at)}
            </span>
          </div>
          <p className="text-sm font-medium text-ink truncate">
            {request.input_text || 'Untitled request'}
          </p>
          {request.status === 'in_review' && draft?.caption && (
            <p className="text-xs text-ink-3 mt-1 line-clamp-1">{draft.caption}</p>
          )}
          {request.status === 'in_review' && (
            <p className="text-[10px] text-amber-700 font-semibold mt-1.5">
              Review draft →
            </p>
          )}
          {request.revision_count > 0 && request.status === 'drafting' && (
            <p className="text-[10px] text-purple-600 font-medium mt-1.5">
              Being revised (round {request.revision_count} of {request.revision_limit})
            </p>
          )}
        </div>

        <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1" />
      </div>
    </Link>
  )
}

/* ─── History row ────────────────────────────────────── */

function HistoryRow({ request }: { request: ContentQueueItem }) {
  const Icon = STATUS_ICON[request.status]
  const draft: ContentQueueDraft | null =
    request.selected_draft != null && request.drafts[request.selected_draft]
      ? (request.drafts[request.selected_draft] as ContentQueueDraft)
      : null

  return (
    <Link
      href={`/dashboard/social/requests/${request.id}`}
      className="flex items-center gap-3 px-4 py-3 bg-white border border-ink-6 rounded-xl hover:border-brand/30 hover:shadow-sm transition-all"
    >
      <div className="w-9 h-9 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0 overflow-hidden">
        {draft?.image_url ? (
          request.content_format === 'short_form_video' ? (
            <video src={draft.image_url} className="w-full h-full object-cover" muted preload="metadata" />
          ) : (
            <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
          )
        ) : (
          <Icon className="w-4 h-4 text-ink-4" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${STATUS_PILL[request.status]}`}>
            {STATUS_SHORT[request.status]}
          </span>
          {request.content_format && FORMAT_LABEL[request.content_format] && (
            <span className="text-[10px] text-ink-4">{FORMAT_LABEL[request.content_format]}</span>
          )}
          <span className="text-[10px] text-ink-4 ml-auto">
            {timeAgo(request.updated_at)}
          </span>
        </div>
        <p className="text-sm text-ink-2 truncate">
          {request.input_text || 'Untitled request'}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
    </Link>
  )
}

/* ─── Empty state ────────────────────────────────────── */

function EmptyState({ tab, hasAny }: { tab: 'active' | 'history'; hasAny: boolean }) {
  if (tab === 'active') {
    return (
      <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
        <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
          <Sparkles className="w-5 h-5 text-ink-4" />
        </div>
        <p className="text-sm font-medium text-ink-2">
          {hasAny ? 'No active requests' : 'No requests yet'}
        </p>
        <p className="text-xs text-ink-4 mt-1 mb-4 max-w-sm mx-auto">
          {hasAny
            ? 'Everything is wrapped up. Ready to create something new?'
            : "No requests yet. Ready to create something? Use the buttons above to request a graphic or reel."}
        </p>
        <Link
          href="/dashboard/social/requests/new"
          className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Request
        </Link>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
      <div className="w-12 h-12 rounded-xl bg-bg-2 flex items-center justify-center mx-auto mb-3">
        <ListTodo className="w-5 h-5 text-ink-4" />
      </div>
      <p className="text-sm font-medium text-ink-2">No history yet</p>
      <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
        Approved, scheduled, posted, and cancelled requests will show up here.
      </p>
    </div>
  )
}
