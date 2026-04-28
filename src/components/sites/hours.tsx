/**
 * Hours section for a restaurant site.
 * Auto-binds to gbp_locations.hours (source of truth from Apnosh).
 * Highlights today's row. Surfaces special hours overrides.
 *
 * THIS is the killer demo: when an Apnosh manager updates hours,
 * this component renders the new hours on the next page load.
 * No "did you remember to update the website?" anxiety.
 */

import type { WeeklyHours, DayKey, SpecialHoursEntry } from '@/lib/updates/types'

interface HoursProps {
  hours: WeeklyHours | null
  specialHours?: SpecialHoursEntry[]
  /** Optional restaurant timezone, defaults to America/Los_Angeles */
  timezone?: string
}

const DAYS: { key: DayKey; label: string; index: number }[] = [
  { key: 'mon', label: 'Monday',    index: 1 },
  { key: 'tue', label: 'Tuesday',   index: 2 },
  { key: 'wed', label: 'Wednesday', index: 3 },
  { key: 'thu', label: 'Thursday',  index: 4 },
  { key: 'fri', label: 'Friday',    index: 5 },
  { key: 'sat', label: 'Saturday',  index: 6 },
  { key: 'sun', label: 'Sunday',    index: 0 },
]

function formatTime(time: string): string {
  if (!time) return ''
  const [h, m] = time.split(':').map(Number)
  const period = h >= 12 ? 'pm' : 'am'
  const displayH = h % 12 || 12
  if (m === 0) return `${displayH}${period}`
  return `${displayH}:${m.toString().padStart(2, '0')}${period}`
}

export default function Hours({ hours, specialHours }: HoursProps) {
  if (!hours) return null

  const todayIndex = new Date().getDay()
  const todayIso = new Date().toISOString().slice(0, 10)
  const todaySpecial = specialHours?.find(s => s.date === todayIso)

  // Upcoming special hours (next 30 days)
  const upcoming = (specialHours ?? [])
    .filter(s => s.date >= todayIso)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 3)

  return (
    <section className="py-16 px-6 bg-stone-50">
      <div className="max-w-2xl mx-auto">
        <h2 className="text-3xl font-bold text-stone-900 mb-8 text-center">Hours</h2>

        {/* Today's special hours alert */}
        {todaySpecial && (
          <div className={`mb-6 p-4 rounded-lg ${
            todaySpecial.hours.length === 0
              ? 'bg-red-50 border border-red-200'
              : 'bg-amber-50 border border-amber-200'
          }`}>
            <div className="font-semibold text-stone-900 mb-1">Today: {todaySpecial.note ?? 'Special hours'}</div>
            <div className="text-sm text-stone-700">
              {todaySpecial.hours.length === 0
                ? 'Closed'
                : todaySpecial.hours.map((r, i) => (
                    <span key={i}>
                      {i > 0 && ' · '}
                      {formatTime(r.open)} – {formatTime(r.close)}
                    </span>
                  ))}
            </div>
          </div>
        )}

        <div className="bg-white rounded-xl border border-stone-200 overflow-hidden">
          {DAYS.map(d => {
            const ranges = hours[d.key] ?? []
            const isToday = d.index === todayIndex
            const isClosed = ranges.length === 0
            return (
              <div
                key={d.key}
                className={`flex items-center justify-between px-5 py-3 border-b border-stone-100 last:border-0 ${
                  isToday ? 'bg-stone-50' : ''
                }`}
              >
                <div className={`font-medium ${isToday ? 'text-stone-900' : 'text-stone-600'}`}>
                  {d.label}
                  {isToday && <span className="ml-2 text-xs text-stone-500">Today</span>}
                </div>
                <div className={isToday ? 'text-stone-900 font-medium' : 'text-stone-600'}>
                  {isClosed ? (
                    <span className="text-stone-400">Closed</span>
                  ) : (
                    ranges.map((r, i) => (
                      <span key={i}>
                        {i > 0 && <span className="text-stone-400 mx-1">·</span>}
                        {formatTime(r.open)} – {formatTime(r.close)}
                      </span>
                    ))
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Upcoming special hours */}
        {upcoming.length > 0 && (
          <div className="mt-6 text-sm text-stone-600">
            <p className="font-medium text-stone-700 mb-2">Upcoming changes:</p>
            <ul className="space-y-1">
              {upcoming.map(s => (
                <li key={s.date}>
                  <span className="font-medium">{new Date(s.date + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}:</span>{' '}
                  {s.hours.length === 0 ? 'Closed' : s.hours.map(r => `${formatTime(r.open)}–${formatTime(r.close)}`).join(', ')}
                  {s.note && <span className="text-stone-500"> · {s.note}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
