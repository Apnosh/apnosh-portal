'use client'

/**
 * Weekly hours editor.
 *
 * Per day:
 *   - Toggle "open" / "closed"
 *   - Add/remove time ranges (split shifts -- lunch + dinner)
 *   - Pick open/close times
 *
 * Compact, restaurant-friendly UI. Most restaurants are 1 range/day,
 * but split-shifts are common enough that we support multi-range.
 */

import { Plus, Minus } from 'lucide-react'
import type { WeeklyHours, DayKey, TimeRange } from '@/lib/updates/types'

const DAYS: { key: DayKey; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
]

interface Props {
  weekly: WeeklyHours
  onChange: (next: WeeklyHours) => void
}

export default function HoursEditor({ weekly, onChange }: Props) {
  const update = (day: DayKey, ranges: TimeRange[]) => {
    onChange({ ...weekly, [day]: ranges })
  }

  return (
    <div>
      <label className="text-xs font-medium text-ink-3 block mb-2">Hours</label>
      <div className="space-y-1.5">
        {DAYS.map(d => {
          const ranges = weekly[d.key] ?? []
          const isClosed = ranges.length === 0
          return (
            <div key={d.key} className="flex items-start gap-3 py-1.5">
              <div className="w-24 shrink-0 text-sm text-ink pt-1.5">{d.label}</div>

              {isClosed ? (
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-sm text-ink-3 italic">Closed</span>
                  <button
                    type="button"
                    onClick={() => update(d.key, [{ open: '11:00', close: '22:00' }])}
                    className="text-xs text-brand hover:underline"
                  >
                    Open this day
                  </button>
                </div>
              ) : (
                <div className="flex-1 space-y-1.5">
                  {ranges.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <TimeInput
                        value={r.open}
                        onChange={v => {
                          const next = [...ranges]
                          next[i] = { ...next[i], open: v }
                          update(d.key, next)
                        }}
                      />
                      <span className="text-ink-4 text-sm">to</span>
                      <TimeInput
                        value={r.close}
                        onChange={v => {
                          const next = [...ranges]
                          next[i] = { ...next[i], close: v }
                          update(d.key, next)
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => update(d.key, ranges.filter((_, j) => j !== i))}
                        className="p-1 text-ink-4 hover:text-red-500"
                        title="Remove this range"
                      >
                        <Minus className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => update(d.key, [...ranges, { open: '17:00', close: '22:00' }])}
                      className="inline-flex items-center gap-1 text-brand hover:underline"
                    >
                      <Plus className="w-3 h-3" /> Add another range
                    </button>
                    <span className="text-ink-4">·</span>
                    <button
                      type="button"
                      onClick={() => update(d.key, [])}
                      className="text-ink-3 hover:text-red-500"
                    >
                      Mark closed
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      type="time"
      value={value}
      onChange={e => onChange(e.target.value)}
      className="px-2 py-1 text-sm border border-ink-5 rounded font-mono"
      step={900}
    />
  )
}
