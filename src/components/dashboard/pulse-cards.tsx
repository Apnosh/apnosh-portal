'use client'

/**
 * Pulse cards — three glanceable metrics for the dashboard.
 * Owner-framing: "your reach", "your reputation", "your bookings".
 *
 * Reads aggregated values from existing dashboard data — accepts the
 * already-computed values as props so the heavy lifting stays in the
 * server-side getDashboardData.
 */

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

export interface PulseCard {
  label: string
  value: string
  /** e.g. "+12%" or "—" */
  delta: string
  /** Trend direction; null = no comparable data */
  up: boolean | null
  /** Subtle context line under the value */
  subtitle: string
  /** Where to drill down */
  href: string
  /** Highlight if this metric is in an alarming state */
  alert?: boolean
}

export default function PulseCards({ cards }: { cards: PulseCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {cards.map((c) => {
        const accent =
          c.up === null ? 'text-ink-4' :
          c.up ? 'text-emerald-600' : 'text-rose-600'
        const Arrow = c.up === null ? Minus : c.up ? ArrowUpRight : ArrowDownRight
        return (
          <Link
            href={c.href}
            key={c.label}
            className={`block rounded-xl p-4 border bg-white hover:bg-bg-2 transition-colors ${c.alert ? 'border-rose-300 ring-1 ring-rose-200' : ''}`}
            style={{ borderColor: c.alert ? undefined : 'var(--db-border, #e5e5e5)' }}
          >
            <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--db-ink-3, #888)' }}>
              {c.label}
            </p>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl font-bold" style={{ color: 'var(--db-black, #111)' }}>{c.value}</span>
              <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${accent}`}>
                <Arrow className="w-3 h-3" />{c.delta}
              </span>
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--db-ink-3, #888)' }}>{c.subtitle}</p>
          </Link>
        )
      })}
    </div>
  )
}
