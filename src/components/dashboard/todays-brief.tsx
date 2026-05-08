'use client'

/**
 * Today's brief — AI-generated 60-80 word morning brief at the top of
 * the client dashboard. Calls /api/dashboard/brief with 24-hour cache.
 *
 * Voice: calm, confident, practical (set in the API system prompt).
 * Renders a fade-in skeleton while loading; no error UI bubbles up
 * because the endpoint always returns text (real or fallback).
 */

import { useEffect, useState } from 'react'
import { Sparkles, RefreshCw } from 'lucide-react'

interface BriefData {
  text: string
  generatedAt: string
  model: string
  cached: boolean
}

export default function TodaysBrief({
  clientId,
  initialBrief,
}: {
  clientId: string
  /** When provided, skips the initial fetch (parent already loaded the brief in a batch). */
  initialBrief?: BriefData | null
}) {
  const [brief, setBrief] = useState<BriefData | null>(initialBrief ?? null)
  // If parent provided initialBrief (even null = no cache), we don't show a loading state — we
  // either render the cached brief or kick off a background generation silently.
  const [loading, setLoading] = useState(initialBrief === undefined)
  const [refreshing, setRefreshing] = useState(false)

  async function load(refresh = false) {
    if (refresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch('/api/dashboard/brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, refresh }),
      })
      const json = await res.json()
      if (res.ok && json.text) setBrief(json)
    } catch {
      // silent — UI shows nothing rather than an error
    }
    setLoading(false)
    setRefreshing(false)
  }

  useEffect(() => {
    if (initialBrief !== undefined) {
      // Parent passed a value. Sync our state to it (covers the case
      // where bundle starts undefined then transitions to {...} or null).
      setBrief(initialBrief)
      setLoading(false)
      // If null = no cached brief, kick off background generation so
      // tomorrow's load has a cache hit. Don't show a loading skeleton.
      if (initialBrief === null) {
        load(false).catch(() => { /* silent */ })
      }
      return
    }
    // No parent batch — do the legacy fetch path
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, initialBrief])

  if (loading) {
    return (
      <div className="rounded-xl p-5 mb-4 bg-white border" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="animate-pulse space-y-2">
          <div className="h-3 bg-ink-6 rounded w-24" />
          <div className="h-4 bg-ink-6 rounded w-full" />
          <div className="h-4 bg-ink-6 rounded w-5/6" />
          <div className="h-4 bg-ink-6 rounded w-3/4" />
        </div>
      </div>
    )
  }

  // No cached brief and parent batch didn't pass one — render an unobtrusive
  // "Composing your brief" placeholder while the background generation runs.
  if (!brief) {
    return (
      <div className="rounded-xl p-5 mb-4 bg-white border" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="w-4 h-4 text-amber-600" />
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
            Today&apos;s brief
          </span>
        </div>
        <p className="text-[13px] italic" style={{ color: 'var(--db-ink-3, #888)' }}>
          Composing your brief — this only happens once a day, ~5 seconds.
        </p>
      </div>
    )
  }

  const generated = new Date(brief.generatedAt)
  const isToday = generated.toDateString() === new Date().toDateString()

  return (
    <div
      className="rounded-xl p-5 mb-4 border bg-gradient-to-br from-white via-white to-amber-50/30"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)' }}
          >
            <Sparkles className="w-3 h-3 text-white" />
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
            Today&apos;s brief
          </span>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="text-ink-4 hover:text-ink-2 disabled:opacity-50"
          title="Regenerate brief"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>
      <p
        className="text-[15px] leading-relaxed"
        style={{ color: 'var(--db-black, #111)' }}
      >
        {brief.text}
      </p>
      <p className="text-[10px] mt-3" style={{ color: 'var(--db-ink-4, #aaa)' }}>
        {isToday ? `Generated ${generated.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `Generated ${generated.toLocaleDateString()}`}
        {' · '}AI assistant
      </p>
    </div>
  )
}
