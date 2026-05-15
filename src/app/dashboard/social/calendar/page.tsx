'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus,
  Check, X, Eye, Loader2, AlertTriangle, MessageSquare, RefreshCw,
  Image as ImageIcon, Film, Send, Compass, Zap, ChevronRight as ChevronRightIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { useRealtimeRefresh } from '@/lib/realtime'
import { submitClientFeedback } from '@/lib/client-portal-actions'
import CalendarGrid, { type CalendarEntryWithBusiness } from '@/components/calendar/CalendarGrid'
import type { ContentQueueItem, ContentQueueDraft, CalendarNote, Platform } from '@/types/database'
import EmptyState from '@/components/ui/empty-state'

const STATUS_FILTER_OPTIONS = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'in_review', label: 'Pending approval' },
  { id: 'posted', label: 'Published' },
]

const PLATFORM_ICONS: Record<string, string> = {
  instagram: '📸', tiktok: '🎬', facebook: '📘', linkedin: '💼', youtube: '▶️',
}

export default function SocialCalendarPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntryWithBusiness | null>(null)
  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [calendarNotes, setCalendarNotes] = useState<CalendarNote[]>([])
  const [loading, setLoading] = useState(true)

  // Filters
  const [statusFilter, setStatusFilter] = useState('all')
  const [platformFilter, setPlatformFilter] = useState('all')

  // Approve from modal
  const [approving, setApproving] = useState(false)
  const [approveError, setApproveError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [queueRes, notesRes] = await Promise.all([
      supabase
        .from('content_queue')
        .select('*')
        .eq('client_id', client.id)
        .eq('service_area', 'social')
        .not('scheduled_for', 'is', null)
        .order('scheduled_for', { ascending: true }),
      supabase
        .from('calendar_notes')
        .select('*')
        .eq('client_id', client.id)
        .order('note_date', { ascending: true }),
    ])

    setRequests((queueRes.data ?? []) as ContentQueueItem[])
    setCalendarNotes((notesRes.data ?? []) as CalendarNote[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['content_queue', 'calendar_notes'] as never[], load)

  // Transform to calendar entries with filtering
  const entries: CalendarEntryWithBusiness[] = useMemo(() => {
    return requests
      .filter(r => {
        if (!r.scheduled_for) return false
        if (statusFilter !== 'all') {
          const calStatus = r.status === 'posted' ? 'posted' : r.status === 'scheduled' || r.status === 'approved' ? 'scheduled' : r.status === 'in_review' ? 'in_review' : null
          if (calStatus !== statusFilter) return false
        }
        if (platformFilter !== 'all' && r.platform !== platformFilter) return false
        return true
      })
      .map(r => ({
        id: r.id,
        business_id: r.client_id,
        platform: (r.platform as Platform) || 'instagram',
        title: r.input_text?.slice(0, 60) || 'Untitled post',
        caption: r.drafts[r.selected_draft ?? 0]?.caption,
        scheduled_at: r.scheduled_for!,
        status: r.status === 'posted' ? 'published' as const : r.status === 'scheduled' || r.status === 'approved' ? 'scheduled' as const : 'draft' as const,
        created_at: r.created_at,
      }))
  }, [requests, statusFilter, platformFilter])

  // Stats
  const thisWeekStart = new Date()
  thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay())
  thisWeekStart.setHours(0, 0, 0, 0)
  const thisWeekEnd = new Date(thisWeekStart)
  thisWeekEnd.setDate(thisWeekEnd.getDate() + 7)

  const scheduledThisWeek = requests.filter(r =>
    r.scheduled_for && new Date(r.scheduled_for) >= thisWeekStart && new Date(r.scheduled_for) < thisWeekEnd &&
    ['scheduled', 'approved', 'in_review'].includes(r.status)
  ).length

  const platforms = Array.from(new Set(requests.map(r => r.platform).filter(Boolean)))
  const failedPosts = requests.filter(r => r.failed_reason)

  // Notes for current month
  const monthNotes = calendarNotes.filter(n => {
    const d = new Date(n.note_date)
    return d.getMonth() === month && d.getFullYear() === year
  })

  function goPrev() {
    if (month === 0) { setYear(year - 1); setMonth(11) } else setMonth(month - 1)
  }
  function goNext() {
    if (month === 11) { setYear(year + 1); setMonth(0) } else setMonth(month + 1)
  }
  function goToday() {
    setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDate(today)
  }

  // Find the full request for the selected entry
  const selectedRequest = selectedEntry ? requests.find(r => r.id === selectedEntry.id) : null
  const selectedDraft: ContentQueueDraft | null = selectedRequest?.selected_draft != null && selectedRequest.drafts[selectedRequest.selected_draft]
    ? selectedRequest.drafts[selectedRequest.selected_draft] as ContentQueueDraft : null

  async function handleApproveFromModal() {
    if (!selectedRequest) return
    setApproving(true)
    setApproveError(null)
    const result = await submitClientFeedback(selectedRequest.id, 'approval')
    setApproving(false)
    if (result.success) {
      setSelectedEntry(null)
      load()
    } else {
      // Keep the modal open and surface the error so the user knows the
      // approval didn't land -- previously the modal closed regardless.
      setApproveError(result.error || 'Approval failed. Please try again.')
    }
  }

  // Clear any approval error when the user opens a different entry
  useEffect(() => {
    setApproveError(null)
  }, [selectedEntry?.id])

  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-[1100px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Social
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
            <CalendarIcon className="w-6 h-6 text-ink-4" />
            Calendar
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">When your social posts are scheduled to go live.</p>
        </div>
        <Link
          href="/dashboard/social/requests/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm shadow-brand/20"
        >
          <Plus className="w-3.5 h-3.5" /> Request a post
        </Link>
      </div>

      {/* Discovery rail -- Plan + Boost live under the Calendar umbrella
         per the sub-nav, so surface them right here for clients who
         haven't memorized the URLs. */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Link
          href="/dashboard/social/plan"
          className="group flex items-center gap-3 rounded-xl bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm px-4 py-3 transition-all"
        >
          <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700 ring-1 ring-amber-100 flex-shrink-0">
            <Compass className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink leading-tight">Editorial plan</p>
            <p className="text-[11.5px] text-ink-3 leading-tight mt-0.5">This month&apos;s theme and content pillars</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-ink-4 group-hover:text-ink-2 flex-shrink-0" />
        </Link>
        <Link
          href="/dashboard/social/boost"
          className="group flex items-center gap-3 rounded-xl bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm px-4 py-3 transition-all"
        >
          <span className="w-9 h-9 rounded-lg flex items-center justify-center bg-violet-50 text-violet-700 ring-1 ring-violet-100 flex-shrink-0">
            <Zap className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[13px] font-semibold text-ink leading-tight">Boost a post</p>
            <p className="text-[11.5px] text-ink-3 leading-tight mt-0.5">Put paid reach behind your best content</p>
          </div>
          <ChevronRightIcon className="w-4 h-4 text-ink-4 group-hover:text-ink-2 flex-shrink-0" />
        </Link>
      </div>

      {/* Failed post alert */}
      {failedPosts.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-red-900">
              {failedPosts.length} {failedPosts.length === 1 ? 'post' : 'posts'} failed to publish
            </p>
            <p className="text-xs text-red-700 mt-0.5">
              Your account manager has been notified and is working on it.
            </p>
          </div>
        </div>
      )}

      {/* Summary + filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {scheduledThisWeek > 0
            ? `${scheduledThisWeek} ${scheduledThisWeek === 1 ? 'post' : 'posts'} scheduled this week across ${platforms.length} ${platforms.length === 1 ? 'platform' : 'platforms'}`
            : 'No posts scheduled this week'}
        </p>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value)}
            className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
          >
            {STATUS_FILTER_OPTIONS.map(o => (
              <option key={o.id} value={o.id}>{o.label}</option>
            ))}
          </select>
          {platforms.length > 1 && (
            <select
              value={platformFilter}
              onChange={e => setPlatformFilter(e.target.value)}
              className="text-xs border border-ink-6 rounded-lg px-2.5 py-1.5 text-ink-2 bg-white"
            >
              <option value="all">All platforms</option>
              {platforms.map(p => (
                <option key={p!} value={p!}>{PLATFORM_ICONS[p!] || ''} {p}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-ink-6 px-4 py-3">
        <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{monthName}</h2>
          <button onClick={goToday} className="text-xs font-medium text-brand hover:text-brand-dark px-2 py-1 rounded transition-colors">
            Today
          </button>
        </div>
        <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      {loading || clientLoading ? (
        <div className="bg-white rounded-xl border border-ink-6 p-5 h-96 animate-pulse" />
      ) : entries.length === 0 && monthNotes.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6">
          <EmptyState
            icon={CalendarIcon}
            title="No posts on the calendar"
            description="Approved posts will show up here with their scheduled date."
          />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-ink-6 p-4">
          <CalendarGrid
            entries={entries}
            year={year}
            month={month}
            selectedDate={selectedDate}
            onSelectDate={setSelectedDate}
            onSelectEntry={setSelectedEntry}
          />
        </div>
      )}

      {/* Calendar notes for this month */}
      {monthNotes.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-ink mb-2 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-ink-4" /> Team notes this month
          </h3>
          <div className="space-y-2">
            {monthNotes.map(note => (
              <div key={note.id} className="bg-brand-tint/30 border border-brand/15 rounded-xl p-3 flex items-start gap-3">
                <div className="text-[10px] font-bold text-brand-dark bg-white rounded px-1.5 py-0.5 flex-shrink-0 mt-0.5">
                  {new Date(note.note_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                </div>
                <p className="text-sm text-ink-2">{note.note_text}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Post detail modal */}
      {selectedEntry && selectedRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedEntry(null)} />
          <div className="relative bg-white rounded-2xl border border-ink-6 shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Modal header */}
            <div className="px-5 py-4 border-b border-ink-6 flex items-center justify-between">
              <div>
                <h3 className="font-[family-name:var(--font-display)] text-lg text-ink">{selectedEntry.title}</h3>
                <p className="text-[10px] text-ink-4 uppercase tracking-wide mt-0.5">
                  {new Date(selectedEntry.scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                  {' · '}
                  <span className="capitalize">{selectedEntry.platform}</span>
                  {' · '}
                  <span className={
                    selectedEntry.status === 'published' ? 'text-emerald-600' :
                    selectedEntry.status === 'scheduled' ? 'text-indigo-600' : 'text-amber-600'
                  }>
                    {selectedEntry.status === 'published' ? 'Published' : selectedEntry.status === 'scheduled' ? 'Scheduled' : 'Pending approval'}
                  </span>
                </p>
              </div>
              <button onClick={() => setSelectedEntry(null)} className="text-ink-4 hover:text-ink">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Draft preview */}
            {selectedDraft?.image_url && (
              <div className="bg-bg-2 flex items-center justify-center p-4">
                {selectedRequest.content_format === 'short_form_video' ? (
                  <video src={selectedDraft.image_url} controls playsInline className="max-h-64 rounded-lg bg-black" />
                ) : (
                  <img src={selectedDraft.image_url} alt="" className="max-h-64 rounded-lg object-contain" />
                )}
              </div>
            )}

            {/* Caption */}
            {selectedDraft?.caption && (
              <div className="px-5 py-3">
                <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed line-clamp-4">
                  {selectedDraft.caption}
                </p>
              </div>
            )}

            {/* Approval error banner -- shows when submitClientFeedback fails
                so the user knows to retry instead of assuming it worked */}
            {approveError && (
              <div className="mx-5 mb-3 rounded-lg bg-red-50 border border-red-200 p-3 text-[12px] text-red-800 flex items-start gap-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                <span>{approveError}</span>
              </div>
            )}

            {/* Actions */}
            <div className="px-5 py-4 border-t border-ink-6 flex items-center justify-between">
              <Link
                href={`/dashboard/social/requests/${selectedEntry.id}`}
                className="text-sm font-medium text-brand hover:text-brand-dark transition-colors"
              >
                View full request →
              </Link>
              <div className="flex items-center gap-2">
                {selectedRequest.status === 'in_review' && (
                  <button
                    onClick={handleApproveFromModal}
                    disabled={approving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-3 py-1.5 flex items-center gap-1 transition-colors disabled:opacity-50"
                  >
                    {approving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                    Approve
                  </button>
                )}
                <button
                  onClick={() => setSelectedEntry(null)}
                  className="text-sm text-ink-3 hover:text-ink transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
