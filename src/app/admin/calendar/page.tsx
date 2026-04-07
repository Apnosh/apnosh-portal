'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import {
  ChevronLeft, ChevronRight, X, Plus, Trash2, Calendar as CalendarIcon, AlertTriangle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { createCalendarEntry, updateCalendarEntry, deleteCalendarEntry } from '@/lib/actions'
import CalendarGrid, {
  PLATFORM_EMOJI,
  PLATFORM_COLORS,
  STATUS_COLORS,
  PLATFORMS,
  type CalendarEntryWithBusiness,
} from '@/components/calendar/CalendarGrid'
// Types are re-exported from CalendarGrid

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

const STATUS_OPTIONS = ['all', 'draft', 'scheduled', 'published', 'failed'] as const

const CLIENT_COLORS = [
  { bg: 'bg-violet-50', text: 'text-violet-700' },
  { bg: 'bg-teal-50', text: 'text-teal-700' },
  { bg: 'bg-orange-50', text: 'text-orange-700' },
  { bg: 'bg-rose-50', text: 'text-rose-700' },
  { bg: 'bg-sky-50', text: 'text-sky-700' },
  { bg: 'bg-lime-50', text: 'text-lime-700' },
  { bg: 'bg-fuchsia-50', text: 'text-fuchsia-700' },
  { bg: 'bg-amber-50', text: 'text-amber-700' },
]

function formatTime(dateStr: string) {
  return new Date(dateStr).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface BusinessOption {
  id: string
  name: string
}

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function AdminCalendar() {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())

  // Filters
  const [clientFilter, setClientFilter] = useState<string>('all')
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Data
  const [entries, setEntries] = useState<CalendarEntryWithBusiness[]>([])
  const [businesses, setBusinesses] = useState<BusinessOption[]>([])
  const [loading, setLoading] = useState(true)

  // Selection
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntryWithBusiness | null>(null)

  // Modal
  const [showModal, setShowModal] = useState(false)
  const [editEntry, setEditEntry] = useState<CalendarEntryWithBusiness | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState(false)

  // Form state
  const [formBusinessId, setFormBusinessId] = useState('')
  const [formPlatform, setFormPlatform] = useState<string>('instagram')
  const [formTitle, setFormTitle] = useState('')
  const [formCaption, setFormCaption] = useState('')
  const [formScheduledAt, setFormScheduledAt] = useState('')
  const [formStatus, setFormStatus] = useState<string>('scheduled')

  // Fetch businesses
  useEffect(() => {
    const supabase = createClient()
    supabase.from('businesses').select('id, name').order('name').then(({ data }) => {
      setBusinesses((data as BusinessOption[]) || [])
    })
  }, [])

  // Fetch entries
  const fetchEntries = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const rangeStart = new Date(year, month, 1).toISOString()
    const rangeEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString()

    let query = supabase
      .from('content_calendar')
      .select('*, businesses!inner(name)')
      .gte('scheduled_at', rangeStart)
      .lte('scheduled_at', rangeEnd)
      .order('scheduled_at', { ascending: true })

    if (clientFilter !== 'all') {
      query = query.eq('business_id', clientFilter)
    }
    if (platformFilter !== 'all') {
      query = query.eq('platform', platformFilter)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query

    const mapped: CalendarEntryWithBusiness[] = (data || []).map((row: Record<string, unknown>) => {
      const biz = row.businesses as { name: string } | null
      return {
        ...row,
        business_name: biz?.name || 'Unknown',
      } as CalendarEntryWithBusiness
    })

    setEntries(mapped)
    setLoading(false)
  }, [year, month, clientFilter, platformFilter, statusFilter])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Client color map
  const clientColorMap = useMemo(() => {
    const map: Record<string, string> = {}
    const uniqueNames = [...new Set(entries.map((e) => e.business_name).filter(Boolean))]
    uniqueNames.forEach((name, i) => {
      const c = CLIENT_COLORS[i % CLIENT_COLORS.length]
      map[name!] = `${c.bg} ${c.text}`
    })
    return map
  }, [entries])

  // Gap detection
  const contentGaps = useMemo(() => {
    const daysInMonth = getDaysInMonth(year, month)
    const clientNames = businesses.map((b) => b.name)
    const gaps: { client: string; days: number[] }[] = []

    clientNames.forEach((clientName) => {
      const clientEntries = entries.filter((e) => e.business_name === clientName)
      const daysWithContent = new Set(clientEntries.map((e) => new Date(e.scheduled_at).getDate()))
      const missingDays: number[] = []

      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(year, month, d)
        const dow = date.getDay()
        // Only flag weekdays with no content
        if (dow !== 0 && dow !== 6 && !daysWithContent.has(d)) {
          missingDays.push(d)
        }
      }

      if (missingDays.length > 0) {
        gaps.push({ client: clientName, days: missingDays })
      }
    })

    return gaps
  }, [entries, businesses, year, month])

  // Navigation
  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
    setSelectedDate(null)
  }
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
    setSelectedDate(null)
  }

  // Open create modal
  const openCreateModal = () => {
    setEditEntry(null)
    setFormBusinessId(businesses[0]?.id || '')
    setFormPlatform('instagram')
    setFormTitle('')
    setFormCaption('')
    setFormScheduledAt('')
    setFormStatus('scheduled')
    setDeleteConfirm(false)
    setShowModal(true)
  }

  // Open edit modal
  const openEditModal = (entry: CalendarEntryWithBusiness) => {
    setEditEntry(entry)
    setFormBusinessId(entry.business_id)
    setFormPlatform(entry.platform)
    setFormTitle(entry.title)
    setFormCaption(entry.caption || '')
    // Format for datetime-local input
    const dt = new Date(entry.scheduled_at)
    const pad = (n: number) => String(n).padStart(2, '0')
    setFormScheduledAt(`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`)
    setFormStatus(entry.status)
    setDeleteConfirm(false)
    setShowModal(true)
    setSelectedEntry(null)
  }

  // Save
  const handleSave = async () => {
    setSaving(true)
    if (editEntry) {
      await updateCalendarEntry(editEntry.id, {
        platform: formPlatform,
        title: formTitle,
        caption: formCaption,
        scheduledAt: formScheduledAt ? new Date(formScheduledAt).toISOString() : undefined,
        status: formStatus,
      })
    } else {
      await createCalendarEntry({
        businessId: formBusinessId,
        platform: formPlatform,
        title: formTitle,
        caption: formCaption || undefined,
        scheduledAt: formScheduledAt ? new Date(formScheduledAt).toISOString() : new Date().toISOString(),
      })
    }
    setSaving(false)
    setShowModal(false)
    fetchEntries()
  }

  // Delete
  const handleDelete = async () => {
    if (!editEntry) return
    setSaving(true)
    await deleteCalendarEntry(editEntry.id)
    setSaving(false)
    setShowModal(false)
    fetchEntries()
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6 text-brand" />
          <h1 className="text-2xl font-bold text-ink">Content Calendar</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreateModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors"
          >
            <Plus className="w-4 h-4" /> New Entry
          </button>
          <button className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-ink-6 text-ink text-sm font-medium rounded-xl hover:bg-bg-2 transition-colors opacity-50 cursor-not-allowed" disabled>
            Bulk Schedule
          </button>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Month nav */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-ink-6 px-3 py-1.5">
          <button onClick={prevMonth} className="p-1 hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-ink-3" />
          </button>
          <span className="text-sm font-semibold text-ink min-w-[140px] text-center">
            {MONTH_NAMES[month]} {year}
          </span>
          <button onClick={nextMonth} className="p-1 hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-ink-3" />
          </button>
        </div>

        {/* Client filter */}
        <select
          value={clientFilter}
          onChange={(e) => setClientFilter(e.target.value)}
          className="bg-white border border-ink-6 rounded-xl px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">All Clients</option>
          {businesses.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>

        {/* Platform filter */}
        <select
          value={platformFilter}
          onChange={(e) => setPlatformFilter(e.target.value)}
          className="bg-white border border-ink-6 rounded-xl px-3 py-1.5 text-sm text-ink"
        >
          <option value="all">All Platforms</option>
          {PLATFORMS.map((p) => (
            <option key={p} value={p}>{PLATFORM_EMOJI[p]} {p.replace('_', ' ')}</option>
          ))}
        </select>

        {/* Status filter */}
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="bg-white border border-ink-6 rounded-xl px-3 py-1.5 text-sm text-ink"
        >
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>{s === 'all' ? 'All Statuses' : s.charAt(0).toUpperCase() + s.slice(1)}</option>
          ))}
        </select>
      </div>

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Calendar Grid */}
      {!loading && (
        <CalendarGrid
          entries={entries}
          year={year}
          month={month}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectEntry={openEditModal}
          colorByClient
          clientColors={clientColorMap}
        />
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CalendarIcon className="w-10 h-10 text-ink-5 mx-auto mb-3" />
          <p className="text-sm text-ink-3">No content scheduled this month.</p>
          <button onClick={openCreateModal} className="mt-3 text-sm text-brand font-medium hover:underline">
            Create an entry
          </button>
        </div>
      )}

      {/* Content Gaps Section */}
      {!loading && contentGaps.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5 text-amber-500" />
            <h3 className="text-sm font-semibold text-ink">Content Gaps</h3>
          </div>
          <div className="space-y-3">
            {contentGaps.map((gap) => (
              <div key={gap.client} className="flex items-start gap-3">
                <span className="text-sm font-medium text-ink min-w-[120px]">{gap.client}</span>
                <div className="flex flex-wrap gap-1">
                  {gap.days.slice(0, 15).map((d) => (
                    <span key={d} className="text-[11px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                      {MONTH_NAMES[month].slice(0, 3)} {d}
                    </span>
                  ))}
                  {gap.days.length > 15 && (
                    <span className="text-[11px] text-ink-4">+{gap.days.length - 15} more days</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full max-h-[85vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-ink">{editEntry ? 'Edit Entry' : 'New Calendar Entry'}</h2>
                <button onClick={() => setShowModal(false)} className="p-1 hover:bg-bg-2 rounded-lg">
                  <X className="w-5 h-5 text-ink-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Client select (only for new entries) */}
                {!editEntry && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-4 mb-1.5">Client</label>
                    <select
                      value={formBusinessId}
                      onChange={(e) => setFormBusinessId(e.target.value)}
                      className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink"
                    >
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Platform */}
                <div>
                  <label className="block text-xs font-semibold text-ink-4 mb-1.5">Platform</label>
                  <select
                    value={formPlatform}
                    onChange={(e) => setFormPlatform(e.target.value)}
                    className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink"
                  >
                    {PLATFORMS.map((p) => (
                      <option key={p} value={p}>{PLATFORM_EMOJI[p]} {p.replace('_', ' ')}</option>
                    ))}
                  </select>
                </div>

                {/* Title */}
                <div>
                  <label className="block text-xs font-semibold text-ink-4 mb-1.5">Title</label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Post title..."
                    className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-5"
                  />
                </div>

                {/* Caption */}
                <div>
                  <label className="block text-xs font-semibold text-ink-4 mb-1.5">Caption</label>
                  <textarea
                    value={formCaption}
                    onChange={(e) => setFormCaption(e.target.value)}
                    placeholder="Post caption..."
                    rows={3}
                    className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink placeholder:text-ink-5 resize-none"
                  />
                </div>

                {/* Scheduled date/time */}
                <div>
                  <label className="block text-xs font-semibold text-ink-4 mb-1.5">Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    value={formScheduledAt}
                    onChange={(e) => setFormScheduledAt(e.target.value)}
                    className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink"
                  />
                </div>

                {/* Status (edit only) */}
                {editEntry && (
                  <div>
                    <label className="block text-xs font-semibold text-ink-4 mb-1.5">Status</label>
                    <select
                      value={formStatus}
                      onChange={(e) => setFormStatus(e.target.value)}
                      className="w-full bg-white border border-ink-6 rounded-xl px-3 py-2 text-sm text-ink"
                    >
                      <option value="draft">Draft</option>
                      <option value="scheduled">Scheduled</option>
                      <option value="published">Published</option>
                      <option value="failed">Failed</option>
                    </select>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-between mt-6 pt-4 border-t border-ink-6">
                {editEntry ? (
                  <div>
                    {deleteConfirm ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-red-600">Are you sure?</span>
                        <button
                          onClick={handleDelete}
                          disabled={saving}
                          className="text-xs font-medium text-red-600 hover:underline"
                        >
                          Yes, delete
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          className="text-xs text-ink-4 hover:underline"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(true)}
                        className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Delete
                      </button>
                    )}
                  </div>
                ) : (
                  <div />
                )}
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowModal(false)}
                    className="px-4 py-2 text-sm text-ink-3 hover:text-ink transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !formTitle || !formScheduledAt}
                    className="px-4 py-2 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : editEntry ? 'Update' : 'Create'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
