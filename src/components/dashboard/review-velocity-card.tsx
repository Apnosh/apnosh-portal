'use client'

/**
 * Review velocity — count of new reviews this week vs last week vs
 * 12-week average. Single small card meant to live on the Reviews
 * page next to the existing platform breakdown.
 */

import { useEffect, useState } from 'react'
import { TrendingUp, TrendingDown, Minus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'

export default function ReviewVelocityCard({ locationId }: { locationId?: string | null }) {
  const { client } = useClient()
  const [data, setData] = useState<{
    thisWeek: number
    lastWeek: number
    avgWeekly: number
    weekly: number[]
  } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setLoading(true)
    const supabase = createClient()
    const since = new Date()
    since.setUTCDate(since.getUTCDate() - 7 * 14)
    let q = supabase
      .from('reviews')
      .select('created_at')
      .eq('client_id', client.id)
      .gte('created_at', since.toISOString())
    if (locationId) q = q.eq('location_id', locationId)
    q.then(({ data: rows }) => {
      if (cancelled) return
      const buckets = bucketByWeek((rows ?? []) as Array<{ created_at: string }>, 14)
      const thisWeek = buckets[buckets.length - 1] ?? 0
      const lastWeek = buckets[buckets.length - 2] ?? 0
      const earlier = buckets.slice(0, -2)
      const avgWeekly = earlier.length === 0
        ? 0
        : Math.round((earlier.reduce((s, n) => s + n, 0) / earlier.length) * 10) / 10
      setData({ thisWeek, lastWeek, avgWeekly, weekly: buckets })
    }).then(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [client?.id, locationId])

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-4">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-sm font-semibold text-ink">Review velocity</h2>
        </div>
        <div className="flex items-center gap-2 text-xs text-ink-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
        </div>
      </div>
    )
  }
  if (!data) return null

  const delta = data.thisWeek - data.lastWeek
  const Icon = delta > 0 ? TrendingUp : delta < 0 ? TrendingDown : Minus
  const trendColor = delta > 0 ? 'text-emerald-600' : delta < 0 ? 'text-rose-600' : 'text-ink-3'

  const max = Math.max(...data.weekly, 1)

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-4">
      <div className="flex items-center justify-between mb-1">
        <h2 className="text-sm font-semibold text-ink">Review velocity</h2>
        <span className={`inline-flex items-center gap-1 text-[11px] ${trendColor}`}>
          <Icon className="w-3 h-3" />
          {delta > 0 ? '+' : ''}{delta}
        </span>
      </div>
      <p className="text-[11px] text-ink-3 mb-3">
        New reviews per week, last 14 weeks.
      </p>
      <div className="flex items-end gap-3">
        <div>
          <div className="text-[26px] font-semibold text-ink tabular-nums leading-none">{data.thisWeek}</div>
          <div className="text-[10px] uppercase tracking-wider text-ink-4 mt-1">This week</div>
        </div>
        {/* Bars */}
        <div className="flex-1 flex items-end gap-0.5 h-10">
          {data.weekly.map((n, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${i === data.weekly.length - 1 ? 'bg-brand' : 'bg-ink-7'}`}
              style={{ height: `${Math.max(8, (n / max) * 100)}%` }}
              title={`${n} review${n === 1 ? '' : 's'}`}
            />
          ))}
        </div>
      </div>
      <p className="mt-2 text-[11px] text-ink-3">
        12-week average: <strong className="text-ink-2 tabular-nums">{data.avgWeekly}</strong> per week
      </p>
    </div>
  )
}

function bucketByWeek(rows: Array<{ created_at: string }>, weeks: number): number[] {
  const buckets = Array(weeks).fill(0)
  const now = new Date()
  for (const r of rows) {
    const d = new Date(r.created_at)
    const ageDays = Math.floor((now.getTime() - d.getTime()) / (24 * 60 * 60 * 1000))
    const weekIndex = weeks - 1 - Math.floor(ageDays / 7)
    if (weekIndex >= 0 && weekIndex < weeks) buckets[weekIndex]++
  }
  return buckets
}
