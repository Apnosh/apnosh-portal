'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  TrendingUp, TrendingDown, Minus, Users, Heart,
  Eye, Share2, BarChart3, Award, ChevronDown,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { SocialMetricsRow, SocialPlatform } from '@/types/database'

const PLATFORM_LABEL: Record<SocialPlatform, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
  google_business: 'Google',
  youtube: 'YouTube',
  twitter: 'Twitter',
}

const PLATFORM_COLOR: Record<SocialPlatform, string> = {
  instagram: 'bg-pink-50 text-pink-700',
  facebook: 'bg-blue-50 text-blue-700',
  tiktok: 'bg-slate-100 text-slate-700',
  linkedin: 'bg-sky-50 text-sky-700',
  google_business: 'bg-green-50 text-green-700',
  youtube: 'bg-red-50 text-red-700',
  twitter: 'bg-cyan-50 text-cyan-700',
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function calcChange(current: number, previous: number): number {
  if (previous === 0) return current === 0 ? 0 : 100
  return Math.round(((current - previous) / previous) * 1000) / 10
}

export function SummaryView() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [metrics, setMetrics] = useState<SocialMetricsRow[]>([])
  const [loading, setLoading] = useState(true)

  // Current month/year for display (default: latest data we have)
  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    // Fetch ALL metrics for this client so we can calc prior month + trends
    const { data } = await supabase
      .from('social_metrics')
      .select('*')
      .eq('client_id', client.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    setMetrics((data ?? []) as SocialMetricsRow[])

    // If we have data and default month/year has nothing, jump to latest
    if (data && data.length > 0) {
      const latest = data[0] as SocialMetricsRow
      const hasCurrent = data.some(m => (m as SocialMetricsRow).month === selectedMonth && (m as SocialMetricsRow).year === selectedYear)
      if (!hasCurrent) {
        setSelectedMonth(latest.month)
        setSelectedYear(latest.year)
      }
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['social_metrics'], load)

  // Metrics for current month (summed across platforms)
  const currentMetrics = useMemo(() => {
    const rows = metrics.filter(m => m.month === selectedMonth && m.year === selectedYear)
    return {
      rows,
      reach: rows.reduce((sum, r) => sum + r.total_reach, 0),
      engagement: rows.reduce((sum, r) => sum + r.total_engagement, 0),
      followers: rows.reduce((sum, r) => sum + r.followers_count, 0),
      followersChange: rows.reduce((sum, r) => sum + r.followers_change, 0),
      posts: rows.reduce((sum, r) => sum + r.posts_published, 0),
      planned: rows.reduce((sum, r) => sum + r.posts_planned, 0),
    }
  }, [metrics, selectedMonth, selectedYear])

  // Previous month for MoM comparison
  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
  const previousMetrics = useMemo(() => {
    const rows = metrics.filter(m => m.month === prevMonth && m.year === prevYear)
    return {
      reach: rows.reduce((sum, r) => sum + r.total_reach, 0),
      engagement: rows.reduce((sum, r) => sum + r.total_engagement, 0),
      followers: rows.reduce((sum, r) => sum + r.followers_count, 0),
      posts: rows.reduce((sum, r) => sum + r.posts_published, 0),
    }
  }, [metrics, prevMonth, prevYear])

  // Top performing post (highest engagement across all rows this month)
  const topPost = useMemo(() => {
    let best: SocialMetricsRow | null = null
    for (const row of currentMetrics.rows) {
      if (row.top_post_engagement && (!best || (row.top_post_engagement > (best.top_post_engagement || 0)))) {
        best = row
      }
    }
    return best
  }, [currentMetrics.rows])

  // Unique months/years we have data for (for the selector)
  const availablePeriods = useMemo(() => {
    const set = new Set<string>()
    for (const m of metrics) set.add(`${m.year}-${String(m.month).padStart(2, '0')}`)
    return Array.from(set)
      .sort()
      .reverse()
      .map(s => { const [y, mo] = s.split('-'); return { year: Number(y), month: Number(mo) } })
  }, [metrics])

  const monthLabel = new Date(selectedYear, selectedMonth - 1).toLocaleDateString('en-US', {
    month: 'long', year: 'numeric',
  })

  const reachChange = calcChange(currentMetrics.reach, previousMetrics.reach)
  const engagementChange = calcChange(currentMetrics.engagement, previousMetrics.engagement)
  const followersChange = calcChange(currentMetrics.followers, previousMetrics.followers)

  if (clientLoading || loading) return <PerformanceSkeleton />

  const hasData = metrics.length > 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Month selector — title comes from the parent container */}
      <div className="flex items-center justify-end">
        {availablePeriods.length > 0 && (
          <div className="relative">
            <select
              value={`${selectedYear}-${String(selectedMonth).padStart(2, '0')}`}
              onChange={e => {
                const [y, m] = e.target.value.split('-')
                setSelectedYear(Number(y))
                setSelectedMonth(Number(m))
              }}
              className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-2 text-sm text-ink font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
            >
              {availablePeriods.map(p => (
                <option key={`${p.year}-${p.month}`} value={`${p.year}-${String(p.month).padStart(2, '0')}`}>
                  {new Date(p.year, p.month - 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-ink-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}
      </div>

      {!hasData ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No performance data yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team will publish monthly performance snapshots here. You&apos;ll see reach,
            engagement, follower growth, and your top post per platform.
          </p>
        </div>
      ) : currentMetrics.rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No data for {monthLabel}</p>
          <p className="text-xs text-ink-4 mt-1">Pick a different month from the selector above.</p>
        </div>
      ) : (
        <>
          {/* Top-level stat cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard label="Total Reach" value={currentMetrics.reach} change={reachChange} icon={Eye} />
            <MetricCard label="Total Engagement" value={currentMetrics.engagement} change={engagementChange} icon={Heart} />
            <MetricCard label="Followers" value={currentMetrics.followers} change={followersChange} icon={Users} subValue={currentMetrics.followersChange} />
            <MetricCard
              label="Posts Published"
              value={currentMetrics.posts}
              change={calcChange(currentMetrics.posts, previousMetrics.posts)}
              icon={Share2}
              subLabel={currentMetrics.planned > 0 ? `of ${currentMetrics.planned} planned` : undefined}
            />
          </div>

          {/* Top post */}
          {topPost && topPost.top_post_url && (
            <div>
              <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
                <Award className="w-4 h-4 text-amber-500" />
                Top Performing Post
              </h2>
              <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                <div className="grid grid-cols-1 sm:grid-cols-[200px_1fr] gap-0">
                  {topPost.top_post_image_url ? (
                    <div className="bg-bg-2 flex items-center justify-center aspect-square sm:aspect-auto">
                      <img src={topPost.top_post_image_url} alt="Top post" className="w-full h-full object-cover" />
                    </div>
                  ) : (
                    <div className="bg-bg-2 flex items-center justify-center aspect-square sm:aspect-auto">
                      <Award className="w-10 h-10 text-ink-5" />
                    </div>
                  )}
                  <div className="p-5">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PLATFORM_COLOR[topPost.platform]}`}>
                      {PLATFORM_LABEL[topPost.platform]}
                    </span>
                    {topPost.top_post_caption && (
                      <p className="text-sm text-ink-2 mt-2 line-clamp-3 leading-relaxed">{topPost.top_post_caption}</p>
                    )}
                    <div className="flex items-center gap-2 mt-3">
                      <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Engagement</span>
                      <span className="font-[family-name:var(--font-display)] text-lg text-ink">
                        {formatNumber(topPost.top_post_engagement ?? 0)}
                      </span>
                    </div>
                    <a
                      href={topPost.top_post_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-3 inline-flex items-center gap-1 text-xs text-brand hover:text-brand-dark font-medium"
                    >
                      View post →
                    </a>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Per-platform breakdown */}
          <div>
            <h2 className="text-sm font-semibold text-ink mb-3">By Platform</h2>
            <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-bg-2 border-b border-ink-6">
                      <th className="text-left py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Platform</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Reach</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Engagement</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Followers</th>
                      <th className="text-right py-2.5 px-4 text-[11px] text-ink-4 font-medium uppercase tracking-wide">Posts</th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMetrics.rows.map(row => (
                      <tr key={row.id} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50 transition-colors">
                        <td className="py-3 px-4">
                          <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${PLATFORM_COLOR[row.platform]}`}>
                            {PLATFORM_LABEL[row.platform]}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right text-ink font-medium">{formatNumber(row.total_reach)}</td>
                        <td className="py-3 px-4 text-right text-ink font-medium">{formatNumber(row.total_engagement)}</td>
                        <td className="py-3 px-4 text-right text-ink">
                          {formatNumber(row.followers_count)}
                          {row.followers_change !== 0 && (
                            <span className={`ml-1 text-[10px] ${row.followers_change > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                              {row.followers_change > 0 ? '+' : ''}{row.followers_change}
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right text-ink">{row.posts_published}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MetricCard({
  label, value, change, icon: Icon, subValue, subLabel,
}: {
  label: string
  value: number
  change: number
  icon: typeof Eye
  subValue?: number
  subLabel?: string
}) {
  const trendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const trendColor = change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-ink-4'
  const TrendIcon = trendIcon

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ink-3" />
        </div>
        <span className={`text-xs font-medium flex items-center gap-0.5 ${trendColor}`}>
          <TrendIcon className="w-3 h-3" />
          {change > 0 ? '+' : ''}{change}%
        </span>
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{formatNumber(value)}</div>
      <div className="text-ink-3 text-xs mt-0.5">{label}</div>
      {subValue !== undefined && subValue !== 0 && (
        <div className={`text-[10px] mt-1 ${subValue > 0 ? 'text-emerald-600' : 'text-red-500'}`}>
          {subValue > 0 ? '+' : ''}{subValue} this month
        </div>
      )}
      {subLabel && <div className="text-[10px] text-ink-4 mt-1">{subLabel}</div>}
    </div>
  )
}

function PerformanceSkeleton() {
  return (
    <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
      <div className="h-8 w-48 bg-ink-6 rounded" />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-white rounded-xl border border-ink-6 p-5 h-32" />
        ))}
      </div>
      <div className="bg-white rounded-xl border border-ink-6 h-40" />
    </div>
  )
}
