'use client'

/**
 * Month-view content calendar for a client.
 *
 * Shows every queue item placed on its scheduled date, with status,
 * format, and platform visible on each pill. Items without a scheduled
 * date roll into an "Unscheduled" column on the right so they're
 * never invisible.
 *
 * Clicking an item opens the queue-tab detail (parent decides via
 * onItemClick). Clicking a date cell opens a "new post for this date"
 * flow (parent decides via onDateClick).
 */

import { useMemo, useState } from 'react'
import {
  ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon,
  Image as ImageIcon, Film, FileText, Sparkles, Send, Eye, Check, Clock,
} from 'lucide-react'
import type { ContentQueueItem, QueueStatus, ContentFormat, PostPlatform } from '@/types/database'

interface Props {
  items: ContentQueueItem[]
  onItemClick: (id: string) => void
  onNewPost: (date?: Date) => void
}

// Decide which date to place the item on:
//   scheduled_for   — if scheduled, use the scheduled date
//   updated_at      — if posted/cancelled, use the last-changed date
//   null            — otherwise it's unscheduled
function itemDate(item: ContentQueueItem): Date | null {
  if (item.scheduled_for) return new Date(item.scheduled_for)
  if (item.status === 'posted' || item.status === 'cancelled') return new Date(item.updated_at)
  return null
}

const STATUS_TONE: Record<QueueStatus, { bg: string; border: string; text: string; label: string }> = {
  new:       { bg: 'bg-cyan-50',    border: 'border-cyan-200',    text: 'text-cyan-700',    label: 'Awaiting' },
  confirmed: { bg: 'bg-blue-50',    border: 'border-blue-200',    text: 'text-blue-700',    label: 'Confirmed' },
  drafting:  { bg: 'bg-purple-50',  border: 'border-purple-200',  text: 'text-purple-700',  label: 'Drafting' },
  in_review: { bg: 'bg-amber-50',   border: 'border-amber-200',   text: 'text-amber-700',   label: 'In review' },
  approved:  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700', label: 'Approved' },
  scheduled: { bg: 'bg-indigo-50',  border: 'border-indigo-200',  text: 'text-indigo-700',  label: 'Scheduled' },
  posted:    { bg: 'bg-green-50',   border: 'border-green-200',   text: 'text-green-700',   label: 'Posted' },
  cancelled: { bg: 'bg-bg-2',       border: 'border-ink-6',       text: 'text-ink-4',       label: 'Cancelled' },
}

const FORMAT_ICON: Partial<Record<ContentFormat, typeof ImageIcon>> = {
  graphic: ImageIcon,
  short_form_video: Film,
  custom: FileText,
  feed_post: ImageIcon,
  reel: Film,
  carousel: ImageIcon,
  story: ImageIcon,
  blog_post: FileText,
  page_update: FileText,
  bug_fix: FileText,
  gbp_post: ImageIcon,
  review_response: FileText,
  citation_update: FileText,
  email_campaign: FileText,
  sms_blast: FileText,
  newsletter: FileText,
}

const PLATFORM_LABEL: Record<PostPlatform, string> = {
  instagram: 'IG', tiktok: 'TT', linkedin: 'LI',
}

function startOfMonth(d: Date): Date { return new Date(d.getFullYear(), d.getMonth(), 1) }
function startOfGrid(d: Date): Date {
  // Start the grid on the Monday of the week containing day 1 of the month.
  const s = startOfMonth(d)
  const dow = s.getDay() // 0=Sun
  const offset = dow === 0 ? 6 : dow - 1
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - offset)
}
function addDays(d: Date, n: number): Date { const c = new Date(d); c.setDate(c.getDate() + n); return c }
function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function ContentCalendar({ items, onItemClick, onNewPost }: Props) {
  const [cursor, setCursor] = useState<Date>(() => new Date())
  const [hoveredDay, setHoveredDay] = useState<string | null>(null)

  const today = new Date()

  // Bucket items by date key 'YYYY-MM-DD' + a catch-all for unscheduled
  const { dayBuckets, unscheduled } = useMemo(() => {
    const dayBuckets = new Map<string, ContentQueueItem[]>()
    const unscheduled: ContentQueueItem[] = []
    for (const item of items) {
      const d = itemDate(item)
      if (!d) { unscheduled.push(item); continue }
      const key = d.toISOString().slice(0, 10)
      const list = dayBuckets.get(key) ?? []
      list.push(item)
      dayBuckets.set(key, list)
    }
    // Sort items within each day by scheduled_for time, else created_at
    for (const list of dayBuckets.values()) {
      list.sort((a, b) => {
        const ad = a.scheduled_for ? new Date(a.scheduled_for).getTime() : new Date(a.created_at).getTime()
        const bd = b.scheduled_for ? new Date(b.scheduled_for).getTime() : new Date(b.created_at).getTime()
        return ad - bd
      })
    }
    // Sort unscheduled by created_at desc
    unscheduled.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    return { dayBuckets, unscheduled }
  }, [items])

  const gridStart = useMemo(() => startOfGrid(cursor), [cursor])
  const days = useMemo(() => Array.from({ length: 42 }, (_, i) => addDays(gridStart, i)), [gridStart])

  // Metrics for the current visible month
  const monthSummary = useMemo(() => {
    const monthItems = items.filter(item => {
      const d = itemDate(item)
      if (!d) return false
      return d.getFullYear() === cursor.getFullYear() && d.getMonth() === cursor.getMonth()
    })
    return {
      total: monthItems.length,
      scheduled: monthItems.filter(i => i.status === 'scheduled' || i.status === 'approved').length,
      published: monthItems.filter(i => i.status === 'posted').length,
      inFlight: monthItems.filter(i => ['confirmed', 'drafting', 'in_review'].includes(i.status)).length,
    }
  }, [items, cursor])

  function goPrev() { setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1)) }
  function goNext() { setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1)) }
  function goToday() { setCursor(new Date()) }

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      {/* Header: month nav + summary */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6 gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center gap-0.5 border border-ink-6 rounded-lg overflow-hidden">
            <button
              onClick={goPrev}
              className="p-1.5 hover:bg-bg-2 text-ink-3 hover:text-ink"
              title="Previous month"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={goToday}
              className="px-3 py-1 text-[12px] font-medium text-ink-2 hover:bg-bg-2 border-l border-r border-ink-6"
            >
              Today
            </button>
            <button
              onClick={goNext}
              className="p-1.5 hover:bg-bg-2 text-ink-3 hover:text-ink"
              title="Next month"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div>
            <h2 className="text-[16px] font-[family-name:var(--font-display)] text-ink leading-tight">
              {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
            </h2>
            <p className="text-[11px] text-ink-4 mt-0.5">
              {monthSummary.total} item{monthSummary.total === 1 ? '' : 's'} ·{' '}
              {monthSummary.published} published ·{' '}
              {monthSummary.scheduled} scheduled ·{' '}
              {monthSummary.inFlight} in flight
            </p>
          </div>
        </div>

        <button
          onClick={() => onNewPost()}
          className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white text-[13px] font-medium rounded-lg px-3.5 py-2 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New post
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 bg-bg-2/60 border-b border-ink-6">
        {WEEKDAYS.map(w => (
          <div key={w} className="text-[10px] font-semibold text-ink-4 uppercase tracking-wide px-2 py-2 text-center">
            {w}
          </div>
        ))}
      </div>

      {/* 6-week calendar grid */}
      <div className="grid grid-cols-7">
        {days.map((day, i) => {
          const key = day.toISOString().slice(0, 10)
          const dayItems = dayBuckets.get(key) ?? []
          const isCurrentMonth = day.getMonth() === cursor.getMonth()
          const isToday = sameDay(day, today)
          const isHovered = hoveredDay === key
          return (
            <div
              key={i}
              onMouseEnter={() => setHoveredDay(key)}
              onMouseLeave={() => setHoveredDay(null)}
              className={`relative border-r border-b border-ink-6 min-h-[108px] p-1.5 transition-colors ${
                !isCurrentMonth ? 'bg-bg-2/30' : 'bg-white'
              } ${i % 7 === 6 ? 'border-r-0' : ''}`}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-1">
                <span className={`text-[11px] font-medium tabular-nums ${
                  isToday
                    ? 'bg-brand text-white rounded-full w-5 h-5 flex items-center justify-center'
                    : isCurrentMonth ? 'text-ink-2' : 'text-ink-5'
                }`}>
                  {day.getDate()}
                </span>
                {isHovered && isCurrentMonth && (
                  <button
                    onClick={() => onNewPost(day)}
                    className="text-ink-4 hover:text-brand-dark"
                    title="Add post on this date"
                  >
                    <Plus className="w-3 h-3" />
                  </button>
                )}
              </div>

              {/* Items — stack up to 3 then overflow */}
              <div className="space-y-1">
                {dayItems.slice(0, 3).map(item => (
                  <CalendarItem key={item.id} item={item} onClick={() => onItemClick(item.id)} />
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[10px] text-ink-4 font-medium px-1">
                    +{dayItems.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Unscheduled sidebar below grid — only renders if there are items */}
      {unscheduled.length > 0 && (
        <div className="border-t border-ink-6 bg-bg-2/30 p-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide inline-flex items-center gap-1.5">
              <CalendarIcon className="w-3 h-3" />
              Unscheduled
            </h3>
            <span className="text-[11px] text-ink-4">{unscheduled.length}</span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {unscheduled.slice(0, 20).map(item => (
              <div key={item.id} className="flex-shrink-0 w-56">
                <CalendarItem item={item} onClick={() => onItemClick(item.id)} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function CalendarItem({ item, onClick }: { item: ContentQueueItem; onClick: () => void }) {
  const tone = STATUS_TONE[item.status]
  const FormatIcon = item.content_format ? (FORMAT_ICON[item.content_format] ?? FileText) : Sparkles
  const StatusIcon = item.status === 'posted' ? Send
    : item.status === 'in_review' ? Eye
    : item.status === 'approved' ? Check
    : item.status === 'scheduled' ? Clock
    : null

  const time = item.scheduled_for
    ? new Date(item.scheduled_for).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
    : null

  const title = item.input_text || 'Untitled post'
  const truncatedTitle = title.length > 40 ? title.slice(0, 40) + '…' : title

  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left px-1.5 py-1 rounded-md border ${tone.bg} ${tone.border} hover:shadow-sm transition-shadow`}
    >
      <div className="flex items-center gap-1 mb-0.5">
        <FormatIcon className="w-2.5 h-2.5 text-ink-3 flex-shrink-0" />
        {item.platform && (
          <span className="text-[9px] font-semibold text-ink-3 bg-white rounded px-1 py-0.5">
            {PLATFORM_LABEL[item.platform]}
          </span>
        )}
        {StatusIcon && <StatusIcon className={`w-2.5 h-2.5 ${tone.text} ml-auto flex-shrink-0`} />}
      </div>
      <div className="text-[10.5px] leading-tight text-ink truncate">{truncatedTitle}</div>
      {time && (
        <div className={`text-[9.5px] ${tone.text} mt-0.5 tabular-nums`}>{time}</div>
      )}
    </button>
  )
}
