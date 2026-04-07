'use client'

import { useState, useEffect, useMemo, useCallback } from 'react'
import { ChevronLeft, ChevronRight, X, ExternalLink, Calendar as CalendarIcon } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useBusiness } from '@/lib/supabase/hooks'
import Link from 'next/link'
import CalendarGrid, {
  PLATFORM_EMOJI,
  PLATFORM_COLORS,
  STATUS_COLORS,
  PLATFORMS,
  type CalendarEntryWithBusiness,
} from '@/components/calendar/CalendarGrid'
import type { ContentCalendarEntry } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatTime(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatDate(dateStr: string) {
  const d = new Date(dateStr)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function getWeekDates(date: Date): Date[] {
  const start = new Date(date)
  start.setDate(start.getDate() - start.getDay())
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    days.push(d)
  }
  return days
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

/* ------------------------------------------------------------------ */
/*  Status filter values                                               */
/* ------------------------------------------------------------------ */
const STATUS_OPTIONS = ['all', 'draft', 'scheduled', 'published', 'failed'] as const

/* ------------------------------------------------------------------ */
/*  Page Component                                                     */
/* ------------------------------------------------------------------ */

export default function ClientCalendar() {
  const { data: business } = useBusiness()

  // Calendar navigation
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [view, setView] = useState<'month' | 'week'>('month')
  const [weekAnchor, setWeekAnchor] = useState(now)

  // Filters
  const [platformFilter, setPlatformFilter] = useState<string>('all')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  // Selection
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntryWithBusiness | null>(null)

  // Data
  const [entries, setEntries] = useState<ContentCalendarEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Fetch calendar entries for the displayed range
  const fetchEntries = useCallback(async () => {
    if (!business) return
    setLoading(true)
    const supabase = createClient()

    let rangeStart: string
    let rangeEnd: string

    if (view === 'month') {
      rangeStart = new Date(year, month, 1).toISOString()
      rangeEnd = new Date(year, month + 1, 0, 23, 59, 59).toISOString()
    } else {
      const weekDays = getWeekDates(weekAnchor)
      rangeStart = weekDays[0].toISOString()
      rangeEnd = new Date(weekDays[6].getFullYear(), weekDays[6].getMonth(), weekDays[6].getDate(), 23, 59, 59).toISOString()
    }

    let query = supabase
      .from('content_calendar')
      .select('*')
      .eq('business_id', business.id)
      .gte('scheduled_at', rangeStart)
      .lte('scheduled_at', rangeEnd)
      .order('scheduled_at', { ascending: true })

    if (platformFilter !== 'all') {
      query = query.eq('platform', platformFilter)
    }
    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter)
    }

    const { data } = await query
    setEntries((data as ContentCalendarEntry[]) || [])
    setLoading(false)
  }, [business, year, month, view, weekAnchor, platformFilter, statusFilter])

  useEffect(() => { fetchEntries() }, [fetchEntries])

  // Month navigation
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

  // Week navigation
  const prevWeek = () => {
    const d = new Date(weekAnchor)
    d.setDate(d.getDate() - 7)
    setWeekAnchor(d)
  }
  const nextWeek = () => {
    const d = new Date(weekAnchor)
    d.setDate(d.getDate() + 7)
    setWeekAnchor(d)
  }

  // Filter entries for selected date panel
  const selectedDayEntries = useMemo(() => {
    if (!selectedDate) return []
    return entries.filter((e) => {
      const d = new Date(e.scheduled_at)
      return isSameDay(d, selectedDate)
    })
  }, [entries, selectedDate])

  // Week view data
  const weekDays = useMemo(() => getWeekDates(weekAnchor), [weekAnchor])
  const entriesByWeekDay = useMemo(() => {
    const map: Record<string, ContentCalendarEntry[]> = {}
    weekDays.forEach((d) => {
      const key = d.toDateString()
      map[key] = entries.filter((e) => isSameDay(new Date(e.scheduled_at), d))
    })
    return map
  }, [entries, weekDays])

  const today = useMemo(() => new Date(), [])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <CalendarIcon className="w-6 h-6 text-brand" />
          <h1 className="text-2xl font-bold text-ink">Content Calendar</h1>
        </div>
      </div>

      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Month/Week nav */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-ink-6 px-3 py-1.5">
          <button onClick={view === 'month' ? prevMonth : prevWeek} className="p-1 hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4 text-ink-3" />
          </button>
          <span className="text-sm font-semibold text-ink min-w-[140px] text-center">
            {view === 'month'
              ? `${MONTH_NAMES[month]} ${year}`
              : `${weekDays[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - ${weekDays[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`
            }
          </span>
          <button onClick={view === 'month' ? nextMonth : nextWeek} className="p-1 hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4 text-ink-3" />
          </button>
        </div>

        {/* View toggle */}
        <div className="flex bg-white rounded-xl border border-ink-6 overflow-hidden">
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'month' ? 'bg-brand text-white' : 'text-ink-3 hover:bg-bg-2'}`}
          >
            Month
          </button>
          <button
            onClick={() => setView('week')}
            className={`px-3 py-1.5 text-sm font-medium transition-colors ${view === 'week' ? 'bg-brand text-white' : 'text-ink-3 hover:bg-bg-2'}`}
          >
            Week
          </button>
        </div>

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

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {/* Month View */}
      {!loading && view === 'month' && (
        <CalendarGrid
          entries={entries}
          year={year}
          month={month}
          selectedDate={selectedDate}
          onSelectDate={setSelectedDate}
          onSelectEntry={setSelectedEntry}
        />
      )}

      {/* Week View */}
      {!loading && view === 'week' && (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="grid grid-cols-7">
            {weekDays.map((day) => {
              const isToday = isSameDay(day, today)
              const dayKey = day.toDateString()
              const dayEntries = entriesByWeekDay[dayKey] || []

              return (
                <div key={dayKey} className="border-r border-ink-6 last:border-r-0 min-h-[300px]">
                  {/* Day header */}
                  <div className={`p-3 border-b border-ink-6 text-center ${isToday ? 'bg-brand/[0.06]' : ''}`}>
                    <div className="text-xs text-ink-4 uppercase">{day.toLocaleDateString('en-US', { weekday: 'short' })}</div>
                    <div className={`text-lg font-bold mt-0.5 ${isToday ? 'text-brand' : 'text-ink'}`}>
                      {day.getDate()}
                    </div>
                  </div>
                  {/* Entries */}
                  <div className="p-2 space-y-2">
                    {dayEntries.map((entry) => {
                      const pColors = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.website
                      const sColors = STATUS_COLORS[entry.status] || STATUS_COLORS.draft
                      return (
                        <button
                          key={entry.id}
                          onClick={() => setSelectedEntry(entry)}
                          className={`w-full text-left p-2 rounded-lg border-l-2 ${pColors.border} ${pColors.bg} transition-colors hover:shadow-sm`}
                        >
                          <div className={`text-xs font-semibold ${pColors.text} truncate`}>
                            {PLATFORM_EMOJI[entry.platform]} {entry.title}
                          </div>
                          <div className="text-[10px] text-ink-4 mt-0.5">{formatTime(entry.scheduled_at)}</div>
                          <div className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full inline-block mt-1 ${sColors.bg} ${sColors.text}`}>
                            {entry.status}
                          </div>
                        </button>
                      )
                    })}
                    {dayEntries.length === 0 && (
                      <div className="text-[11px] text-ink-5 text-center py-4">No content</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Selected day panel (month view) */}
      {!loading && view === 'month' && selectedDate && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-ink">
              {selectedDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            </h3>
            <button onClick={() => setSelectedDate(null)} className="p-1 hover:bg-bg-2 rounded-lg">
              <X className="w-4 h-4 text-ink-4" />
            </button>
          </div>
          {selectedDayEntries.length === 0 ? (
            <p className="text-sm text-ink-4">No content scheduled for this day.</p>
          ) : (
            <div className="space-y-3">
              {selectedDayEntries.map((entry) => {
                const pColors = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.website
                const sColors = STATUS_COLORS[entry.status] || STATUS_COLORS.draft
                return (
                  <button
                    key={entry.id}
                    onClick={() => setSelectedEntry(entry)}
                    className={`w-full text-left p-3 rounded-lg border-l-3 ${pColors.border} ${pColors.bg} hover:shadow-sm transition-colors`}
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-sm font-semibold ${pColors.text}`}>
                        {PLATFORM_EMOJI[entry.platform]} {entry.title}
                      </span>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${sColors.bg} ${sColors.text}`}>
                        {entry.status}
                      </span>
                    </div>
                    <div className="text-xs text-ink-4 mt-1">{formatTime(entry.scheduled_at)}</div>
                    {entry.caption && (
                      <p className="text-xs text-ink-3 mt-1 line-clamp-2">{entry.caption}</p>
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Empty state */}
      {!loading && entries.length === 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CalendarIcon className="w-10 h-10 text-ink-5 mx-auto mb-3" />
          <p className="text-sm text-ink-3">No content scheduled this month. Start planning your content calendar.</p>
        </div>
      )}

      {/* Entry detail modal */}
      {selectedEntry && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-center justify-center p-4" onClick={() => setSelectedEntry(null)}>
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-5">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-lg">{PLATFORM_EMOJI[selectedEntry.platform]}</span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      (PLATFORM_COLORS[selectedEntry.platform] || PLATFORM_COLORS.website).bg
                    } ${(PLATFORM_COLORS[selectedEntry.platform] || PLATFORM_COLORS.website).text}`}>
                      {selectedEntry.platform.replace('_', ' ')}
                    </span>
                    <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                      (STATUS_COLORS[selectedEntry.status] || STATUS_COLORS.draft).bg
                    } ${(STATUS_COLORS[selectedEntry.status] || STATUS_COLORS.draft).text}`}>
                      {selectedEntry.status}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-ink">{selectedEntry.title}</h2>
                </div>
                <button onClick={() => setSelectedEntry(null)} className="p-1 hover:bg-bg-2 rounded-lg">
                  <X className="w-5 h-5 text-ink-4" />
                </button>
              </div>

              <div className="space-y-3 text-sm">
                <div>
                  <span className="text-ink-4">Scheduled:</span>{' '}
                  <span className="text-ink font-medium">{formatDate(selectedEntry.scheduled_at)} at {formatTime(selectedEntry.scheduled_at)}</span>
                </div>

                {selectedEntry.caption && (
                  <div>
                    <span className="text-ink-4 block mb-1">Caption:</span>
                    <p className="text-ink bg-bg-2 rounded-lg p-3 text-sm">{selectedEntry.caption}</p>
                  </div>
                )}

                {selectedEntry.published_at && (
                  <div>
                    <span className="text-ink-4">Published:</span>{' '}
                    <span className="text-ink font-medium">{formatDate(selectedEntry.published_at)} at {formatTime(selectedEntry.published_at)}</span>
                  </div>
                )}

                {selectedEntry.post_url && (
                  <a
                    href={selectedEntry.post_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-brand hover:underline text-sm"
                  >
                    View post <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}

                {selectedEntry.deliverable_id && (
                  <Link
                    href={`/dashboard/approvals/${selectedEntry.deliverable_id}`}
                    className="inline-flex items-center gap-1.5 text-brand hover:underline text-sm"
                  >
                    View deliverable <ExternalLink className="w-3.5 h-3.5" />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
