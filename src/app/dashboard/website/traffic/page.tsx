'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, Users, Eye, TrendingUp, TrendingDown, Minus,
  ChevronDown, FileText, Search, Share2, Link as LinkIcon, Mail, DollarSign,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { WebsiteTraffic, TrafficSources, TopPage } from '@/types/database'

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Search }> = {
  direct: { label: 'Direct', icon: LinkIcon },
  search: { label: 'Search', icon: Search },
  social: { label: 'Social', icon: Share2 },
  referral: { label: 'Referral', icon: LinkIcon },
  email: { label: 'Email', icon: Mail },
  paid: { label: 'Paid Ads', icon: DollarSign },
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

export default function WebsiteTrafficPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [traffic, setTraffic] = useState<WebsiteTraffic[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const { data } = await supabase
      .from('website_traffic')
      .select('*')
      .eq('client_id', client.id)
      .order('year', { ascending: false })
      .order('month', { ascending: false })

    const rows = (data ?? []) as WebsiteTraffic[]
    setTraffic(rows)

    // Default to latest month with data
    if (rows.length > 0) {
      const hasCurrent = rows.some(r => r.month === selectedMonth && r.year === selectedYear)
      if (!hasCurrent) {
        setSelectedMonth(rows[0].month)
        setSelectedYear(rows[0].year)
      }
    }

    setLoading(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['website_traffic'], load)

  const current = useMemo(
    () => traffic.find(t => t.month === selectedMonth && t.year === selectedYear) || null,
    [traffic, selectedMonth, selectedYear],
  )

  const prevMonth = selectedMonth === 1 ? 12 : selectedMonth - 1
  const prevYear = selectedMonth === 1 ? selectedYear - 1 : selectedYear
  const previous = useMemo(
    () => traffic.find(t => t.month === prevMonth && t.year === prevYear) || null,
    [traffic, prevMonth, prevYear],
  )

  const availablePeriods = useMemo(
    () => traffic.map(t => ({ year: t.year, month: t.month })),
    [traffic],
  )

  if (clientLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-pulse">
        <div className="h-8 w-48 bg-ink-6 rounded" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-28" />
          ))}
        </div>
      </div>
    )
  }

  const hasData = traffic.length > 0

  // Calculate total traffic for source percentages
  const sourcesTotal = current
    ? Object.values(current.traffic_sources as TrafficSources).reduce<number>((sum, v) => sum + (v ?? 0), 0)
    : 0

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/website" className="text-ink-4 hover:text-ink transition-colors mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
              <BarChart3 className="w-6 h-6 text-ink-4" />
              Website Traffic
            </h1>
            <p className="text-ink-3 text-sm mt-0.5">Visitors, top pages, and traffic sources.</p>
          </div>
        </div>

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

      {!hasData || !current ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">No traffic data yet</p>
          <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
            Your Apnosh team will publish monthly traffic snapshots here with visitors, top pages, and traffic sources.
          </p>
        </div>
      ) : (
        <>
          {/* Top-level metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <MetricCard
              label="Visitors"
              value={current.visitors}
              change={previous ? calcChange(current.visitors, previous.visitors) : null}
              icon={Users}
            />
            <MetricCard
              label="Pageviews"
              value={current.pageviews}
              change={previous ? calcChange(current.pageviews, previous.pageviews) : null}
              icon={Eye}
            />
            <MetricCard
              label="Sessions"
              value={current.sessions}
              change={previous ? calcChange(current.sessions, previous.sessions) : null}
              icon={TrendingUp}
            />
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center mb-3">
                <TrendingDown className="w-4 h-4 text-ink-3" />
              </div>
              <div className="font-[family-name:var(--font-display)] text-2xl text-ink">
                {current.bounce_rate != null ? `${current.bounce_rate}%` : '—'}
              </div>
              <div className="text-ink-3 text-xs mt-0.5">Bounce Rate</div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Traffic sources */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Traffic Sources</h2>
              {sourcesTotal === 0 ? (
                <p className="text-sm text-ink-4">No source data</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(current.traffic_sources as TrafficSources)
                    .filter(([, v]) => (v ?? 0) > 0)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                    .map(([key, value]) => {
                      const cfg = SOURCE_LABELS[key] || { label: key, icon: LinkIcon }
                      const SrcIcon = cfg.icon
                      const pct = sourcesTotal > 0 ? ((value ?? 0) / sourcesTotal) * 100 : 0
                      return (
                        <div key={key}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="flex items-center gap-2 text-sm text-ink-2">
                              <SrcIcon className="w-3.5 h-3.5 text-ink-4" />
                              {cfg.label}
                            </span>
                            <span className="text-sm text-ink">
                              {formatNumber(value ?? 0)}
                              <span className="text-[10px] text-ink-4 ml-1.5">{pct.toFixed(0)}%</span>
                            </span>
                          </div>
                          <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
                            <div className="h-full bg-brand transition-all" style={{ width: `${pct}%` }} />
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>

            {/* Top pages */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-ink-4" />
                Top Pages
              </h2>
              {(current.top_pages as TopPage[]).length === 0 ? (
                <p className="text-sm text-ink-4">No page data</p>
              ) : (
                <div className="space-y-2">
                  {(current.top_pages as TopPage[]).slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-ink-4 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs text-ink truncate">{p.title || p.path}</div>
                        {p.title && <div className="text-[10px] text-ink-4 truncate font-mono">{p.path}</div>}
                      </div>
                      <span className="text-xs text-ink-2 font-medium">{formatNumber(p.pageviews)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {current.notes && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-2">Notes from your team</h2>
              <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{current.notes}</p>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function MetricCard({
  label, value, change, icon: Icon,
}: {
  label: string
  value: number
  change: number | null
  icon: typeof Users
}) {
  const trendIcon = change == null ? null : change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus
  const trendColor = change == null ? 'text-ink-4' : change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-ink-4'
  const TrendIcon = trendIcon

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ink-3" />
        </div>
        {change != null && TrendIcon && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{formatNumber(value)}</div>
      <div className="text-ink-3 text-xs mt-0.5">{label}</div>
    </div>
  )
}
