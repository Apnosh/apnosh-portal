'use client'

/**
 * Pulse cards — three glanceable metrics for the dashboard.
 * Owner-framing: "your customers", "your reputation", "your reach".
 *
 * Three states per card:
 *   - "live"      — has data, shows value + delta + sparkline + alarm-when-bad
 *   - "no-data"   — connection missing or no rows yet; gray, neutral,
 *                   shows a "Connect →" CTA instead of "0 -100%"
 *   - "loading"   — skeleton
 *
 * Live cards optionally render a 14-day sparkline so the trend is
 * visible at a glance — sparkline > number-with-arrow for "is the
 * line going up or down" recognition speed.
 */

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus, Plug } from 'lucide-react'
import Sparkline from './sparkline'

export interface PulseCard {
  label: string
  /** Either 'live' (has data), 'no-data' (no metric available), or 'loading' */
  state: 'live' | 'no-data' | 'loading'
  /** When state='live': the value (e.g. "1.2k", "4.8★", "175"). */
  value?: string
  /** Trend percent string, e.g. "+12%" or null when not comparable. */
  delta?: string | null
  /** Trend direction for the arrow icon. */
  up?: boolean | null
  /** Subtle context line under the value. */
  subtitle: string
  /** Where to drill down on tap (live) OR where to connect (no-data). */
  href: string
  /** When state='no-data', the connect CTA label. */
  connectLabel?: string
  /** Highlight if the metric is genuinely in trouble (live state only). */
  alert?: boolean
  /** Optional 14-day daily series for a sparkline (live state only). */
  series?: number[]
}

export default function PulseCards({ cards }: { cards: PulseCard[] }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
      {cards.map((c) => {
        if (c.state === 'loading') {
          return (
            <div
              key={c.label}
              className="rounded-xl p-4 border bg-white animate-pulse"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <div className="h-3 bg-ink-6 rounded w-24 mb-2" />
              <div className="h-7 bg-ink-6 rounded w-20 mb-2" />
              <div className="h-3 bg-ink-6 rounded w-32" />
            </div>
          )
        }
        if (c.state === 'no-data') {
          // Phase B7: contextual empty state. Lead with what we'll show
          // when connected, not a sad em-dash.
          return (
            <Link
              href={c.href}
              key={c.label}
              className="block rounded-xl p-4 border-2 border-dashed bg-white hover:bg-bg-2 transition-colors"
              style={{ borderColor: 'var(--db-border, #d4e0db)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                {c.label}
              </p>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: 'var(--db-ink-2, #555)' }}>
                {c.subtitle}.
                <br />
                <span className="text-ink-3 text-[12px]">Connect to start tracking.</span>
              </p>
              <p className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                <Plug className="w-3 h-3" />
                {c.connectLabel ?? 'Connect'} →
              </p>
            </Link>
          )
        }
        // live
        const accent =
          c.up === null || c.up === undefined ? 'text-ink-4' :
          c.up ? 'text-emerald-600' : 'text-rose-600'
        const Arrow = c.up === null || c.up === undefined ? Minus : c.up ? ArrowUpRight : ArrowDownRight
        const hasSeries = c.series && c.series.length > 1 && c.series.some(v => v > 0)
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
              <span className="text-2xl font-bold" style={{ color: 'var(--db-black, #111)' }}>{c.value ?? '—'}</span>
              {c.delta && (
                <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${accent}`}>
                  <Arrow className="w-3 h-3" />{c.delta}
                </span>
              )}
            </div>
            <p className="text-[11px] mt-1" style={{ color: 'var(--db-ink-3, #888)' }}>{c.subtitle}</p>
            {hasSeries && (
              <Sparkline data={c.series!} up={c.up !== false} height={28} />
            )}
          </Link>
        )
      })}
    </div>
  )
}
