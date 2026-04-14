'use client'

import { useMemo } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import type { CalendarItemData } from './calendar-item-row'

const TYPE_CHIP_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  feed_post: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  carousel: 'bg-pink-100 text-pink-800 border-pink-200',
  story: 'bg-amber-100 text-amber-800 border-amber-200',
  static_post: 'bg-cyan-100 text-cyan-800 border-cyan-200',
  video: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  short_form_video: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  image: 'bg-cyan-100 text-cyan-800 border-cyan-200',
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

interface MonthGridProps {
  items: CalendarItemData[]
  month: Date // first day of the month
  onMonthChange: (d: Date) => void
  selectedDate: string | null
  onSelectDate: (date: string) => void
  onSelectItem: (item: CalendarItemData) => void
  onQuickAdd: (date: string) => void
  conflicts: Set<string> // item IDs with conflicts
}

export default function MonthGrid({
  items, month, onMonthChange, selectedDate, onSelectDate, onSelectItem, onQuickAdd, conflicts,
}: MonthGridProps) {
  // Build calendar grid
  const { weeks, monthLabel } = useMemo(() => {
    const year = month.getFullYear()
    const m = month.getMonth()
    const firstDay = new Date(year, m, 1)
    const lastDay = new Date(year, m + 1, 0)

    // Get Monday of the first week
    let start = new Date(firstDay)
    const dow = start.getDay()
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))

    const weeks: Array<Array<{ date: Date; dateStr: string; inMonth: boolean; isToday: boolean }>> = []
    const cursor = new Date(start)

    while (cursor <= lastDay || weeks.length < 5) {
      const week: typeof weeks[0] = []
      for (let d = 0; d < 7; d++) {
        const dateStr = cursor.toISOString().split('T')[0]
        week.push({
          date: new Date(cursor),
          dateStr,
          inMonth: cursor.getMonth() === m,
          isToday: isToday(cursor),
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      weeks.push(week)
      if (weeks.length >= 6) break
    }

    const monthLabel = firstDay.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    return { weeks, monthLabel }
  }, [month])

  // Group items by date
  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItemData[]>()
    for (const item of items) {
      if (!item.scheduled_date) continue
      if (!map.has(item.scheduled_date)) map.set(item.scheduled_date, [])
      map.get(item.scheduled_date)!.push(item)
    }
    return map
  }, [items])

  // Average items per day (for heavy day detection)
  const daysWithItems = [...byDate.values()].filter((d) => d.length > 0).length
  const avgPerDay = daysWithItems > 0 ? items.length / daysWithItems : 3

  const prevMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))
  const nextMonth = () => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))
  const goToday = () => onMonthChange(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <button onClick={prevMonth} className="p-1.5 text-ink-3 hover:text-ink hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <h2 className="text-base font-bold text-ink min-w-[160px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-1.5 text-ink-3 hover:text-ink hover:bg-bg-2 rounded-lg transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={goToday} className="text-xs font-medium text-brand hover:text-brand-dark ml-2">Today</button>
        </div>

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 text-[10px] text-ink-3">
          {[
            { type: 'reel', label: 'Reel', color: 'bg-indigo-400' },
            { type: 'feed_post', label: 'Feed', color: 'bg-cyan-400' },
            { type: 'carousel', label: 'Carousel', color: 'bg-pink-400' },
            { type: 'story', label: 'Story', color: 'bg-amber-400' },
          ].map((l) => (
            <span key={l.type} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${l.color}`} />
              {l.label}
            </span>
          ))}
        </div>
      </div>

      {/* Grid */}
      <div className="border border-ink-6 rounded-xl overflow-hidden">
        {/* Day headers */}
        <div className="grid grid-cols-7 bg-bg-2 border-b border-ink-6">
          {DAY_NAMES.map((d) => (
            <div key={d} className="text-center text-[10px] font-semibold text-ink-3 uppercase tracking-wider py-2">
              {d}
            </div>
          ))}
        </div>

        {/* Weeks */}
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 border-b border-ink-6 last:border-0">
            {week.map((day) => {
              const dayItems = byDate.get(day.dateStr) ?? []
              const isSelected = selectedDate === day.dateStr
              const isHeavy = dayItems.length > avgPerDay * 1.5
              const maxVisible = 3
              const overflow = dayItems.length > maxVisible

              return (
                <div
                  key={day.dateStr}
                  onClick={() => onSelectDate(day.dateStr)}
                  className={`min-h-[90px] p-1.5 border-r border-ink-6 last:border-r-0 cursor-pointer transition-colors ${
                    !day.inMonth ? 'bg-ink-6/30' : isSelected ? 'bg-brand-tint' : 'bg-white hover:bg-bg-2/50'
                  }`}
                >
                  {/* Date number */}
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium leading-none ${
                      day.isToday
                        ? 'w-6 h-6 flex items-center justify-center rounded-full bg-brand text-white'
                        : !day.inMonth ? 'text-ink-4' : 'text-ink-2'
                    }`}>
                      {day.date.getDate()}
                    </span>
                    {isHeavy && day.inMonth && (
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="Heavy day" />
                    )}
                  </div>

                  {/* Item chips */}
                  <div className="space-y-0.5">
                    {dayItems.slice(0, maxVisible).map((item) => {
                      const cc = TYPE_CHIP_COLORS[item.content_type] ?? 'bg-ink-6 text-ink-3 border-ink-5'
                      const hasConflict = conflicts.has(item.id)
                      return (
                        <button
                          key={item.id}
                          onClick={(e) => { e.stopPropagation(); onSelectItem(item) }}
                          className={`w-full text-left px-1.5 py-0.5 rounded border text-[9px] font-medium truncate transition-all hover:shadow-sm ${cc} ${
                            hasConflict ? 'ring-1 ring-red-400' : ''
                          } ${item.status === 'strategist_approved' || item.status === 'approved' ? 'opacity-60' : ''}`}
                          title={`${item.scheduled_time?.slice(0, 5) ?? ''} ${item.concept_title}`}
                        >
                          {item.scheduled_time?.slice(0, 5)} {item.concept_title}
                        </button>
                      )
                    })}
                    {overflow && (
                      <span className="text-[9px] text-ink-4 font-medium px-1">+{dayItems.length - maxVisible}</span>
                    )}
                  </div>

                  {/* Quick-add for empty in-month days */}
                  {dayItems.length === 0 && day.inMonth && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onQuickAdd(day.dateStr) }}
                      className="w-full flex items-center justify-center mt-2 py-1 text-ink-5 hover:text-brand hover:bg-brand-tint/50 rounded transition-colors opacity-0 group-hover:opacity-100"
                      style={{ opacity: 0.3 }}
                      onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                      onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.3')}
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}
