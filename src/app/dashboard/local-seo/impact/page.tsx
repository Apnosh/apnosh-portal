'use client'

/**
 * Your month — an auto-generated, plain-English recap of what the owner's
 * Google presence did this month vs the same days last month. No admin
 * publishing step: it reads live from gbp_metrics + reviews + the rating.
 */

import { useState, useEffect } from 'react'
import { TrendingUp, TrendingDown, Minus, Star, Loader2 } from 'lucide-react'

interface ImpactMetric { key: string; label: string; value: number; prev: number; deltaPct: number | null }
interface ImpactSummary {
  monthLabel: string
  rangeLabel: string
  throughLabel: string | null
  metrics: ImpactMetric[]
  reviewsThisMonth: number
  reviewsPrevMonth: number
  rating: number | null
  ratingCount: number | null
  hasData: boolean
}

function Delta({ value, prev, deltaPct }: { value: number; prev: number; deltaPct: number | null }) {
  // Brand-new activity (nothing last period) reads as a win, not a divide-by-zero.
  if (deltaPct === null) {
    if (value > 0) return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold"><TrendingUp className="w-3.5 h-3.5" />New</span>
    return <span className="inline-flex items-center gap-1 text-ink-4 text-xs font-medium"><Minus className="w-3.5 h-3.5" />No change</span>
  }
  if (deltaPct > 0) return <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold"><TrendingUp className="w-3.5 h-3.5" />+{deltaPct}%</span>
  if (deltaPct < 0) return <span className="inline-flex items-center gap-1 text-red-600 text-xs font-semibold"><TrendingDown className="w-3.5 h-3.5" />{deltaPct}%</span>
  return <span className="inline-flex items-center gap-1 text-ink-4 text-xs font-medium"><Minus className="w-3.5 h-3.5" />Flat</span>
}

export default function ImpactPage() {
  const [data, setData] = useState<ImpactSummary | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/dashboard/impact')
      .then(r => r.ok ? r.json() : null)
      .then((d: ImpactSummary | null) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false))
  }, [])

  const reviewDelta = data ? data.reviewsThisMonth - data.reviewsPrevMonth : 0

  return (
    <div className="max-w-[760px] mx-auto px-4 lg:px-6 pt-6 pb-20 space-y-5">
      <div>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Local SEO</p>
        <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1 flex items-center gap-2">
          <TrendingUp className="w-6 h-6 text-brand" />
          Your month
        </h1>
        <p className="text-ink-3 text-sm mt-0.5">
          What your Google listing did this month, compared to the same days last month.
        </p>
      </div>

      {loading && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-10 flex items-center justify-center text-ink-3">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {!loading && !data && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-sm text-amber-900">
          We couldn&rsquo;t load your numbers right now. Try again in a moment.
        </div>
      )}

      {!loading && data && !data.hasData && (
        <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-8 text-center">
          <p className="text-base font-semibold text-ink">Still gathering {data.monthLabel}</p>
          <p className="text-sm text-ink-3 mt-1 max-w-sm mx-auto">
            Google updates these numbers daily. Once your listing logs some activity this month, your recap shows up here.
          </p>
        </div>
      )}

      {!loading && data && data.hasData && (
        <>
          {/* Headline */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-brand">{data.monthLabel}</p>
            <h2 className="text-xl font-semibold text-ink mt-1 leading-snug">
              Here&rsquo;s what your Google presence did this month.
            </h2>
            <p className="text-sm text-ink-3 mt-1">{data.rangeLabel} vs the same days last month.</p>
            {data.throughLabel && (
              <p className="text-xs text-ink-4 mt-0.5">Through {data.throughLabel}, Google&rsquo;s latest data.</p>
            )}
            {data.rating != null && (
              <div className="mt-4 inline-flex items-center gap-2 rounded-full bg-amber-50 ring-1 ring-amber-200 px-3 py-1.5">
                <Star className="w-4 h-4 text-amber-500 fill-amber-500" />
                <span className="text-sm font-semibold text-ink">{data.rating.toFixed(1)}</span>
                {data.ratingCount != null && <span className="text-sm text-ink-3">from {data.ratingCount} reviews</span>}
              </div>
            )}
          </div>

          {/* Metric tiles */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {data.metrics.map(m => (
              <div key={m.key} className="rounded-2xl bg-white ring-1 ring-ink-6 p-4">
                <p className="text-[28px] font-bold text-ink leading-none tabular-nums">{m.value.toLocaleString()}</p>
                <p className="text-[13px] text-ink-3 mt-1.5">{m.label}</p>
                <div className="mt-2"><Delta value={m.value} prev={m.prev} deltaPct={m.deltaPct} /></div>
              </div>
            ))}
          </div>

          {/* Reviews */}
          <div className="rounded-2xl bg-white ring-1 ring-ink-6 p-5 flex items-center gap-4">
            <div className="w-11 h-11 rounded-full bg-amber-50 flex items-center justify-center flex-shrink-0">
              <Star className="w-5 h-5 text-amber-500" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-ink">
                {data.reviewsThisMonth} new {data.reviewsThisMonth === 1 ? 'review' : 'reviews'} this month
              </p>
              <p className="text-sm text-ink-3 mt-0.5">
                {reviewDelta > 0 && `That's ${reviewDelta} more than the same days last month.`}
                {reviewDelta < 0 && `${Math.abs(reviewDelta)} fewer than the same days last month. A review request can help.`}
                {reviewDelta === 0 && data.reviewsThisMonth > 0 && 'Same pace as last month. Keep it going.'}
                {reviewDelta === 0 && data.reviewsThisMonth === 0 && 'No new reviews yet. Try sending a review request.'}
              </p>
            </div>
          </div>

          <p className="text-xs text-ink-4 px-1">
            Numbers come straight from Google, which reports a few days behind. We compare only the days Google has finished counting, so the change is apples to apples.
          </p>
        </>
      )}
    </div>
  )
}
