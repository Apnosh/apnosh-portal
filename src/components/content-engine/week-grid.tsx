'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'

interface CalendarItem {
  id: string
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_type: string
  concept_title: string
}

interface WeekGridProps {
  items: CalendarItem[]
  weekStart: Date
  onWeekChange: (newStart: Date) => void
  onItemClick: (item: CalendarItem) => void
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  feed_post: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  carousel: 'bg-pink-50 text-pink-700 border-pink-100',
  story: 'bg-amber-50 text-amber-700 border-amber-100',
  static_post: 'bg-cyan-50 text-cyan-700 border-cyan-100',
  video: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  short_form_video: 'bg-indigo-50 text-indigo-700 border-indigo-100',
  image: 'bg-cyan-50 text-cyan-700 border-cyan-100',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

function getMonday(d: Date): Date {
  const date = new Date(d)
  const day = date.getDay()
  const diff = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + diff)
  date.setHours(0, 0, 0, 0)
  return date
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function dateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

export default function WeekGrid({ items, weekStart, onWeekChange, onItemClick }: WeekGridProps) {
  const monday = getMonday(weekStart)
  const days: Date[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday)
    d.setDate(d.getDate() + i)
    return d
  })

  // Group items by date
  const byDate = new Map<string, CalendarItem[]>()
  for (const item of items) {
    const key = item.scheduled_date
    if (!byDate.has(key)) byDate.set(key, [])
    byDate.get(key)!.push(item)
  }

  const prevWeek = () => {
    const d = new Date(monday)
    d.setDate(d.getDate() - 7)
    onWeekChange(d)
  }

  const nextWeek = () => {
    const d = new Date(monday)
    d.setDate(d.getDate() + 7)
    onWeekChange(d)
  }

  const goToday = () => onWeekChange(new Date())

  return (
    <div className="space-y-3">
      {/* Navigation */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={prevWeek} className="p-1.5 text-ink-3 hover:text-ink hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <span className="text-sm font-medium text-ink min-w-[140px] text-center">
            {formatDateShort(days[0])} — {formatDateShort(days[6])}
          </span>
          <button onClick={nextWeek} className="p-1.5 text-ink-3 hover:text-ink hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
        <button onClick={goToday} className="text-xs font-medium text-brand hover:text-brand-dark transition-colors">
          Today
        </button>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-7 gap-px bg-ink-6 rounded-xl overflow-hidden border border-ink-6">
        {days.map((day, i) => {
          const key = dateStr(day)
          const dayItems = byDate.get(key) ?? []
          const today = isToday(day)
          const maxVisible = 3
          const overflow = dayItems.length > maxVisible

          return (
            <div key={i} className="bg-white min-h-[120px] flex flex-col">
              {/* Day header */}
              <div className={`px-2 py-1.5 text-center border-b border-ink-6 ${today ? 'bg-brand-tint' : 'bg-bg-2'}`}>
                <div className="text-[10px] font-medium text-ink-3 uppercase">{DAY_NAMES[i]}</div>
                <div className={`text-sm font-semibold ${today ? 'text-brand-dark' : 'text-ink'}`}>
                  {day.getDate()}
                </div>
              </div>

              {/* Items */}
              <div className="flex-1 p-1 space-y-1">
                {dayItems.slice(0, maxVisible).map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onItemClick(item)}
                    className={`w-full text-left px-1.5 py-1 rounded border text-[10px] font-medium truncate transition-colors hover:opacity-80 ${
                      TYPE_COLORS[item.content_type] ?? 'bg-ink-6 text-ink-3 border-ink-5'
                    }`}
                    title={`${item.concept_title} (${item.content_type})`}
                  >
                    {item.scheduled_time?.slice(0, 5)} {item.concept_title}
                  </button>
                ))}
                {overflow && (
                  <div className="text-[10px] text-ink-4 text-center font-medium">
                    +{dayItems.length - maxVisible} more
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
