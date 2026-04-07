'use client'

import { useMemo } from 'react'
import type { ContentCalendarEntry, Platform } from '@/types/database'

/* ------------------------------------------------------------------ */
/*  Platform config                                                    */
/* ------------------------------------------------------------------ */

export const PLATFORM_EMOJI: Record<string, string> = {
  instagram: '\ud83d\udcf8',
  facebook: '\ud83c\udf10',
  tiktok: '\ud83c\udfac',
  google_business: '\ud83d\udccd',
  email: '\u2709\ufe0f',
  linkedin: '\ud83d\udcbc',
  twitter: '\ud83d\udc26',
  youtube: '\u25b6\ufe0f',
  website: '\ud83c\udf10',
}

export const PLATFORM_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  instagram: { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-300' },
  facebook: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-300' },
  tiktok: { bg: 'bg-gray-100', text: 'text-gray-800', border: 'border-gray-400' },
  google_business: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-300' },
  email: { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-300' },
  linkedin: { bg: 'bg-sky-50', text: 'text-sky-700', border: 'border-sky-300' },
  twitter: { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-300' },
  youtube: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-300' },
  website: { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-300' },
}

export const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-600' },
  scheduled: { bg: 'bg-blue-100', text: 'text-blue-700' },
  published: { bg: 'bg-green-100', text: 'text-green-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-700' },
}

export const PLATFORMS: Platform[] = [
  'instagram', 'facebook', 'tiktok', 'linkedin', 'twitter', 'youtube', 'google_business', 'website',
]

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(d1: Date, d2: Date) {
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate()
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface CalendarEntryWithBusiness extends ContentCalendarEntry {
  business_name?: string
}

interface CalendarGridProps {
  entries: CalendarEntryWithBusiness[]
  year: number
  month: number
  selectedDate: Date | null
  onSelectDate: (date: Date) => void
  onSelectEntry: (entry: CalendarEntryWithBusiness) => void
  colorByClient?: boolean
  clientColors?: Record<string, string>
  gapClients?: string[]
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export default function CalendarGrid({
  entries,
  year,
  month,
  selectedDate,
  onSelectDate,
  onSelectEntry,
  colorByClient = false,
  clientColors = {},
}: CalendarGridProps) {
  const today = useMemo(() => new Date(), [])
  const daysInMonth = getDaysInMonth(year, month)
  const firstDay = getFirstDayOfMonth(year, month)

  const entriesByDay = useMemo(() => {
    const map: Record<number, CalendarEntryWithBusiness[]> = {}
    entries.forEach((entry) => {
      const d = new Date(entry.scheduled_at)
      if (d.getFullYear() === year && d.getMonth() === month) {
        const day = d.getDate()
        if (!map[day]) map[day] = []
        map[day].push(entry)
      }
    })
    return map
  }, [entries, year, month])

  // Build grid cells: leading blanks + day cells
  const cells: (number | null)[] = []
  for (let i = 0; i < firstDay; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      {/* Day headers */}
      <div className="grid grid-cols-7 border-b border-ink-6">
        {DAY_NAMES.map((name) => (
          <div key={name} className="py-2 text-center text-xs font-semibold text-ink-4 uppercase tracking-wider">
            {name}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7">
        {cells.map((day, idx) => {
          if (day === null) {
            return <div key={`blank-${idx}`} className="min-h-[90px] border-b border-r border-ink-6 bg-bg-2/30" />
          }

          const date = new Date(year, month, day)
          const isToday = isSameDay(date, today)
          const isSelected = selectedDate ? isSameDay(date, selectedDate) : false
          const dayEntries = entriesByDay[day] || []

          return (
            <button
              key={day}
              onClick={() => onSelectDate(date)}
              className={`min-h-[90px] border-b border-r border-ink-6 p-1.5 text-left transition-colors hover:bg-brand/[0.03] ${
                isSelected ? 'bg-brand/[0.06]' : ''
              }`}
            >
              <div className={`text-sm font-medium mb-1 w-7 h-7 flex items-center justify-center rounded-lg ${
                isToday ? 'bg-brand text-white' : 'text-ink'
              }`}>
                {day}
              </div>
              <div className="space-y-0.5">
                {dayEntries.slice(0, 3).map((entry) => {
                  const platformStyle = PLATFORM_COLORS[entry.platform] || PLATFORM_COLORS.website
                  const clientColor = colorByClient && entry.business_name
                    ? clientColors[entry.business_name]
                    : undefined

                  return (
                    <div
                      key={entry.id}
                      onClick={(e) => { e.stopPropagation(); onSelectEntry(entry) }}
                      className={`text-[11px] font-medium px-2 py-0.5 rounded-full truncate cursor-pointer border-l-2 ${
                        clientColor
                          ? `${clientColor} border-current`
                          : `${platformStyle.bg} ${platformStyle.text} ${platformStyle.border}`
                      }`}
                      title={entry.title}
                    >
                      {colorByClient && entry.business_name ? (
                        <span>{entry.business_name.slice(0, 12)}: {entry.title}</span>
                      ) : (
                        <span>{PLATFORM_EMOJI[entry.platform] || ''} {entry.title}</span>
                      )}
                    </div>
                  )
                })}
                {dayEntries.length > 3 && (
                  <div className="text-[10px] text-ink-4 pl-2">+{dayEntries.length - 3} more</div>
                )}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
