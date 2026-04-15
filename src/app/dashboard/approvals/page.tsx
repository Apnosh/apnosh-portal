'use client'

import { useState, useMemo, useCallback, useEffect } from 'react'
import Link from 'next/link'
import {
  CheckCircle, Clock, RotateCcw, Send, Search, LayoutList, Rows3,
  ArrowUpDown, Check, X, Pen, Eye, ChevronDown, ChevronUp,
  Settings2, ToggleLeft, ToggleRight, AlertTriangle, Sparkles, Calendar,
} from 'lucide-react'
import {
  type Deliverable, type DeliverableStatus, type Platform,
  platformIcon, platformLabel, platformColor,
  urgencyColor, urgencyBadge,
} from '@/lib/mock-deliverables'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/supabase/hooks'
import { approveDeliverable, requestRevision } from '@/lib/actions'

/* ------------------------------------------------------------------ */
/*  Local types                                                        */
/* ------------------------------------------------------------------ */
type FilterTab = 'all' | 'awaiting' | 'approved' | 'changes_requested' | 'scheduled'
type SortMode = 'urgency' | 'newest' | 'platform'
type ViewMode = 'compact' | 'expanded'

const tabMatch = (s: DeliverableStatus, t: FilterTab) => {
  if (t === 'all') return true
  if (t === 'awaiting') return s === 'pending'
  return s === t
}

const urgencyRank = (u: string) => {
  switch (u) {
    case 'overdue': return 0
    case 'today': return 1
    case 'soon': return 2
    case 'normal': return 3
    default: return 4
  }
}

/* ------------------------------------------------------------------ */
/*  Toast component                                                    */
/* ------------------------------------------------------------------ */
function Toast({ message, onUndo, onDismiss }: { message: string; onUndo: () => void; onDismiss: () => void }) {
  useEffect(() => {
    const t = setTimeout(onDismiss, 4000)
    return () => clearTimeout(t)
  }, [onDismiss])

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-ink text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-3 text-sm animate-slide-up max-w-[90vw]">
      <CheckCircle className="w-4 h-4 text-emerald-400 flex-shrink-0" />
      <span className="truncate">{message}</span>
      <button onClick={onUndo} className="text-amber-300 hover:text-amber-200 font-medium flex-shrink-0">Undo</button>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */
/* eslint-disable @typescript-eslint/no-explicit-any */

function mapDbToDeliverable(d: any): Deliverable {
  const content = d.content || {}
  const platform = (content.platform || 'instagram') as Platform
  const now = new Date()
  const created = new Date(d.created_at)
  const deadlineDate = new Date(created.getTime() + 48 * 60 * 60 * 1000)
  const hoursLeft = (deadlineDate.getTime() - now.getTime()) / (1000 * 60 * 60)
  const deadlineUrgency: 'overdue' | 'today' | 'soon' | 'normal' | 'none' =
    hoursLeft <= 0 ? 'overdue' : hoursLeft <= 12 ? 'today' : hoursLeft <= 36 ? 'soon' : 'normal'
  const deadlineLabel =
    hoursLeft <= 0 ? 'Overdue' : hoursLeft <= 12 ? 'Due today' : hoursLeft <= 36 ? 'Due tomorrow' : `Due ${deadlineDate.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`

  const statusMap: Record<string, DeliverableStatus> = {
    client_review: 'pending',
    approved: 'approved',
    revision_requested: 'changes_requested',
    scheduled: 'scheduled',
    published: 'approved',
  }

  return {
    id: d.id,
    title: d.title || 'Untitled',
    platform,
    platforms: [{ platform, contentType: 'Feed Post' as any, scheduledFor: content.scheduled_time || null }],
    contentType: 'Feed Post',
    caption: content.caption || '',
    hashtags: content.hashtags || [],
    submittedDate: created.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    deadline: deadlineDate.toISOString(),
    deadlineLabel,
    deadlineUrgency,
    scheduledFor: content.scheduled_time || null,
    version: d.version || 1,
    status: statusMap[d.status] || 'pending',
    previewColor: 'bg-blue-50',
    createdBy: 'Apnosh Team',
    createdByRole: 'Creative',
  }
}

export default function ApprovalsPage() {
  const { data: business } = useBusiness()

  /* ---------- state ---------- */
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [dataLoading, setDataLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<FilterTab>('all')

  // Load real deliverables from Supabase
  useEffect(() => {
    if (!business?.id) {
      setDataLoading(false)
      return
    }
    const supabase = createClient()

    async function fetchDeliverables() {
      const { data } = await supabase
        .from('deliverables')
        .select('id, title, type, status, version, content, created_at, approved_at, client_feedback')
        .eq('business_id', business!.id)
        .in('status', ['client_review', 'approved', 'revision_requested', 'scheduled', 'published'])
        .order('created_at', { ascending: false })
        .limit(50)

      setDeliverables(data && data.length > 0 ? data.map(mapDbToDeliverable) : [])
      setDataLoading(false)
    }

    fetchDeliverables()
  }, [business?.id])
  const [viewMode, setViewMode] = useState<ViewMode>('compact')
  const [sortMode, setSortMode] = useState<SortMode>('urgency')
  const [searchQuery, setSearchQuery] = useState('')

  // Selection + batch
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [batchConfirmOpen, setBatchConfirmOpen] = useState(false)

  // Feedback inline
  const [feedbackOpen, setFeedbackOpen] = useState<string | null>(null)
  const [feedbackText, setFeedbackText] = useState('')
  const [feedbackCategories, setFeedbackCategories] = useState<Set<string>>(new Set())
  const [feedbackPriority, setFeedbackPriority] = useState<'normal' | 'urgent'>('normal')

  // Edit modal
  const [editOpen, setEditOpen] = useState<string | null>(null)
  const [editCaption, setEditCaption] = useState('')
  const [editSchedule, setEditSchedule] = useState('')

  // Reschedule
  const [rescheduleOpen, setRescheduleOpen] = useState<string | null>(null)
  const [rescheduleDate, setRescheduleDate] = useState('')
  const [rescheduleTime, setRescheduleTime] = useState('')
  const [rescheduleReason, setRescheduleReason] = useState('')

  // Toast
  const [toast, setToast] = useState<{ message: string; undoFn: () => void } | null>(null)

  // Auto-approve settings
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [autoStory, setAutoStory] = useState(false)
  const [autoRecurring, setAutoRecurring] = useState(false)
  const [trustMode, setTrustMode] = useState(false)

  /* ---------- computed ---------- */
  const counts = useMemo(() => {
    const c = { pending: 0, approved: 0, changes_requested: 0, scheduled: 0 }
    deliverables.forEach(d => c[d.status]++)
    return c
  }, [deliverables])

  const filtered = useMemo(() => {
    let items = deliverables.filter(d => tabMatch(d.status, activeTab))

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      items = items.filter(d =>
        d.title.toLowerCase().includes(q) ||
        d.caption.toLowerCase().includes(q) ||
        d.createdBy.toLowerCase().includes(q) ||
        d.platforms.some(pv => platformLabel(pv.platform).toLowerCase().includes(q))
      )
    }

    if (sortMode === 'urgency') {
      items = [...items].sort((a, b) => urgencyRank(a.deadlineUrgency) - urgencyRank(b.deadlineUrgency))
    } else if (sortMode === 'newest') {
      items = [...items].sort((a, b) => b.submittedDate.localeCompare(a.submittedDate))
    } else {
      items = [...items].sort((a, b) => a.platform.localeCompare(b.platform))
    }
    return items
  }, [deliverables, activeTab, searchQuery, sortMode])

  const pendingItems = useMemo(() => filtered.filter(d => d.status === 'pending'), [filtered])

  /* ---------- refetch helper ---------- */
  const refetchDeliverables = useCallback(async () => {
    if (!business?.id) return
    const supabase = createClient()
    const { data } = await supabase
      .from('deliverables')
      .select('id, title, type, status, version, content, created_at, approved_at, client_feedback')
      .eq('business_id', business.id)
      .in('status', ['client_review', 'approved', 'revision_requested', 'scheduled', 'published'])
      .order('created_at', { ascending: false })
      .limit(50)
    setDeliverables(data && data.length > 0 ? data.map(mapDbToDeliverable) : [])
  }, [business?.id])

  /* ---------- actions ---------- */
  const [actionLoading, setActionLoading] = useState<string | null>(null)

  const approveOne = useCallback(async (id: string) => {
    const item = deliverables.find(d => d.id === id)
    if (!item) return
    setActionLoading(id)
    // Optimistic update
    setDeliverables(ds => ds.map(d => d.id === id ? { ...d, status: 'approved' as const, approvedAt: 'just now' } : d))
    setSelected(s => { const n = new Set(s); n.delete(id); return n })

    const result = await approveDeliverable(id)
    if (result.success) {
      setToast({
        message: `${item.title} approved!${item.scheduledFor ? ` Posting ${item.scheduledFor}` : ''}`,
        undoFn: () => refetchDeliverables(),
      })
    } else {
      // Revert on error
      await refetchDeliverables()
      setToast({ message: `Failed: ${result.error}`, undoFn: () => {} })
    }
    setActionLoading(null)
  }, [deliverables, refetchDeliverables])

  const batchApprove = useCallback(async () => {
    const ids = Array.from(selected)
    // Optimistic update
    setDeliverables(ds => ds.map(d => selected.has(d.id) ? { ...d, status: 'approved' as const, approvedAt: 'just now' } : d))
    setSelected(new Set())
    setBatchConfirmOpen(false)

    const results = await Promise.all(ids.map(id => approveDeliverable(id)))
    const failures = results.filter(r => !r.success)
    if (failures.length > 0) {
      await refetchDeliverables()
      setToast({ message: `${ids.length - failures.length} approved, ${failures.length} failed`, undoFn: () => {} })
    } else {
      setToast({
        message: `${ids.length} item${ids.length > 1 ? 's' : ''} approved!`,
        undoFn: () => refetchDeliverables(),
      })
    }
  }, [selected, refetchDeliverables])

  const requestChanges = useCallback(async (id: string) => {
    const categories = Array.from(feedbackCategories)
    const fullFeedback = [
      categories.length > 0 ? `[${categories.join(', ')}]` : '',
      feedbackPriority === 'urgent' ? '[URGENT]' : '',
      feedbackText,
    ].filter(Boolean).join(' ')

    // Optimistic update
    setDeliverables(ds => ds.map(d => d.id === id ? { ...d, status: 'changes_requested' as const, feedbackSummary: feedbackText } : d))
    setFeedbackOpen(null)
    setFeedbackText('')
    setFeedbackCategories(new Set())
    setFeedbackPriority('normal')

    const result = await requestRevision(id, fullFeedback)
    if (!result.success) {
      await refetchDeliverables()
      setToast({ message: `Failed: ${result.error}`, undoFn: () => {} })
    } else {
      await refetchDeliverables()
    }
  }, [feedbackText, feedbackCategories, feedbackPriority, refetchDeliverables])

  const saveAndApprove = useCallback((id: string) => {
    setDeliverables(ds => ds.map(d => d.id === id ? { ...d, status: 'approved' as const, caption: editCaption || d.caption, approvedAt: 'just now' } : d))
    setEditOpen(null)
    setEditCaption('')
    setEditSchedule('')
  }, [editCaption])

  const rescheduleItem = useCallback((id: string) => {
    if (!rescheduleDate) return
    const newSchedule = `${rescheduleDate}${rescheduleTime ? ' at ' + rescheduleTime : ''}`
    const prev = deliverables.find(d => d.id === id)
    setDeliverables(ds => ds.map(d => d.id === id ? {
      ...d,
      scheduledFor: newSchedule,
      platforms: d.platforms.map(p => ({ ...p, scheduledFor: newSchedule })),
    } : d))
    setRescheduleOpen(null)
    setToast({
      message: `📅 Rescheduled to ${newSchedule}`,
      undoFn: () => {
        if (prev) {
          setDeliverables(ds => ds.map(d => d.id === id ? { ...d, scheduledFor: prev.scheduledFor, platforms: prev.platforms } : d))
        }
      },
    })
    setRescheduleDate('')
    setRescheduleTime('')
    setRescheduleReason('')
  }, [rescheduleDate, rescheduleTime, deliverables])

  const toggleSelect = (id: string) => {
    setSelected(s => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }

  const toggleSelectAll = () => {
    if (selected.size === pendingItems.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(pendingItems.map(d => d.id)))
    }
  }

  /* ---------- tabs config ---------- */
  const tabs: { key: FilterTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: deliverables.length },
    { key: 'awaiting', label: 'Needs Review', count: counts.pending },
    { key: 'approved', label: 'Approved', count: counts.approved },
    { key: 'changes_requested', label: 'Changes Req.', count: counts.changes_requested },
    { key: 'scheduled', label: 'Scheduled', count: counts.scheduled },
  ]

  const fbCategories = ['Caption', 'Image', 'Colors', 'Timing', 'Hashtags', 'Other']

  /* ---------- render ---------- */

  if (dataLoading) {
    return (
      <div className="max-w-5xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="h-12 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-32 bg-ink-6 rounded-xl animate-pulse" />
        <div className="h-32 bg-ink-6 rounded-xl animate-pulse" />
      </div>
    )
  }

  if (deliverables.length === 0) {
    return (
      <div className="max-w-5xl mx-auto space-y-5">
        <h1 className="text-xl font-[family-name:var(--font-display)] text-ink">Approvals</h1>
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-1">No content to review yet</h2>
          <p className="text-ink-3 text-sm max-w-md mx-auto">
            Once your Apnosh team starts creating content for your business, it will appear here for your review and approval.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {/* ========= HEADER ========= */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-[family-name:var(--font-display)] text-ink">Approvals</h1>
          {counts.pending > 0 && (
            <span className="bg-amber-100 text-amber-800 text-xs font-bold px-2 py-0.5 rounded-full">{counts.pending} pending</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-ink-4" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm bg-white border border-ink-6 rounded-lg w-full sm:w-48 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
            />
          </div>
          {/* View toggle */}
          <div className="flex bg-white border border-ink-6 rounded-lg overflow-hidden">
            <button onClick={() => setViewMode('compact')} className={`p-1.5 ${viewMode === 'compact' ? 'bg-brand-tint text-brand-dark' : 'text-ink-4 hover:text-ink-2'}`} title="Compact">
              <Rows3 className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('expanded')} className={`p-1.5 ${viewMode === 'expanded' ? 'bg-brand-tint text-brand-dark' : 'text-ink-4 hover:text-ink-2'}`} title="Expanded">
              <LayoutList className="w-4 h-4" />
            </button>
          </div>
          {/* Sort */}
          <select
            value={sortMode}
            onChange={e => setSortMode(e.target.value as SortMode)}
            className="text-sm border border-ink-6 rounded-lg px-2 py-1.5 bg-white text-ink-2 focus:outline-none focus:ring-2 focus:ring-brand/30"
          >
            <option value="urgency">Sort: Urgency</option>
            <option value="newest">Sort: Newest</option>
            <option value="platform">Sort: Platform</option>
          </select>
        </div>
      </div>

      {/* ========= STATS ========= */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Needs Review', value: counts.pending, icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50' },
          { label: 'Approved', value: counts.approved, icon: CheckCircle, color: 'text-emerald-600', bg: 'bg-emerald-50' },
          { label: 'Changes Req.', value: counts.changes_requested, icon: RotateCcw, color: 'text-red-500', bg: 'bg-red-50' },
          { label: 'Scheduled', value: counts.scheduled, icon: Send, color: 'text-blue-600', bg: 'bg-blue-50' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-xl border border-ink-6 p-3 flex items-center gap-3">
            <div className={`w-9 h-9 rounded-lg ${s.bg} flex items-center justify-center`}>
              <s.icon className={`w-4 h-4 ${s.color}`} />
            </div>
            <div>
              <div className="text-lg font-semibold text-ink leading-tight">{s.value}</div>
              <div className="text-[11px] text-ink-4">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ========= FILTER TABS ========= */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mb-1">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => { setActiveTab(t.key); setSelected(new Set()) }}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
              activeTab === t.key
                ? 'bg-brand-tint text-brand-dark'
                : 'text-ink-3 hover:bg-bg-2 hover:text-ink-2'
            }`}
          >
            {t.label}
            <span className={`ml-1.5 text-xs ${activeTab === t.key ? 'text-brand' : 'text-ink-4'}`}>{t.count}</span>
          </button>
        ))}
      </div>

      {/* ========= SEARCH RESULTS COUNT ========= */}
      {searchQuery.trim() && (
        <div className="text-sm text-ink-3">
          {filtered.length} result{filtered.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
          <button onClick={() => setSearchQuery('')} className="ml-2 text-brand hover:text-brand-dark font-medium">Clear</button>
        </div>
      )}

      {/* ========= SELECT ALL (when pending tab or items selectable) ========= */}
      {pendingItems.length > 0 && (activeTab === 'all' || activeTab === 'awaiting') && (
        <div className="flex items-center gap-2">
          <button onClick={toggleSelectAll} className="flex items-center gap-2 text-sm text-ink-3 hover:text-ink-2">
            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
              selected.size === pendingItems.length && pendingItems.length > 0
                ? 'bg-brand border-brand text-white'
                : 'border-ink-5'
            }`}>
              {selected.size === pendingItems.length && pendingItems.length > 0 && <Check className="w-3 h-3" />}
            </div>
            Select all pending ({pendingItems.length})
          </button>
        </div>
      )}

      {/* ========= CARDS ========= */}
      <div className="space-y-3">
        {filtered.length === 0 && (
          <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
            {searchQuery.trim() ? (
              <>
                <p className="text-ink-3 text-sm">No items match this filter.</p>
                <button onClick={() => setSearchQuery('')} className="mt-2 text-sm text-brand hover:text-brand-dark font-medium">Clear filters</button>
              </>
            ) : activeTab === 'awaiting' ? (
              <p className="text-ink-3 text-sm">All caught up! No items need your review right now.</p>
            ) : activeTab === 'approved' ? (
              <p className="text-ink-3 text-sm">Items you approve will appear here.</p>
            ) : (
              <p className="text-ink-3 text-sm">No items to show.</p>
            )}
          </div>
        )}

        {filtered.map(d => {
          const Icon = platformIcon(d.platform)
          const isSelected = selected.has(d.id)
          const isFeedbackOpen = feedbackOpen === d.id
          const isEditOpen = editOpen === d.id
          const isPending = d.status === 'pending'
          const uniquePlatforms = [...new Set(d.platforms.map(pv => pv.platform))]

          return (
            <div
              key={d.id}
              className={`bg-white rounded-xl border border-ink-6 border-t-[3px] ${urgencyColor(d.deadlineUrgency)} overflow-hidden transition-shadow hover:shadow-sm ${
                isSelected ? 'ring-2 ring-brand/40' : ''
              }`}
            >
              {/* --- Main row --- */}
              <div className="p-4 flex gap-3">
                {/* Checkbox + Thumbnail */}
                <div className="flex flex-col items-center gap-2 flex-shrink-0">
                  {isPending && (
                    <button onClick={() => toggleSelect(d.id)} className="flex-shrink-0">
                      <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                        isSelected ? 'bg-brand border-brand text-white' : 'border-ink-5 hover:border-ink-4'
                      }`}>
                        {isSelected && <Check className="w-3 h-3" />}
                      </div>
                    </button>
                  )}
                  <div className={`w-16 h-16 sm:w-20 sm:h-20 rounded-lg ${d.previewColor} flex items-center justify-center flex-shrink-0`}>
                    <Icon className={`w-6 h-6 ${platformColor(d.platform)} opacity-40`} />
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-[family-name:var(--font-display)] text-[15px] text-ink leading-snug truncate">{d.title}</h3>
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {/* Platform icons */}
                        {uniquePlatforms.map(p => {
                          const PIcon = platformIcon(p)
                          return <PIcon key={p} className={`w-3.5 h-3.5 ${platformColor(p)}`} />
                        })}
                        <span className="text-xs text-ink-4">
                          {uniquePlatforms.length} platform{uniquePlatforms.length > 1 ? 's' : ''}
                        </span>
                        <span className="text-ink-5">·</span>
                        <span className="text-xs text-ink-3">{d.contentType}</span>
                        {d.version > 1 && (
                          <>
                            <span className="text-ink-5">·</span>
                            <span className="text-xs text-amber-600 font-medium">v{d.version}</span>
                          </>
                        )}
                        {d.slides && (
                          <>
                            <span className="text-ink-5">·</span>
                            <span className="text-xs text-ink-4">{d.slides} slides</span>
                          </>
                        )}
                      </div>
                    </div>
                    {/* Deadline badge */}
                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0 ${urgencyBadge(d.deadlineUrgency)}`}>
                      {d.deadlineLabel}
                    </span>
                  </div>

                  {/* Caption preview */}
                  <p className={`text-sm text-ink-3 mt-1.5 ${viewMode === 'compact' ? 'line-clamp-2' : ''}`}>
                    {d.caption}
                  </p>

                  {/* Expanded view extras */}
                  {viewMode === 'expanded' && (
                    <div className="mt-3 space-y-2">
                      {/* Cross-platform breakdown */}
                      <div className="bg-bg-2 rounded-lg p-2.5">
                        <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wide mb-1.5">Platform Breakdown</div>
                        <div className="space-y-1">
                          {d.platforms.map((pv, i) => {
                            const PVIcon = platformIcon(pv.platform)
                            return (
                              <div key={i} className="flex items-center gap-2 text-xs text-ink-3">
                                <PVIcon className={`w-3 h-3 ${platformColor(pv.platform)}`} />
                                <span className="font-medium text-ink-2">{platformLabel(pv.platform)}</span>
                                <span className="text-ink-5">·</span>
                                <span>{pv.contentType}</span>
                                {pv.dimensions && <><span className="text-ink-5">·</span><span>{pv.dimensions}</span></>}
                                {pv.scheduledFor && <><span className="text-ink-5">·</span><span>{pv.scheduledFor}</span></>}
                              </div>
                            )
                          })}
                        </div>
                      </div>

                      {/* Strategy note */}
                      {d.strategyNote && (
                        <div className="flex items-start gap-2 text-xs bg-brand-tint/50 rounded-lg p-2.5">
                          <Sparkles className="w-3.5 h-3.5 text-brand flex-shrink-0 mt-0.5" />
                          <span className="text-ink-2">{d.strategyNote}</span>
                        </div>
                      )}

                      {/* Hashtags */}
                      {d.hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {d.hashtags.map(h => (
                            <span key={h} className="text-[11px] bg-ink-6 text-ink-3 px-1.5 py-0.5 rounded">#{h}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Version note */}
                  {d.versionNote && (
                    <div className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {d.versionNote}
                    </div>
                  )}

                  {/* Overdue impact */}
                  {d.overdueImpact && (
                    <div className="text-xs text-red-600 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {d.overdueImpact}
                    </div>
                  )}

                  {/* Feedback summary (for changes_requested) */}
                  {d.feedbackSummary && d.status === 'changes_requested' && (
                    <div className="text-xs text-red-600 mt-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
                      <span className="font-medium">Feedback:</span> {d.feedbackSummary}
                    </div>
                  )}

                  {/* Creator + actions row */}
                  <div className="flex items-center justify-between mt-3 gap-2 flex-wrap">
                    <span className="text-xs text-ink-4">By {d.createdBy} · {d.createdByRole}</span>
                    <div className="flex items-center gap-1.5">
                      {isPending && (
                        <>
                          <button
                            onClick={() => approveOne(d.id)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg transition-colors"
                          >
                            <Check className="w-3 h-3" /> Approve
                          </button>
                          <button
                            onClick={() => { setEditOpen(d.id); setEditCaption(d.caption); setEditSchedule(d.scheduledFor || '') }}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-ink-6 text-ink-2 text-xs font-medium rounded-lg hover:bg-bg-2 transition-colors"
                          >
                            <Pen className="w-3 h-3" /> Edit
                          </button>
                          <button
                            onClick={() => { setFeedbackOpen(isFeedbackOpen ? null : d.id); setFeedbackText(''); setFeedbackCategories(new Set()); setFeedbackPriority('normal') }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-xs font-medium rounded-lg transition-colors ${
                              isFeedbackOpen ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-ink-6 text-ink-2 hover:bg-bg-2'
                            }`}
                          >
                            <RotateCcw className="w-3 h-3" /> Changes
                          </button>
                          <button
                            onClick={() => {
                              const isOpen = rescheduleOpen === d.id
                              setRescheduleOpen(isOpen ? null : d.id)
                              if (!isOpen) {
                                setRescheduleDate('')
                                setRescheduleTime('')
                                setRescheduleReason('')
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-2.5 py-1.5 border text-xs font-medium rounded-lg transition-colors ${
                              rescheduleOpen === d.id ? 'bg-blue-50 border-blue-200 text-blue-700' : 'bg-white border-ink-6 text-ink-2 hover:bg-bg-2'
                            }`}
                          >
                            <Calendar className="w-3 h-3" /> Reschedule
                          </button>
                        </>
                      )}
                      <Link
                        href={`/dashboard/approvals/${d.id}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-ink-6 text-ink-3 text-xs font-medium rounded-lg hover:bg-bg-2 hover:text-ink-2 transition-colors"
                      >
                        <Eye className="w-3 h-3" /> Details
                      </Link>
                    </div>
                  </div>
                </div>
              </div>

              {/* --- Feedback inline expand --- */}
              {isFeedbackOpen && (
                <div className="border-t border-ink-6 p-4 bg-bg-2 space-y-3">
                  <div className="text-sm font-medium text-ink">Request Changes</div>
                  <div className="flex flex-wrap gap-1.5">
                    {fbCategories.map(cat => (
                      <button
                        key={cat}
                        onClick={() => setFeedbackCategories(s => {
                          const n = new Set(s)
                          n.has(cat) ? n.delete(cat) : n.add(cat)
                          return n
                        })}
                        className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                          feedbackCategories.has(cat) ? 'bg-red-50 border-red-200 text-red-700' : 'bg-white border-ink-6 text-ink-3 hover:border-ink-5'
                        }`}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-ink-4">Priority:</span>
                    <button onClick={() => setFeedbackPriority('normal')} className={`text-xs px-2 py-0.5 rounded ${feedbackPriority === 'normal' ? 'bg-ink-6 text-ink font-medium' : 'text-ink-4'}`}>Normal</button>
                    <button onClick={() => setFeedbackPriority('urgent')} className={`text-xs px-2 py-0.5 rounded ${feedbackPriority === 'urgent' ? 'bg-red-50 text-red-700 font-medium' : 'text-ink-4'}`}>Urgent</button>
                  </div>
                  <textarea
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                    placeholder="Describe what needs to change..."
                    className="w-full border border-ink-6 rounded-lg p-2.5 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => requestChanges(d.id)}
                      disabled={!feedbackText.trim()}
                      className="px-4 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Submit Feedback
                    </button>
                    <button onClick={() => setFeedbackOpen(null)} className="px-3 py-1.5 text-sm text-ink-3 hover:text-ink-2">Cancel</button>
                  </div>
                </div>
              )}

              {/* --- Edit modal (slide-up panel) --- */}
              {isEditOpen && (
                <div className="border-t border-ink-6 p-4 bg-bg-2 space-y-3">
                  <div className="text-sm font-medium text-ink">Edit & Approve</div>
                  <div>
                    <label className="text-xs text-ink-4 mb-1 block">Caption</label>
                    <textarea
                      value={editCaption}
                      onChange={e => setEditCaption(e.target.value)}
                      className="w-full border border-ink-6 rounded-lg p-2.5 text-sm min-h-[80px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-ink-4 mb-1 block">Schedule</label>
                    <input
                      type="text"
                      value={editSchedule}
                      onChange={e => setEditSchedule(e.target.value)}
                      placeholder="e.g. Thursday, Mar 26 at 10:00 AM"
                      className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => saveAndApprove(d.id)}
                      className="px-4 py-1.5 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Save & Approve
                    </button>
                    <button onClick={() => setEditOpen(null)} className="px-3 py-1.5 text-sm text-ink-3 hover:text-ink-2">Cancel</button>
                  </div>
                </div>
              )}

              {/* --- Reschedule panel --- */}
              {rescheduleOpen === d.id && (
                <div className="border-t border-blue-200 p-4 bg-blue-50/30 space-y-3">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-medium text-ink">Reschedule Post</span>
                  </div>
                  {d.scheduledFor && (
                    <div className="text-xs text-ink-4 bg-white rounded-lg px-3 py-2 border border-ink-6">
                      Currently scheduled: <span className="font-medium text-ink-2">{d.scheduledFor}</span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <div>
                      <label className="text-xs text-ink-4 mb-1 block">New Date *</label>
                      <input
                        type="date"
                        value={rescheduleDate}
                        onChange={e => setRescheduleDate(e.target.value)}
                        className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-ink-4 mb-1 block">New Time</label>
                      <input
                        type="time"
                        value={rescheduleTime}
                        onChange={e => setRescheduleTime(e.target.value)}
                        className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="text-xs text-ink-4 mb-1 block">Reason (optional)</label>
                    <input
                      type="text"
                      value={rescheduleReason}
                      onChange={e => setRescheduleReason(e.target.value)}
                      placeholder="e.g. Conflict with event, want to post after holiday..."
                      className="w-full border border-ink-6 rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 focus:border-blue-400"
                    />
                  </div>
                  {d.platforms.length > 1 && (
                    <div className="text-xs text-blue-600 bg-blue-50 rounded-lg px-3 py-2 border border-blue-100">
                      📋 This will reschedule across all {d.platforms.length} platforms
                    </div>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => rescheduleItem(d.id)}
                      disabled={!rescheduleDate}
                      className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
                    >
                      Confirm Reschedule
                    </button>
                    <button onClick={() => setRescheduleOpen(null)} className="px-3 py-1.5 text-sm text-ink-3 hover:text-ink-2">Cancel</button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ========= AUTO-APPROVE SETTINGS ========= */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        <button
          onClick={() => setSettingsOpen(!settingsOpen)}
          className="w-full flex items-center justify-between px-4 py-3 text-sm text-ink-3 hover:bg-bg-2 transition-colors"
        >
          <div className="flex items-center gap-2">
            <Settings2 className="w-4 h-4" />
            <span className="font-medium">Auto-Approve Settings</span>
          </div>
          {settingsOpen ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
        {settingsOpen && (
          <div className="border-t border-ink-6 p-4 space-y-4">
            {[
              { label: 'Auto-approve Stories', desc: 'Automatically approve story content that follows your brand templates.', value: autoStory, set: setAutoStory },
              { label: 'Auto-approve recurring posts', desc: 'Recurring series (Recipe Tuesday, etc.) get approved automatically after the first approval.', value: autoRecurring, set: setAutoRecurring },
              { label: 'Trust mode', desc: 'Skip approval for all content from verified team members. Not recommended.', value: trustMode, set: setTrustMode },
            ].map(s => (
              <div key={s.label} className="flex items-start justify-between gap-4">
                <div>
                  <div className="text-sm font-medium text-ink">{s.label}</div>
                  <div className="text-xs text-ink-4 mt-0.5">{s.desc}</div>
                </div>
                <button onClick={() => s.set(!s.value)} className="flex-shrink-0 mt-0.5">
                  {s.value
                    ? <ToggleRight className="w-8 h-8 text-brand" />
                    : <ToggleLeft className="w-8 h-8 text-ink-5" />
                  }
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========= BATCH APPROVE BAR (sticky bottom) ========= */}
      {selected.size > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-ink-6 shadow-lg px-4 py-3 lg:pl-[276px]">
          <div className="max-w-5xl mx-auto flex items-center justify-between">
            <span className="text-sm font-medium text-ink">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <button onClick={() => setSelected(new Set())} className="text-sm text-ink-3 hover:text-ink-2 px-3 py-1.5">Clear</button>
              <button
                onClick={() => setBatchConfirmOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Check className="w-3.5 h-3.5" /> Approve All
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========= BATCH CONFIRM MODAL ========= */}
      {batchConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-4">
            <h3 className="font-[family-name:var(--font-display)] text-lg text-ink">Confirm Batch Approval</h3>
            <p className="text-sm text-ink-3">You are about to approve {selected.size} item{selected.size > 1 ? 's' : ''}:</p>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {deliverables.filter(d => selected.has(d.id)).map(d => (
                <li key={d.id} className="flex items-center justify-between text-sm bg-bg-2 rounded-lg px-3 py-2">
                  <span className="text-ink font-medium truncate">{d.title}</span>
                  {d.scheduledFor && <span className="text-xs text-ink-4 flex-shrink-0 ml-2">{d.scheduledFor}</span>}
                </li>
              ))}
            </ul>
            <div className="flex gap-2 justify-end pt-2">
              <button onClick={() => setBatchConfirmOpen(false)} className="px-4 py-2 text-sm text-ink-3 hover:text-ink-2">Cancel</button>
              <button
                onClick={batchApprove}
                className="px-5 py-2 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors"
              >
                Approve {selected.size} Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========= TOAST ========= */}
      {toast && (
        <Toast
          message={toast.message}
          onUndo={() => { toast.undoFn(); setToast(null) }}
          onDismiss={() => setToast(null)}
        />
      )}

      {/* Spacer for sticky bottom bar */}
      {selected.size > 0 && <div className="h-16" />}

      {/* Slide-up animation */}
      <style jsx global>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translate(-50%, 20px); }
          to { opacity: 1; transform: translate(-50%, 0); }
        }
        .animate-slide-up { animation: slide-up 0.2s ease-out; }
      `}</style>
    </div>
  )
}
