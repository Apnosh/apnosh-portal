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

export default function TodaysBrief({ clientId }: { clientId: string }) {
  const [brief, setBrief] = useState<BriefData | null>(null)
  const [loading, setLoading] = useState(true)
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
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

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

  if (!brief) return null

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
