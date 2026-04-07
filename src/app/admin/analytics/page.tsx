'use client'

import { useState, useMemo, useEffect } from 'react'
import Link from 'next/link'
import { BarChart3, Activity, Eye, TrendingUp, Upload, ArrowRight } from 'lucide-react'
import { useAllGBPData } from '@/hooks/useGBPData'
import { PeriodSelector } from '@/components/analytics'
import type { Period } from '@/components/analytics'
import type { GBPMonthlyData, Business } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import { formatMonth } from '@/lib/gbp-data'

function periodToMonths(p: Period): number | undefined {
  if (p === '1') return 1
  if (p === '3') return 3
  if (p === '6') return 6
  return undefined
}

function fmt(v: number): string {
  if (v >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return Math.round(v).toString()
}

function totalInteractions(d: GBPMonthlyData): number {
  return (d.calls ?? 0) + (d.bookings ?? 0) + (d.directions ?? 0) + (d.website_clicks ?? 0)
}

function totalViews(d: GBPMonthlyData): number {
  return (d.search_mobile ?? 0) + (d.search_desktop ?? 0) + (d.maps_mobile ?? 0) + (d.maps_desktop ?? 0)
}

export default function AdminAnalyticsPage() {
  const [period, setPeriod] = useState<Period>('6')
  const months = periodToMonths(period)
  const { data, loading } = useAllGBPData(months)
  const [businesses, setBusinesses] = useState<Business[]>([])
  const [bizLoading, setBizLoading] = useState(true)

  useEffect(() => {
    const supabase = createClient()
    supabase.from('businesses').select('*').then(({ data: biz }) => {
      setBusinesses((biz as Business[]) || [])
      setBizLoading(false)
    })
  }, [])

  // Group data by business
  const byBusiness = useMemo(() => {
    const map: Record<string, GBPMonthlyData[]> = {}
    for (const row of data) {
      if (!map[row.business_id]) map[row.business_id] = []
      map[row.business_id].push(row)
    }
    return map
  }, [data])

  // Aggregate stats
  const stats = useMemo(() => {
    if (!data.length) return null

    let allInteractions = 0
    let allViews = 0
    let topClientId = ''
    let topClientInteractions = 0
    const clientInteractionTotals: Record<string, number> = {}

    for (const row of data) {
      const interactions = totalInteractions(row)
      const views = totalViews(row)
      allInteractions += interactions
      allViews += views
      clientInteractionTotals[row.business_id] = (clientInteractionTotals[row.business_id] || 0) + interactions
    }

    for (const [id, total] of Object.entries(clientInteractionTotals)) {
      if (total > topClientInteractions) {
        topClientInteractions = total
        topClientId = id
      }
    }

    const topBiz = businesses.find(b => b.id === topClientId)

    return {
      totalInteractions: allInteractions,
      totalViews: allViews,
      topClient: topBiz?.name || 'N/A',
      clientCount: Object.keys(byBusiness).length,
    }
  }, [data, businesses, byBusiness])

  if (loading || bizLoading) {
    return (
      <div className="max-w-6xl mx-auto space-y-4">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-ink-6 rounded-xl animate-pulse" />)}
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => <div key={i} className="h-36 bg-ink-6 rounded-xl animate-pulse" />)}
        </div>
      </div>
    )
  }

  if (!data.length) {
    return (
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Analytics</h1>
          <p className="text-ink-3 text-sm mt-1">Google Business Profile performance across all clients.</p>
        </div>
        <div className="bg-white/55 backdrop-blur-xl rounded-2xl border border-white/70 p-12 text-center">
          <BarChart3 className="w-10 h-10 text-ink-4 mx-auto mb-3" />
          <h2 className="text-lg font-[family-name:var(--font-display)] text-ink mb-1">No analytics data yet</h2>
          <p className="text-ink-3 text-sm max-w-md mx-auto mb-4">
            Upload data to get started.
          </p>
          <Link
            href="/admin/analytics/upload"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload data
          </Link>
        </div>
      </div>
    )
  }

  const statCards = [
    { label: 'Total Interactions', value: fmt(stats?.totalInteractions ?? 0), icon: Activity, color: 'bg-brand-tint text-brand-dark' },
    { label: 'Total Views', value: fmt(stats?.totalViews ?? 0), icon: Eye, color: 'bg-blue-50 text-blue-600' },
    { label: 'Top Client', value: stats?.topClient ?? 'N/A', icon: TrendingUp, color: 'bg-emerald-50 text-emerald-600' },
    { label: 'Active Clients', value: String(stats?.clientCount ?? 0), icon: BarChart3, color: 'bg-purple-50 text-purple-600' },
  ]

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Analytics</h1>
          <p className="text-ink-3 text-sm mt-1">Google Business Profile performance across all clients.</p>
        </div>
        <div className="flex items-center gap-3">
          <PeriodSelector value={period} onChange={setPeriod} />
          <Link
            href="/admin/analytics/upload"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
          >
            <Upload className="w-4 h-4" /> Upload
          </Link>
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {statCards.map(stat => (
          <div key={stat.label} className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5 hover:shadow-md transition-all">
            <div className={`w-9 h-9 rounded-xl ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-4 h-4" />
            </div>
            <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{stat.value}</div>
            <div className="text-xs text-ink-4 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Client Cards */}
      <div>
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-3">Clients</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Object.entries(byBusiness).map(([bizId, rows]) => {
            const biz = businesses.find(b => b.id === bizId)
            const interactions = rows.reduce((sum, r) => sum + totalInteractions(r), 0)
            const views = rows.reduce((sum, r) => sum + totalViews(r), 0)
            const sorted = [...rows].sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year)
            const latestRow = sorted[sorted.length - 1]
            const latestLabel = latestRow ? formatMonth(latestRow.month, latestRow.year) : ''

            return (
              <Link
                key={bizId}
                href={`/admin/analytics/${bizId}`}
                className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5 hover:shadow-md transition-all group"
              >
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold text-ink truncate">{biz?.name || 'Unknown'}</h3>
                  <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-brand transition-colors" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="font-[family-name:var(--font-display)] text-lg text-ink">{fmt(interactions)}</div>
                    <div className="text-[11px] text-ink-4">Interactions</div>
                  </div>
                  <div>
                    <div className="font-[family-name:var(--font-display)] text-lg text-ink">{fmt(views)}</div>
                    <div className="text-[11px] text-ink-4">Views</div>
                  </div>
                </div>
                <div className="text-[10px] text-ink-5 mt-3 pt-2 border-t border-ink-6">
                  {rows.length} month{rows.length !== 1 ? 's' : ''} of data &middot; Latest: {latestLabel}
                </div>
              </Link>
            )
          })}
        </div>
      </div>
    </div>
  )
}
