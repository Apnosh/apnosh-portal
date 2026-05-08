'use client'

/**
 * ChannelHero — the analytics summary at the top of every channel
 * page (Posts / Local SEO / Email & SMS / Website / Reviews).
 *
 * Same shape as the dashboard's pulse cards (number + sparkline +
 * delta), but scoped to a single channel and laid out as a hero strip
 * directly under the page title.
 *
 * Each channel page passes its own three metrics. The component is
 * dumb — server-side helpers compute the numbers and hand them in.
 */

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'
import Sparkline from './sparkline'

export interface ChannelMetric {
  label: string
  /** "live" = real numbers; "no-data" = neutral; "loading" = skeleton */
  state: 'live' | 'no-data' | 'loading'
  value?: string
  delta?: string | null
  up?: boolean | null
  subtitle: string
  series?: number[]
  href?: string
  connectLabel?: string
}

export interface ChannelHeroProps {
  /** Section label for the strip — e.g. "Posts performance" */
  title: string
  /** Optional one-line summary the AI / data layer composed */
  summary?: string | null
  metrics: ChannelMetric[]
}

export default function ChannelHero({ title, summary, metrics }: ChannelHeroProps) {
  return (
    <div className="mb-6">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          {title}
        </h2>
      </div>

      {summary && (
        <p className="text-[14px] leading-relaxed mb-4" style={{ color: 'var(--db-ink-2, #555)' }}>
          {summary}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {metrics.map((m) => {
          if (m.state === 'loading') {
            return (
              <div key={m.label} className="rounded-xl p-4 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                <div className="h-3 bg-ink-6 rounded w-24 mb-2" />
                <div className="h-7 bg-ink-6 rounded w-20 mb-2" />
                <div className="h-3 bg-ink-6 rounded w-32" />
              </div>
            )
          }
          if (m.state === 'no-data') {
            return (
              <div
                key={m.label}
                className="rounded-xl p-4 border bg-white"
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              >
                <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                  {m.label}
                </p>
                <div className="text-2xl font-bold" style={{ color: 'var(--db-ink-4, #aaa)' }}>—</div>
                <p className="text-[11px] mt-1" style={{ color: 'var(--db-ink-3, #888)' }}>{m.subtitle}</p>
                {m.href && m.connectLabel && (
                  <Link href={m.href} className="inline-block text-[11px] font-semibold mt-2 text-emerald-600 hover:text-emerald-800">
                    {m.connectLabel} →
                  </Link>
                )}
              </div>
            )
          }
          // live
          const accent =
            m.up === null || m.up === undefined ? 'text-ink-4' :
            m.up ? 'text-emerald-600' : 'text-rose-600'
          const Arrow = m.up === null || m.up === undefined ? Minus : m.up ? ArrowUpRight : ArrowDownRight
          const hasSeries = m.series && m.series.length > 1 && m.series.some(v => v > 0)
          return (
            <div
              key={m.label}
              className="rounded-xl p-4 border bg-white"
              style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
            >
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-1.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                {m.label}
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold" style={{ color: 'var(--db-black, #111)' }}>{m.value ?? '—'}</span>
                {m.delta && (
                  <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${accent}`}>
                    <Arrow className="w-3 h-3" />{m.delta}
                  </span>
                )}
              </div>
              <p className="text-[11px] mt-1" style={{ color: 'var(--db-ink-3, #888)' }}>{m.subtitle}</p>
              {hasSeries && (
                <Sparkline data={m.series!} up={m.up !== false} height={28} />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
