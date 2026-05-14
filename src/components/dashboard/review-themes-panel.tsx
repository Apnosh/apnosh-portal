'use client'

import { useEffect, useState } from 'react'
import { Sparkles, ThumbsUp, ThumbsDown, RefreshCw, Loader2 } from 'lucide-react'
import type { ReviewTheme } from '@/lib/review-themes'

interface ThemesResponse {
  generatedAt: string
  windowStart: string
  windowEnd: string
  reviewCount: number
  themes: ReviewTheme[]
}

export default function ReviewThemesPanel({ locationId }: { locationId?: string | null }) {
  const [data, setData] = useState<ThemesResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [regenerating, setRegenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)
    const q = locationId ? `?locationId=${encodeURIComponent(locationId)}` : ''
    fetch(`/api/dashboard/reviews/themes${q}`)
      .then(async r => {
        const body = await r.json()
        if (!r.ok) throw new Error(body.error || `HTTP ${r.status}`)
        return body as ThemesResponse
      })
      .then(d => { if (!cancelled) setData(d) })
      .catch(e => { if (!cancelled) setError((e as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [locationId])

  async function regenerate() {
    setRegenerating(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/reviews/themes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId }),
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
      setData(body as ThemesResponse)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setRegenerating(false)
    }
  }

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <Sparkles className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">What customers keep mentioning</h2>
        </div>
        <p className="text-xs text-ink-4">Reading the last 90 days of reviews…</p>
      </div>
    )
  }

  if (error || !data || data.themes.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Sparkles className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">What customers keep mentioning</h2>
        </div>
        <p className="text-xs text-ink-4">
          {error
            ? `Couldn't load themes: ${error}`
            : 'Not enough reviews with text in the last 90 days to extract themes yet. Once you have at least 5 written reviews, recurring topics will appear here.'}
        </p>
      </div>
    )
  }

  const maxMentions = Math.max(...data.themes.map(t => t.mentions))

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-start justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">What customers keep mentioning</h2>
        </div>
        <button
          onClick={regenerate}
          disabled={regenerating}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium text-ink-3 hover:text-ink ring-1 ring-ink-6 hover:ring-ink-4 disabled:opacity-50"
        >
          {regenerating
            ? <Loader2 className="w-3 h-3 animate-spin" />
            : <RefreshCw className="w-3 h-3" />}
          Refresh
        </button>
      </div>
      <p className="text-[11px] text-ink-4 mb-4">
        Based on {data.reviewCount} review{data.reviewCount === 1 ? '' : 's'} from the last 90 days.
      </p>

      <div className="space-y-3">
        {data.themes.map((t) => {
          const total = t.praise + t.critical
          const praisePct = total === 0 ? 0 : Math.round((t.praise / total) * 100)
          const widthPct = Math.max(8, Math.round((t.mentions / maxMentions) * 100))
          return (
            <div key={t.theme} className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-medium text-ink capitalize">{t.theme}</span>
                <span className="text-[11px] text-ink-4 tabular-nums">
                  {t.mentions} mention{t.mentions === 1 ? '' : 's'}
                </span>
              </div>
              {/* Praise vs critical bar */}
              <div
                className="h-2 rounded-full bg-ink-7 overflow-hidden flex"
                style={{ width: `${widthPct}%` }}
              >
                <div className="h-full bg-emerald-500" style={{ width: `${praisePct}%` }} />
                <div className="h-full bg-rose-500" style={{ width: `${100 - praisePct}%` }} />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-ink-3">
                <span className="inline-flex items-center gap-1">
                  <ThumbsUp className="w-3 h-3 text-emerald-600" />
                  {t.praise}
                </span>
                <span className="inline-flex items-center gap-1">
                  <ThumbsDown className="w-3 h-3 text-rose-600" />
                  {t.critical}
                </span>
                {t.examples?.[0] && (
                  <span className="text-ink-4 italic truncate">
                    &ldquo;{t.examples[0].snippet}&rdquo;
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
