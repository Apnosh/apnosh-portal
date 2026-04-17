'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, Users, Target, Search,
  TrendingUp, TrendingDown, ChevronDown, ChevronRight,
  MapPin, FileText, Globe, Phone, Navigation, Send, Calendar,
  RefreshCw, Info,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import {
  buildWebsiteInsight,
  type DailyWebsiteRow, type DailySearchRow, type WebsiteInsight,
  type UniqueAggregateOverride,
} from '@/lib/website-insights'

// ---------------------------------------------------------------------------
// Time range options
// ---------------------------------------------------------------------------

type RangeKey = 'last_30_days' | 'last_7_days' | 'this_month' | 'last_month' | 'last_90_days'

const RANGE_OPTIONS: Record<RangeKey, { label: string; compute: () => { start: Date; end: Date } }> = {
  last_7_days: {
    label: 'Last 7 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      return { start, end }
    },
  },
  last_30_days: {
    label: 'Last 30 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 29)
      return { start, end }
    },
  },
  this_month: {
    label: 'This month',
    compute: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date()
      return { start, end }
    },
  },
  last_month: {
    label: 'Last month',
    compute: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start, end }
    },
  },
  last_90_days: {
    label: 'Last 90 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 89)
      return { start, end }
    },
  },
}

function toDateStr(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function previousRange(start: Date, end: Date): { start: Date; end: Date } {
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const newEnd = new Date(start); newEnd.setDate(newEnd.getDate() - 1)
  const newStart = new Date(newEnd); newStart.setDate(newStart.getDate() - days + 1)
  return { start: newStart, end: newEnd }
}

function formatRange(start: Date, end: Date): string {
  const sameYear = start.getFullYear() === end.getFullYear()
  const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: sameYear ? undefined : 'numeric' })
  const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return `${startStr} – ${endStr}`
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

// ---------------------------------------------------------------------------

export default function WebsiteTrafficPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [rangeKey, setRangeKey] = useState<RangeKey>('last_30_days')
  const [dailyWeb, setDailyWeb] = useState<DailyWebsiteRow[]>([])
  const [dailySearch, setDailySearch] = useState<DailySearchRow[]>([])
  const [monthlyUniques, setMonthlyUniques] = useState<Array<{
    year: number; month: number
    unique_visitors: number | null; unique_new_users: number | null; unique_returning_users: number | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [latestSync, setLatestSync] = useState<string | null>(null)

  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [ga, gsc, monthly] = await Promise.all([
      supabase
        .from('website_metrics')
        .select('date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages, conversion_events, top_cities, landing_pages, new_users, returning_users, top_referrers, created_at')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(400),
      supabase
        .from('search_metrics')
        .select('date, total_impressions, total_clicks, avg_ctr, avg_position, top_queries, top_pages')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(400),
      supabase
        .from('website_metrics_monthly')
        .select('year, month, unique_visitors, unique_new_users, unique_returning_users')
        .eq('client_id', client.id),
    ])

    const gaRowsRaw = (ga.data ?? []) as Array<DailyWebsiteRow & { created_at?: string }>
    setDailyWeb(gaRowsRaw)
    setDailySearch((gsc.data ?? []) as DailySearchRow[])
    setMonthlyUniques(monthly.data ?? [])
    if (gaRowsRaw.length > 0) setLatestSync(gaRowsRaw[0].created_at ?? null)
    setLoading(false)
  }, [client?.id, supabase])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['website_metrics', 'search_metrics', 'website_metrics_monthly'], load)

  // Compute insight for the selected range
  const insight = useMemo<WebsiteInsight | null>(() => {
    if (dailyWeb.length === 0 && dailySearch.length === 0) return null

    const { start, end } = RANGE_OPTIONS[rangeKey].compute()
    const prev = previousRange(start, end)
    const startStr = toDateStr(start)
    const endStr = toDateStr(end)
    const prevStartStr = toDateStr(prev.start)
    const prevEndStr = toDateStr(prev.end)

    const currDaily = dailyWeb.filter(r => r.date >= startStr && r.date <= endStr)
    const prevDaily = dailyWeb.filter(r => r.date >= prevStartStr && r.date <= prevEndStr)
    const currSearch = dailySearch.filter(r => r.date >= startStr && r.date <= endStr)
    const prevSearch = dailySearch.filter(r => r.date >= prevStartStr && r.date <= prevEndStr)

    // Use monthly aggregate override when the range IS an exact calendar month
    let override: UniqueAggregateOverride | undefined
    let prevOverride: UniqueAggregateOverride | undefined
    if (rangeKey === 'this_month' || rangeKey === 'last_month') {
      const month = start.getMonth() + 1
      const year = start.getFullYear()
      const match = monthlyUniques.find(m => m.year === year && m.month === month)
      if (match?.unique_visitors != null) {
        override = {
          unique_visitors: match.unique_visitors,
          unique_new_users: match.unique_new_users ?? undefined,
          unique_returning_users: match.unique_returning_users ?? undefined,
        }
      }
      const prevM = prev.start.getMonth() + 1
      const prevY = prev.start.getFullYear()
      const prevMatch = monthlyUniques.find(m => m.year === prevY && m.month === prevM)
      if (prevMatch?.unique_visitors != null) {
        prevOverride = {
          unique_visitors: prevMatch.unique_visitors,
          unique_new_users: prevMatch.unique_new_users ?? undefined,
          unique_returning_users: prevMatch.unique_returning_users ?? undefined,
        }
      }
    }

    return buildWebsiteInsight(
      { daily: currDaily, search: currSearch, uniqueOverride: override },
      { daily: prevDaily, search: prevSearch, uniqueOverride: prevOverride },
      startStr,
      endStr,
    )
  }, [dailyWeb, dailySearch, monthlyUniques, rangeKey])

  const { start, end } = RANGE_OPTIONS[rangeKey].compute()
  const rangeLabel = formatRange(start, end)

  if (clientLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto space-y-6 animate-pulse">
        <div className="h-6 w-48 bg-ink-6 rounded" />
        <div className="h-24 bg-ink-6 rounded-xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-28" />
          ))}
        </div>
      </div>
    )
  }

  const hasAnyData = insight != null && (
    insight.hero.visitors.hasData ||
    insight.hero.actions.hasData ||
    insight.hero.searchVisibility.hasData ||
    insight.advanced.sessions > 0
  )

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/website" className="text-ink-4 hover:text-ink transition-colors mt-1">
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">
              Your Website
            </h1>
            <p className="text-ink-3 text-sm mt-0.5">{rangeLabel}</p>
          </div>
        </div>

        <div className="relative">
          <select
            value={rangeKey}
            onChange={e => setRangeKey(e.target.value as RangeKey)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-2 text-sm text-ink font-medium focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand cursor-pointer"
          >
            {(Object.keys(RANGE_OPTIONS) as RangeKey[]).map(k => (
              <option key={k} value={k}>{RANGE_OPTIONS[k].label}</option>
            ))}
          </select>
          <ChevronDown className="w-4 h-4 text-ink-4 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>
      </div>

      {!hasAnyData || !insight ? (
        <EmptyState />
      ) : (
        <>
          {/* HEADLINE — the story */}
          <div className="bg-gradient-to-br from-brand-tint/40 to-white rounded-2xl border border-brand-tint p-6">
            <h2 className="font-[family-name:var(--font-display)] text-2xl text-ink mb-3 leading-tight">
              {insight.headline}
            </h2>
            <p className="text-[15px] text-ink-2 leading-relaxed">
              {insight.narrative}
            </p>
          </div>

          {/* 3 HERO METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <HeroCard metric={insight.hero.visitors} icon={Users} />
            <HeroCard metric={insight.hero.actions} icon={Target} emptyText="No actions tracked yet" />
            <HeroCard metric={insight.hero.searchVisibility} icon={Search} emptyText="Not showing on Google yet" />
          </div>

          {/* WHERE THEY CAME FROM + WHERE THEY ARE */}
          {(insight.sources.length > 0 || insight.cities.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insight.sources.length > 0 && <SourcesCard sources={insight.sources} />}
              {insight.cities.length > 0 && <CitiesCard cities={insight.cities} />}
            </div>
          )}

          {/* WHAT THEY LOOKED AT */}
          {insight.topPages.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
                <FileText className="w-4 h-4 text-ink-4" />
                What they looked at
              </h3>
              <p className="text-xs text-ink-4 mb-4">The pages people viewed most on your site.</p>
              <div className="space-y-2">
                {insight.topPages.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] text-ink-4 font-mono w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink truncate">{p.label}</div>
                      <div className="text-[10px] text-ink-4 truncate font-mono">{p.path}</div>
                    </div>
                    <span className="text-xs text-ink-2 font-medium">{formatNumber(p.views)} views</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HOW YOU SHOW UP ON GOOGLE */}
          {insight.search.hasData && <SearchCard search={insight.search} />}

          {/* ADVANCED DETAILS (collapsed) */}
          <AdvancedSection
            open={showAdvanced}
            onToggle={() => setShowAdvanced(v => !v)}
            advanced={insight.advanced}
          />

          {/* Freshness + method footnote */}
          {latestSync && (
            <div className="flex items-start gap-1.5 text-[11px] text-ink-4 pt-2">
              <RefreshCw className="w-3 h-3 mt-0.5" />
              <span>
                Last updated {new Date(latestSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}{' '}
                at {new Date(latestSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.{' '}
                {insight.meta.usingMonthlyAggregate
                  ? 'Visitor count matches Google Analytics exactly.'
                  : 'Visitor count uses a daily sum (may slightly overcount repeat visitors across days).'}
              </span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function EmptyState() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
      <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
      <p className="text-sm font-medium text-ink-2">No data for this period yet</p>
      <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
        If you just connected Google Analytics, data takes up to 24 hours to appear.
        Try switching to &ldquo;Last 30 days&rdquo; if you selected a shorter window.
      </p>
    </div>
  )
}

function HeroCard({
  metric, icon: Icon, emptyText,
}: {
  metric: { value: number; label: string; sublabel: string | null; trendPct: number | null; hasData: boolean }
  icon: typeof Users
  emptyText?: string
}) {
  const trendColor = metric.trendPct == null ? 'text-ink-4'
    : metric.trendPct > 0 ? 'text-emerald-600'
    : metric.trendPct < 0 ? 'text-red-500'
    : 'text-ink-4'
  const TrendIcon = metric.trendPct == null ? null : metric.trendPct > 0 ? TrendingUp : metric.trendPct < 0 ? TrendingDown : null

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-bg-2 flex items-center justify-center">
          <Icon className="w-4 h-4 text-ink-3" />
        </div>
        {metric.hasData && metric.trendPct != null && TrendIcon && (
          <span className={`text-xs font-medium flex items-center gap-0.5 ${trendColor}`}>
            <TrendIcon className="w-3 h-3" />
            {metric.trendPct > 0 ? '+' : ''}{metric.trendPct}%
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-3xl text-ink">
        {metric.hasData ? formatNumber(metric.value) : '—'}
      </div>
      <div className="text-ink-3 text-xs mt-1 uppercase tracking-wide font-medium">{metric.label}</div>
      <div className="text-[11px] text-ink-4 mt-1 min-h-[14px]">
        {metric.hasData ? metric.sublabel : (emptyText ?? 'No data yet')}
      </div>
    </div>
  )
}

function SourcesCard({ sources }: { sources: Array<{ label: string; count: number; pct: number }> }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
        <Globe className="w-4 h-4 text-ink-4" />
        Where they came from
      </h3>
      <p className="text-xs text-ink-4 mb-4">How visitors found your site.</p>
      <div className="space-y-3">
        {sources.slice(0, 6).map(s => (
          <div key={s.label}>
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-ink-2">{s.label}</span>
              <span className="text-sm text-ink">
                {formatNumber(s.count)}
                <span className="text-[10px] text-ink-4 ml-1.5">{s.pct.toFixed(0)}%</span>
              </span>
            </div>
            <div className="h-1.5 bg-bg-2 rounded-full overflow-hidden">
              <div className="h-full bg-brand transition-all" style={{ width: `${s.pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function CitiesCard({ cities }: { cities: Array<{ city: string; sessions: number }> }) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
        <MapPin className="w-4 h-4 text-ink-4" />
        Where they are
      </h3>
      <p className="text-xs text-ink-4 mb-4">Top cities visitors came from.</p>
      <div className="space-y-2">
        {cities.slice(0, 6).map(c => (
          <div key={c.city} className="flex items-center justify-between">
            <span className="text-sm text-ink truncate">{c.city}</span>
            <span className="text-sm text-ink-2 font-medium">{formatNumber(c.sessions)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function SearchCard({ search }: { search: WebsiteInsight['search'] }) {
  const ctr = search.impressions > 0 ? (search.clicks / search.impressions) * 100 : 0
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <h3 className="text-sm font-semibold text-ink mb-1 flex items-center gap-2">
        <Search className="w-4 h-4 text-ink-4" />
        How you show up on Google
      </h3>
      {search.insight ? (
        <p className="text-sm text-ink-2 mt-2 mb-4 leading-relaxed">{search.insight}</p>
      ) : (
        <p className="text-xs text-ink-4 mb-4">Your presence in Google search results.</p>
      )}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <div className="text-[10px] text-ink-3 uppercase tracking-wide">Shown</div>
          <div className="font-[family-name:var(--font-display)] text-xl text-ink mt-0.5">
            {formatNumber(search.impressions)}
          </div>
          <div className="text-[10px] text-ink-4">times</div>
        </div>
        <div>
          <div className="text-[10px] text-ink-3 uppercase tracking-wide">Clicked</div>
          <div className="font-[family-name:var(--font-display)] text-xl text-ink mt-0.5">
            {formatNumber(search.clicks)}
          </div>
          <div className="text-[10px] text-ink-4">{ctr.toFixed(0)}% of shows</div>
        </div>
        {search.topQuery && (
          <div>
            <div className="text-[10px] text-ink-3 uppercase tracking-wide">Top Search</div>
            <div className="text-sm text-ink mt-1 truncate font-medium">&ldquo;{search.topQuery}&rdquo;</div>
          </div>
        )}
      </div>
    </div>
  )
}

function AdvancedSection({
  open, onToggle, advanced,
}: {
  open: boolean
  onToggle: () => void
  advanced: WebsiteInsight['advanced']
}) {
  const hasAnyAdvanced =
    advanced.sessions > 0 ||
    advanced.pageViews > 0 ||
    advanced.landingPages.length > 0 ||
    advanced.referrers.length > 0 ||
    advanced.conversionBreakdown.total > 0

  if (!hasAnyAdvanced) return null

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-5 hover:bg-bg-2 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Info className="w-4 h-4 text-ink-4" />
          <span className="text-sm font-semibold text-ink">Advanced details</span>
          <span className="text-xs text-ink-4">Bounce rate, session time, conversion breakdown, referrers, entry pages</span>
        </div>
        <ChevronRight className={`w-4 h-4 text-ink-4 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-ink-6">
          {/* Detailed metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
            <MiniStat label="Sessions" value={formatNumber(advanced.sessions)} />
            <MiniStat label="Pageviews" value={formatNumber(advanced.pageViews)} />
            <MiniStat
              label="Bounce rate"
              value={advanced.bounceRate != null ? `${advanced.bounceRate}%` : '—'}
            />
            <MiniStat
              label="Avg time on site"
              value={formatDuration(advanced.avgSessionDuration)}
            />
            <MiniStat
              label="On mobile"
              value={advanced.mobilePct != null ? `${advanced.mobilePct.toFixed(0)}%` : '—'}
            />
            <MiniStat label="New visitors" value={formatNumber(advanced.newUsers)} />
            <MiniStat label="Returning" value={formatNumber(advanced.returningUsers)} />
          </div>

          {/* Conversion breakdown */}
          {advanced.conversionBreakdown.total > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink mb-3 uppercase tracking-wide">Actions breakdown</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <ActionStat icon={Phone} label="Phone calls" value={advanced.conversionBreakdown.phone_clicks} />
                <ActionStat icon={Navigation} label="Directions" value={advanced.conversionBreakdown.direction_clicks} />
                <ActionStat icon={Send} label="Form submits" value={advanced.conversionBreakdown.form_submits} />
                <ActionStat icon={Calendar} label="Bookings" value={advanced.conversionBreakdown.booking_clicks} />
              </div>
            </div>
          )}

          {/* Landing pages */}
          {advanced.landingPages.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink mb-2 uppercase tracking-wide">Entry pages</h4>
              <p className="text-[11px] text-ink-4 mb-3">Where visitors first arrive.</p>
              <div className="space-y-1.5">
                {advanced.landingPages.slice(0, 6).map((p, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-ink-4 font-mono w-4">{i + 1}</span>
                    <span className="flex-1 min-w-0 text-ink truncate font-mono">{p.path}</span>
                    <span className="text-ink-2 font-medium">{formatNumber(p.sessions)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Referrers */}
          {advanced.referrers.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-ink mb-2 uppercase tracking-wide">Referring sites</h4>
              <div className="space-y-1.5">
                {advanced.referrers.slice(0, 6).map((r, i) => (
                  <div key={i} className="flex items-center gap-3 text-xs">
                    <span className="text-ink-4 font-mono w-4">{i + 1}</span>
                    <span className="flex-1 min-w-0 text-ink truncate">{r.source}</span>
                    <span className="text-ink-2 font-medium">{formatNumber(r.sessions)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-2 rounded-lg p-3">
      <div className="text-[10px] text-ink-3 uppercase tracking-wide">{label}</div>
      <div className="text-sm font-semibold text-ink mt-1">{value}</div>
    </div>
  )
}

function ActionStat({
  icon: Icon, label, value,
}: {
  icon: typeof Phone
  label: string
  value: number
}) {
  return (
    <div className="bg-bg-2 rounded-lg p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-brand" />
        <span className="text-[10px] text-ink-3 uppercase tracking-wide">{label}</span>
      </div>
      <div className="text-base font-semibold text-ink">{formatNumber(value)}</div>
    </div>
  )
}
