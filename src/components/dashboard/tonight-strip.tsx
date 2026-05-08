'use client'

/**
 * "Today" strip — top-of-dashboard quick-glance for the marketing
 * operator. Strictly marketing-focused, no operations data.
 *
 * Three cells, left to right:
 *   1. Going out today  — what's queued to publish in the next 24h
 *   2. Needs attention  — single most urgent unread/unanswered item
 *   3. Trend signal     — reach or customer-actions delta this week
 *
 * Hides itself when there's nothing in any of the three cells.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarClock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from 'lucide-react'

interface TodayData {
  scheduled: {
    count: number
    nextLabel: string
    nextAt: string | null
  }
  attention: {
    label: string
    href: string
    urgency: 'high' | 'medium' | 'low'
  } | null
  signal: {
    label: string
    value: string
    up: boolean | null
  } | null
  generatedAt: string
}

export default function TonightStrip({ clientId }: { clientId: string }) {
  const [data, setData] = useState<TodayData | null>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`/api/dashboard/tonight?clientId=${encodeURIComponent(clientId)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!cancelled && d) setData(d as TodayData)
        if (!cancelled) setLoaded(true)
      })
      .catch(() => { if (!cancelled) setLoaded(true) })
    return () => { cancelled = true }
  }, [clientId])

  if (!loaded) {
    return (
      <div className="rounded-xl p-4 mb-4 bg-white border animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="h-3 bg-ink-6 rounded w-32 mb-2" />
        <div className="h-4 bg-ink-6 rounded w-3/4" />
      </div>
    )
  }

  // Hide if nothing useful
  if (!data) return null
  const hasScheduled = data.scheduled.count > 0
  const hasAttention = data.attention !== null
  const hasSignal = data.signal !== null
  if (!hasScheduled && !hasAttention && !hasSignal) return null

  return (
    <div
      className="rounded-xl p-4 mb-4 border bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-1.5 mb-2.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Today
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-x-4 gap-y-2 items-start">

        {/* Going out today */}
        <div className="flex items-start gap-2.5 min-w-0">
          <CalendarClock className="w-4 h-4 mt-0.5 shrink-0" style={{ color: 'var(--db-ink-3, #888)' }} />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
              Going out today
            </div>
            {hasScheduled ? (
              <Link
                href="/dashboard/calendar"
                className="text-[13px] font-semibold leading-snug truncate block hover:text-emerald-700"
                style={{ color: 'var(--db-black, #111)' }}
              >
                {data.scheduled.count > 1 && (
                  <span className="text-emerald-700 mr-1">{data.scheduled.count}×</span>
                )}
                {data.scheduled.nextLabel}
              </Link>
            ) : (
              <Link
                href="/dashboard/social"
                className="text-[12px] italic hover:text-emerald-700"
                style={{ color: 'var(--db-ink-3, #888)' }}
              >
                Nothing queued — draft a post →
              </Link>
            )}
          </div>
        </div>

        {/* Needs attention */}
        <div className="flex items-start gap-2.5 min-w-0">
          {hasAttention ? (
            <>
              <AlertTriangle
                className={`w-4 h-4 mt-0.5 shrink-0 ${
                  data.attention!.urgency === 'high' ? 'text-rose-500' :
                  data.attention!.urgency === 'medium' ? 'text-amber-500' :
                  'text-ink-3'
                }`}
              />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                  Needs attention
                </div>
                <Link
                  href={data.attention!.href}
                  className="text-[13px] font-semibold leading-snug hover:text-emerald-700"
                  style={{ color: 'var(--db-black, #111)' }}
                >
                  {data.attention!.label} →
                </Link>
              </div>
            </>
          ) : (
            <>
              <div className="w-4 h-4 mt-0.5 shrink-0 rounded-full bg-emerald-100 flex items-center justify-center">
                <span className="text-emerald-600 text-[9px]">✓</span>
              </div>
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                  Inbox
                </div>
                <span className="text-[13px]" style={{ color: 'var(--db-ink-3, #888)' }}>
                  All caught up
                </span>
              </div>
            </>
          )}
        </div>

        {/* Trend signal */}
        {hasSignal ? (
          <div className="text-right sm:text-left">
            <div className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
              {data.signal!.label}
            </div>
            <div className={`inline-flex items-center gap-1 text-[15px] font-bold ${
              data.signal!.up === true ? 'text-emerald-600' :
              data.signal!.up === false ? 'text-rose-600' :
              'text-ink-4'
            }`}>
              {data.signal!.up === true ? <ArrowUpRight className="w-3.5 h-3.5" /> :
               data.signal!.up === false ? <ArrowDownRight className="w-3.5 h-3.5" /> :
               <Minus className="w-3.5 h-3.5" />}
              {data.signal!.value}
            </div>
          </div>
        ) : (
          <div />
        )}
      </div>
    </div>
  )
}
