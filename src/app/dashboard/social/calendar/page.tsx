'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronLeft, ChevronRight, Calendar as CalendarIcon, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import CalendarGrid, { type CalendarEntryWithBusiness } from '@/components/calendar/CalendarGrid'
import type { ContentQueueItem, ContentCalendarEntry, Platform } from '@/types/database'

export default function SocialCalendarPage() {
  const supabase = createClient()

  const today = new Date()
  const [year, setYear] = useState(today.getFullYear())
  const [month, setMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState<Date | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<CalendarEntryWithBusiness | null>(null)
  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    if (!business?.client_id) { setLoading(false); return }

    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', business.client_id)
      .eq('service_area', 'social')
      .not('scheduled_for', 'is', null)
      .order('scheduled_for', { ascending: true })

    setRequests((data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['content_queue'], load)

  // Transform content_queue rows into CalendarEntryWithBusiness shape
  const entries: CalendarEntryWithBusiness[] = useMemo(() => {
    return requests
      .filter(r => r.scheduled_for)
      .map(r => {
        const entry: ContentCalendarEntry = {
          id: r.id,
          business_id: r.client_id,
          platform: (r.platform as Platform) || 'instagram',
          title: r.input_text?.slice(0, 60) || 'Untitled post',
          caption: r.drafts[r.selected_draft ?? 0]?.caption,
          scheduled_at: r.scheduled_for!,
          status: r.status === 'posted' ? 'published' : r.status === 'scheduled' ? 'scheduled' : 'draft',
          created_at: r.created_at,
        }
        return entry
      })
  }, [requests])

  function goPrev() {
    if (month === 0) { setYear(year - 1); setMonth(11) }
    else setMonth(month - 1)
  }
  function goNext() {
    if (month === 11) { setYear(year + 1); setMonth(0) }
    else setMonth(month + 1)
  }
  function goToday() {
    setYear(today.getFullYear())
    setMonth(today.getMonth())
    setSelectedDate(today)
  }

  const monthName = new Date(year, month).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/social" className="text-ink-4 hover:text-ink transition-colors mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
              <CalendarIcon className="w-6 h-6 text-ink-4" />
              Content Calendar
            </h1>
            <p className="text-ink-3 text-sm mt-0.5">When your social posts are scheduled to go live.</p>
          </div>
        </div>
        <Link
          href="/dashboard/social/requests/new"
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> New Request
        </Link>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between bg-white rounded-xl border border-ink-6 px-4 py-3">
        <button onClick={goPrev} className="p-1.5 rounded-lg hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </button>
        <div className="flex items-center gap-3">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">{monthName}</h2>
          <button
            onClick={goToday}
            className="text-xs font-medium text-brand hover:text-brand-dark px-2 py-1 rounded transition-colors"
          >
            Today
          </button>
        </div>
        <button onClick={goNext} className="p-1.5 rounded-lg hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors">
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Calendar grid */}
      {loading ? (
        <div className="bg-white rounded-xl border border-ink-6 p-5 h-96 animate-pulse" />
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <CalendarIcon className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No scheduled posts</p>
          <p className="text-xs text-ink-4 mt-1">Approved posts will show up here with their scheduled date.</p>
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

      {/* Selected entry modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSelectedEntry(null)} />
          <div className="relative bg-white rounded-2xl border border-ink-6 shadow-xl w-full max-w-md mx-4 p-5">
            <h3 className="font-[family-name:var(--font-display)] text-lg text-ink mb-1">{selectedEntry.title}</h3>
            <p className="text-[10px] text-ink-4 uppercase tracking-wide">
              {new Date(selectedEntry.scheduled_at).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              {' · '}
              {selectedEntry.platform}
              {' · '}
              {selectedEntry.status}
            </p>
            {selectedEntry.caption && (
              <p className="text-sm text-ink-2 mt-3 whitespace-pre-wrap leading-relaxed">{selectedEntry.caption}</p>
            )}
            <div className="flex items-center justify-end gap-2 mt-4 pt-4 border-t border-ink-6">
              <Link
                href={`/dashboard/social/requests/${selectedEntry.id}`}
                className="text-sm font-medium text-brand hover:text-brand-dark transition-colors"
              >
                View request →
              </Link>
              <button
                onClick={() => setSelectedEntry(null)}
                className="text-sm text-ink-3 hover:text-ink transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
