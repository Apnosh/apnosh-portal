'use client'

/**
 * Coming up — marketing calendar card.
 *
 * Strictly content opportunities. Restaurant-relevant US holidays +
 * food-industry moments in the next 60 days. Each row shows whether
 * content is queued near that date; tap to draft if not.
 *
 * NOT an operations calendar. No weather, no walk-in forecasts, no
 * predicted busy/slow days.
 */

import Link from 'next/link'
import { CalendarDays } from 'lucide-react'

export interface ComingUpItem {
  date: string
  label: string
  hook: string
  weight: number
  daysUntil: number
  queuedCount: number
}

function dateLabel(iso: string, daysUntil: number): string {
  const d = new Date(iso)
  const month = d.toLocaleDateString('en-US', { month: 'short' })
  const day = d.getUTCDate()
  if (daysUntil === 0) return `Today · ${month} ${day}`
  if (daysUntil === 1) return `Tomorrow · ${month} ${day}`
  if (daysUntil <= 7) return `${daysUntil}d · ${d.toLocaleDateString('en-US', { weekday: 'short' })} ${month} ${day}`
  return `${month} ${day} · ${d.toLocaleDateString('en-US', { weekday: 'short' })}`
}

export default function ComingUp({ items }: { items: ComingUpItem[] | null }) {
  if (items === null) {
    return (
      <div className="rounded-xl p-5 mb-4 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="h-3 bg-ink-6 rounded w-24 mb-3" />
        <div className="space-y-2">
          <div className="h-4 bg-ink-6 rounded w-full" />
          <div className="h-4 bg-ink-6 rounded w-5/6" />
        </div>
      </div>
    )
  }

  if (items.length === 0) return null

  return (
    <div className="rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-center gap-1.5 mb-3">
        <CalendarDays className="w-3.5 h-3.5" style={{ color: 'var(--db-ink-3, #888)' }} />
        <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Coming up
        </h3>
      </div>
      <ul className="space-y-2.5">
        {items.map((item) => {
          const ready = item.queuedCount > 0
          return (
            <li key={item.date + item.label} className="flex items-start gap-3 text-[12px]">
              <div className="shrink-0 w-[88px]">
                <div
                  className={`text-[10px] uppercase tracking-wider font-semibold ${
                    item.daysUntil <= 7 ? 'text-amber-700' : 'text-ink-3'
                  }`}
                >
                  {dateLabel(item.date, item.daysUntil)}
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate" style={{ color: 'var(--db-black, #111)' }}>
                  {item.label}
                </p>
                {ready ? (
                  <p className="text-[11px]" style={{ color: 'var(--db-up, #00C805)' }}>
                    {item.queuedCount} post{item.queuedCount === 1 ? '' : 's'} queued ✓
                  </p>
                ) : (
                  <Link
                    href={`/dashboard/social/new?occasion=${encodeURIComponent(item.label)}`}
                    className="text-[11px] hover:underline"
                    style={{ color: 'var(--db-ink-3, #888)' }}
                  >
                    Nothing queued — draft now →
                  </Link>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
