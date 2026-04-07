'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  ChevronLeft, ChevronRight, LayoutGrid, List, Filter,
  Clock, AlertTriangle, Calendar, X, Loader2
} from 'lucide-react'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

type DeliverableStatus =
  | 'draft'
  | 'in_progress'
  | 'internal_review'
  | 'client_review'
  | 'revision_requested'
  | 'approved'
  | 'scheduled'
  | 'published'

type DeliverableType =
  | 'graphic'
  | 'video'
  | 'caption'
  | 'email'
  | 'website_page'
  | 'seo'
  | 'branding'
  | 'photography'
  | 'other'

interface Deliverable {
  id: string
  work_brief_id: string | null
  business_id: string | null
  type: DeliverableType
  title: string
  description: string | null
  status: DeliverableStatus
  version: number
  created_at: string
  updated_at: string
  businesses: { name: string } | null
  work_briefs: { deadline: string | null } | null
}

/* ------------------------------------------------------------------ */
/*  Column config                                                      */
/* ------------------------------------------------------------------ */

const columns: { key: DeliverableStatus; label: string; dot: string }[] = [
  { key: 'draft',           label: 'Backlog',            dot: 'bg-ink-4' },
  { key: 'in_progress',     label: 'In Production',      dot: 'bg-blue-500' },
  { key: 'internal_review', label: 'Internal Review',    dot: 'bg-purple-500' },
  { key: 'client_review',   label: 'Client Review',      dot: 'bg-orange-500' },
  { key: 'approved',        label: 'Approved',           dot: 'bg-green-500' },
  { key: 'scheduled',       label: 'Scheduled / Published', dot: 'bg-teal-500' },
]

/** Statuses that belong in the last combined column */
const lastColumnStatuses: DeliverableStatus[] = ['scheduled', 'published']

function columnForStatus(s: DeliverableStatus): string {
  if (lastColumnStatuses.includes(s)) return 'scheduled'
  if (s === 'revision_requested') return 'client_review' // show revision_requested in client review
  return s
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const typeLabels: Record<DeliverableType, string> = {
  graphic: 'Graphic',
  video: 'Video',
  caption: 'Caption',
  email: 'Email',
  website_page: 'Website',
  seo: 'SEO',
  branding: 'Branding',
  photography: 'Photo',
  other: 'Other',
}

const typeBadgeColors: Record<DeliverableType, string> = {
  graphic:      'bg-purple-50 text-purple-700',
  video:        'bg-blue-50 text-blue-700',
  caption:      'bg-amber-50 text-amber-700',
  email:        'bg-emerald-50 text-emerald-700',
  website_page: 'bg-cyan-50 text-cyan-700',
  seo:          'bg-lime-50 text-lime-700',
  branding:     'bg-fuchsia-50 text-fuchsia-700',
  photography:  'bg-rose-50 text-rose-700',
  other:        'bg-ink-6 text-ink-3',
}

function dueInfo(dateStr: string | null | undefined) {
  if (!dateStr) return { label: 'No due date', cls: 'text-ink-4', icon: 'none' as const }
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0)
  const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
  if (diff < 0)   return { label: `${Math.abs(diff)}d overdue`, cls: 'text-red-600 text-xs font-medium', icon: 'overdue' as const }
  if (diff === 0)  return { label: 'Due today',                  cls: 'text-amber-600',                   icon: 'today' as const }
  return             { label: `Due in ${diff}d`,                 cls: 'text-ink-4',                        icon: 'upcoming' as const }
}

function statusLabel(s: DeliverableStatus) {
  if (s === 'published') return 'Published'
  if (s === 'revision_requested') return 'Revision Requested'
  return columns.find(c => c.key === s)?.label ?? s
}

/* ------------------------------------------------------------------ */
/*  Skeleton components                                                */
/* ------------------------------------------------------------------ */

function CardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-3 space-y-2.5 animate-pulse">
      <div className="flex items-center gap-1.5">
        <div className="h-4 w-14 bg-ink-6 rounded-full" />
      </div>
      <div className="h-4 w-3/4 bg-ink-6 rounded" />
      <div className="h-3 w-1/2 bg-ink-6 rounded" />
      <div className="flex items-center justify-between pt-1 border-t border-ink-6">
        <div className="h-3 w-16 bg-ink-6 rounded" />
        <div className="h-3 w-20 bg-ink-6 rounded" />
      </div>
    </div>
  )
}

function BoardSkeleton() {
  return (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6">
      {columns.map(col => (
        <div key={col.key} className="flex-shrink-0 w-[280px] lg:w-[calc((100%-60px)/6)] min-w-[240px]">
          <div className="bg-bg-2 rounded-xl p-3 space-y-2">
            <div className="h-4 w-24 bg-ink-6 rounded animate-pulse" />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>
      ))}
    </div>
  )
}

function ListSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-6">
              {['Title', 'Client', 'Type', 'Status', 'Due Date'].map(h => (
                <th key={h} className="text-left font-medium text-ink-4 text-xs px-5 py-3">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 6 }).map((_, i) => (
              <tr key={i} className="border-b border-ink-6 animate-pulse">
                <td className="px-5 py-3"><div className="h-4 w-40 bg-ink-6 rounded" /></td>
                <td className="px-5 py-3"><div className="h-4 w-24 bg-ink-6 rounded" /></td>
                <td className="px-5 py-3"><div className="h-4 w-16 bg-ink-6 rounded" /></td>
                <td className="px-5 py-3"><div className="h-4 w-24 bg-ink-6 rounded" /></td>
                <td className="px-5 py-3"><div className="h-4 w-20 bg-ink-6 rounded" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function PipelinePage() {
  const [deliverables, setDeliverables] = useState<Deliverable[]>([])
  const [loading, setLoading] = useState(true)
  const [movingId, setMovingId] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [view, setView] = useState<'board' | 'list'>('board')

  // Filters
  const [clientFilter, setClientFilter] = useState('All')
  const [typeFilter, setTypeFilter] = useState('All')
  const [statusFilter, setStatusFilter] = useState('All')
  const [dueDateFilter, setDueDateFilter] = useState('All')

  const supabase = createClient()

  /* ---------------------------------------------------------------- */
  /*  Fetch deliverables                                               */
  /* ---------------------------------------------------------------- */

  const fetchDeliverables = useCallback(async () => {
    const { data, error } = await supabase
      .from('deliverables')
      .select('id, work_brief_id, business_id, type, title, description, status, version, created_at, updated_at, businesses(name), work_briefs(deadline)')
      .order('updated_at', { ascending: false })

    if (error) {
      console.error('Failed to fetch deliverables:', error)
      return
    }
    const mapped = (data ?? []).map((d: Record<string, unknown>) => ({
      ...d,
      businesses: Array.isArray(d.businesses) ? d.businesses[0] ?? null : d.businesses ?? null,
      work_briefs: Array.isArray(d.work_briefs) ? d.work_briefs[0] ?? null : d.work_briefs ?? null,
    })) as Deliverable[]
    setDeliverables(mapped)
    setLoading(false)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchDeliverables()
  }, [fetchDeliverables])

  /* ---------------------------------------------------------------- */
  /*  Derived data                                                     */
  /* ---------------------------------------------------------------- */

  const uniqueClients = Array.from(
    new Set(deliverables.map(d => d.businesses?.name).filter(Boolean))
  ).sort() as string[]

  const allTypes = Array.from(
    new Set(deliverables.map(d => d.type))
  ).sort() as DeliverableType[]

  /* ---------------------------------------------------------------- */
  /*  Filters                                                          */
  /* ---------------------------------------------------------------- */

  const filtered = deliverables.filter(d => {
    if (clientFilter !== 'All' && d.businesses?.name !== clientFilter) return false
    if (typeFilter !== 'All' && d.type !== typeFilter) return false
    if (statusFilter !== 'All' && d.status !== statusFilter) return false
    if (dueDateFilter !== 'All') {
      const deadline = d.work_briefs?.deadline
      if (!deadline) return dueDateFilter === 'no_date'
      const today = new Date(); today.setHours(0, 0, 0, 0)
      const due = new Date(deadline); due.setHours(0, 0, 0, 0)
      const diff = Math.round((due.getTime() - today.getTime()) / 86_400_000)
      if (dueDateFilter === 'overdue' && diff >= 0) return false
      if (dueDateFilter === 'today' && diff !== 0) return false
      if (dueDateFilter === 'this_week' && (diff < 0 || diff > 7)) return false
      if (dueDateFilter === 'no_date' && deadline) return false
    }
    return true
  })

  const overdueCount = filtered.filter(d => {
    const deadline = d.work_briefs?.deadline
    if (!deadline) return false
    const due = new Date(deadline); due.setHours(0, 0, 0, 0)
    const today = new Date(); today.setHours(0, 0, 0, 0)
    return due < today
  }).length

  const hasFilters = clientFilter !== 'All' || typeFilter !== 'All' || statusFilter !== 'All' || dueDateFilter !== 'All'

  /* ---------------------------------------------------------------- */
  /*  Move card                                                        */
  /* ---------------------------------------------------------------- */

  // Toast state for auto-approve notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null)

  useEffect(() => {
    if (toastMessage) {
      const t = setTimeout(() => setToastMessage(null), 4000)
      return () => clearTimeout(t)
    }
  }, [toastMessage])

  const moveCard = async (id: string, direction: 'left' | 'right') => {
    const card = deliverables.find(d => d.id === id)
    if (!card) return

    const currentColKey = columnForStatus(card.status)
    const colIdx = columns.findIndex(c => c.key === currentColKey)
    const nextIdx = direction === 'right' ? colIdx + 1 : colIdx - 1
    if (nextIdx < 0 || nextIdx >= columns.length) return

    let newStatus = columns[nextIdx].key
    setMovingId(id)

    // Auto-approve check: when moving to client_review, check business preferences
    let autoApproved = false
    if (newStatus === 'client_review' && card.business_id) {
      try {
        const { data: biz } = await supabase
          .from('businesses')
          .select('approval_preferences')
          .eq('id', card.business_id)
          .single()

        if (biz?.approval_preferences) {
          const prefs = biz.approval_preferences as { auto_approve?: boolean; types?: Record<string, boolean> }
          const typeAutoApprove = prefs.types?.[card.type] === true
          if (prefs.auto_approve || typeAutoApprove) {
            newStatus = 'approved' as DeliverableStatus
            autoApproved = true
          }
        }
      } catch {
        // If lookup fails, proceed with client_review
      }
    }

    // Optimistic update
    setDeliverables(prev =>
      prev.map(d => (d.id === id ? { ...d, status: newStatus } : d))
    )
    setExpandedId(null)

    const updatePayload: Record<string, unknown> = { status: newStatus }
    if (autoApproved) {
      updatePayload.approved_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('deliverables')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      console.error('Failed to move deliverable:', error)
      // Revert on error
      setDeliverables(prev =>
        prev.map(d => (d.id === id ? { ...d, status: card.status } : d))
      )
    } else if (autoApproved) {
      setToastMessage(`Auto-approved: ${card.title} (client has auto-approve enabled for this content type)`)
    }

    setMovingId(null)
  }

  /* ---------------------------------------------------------------- */
  /*  Board view                                                       */
  /* ---------------------------------------------------------------- */

  const BoardView = () => (
    <div className="flex gap-3 overflow-x-auto pb-4 -mx-4 px-4 lg:-mx-6 lg:px-6 snap-x">
      {columns.map(col => {
        const colCards = filtered.filter(d => {
          if (col.key === 'scheduled') return lastColumnStatuses.includes(d.status)
          if (col.key === 'client_review') return d.status === 'client_review' || d.status === 'revision_requested'
          return d.status === col.key
        })
        return (
          <div key={col.key} className="flex-shrink-0 w-[280px] lg:w-[calc((100%-60px)/6)] min-w-[240px] flex flex-col snap-start">
            {/* Column header */}
            <div className="bg-bg-2 rounded-t-xl px-3 py-2.5 flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${col.dot}`} />
              <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">{col.label}</span>
              <span className="ml-auto text-xs font-medium text-ink-4 bg-white/70 rounded-full px-2 py-0.5">{colCards.length}</span>
            </div>

            {/* Card list */}
            <div className="flex-1 bg-bg-2 rounded-b-xl p-3 space-y-2 overflow-y-auto max-h-[calc(100vh-260px)] min-h-[200px]">
              {colCards.length === 0 && (
                <div className="text-center text-xs text-ink-4 py-8">No items</div>
              )}
              {colCards.map(card => {
                const deadline = card.work_briefs?.deadline
                const due = dueInfo(deadline)
                const isExpanded = expandedId === card.id
                const currentColKey = columnForStatus(card.status)
                const colIdx = columns.findIndex(c => c.key === currentColKey)
                const isMoving = movingId === card.id
                return (
                  <div
                    key={card.id}
                    className={`bg-white rounded-xl border transition-all cursor-pointer ${
                      isExpanded ? 'border-brand shadow-md' : 'border-ink-6 hover:border-ink-5 hover:shadow-sm'
                    } ${isMoving ? 'opacity-50' : ''}`}
                    onClick={() => setExpandedId(isExpanded ? null : card.id)}
                  >
                    <div className="p-3 space-y-2.5">
                      {/* Type badge + revision flag */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeColors[card.type]}`}>
                          {typeLabels[card.type]}
                        </span>
                        {card.status === 'revision_requested' && (
                          <span className="rounded-full px-2 py-0.5 text-[10px] font-medium bg-red-50 text-red-700">
                            Revision
                          </span>
                        )}
                      </div>

                      {/* Title */}
                      <div className="text-sm font-medium text-ink leading-snug">{card.title}</div>

                      {/* Client */}
                      <div className="text-xs text-ink-3">{card.businesses?.name ?? 'No client'}</div>

                      {/* Due date */}
                      <div className="flex items-center justify-between pt-1 border-t border-ink-6">
                        <div className={`flex items-center gap-1 text-[11px] font-medium ${due.cls}`}>
                          {due.icon === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                          {due.icon === 'today' && <Clock className="w-3 h-3" />}
                          {due.icon === 'upcoming' && <Calendar className="w-3 h-3" />}
                          {due.label}
                        </div>
                      </div>
                    </div>

                    {/* Expanded: move buttons */}
                    {isExpanded && (
                      <div className="border-t border-ink-6 px-3 py-2 flex items-center justify-between bg-bg-2 rounded-b-xl">
                        <button
                          disabled={colIdx === 0 || isMoving}
                          onClick={e => { e.stopPropagation(); moveCard(card.id, 'left') }}
                          className="flex items-center gap-1 text-xs font-medium text-ink-3 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Move Back
                        </button>
                        {isMoving && <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-4" />}
                        <button
                          disabled={colIdx === columns.length - 1 || isMoving}
                          onClick={e => { e.stopPropagation(); moveCard(card.id, 'right') }}
                          className="flex items-center gap-1 text-xs font-medium text-brand-dark hover:text-brand disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                        >
                          Move Forward <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  List view                                                        */
  /* ---------------------------------------------------------------- */

  const statusDot: Record<string, string> = {
    draft: 'bg-ink-4',
    in_progress: 'bg-blue-500',
    internal_review: 'bg-purple-500',
    client_review: 'bg-orange-500',
    revision_requested: 'bg-red-500',
    approved: 'bg-green-500',
    scheduled: 'bg-teal-500',
    published: 'bg-teal-500',
  }

  const ListView = () => (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-ink-6">
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Title</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Client</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Type</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Status</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3">Due Date</th>
              <th className="text-left font-medium text-ink-4 text-xs px-5 py-3 w-[120px]">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered
              .sort((a, b) => {
                const aDate = a.work_briefs?.deadline ?? '9999-12-31'
                const bDate = b.work_briefs?.deadline ?? '9999-12-31'
                return new Date(aDate).getTime() - new Date(bDate).getTime()
              })
              .map(card => {
                const deadline = card.work_briefs?.deadline
                const due = dueInfo(deadline)
                const currentColKey = columnForStatus(card.status)
                const colIdx = columns.findIndex(c => c.key === currentColKey)
                const isMoving = movingId === card.id
                return (
                  <tr key={card.id} className={`border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors ${isMoving ? 'opacity-50' : ''}`}>
                    <td className="px-5 py-3">
                      <span className="font-medium text-ink">{card.title}</span>
                    </td>
                    <td className="px-5 py-3 text-ink-3">{card.businesses?.name ?? '-'}</td>
                    <td className="px-5 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${typeBadgeColors[card.type]}`}>
                        {typeLabels[card.type]}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-1.5">
                        <span className={`w-2 h-2 rounded-full ${statusDot[card.status] ?? 'bg-ink-4'}`} />
                        <span className="text-xs font-medium text-ink-2">{statusLabel(card.status)}</span>
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`flex items-center gap-1 text-xs font-medium ${due.cls}`}>
                        {due.icon === 'overdue' && <AlertTriangle className="w-3 h-3" />}
                        {due.icon === 'today' && <Clock className="w-3 h-3" />}
                        {due.label}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-1">
                        <button
                          disabled={colIdx === 0 || isMoving}
                          onClick={() => moveCard(card.id, 'left')}
                          className="p-1 rounded hover:bg-ink-6 text-ink-4 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move back"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        {isMoving ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-4" />
                        ) : null}
                        <button
                          disabled={colIdx === columns.length - 1 || isMoving}
                          onClick={() => moveCard(card.id, 'right')}
                          className="p-1 rounded hover:bg-ink-6 text-ink-4 hover:text-ink disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                          title="Move forward"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-sm text-ink-4">
                  No deliverables found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )

  /* ---------------------------------------------------------------- */
  /*  Render                                                           */
  /* ---------------------------------------------------------------- */

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Production Pipeline</h1>
          <p className="text-ink-3 text-sm mt-1">Track deliverables from draft to publish.</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          {!loading && <span className="text-ink-3">{filtered.length} items</span>}
          {overdueCount > 0 && (
            <span className="flex items-center gap-1 text-red-600 font-medium">
              <AlertTriangle className="w-3 h-3" /> {overdueCount} overdue
            </span>
          )}
        </div>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {/* Client filter */}
        <div className="relative">
          <select
            value={clientFilter}
            onChange={e => setClientFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Clients</option>
            {uniqueClients.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <Filter className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Type filter */}
        <div className="relative">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Types</option>
            {allTypes.map(t => <option key={t} value={t}>{typeLabels[t]}</option>)}
          </select>
          <Filter className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Status filter */}
        <div className="relative">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="in_progress">In Production</option>
            <option value="internal_review">Internal Review</option>
            <option value="client_review">Client Review</option>
            <option value="revision_requested">Revision Requested</option>
            <option value="approved">Approved</option>
            <option value="scheduled">Scheduled</option>
            <option value="published">Published</option>
          </select>
          <Filter className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Due date filter */}
        <div className="relative">
          <select
            value={dueDateFilter}
            onChange={e => setDueDateFilter(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-xs text-ink-2 font-medium focus:outline-none focus:border-brand cursor-pointer"
          >
            <option value="All">All Dates</option>
            <option value="overdue">Overdue</option>
            <option value="today">Due Today</option>
            <option value="this_week">Due This Week</option>
            <option value="no_date">No Due Date</option>
          </select>
          <Calendar className="w-3 h-3 text-ink-4 absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        {/* Clear filters */}
        {hasFilters && (
          <button
            onClick={() => { setClientFilter('All'); setTypeFilter('All'); setStatusFilter('All'); setDueDateFilter('All') }}
            className="flex items-center gap-1 text-[11px] text-ink-4 hover:text-red-500 transition-colors"
          >
            <X className="w-3 h-3" /> Clear filters
          </button>
        )}

        <div className="flex-1" />

        {/* View toggle */}
        <div className="flex items-center border border-ink-6 rounded-lg overflow-hidden">
          <button
            onClick={() => setView('board')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'board' ? 'bg-ink text-white' : 'bg-white text-ink-3 hover:text-ink'
            }`}
          >
            <LayoutGrid className="w-3.5 h-3.5" /> Board
          </button>
          <button
            onClick={() => setView('list')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${
              view === 'list' ? 'bg-ink text-white' : 'bg-white text-ink-3 hover:text-ink'
            }`}
          >
            <List className="w-3.5 h-3.5" /> List
          </button>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        view === 'board' ? <BoardSkeleton /> : <ListSkeleton />
      ) : (
        view === 'board' ? <BoardView /> : <ListView />
      )}

      {/* Auto-approve toast */}
      {toastMessage && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-emerald-700 text-white px-5 py-3 rounded-xl shadow-xl flex items-center gap-2 text-sm max-w-lg">
          <span className="w-2 h-2 rounded-full bg-emerald-300 flex-shrink-0" />
          {toastMessage}
        </div>
      )}
    </div>
  )
}
