'use client'

/**
 * Full analytics for the website. Redesigned for restaurant-owner
 * scanning: each section answers one question in plain English.
 *
 *   1. How many people visited (number + trend chart)
 *   2. What they did (actions + conversion rate + breakdown)
 *   3. How they found you (sources)
 *   4. What they looked at (top pages)
 *   5. Where they live (cities)
 *   6. Google performance (impressions / clicks / top query)
 *   7. More details (collapsed — bounce, session time, etc.)
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Users, Target, Search, TrendingUp, TrendingDown, ChevronDown,
  MapPin, FileText, Globe, Phone, Navigation, Send, Calendar,
  RefreshCw, BarChart3, Sparkles, Mail,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import {
  buildWebsiteInsight,
  type DailyWebsiteRow, type DailySearchRow, type WebsiteInsight,
  type UniqueAggregateOverride,
} from '@/lib/website-insights'

// ─── Range definitions ──────────────────────────────────────────────────
type RangeKey = '7d' | '30d' | '90d' | 'this_month' | 'last_month'

const RANGE_OPTIONS: Record<RangeKey, { label: string; compute: () => { start: Date; end: Date } }> = {
  '7d': {
    label: 'Last 7 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 6)
      return { start, end }
    },
  },
  '30d': {
    label: 'Last 30 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 29)
      return { start, end }
    },
  },
  '90d': {
    label: 'Last 90 days',
    compute: () => {
      const end = new Date(); end.setHours(0, 0, 0, 0)
      const start = new Date(end); start.setDate(start.getDate() - 89)
      return { start, end }
    },
  },
  'this_month': {
    label: 'This month',
    compute: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      return { start, end: new Date() }
    },
  },
  'last_month': {
    label: 'Last month',
    compute: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0)
      return { start, end }
    },
  },
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function previousRange(start: Date, end: Date): { start: Date; end: Date } {
  const days = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1
  const newEnd = new Date(start); newEnd.setDate(newEnd.getDate() - 1)
  const newStart = new Date(newEnd); newStart.setDate(newStart.getDate() - days + 1)
  return { start: newStart, end: newEnd }
}

function yearAgoRange(start: Date, end: Date): { start: Date; end: Date } {
  const ns = new Date(start); ns.setFullYear(ns.getFullYear() - 1)
  const ne = new Date(end);   ne.setFullYear(ne.getFullYear() - 1)
  return { start: ns, end: ne }
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1000).toFixed(1)}k`
  return n.toLocaleString()
}

// ─── Page component ────────────────────────────────────────────────────

export default function WebsiteTrafficPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [rangeKey, setRangeKey] = useState<RangeKey>('30d')
  const [compareMode, setCompareMode] = useState<'prior' | 'yoy'>('prior')
  const [dailyWeb, setDailyWeb] = useState<DailyWebsiteRow[]>([])
  const [dailySearch, setDailySearch] = useState<DailySearchRow[]>([])
  const [monthlyUniques, setMonthlyUniques] = useState<Array<{
    year: number; month: number
    unique_visitors: number | null; unique_new_users: number | null; unique_returning_users: number | null
  }>>([])
  const [loading, setLoading] = useState(true)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [latestSync, setLatestSync] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [ga, gsc, monthly] = await Promise.all([
      supabase.from('website_metrics')
        .select('date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages, conversion_events, top_cities, landing_pages, new_users, returning_users, top_referrers, created_at')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(400),
      supabase.from('search_metrics')
        .select('date, total_impressions, total_clicks, avg_ctr, avg_position, top_queries, top_pages')
        .eq('client_id', client.id)
        .order('date', { ascending: false })
        .limit(400),
      supabase.from('website_metrics_monthly')
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

  useEffect(() => { void load() }, [load])
  useRealtimeRefresh(['website_metrics', 'search_metrics'], load)

  const insight = useMemo<WebsiteInsight | null>(() => {
    if (!client?.id || dailyWeb.length === 0 && dailySearch.length === 0) return null
    const { start, end } = RANGE_OPTIONS[rangeKey].compute()
    const startStr = toDateStr(start)
    const endStr = toDateStr(end)
    const currDaily = dailyWeb.filter(r => r.date >= startStr && r.date <= endStr)
    const currSearch = dailySearch.filter(r => r.date >= startStr && r.date <= endStr)
    /* Comparison window — prior period of same length, OR same
       window from one year ago for YoY mode. */
    const prev = compareMode === 'yoy'
      ? yearAgoRange(start, end)
      : previousRange(start, end)
    const prevStartStr = toDateStr(prev.start)
    const prevEndStr = toDateStr(prev.end)
    const prevDaily = dailyWeb.filter(r => r.date >= prevStartStr && r.date <= prevEndStr)
    const prevSearch = dailySearch.filter(r => r.date >= prevStartStr && r.date <= prevEndStr)

    /* Use monthly aggregate for unique-visitor count when window
       is a single calendar month. Daily sum overcounts. */
    let override: UniqueAggregateOverride | undefined
    let prevOverride: UniqueAggregateOverride | undefined
    if (rangeKey === 'this_month' || rangeKey === 'last_month') {
      const startY = start.getFullYear()
      const startM = start.getMonth() + 1
      const m = monthlyUniques.find(r => r.year === startY && r.month === startM)
      if (m?.unique_visitors != null) {
        override = { unique_visitors: m.unique_visitors, unique_new_users: m.unique_new_users ?? undefined, unique_returning_users: m.unique_returning_users ?? undefined }
      }
      const prevD = new Date(start); prevD.setMonth(prevD.getMonth() - 1)
      const pm = monthlyUniques.find(r => r.year === prevD.getFullYear() && r.month === prevD.getMonth() + 1)
      if (pm?.unique_visitors != null) {
        prevOverride = { unique_visitors: pm.unique_visitors, unique_new_users: pm.unique_new_users ?? undefined, unique_returning_users: pm.unique_returning_users ?? undefined }
      }
    }

    return buildWebsiteInsight(
      { daily: currDaily, search: currSearch, uniqueOverride: override },
      { daily: prevDaily, search: prevSearch, uniqueOverride: prevOverride },
      startStr, endStr,
    )
  }, [dailyWeb, dailySearch, monthlyUniques, rangeKey, client?.id, compareMode])

  /* Device-split estimate: mobile_pct × visitors gives a rough
     mobile-visitor count; we use it to split actions by device. */
  const deviceSplit = useMemo(() => {
    const { start, end } = RANGE_OPTIONS[rangeKey].compute()
    const startStr = toDateStr(start)
    const endStr = toDateStr(end)
    const rows = dailyWeb.filter(r => r.date >= startStr && r.date <= endStr)
    let mobileVisits = 0, desktopVisits = 0
    let mobileActions = 0, desktopActions = 0
    for (const r of rows) {
      const sessions = r.sessions ?? 0
      const pct = (r.mobile_pct ?? 0) / 100
      const mob = Math.round(sessions * pct)
      const desk = sessions - mob
      mobileVisits += mob
      desktopVisits += desk
      const actions = r.conversion_events?.total ?? 0
      mobileActions += Math.round(actions * pct)
      desktopActions += actions - Math.round(actions * pct)
    }
    return {
      mobile: { visits: mobileVisits, actions: mobileActions, rate: mobileVisits === 0 ? 0 : Math.round((mobileActions / mobileVisits) * 1000) / 10 },
      desktop: { visits: desktopVisits, actions: desktopActions, rate: desktopVisits === 0 ? 0 : Math.round((desktopActions / desktopVisits) * 1000) / 10 },
    }
  }, [dailyWeb, rangeKey])

  /* Keyword position series — average GSC position over time. Lower
     is better. Plotted inverted so "going up" visually = improving. */
  const positionSeries = useMemo(() => {
    const { start, end } = RANGE_OPTIONS[rangeKey].compute()
    const startStr = toDateStr(start)
    const endStr = toDateStr(end)
    const rows = dailySearch
      .filter(r => r.date >= startStr && r.date <= endStr && (r.avg_position ?? null) != null)
      .sort((a, b) => a.date.localeCompare(b.date))
    return rows.map(r => ({ date: r.date, position: r.avg_position as number }))
  }, [dailySearch, rangeKey])

  /* Newsletter signups via form_submissions (kind='newsletter'). */
  const [newsletterCount, setNewsletterCount] = useState<number | null>(null)
  useEffect(() => {
    if (!client?.id) return
    const { start } = RANGE_OPTIONS[rangeKey].compute()
    supabase
      .from('form_submissions')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('kind', 'newsletter')
      .gte('submitted_at', start.toISOString())
      .then(r => setNewsletterCount(r.count ?? 0))
  }, [client?.id, rangeKey, supabase])

  /* Compute daily series for the trend chart. */
  const chartSeries = useMemo(() => {
    const { start, end } = RANGE_OPTIONS[rangeKey].compute()
    const startStr = toDateStr(start)
    const endStr = toDateStr(end)
    const byDate = new Map<string, number>()
    for (const r of dailyWeb) {
      if (r.date >= startStr && r.date <= endStr) {
        byDate.set(r.date, r.visitors ?? 0)
      }
    }
    /* Fill missing days with 0 so the chart x-axis is continuous. */
    const series: Array<{ date: string; visitors: number }> = []
    const cursor = new Date(start)
    while (cursor <= end) {
      const key = toDateStr(cursor)
      series.push({ date: key, visitors: byDate.get(key) ?? 0 })
      cursor.setDate(cursor.getDate() + 1)
    }
    return series
  }, [dailyWeb, rangeKey])

  if (clientLoading || loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 lg:px-6 py-8 space-y-4 animate-pulse">
        <div className="h-6 w-48 bg-ink-6 rounded" />
        <div className="h-32 bg-ink-6 rounded-2xl" />
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 bg-ink-6 rounded-2xl" />
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
    <div className="max-w-5xl mx-auto px-4 lg:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Website · Full analytics
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
            How your site is doing
          </h1>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <RangePills value={rangeKey} onChange={setRangeKey} />
          <CompareToggle value={compareMode} onChange={setCompareMode} />
        </div>
      </div>

      {!hasAnyData || !insight ? (
        <EmptyState />
      ) : (
        <>
          {/* 1. Visitors — the headline number with a trend chart. */}
          <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
            <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
              <div>
                <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">People who visited</div>
                <div className="text-[42px] font-semibold text-ink tabular-nums leading-none mt-1">
                  {formatNumber(insight.hero.visitors.value)}
                </div>
              </div>
              {insight.hero.visitors.trendPct != null && (
                <TrendChip pct={insight.hero.visitors.trendPct} />
              )}
            </div>
            {insight.hero.visitors.sublabel && (
              <p className="text-[12.5px] text-ink-3">{insight.hero.visitors.sublabel}</p>
            )}
            <div className="mt-4">
              <TrendLine series={chartSeries} />
            </div>
          </section>

          {/* 2. What they did — conversion rate + breakdown. */}
          {(insight.hero.actions.hasData || insight.advanced.conversionBreakdown.total > 0) && (
            <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Target className="w-3.5 h-3.5 text-brand" />
                <h2 className="text-sm font-semibold text-ink">What they did</h2>
              </div>
              <p className="text-[12.5px] text-ink-3 mb-4">
                {insight.hero.actions.value > 0 && insight.hero.visitors.value > 0
                  ? <>
                    <strong className="text-ink">{formatNumber(insight.hero.actions.value)}</strong>
                    {' '}of {formatNumber(insight.hero.visitors.value)} visitors took an action.
                    {insight.hero.actions.trendPct != null && (
                      <> That&rsquo;s <strong className="text-ink">{insight.hero.actions.trendPct > 0 ? '+' : ''}{insight.hero.actions.trendPct}%</strong> vs the previous period.</>
                    )}
                  </>
                  : 'No actions tracked yet for this period.'}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <ActionChip icon={Phone}      label="Phone calls"  value={insight.advanced.conversionBreakdown.phone_clicks} />
                <ActionChip icon={Navigation} label="Directions"   value={insight.advanced.conversionBreakdown.direction_clicks} />
                <ActionChip icon={Send}       label="Form submits" value={insight.advanced.conversionBreakdown.form_submits} />
                <ActionChip icon={Calendar}   label="Bookings"     value={insight.advanced.conversionBreakdown.booking_clicks} />
              </div>
            </section>
          )}

          {/* 3. How they found you. */}
          {insight.sources.length > 0 && (
            <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Globe className="w-3.5 h-3.5 text-brand" />
                <h2 className="text-sm font-semibold text-ink">How they found you</h2>
              </div>
              <p className="text-[12.5px] text-ink-3 mb-4">The channels driving visits.</p>
              <StackedSources sources={insight.sources} />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 mt-4">
                {insight.sources.slice(0, 6).map(s => (
                  <div key={s.label} className="flex items-center justify-between text-[12.5px]">
                    <span className="text-ink-2 inline-flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full" style={{ background: sourceColor(s.label) }} />
                      {s.label}
                    </span>
                    <span className="text-ink-3 tabular-nums">
                      {formatNumber(s.count)} <span className="text-ink-4">· {s.pct.toFixed(0)}%</span>
                    </span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 4 + 5. Top pages and cities side-by-side. */}
          {(insight.topPages.length > 0 || insight.cities.length > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insight.topPages.length > 0 && (
                <section className="rounded-2xl border border-ink-6 bg-white p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-3.5 h-3.5 text-brand" />
                    <h2 className="text-sm font-semibold text-ink">What they looked at</h2>
                  </div>
                  <p className="text-[11.5px] text-ink-3 mb-3">Pages people viewed most.</p>
                  <ul className="space-y-2">
                    {insight.topPages.slice(0, 5).map((p, i) => (
                      <li key={i} className="flex items-center gap-3 text-[12.5px]">
                        <span className="text-[10px] text-ink-4 font-mono w-4 tabular-nums">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="text-ink truncate">{p.label}</div>
                          <div className="text-[10px] text-ink-4 truncate font-mono">{p.path}</div>
                        </div>
                        <span className="text-ink-2 font-medium tabular-nums">{formatNumber(p.views)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              {insight.cities.length > 0 && (
                <section className="rounded-2xl border border-ink-6 bg-white p-5">
                  <div className="flex items-center gap-2 mb-1">
                    <MapPin className="w-3.5 h-3.5 text-brand" />
                    <h2 className="text-sm font-semibold text-ink">Where they live</h2>
                  </div>
                  <p className="text-[11.5px] text-ink-3 mb-3">Top cities visitors came from.</p>
                  <ul className="space-y-2">
                    {insight.cities.slice(0, 5).map((c, i) => (
                      <li key={c.city} className="flex items-center gap-3 text-[12.5px]">
                        <span className="text-[10px] text-ink-4 font-mono w-4 tabular-nums">{i + 1}</span>
                        <span className="flex-1 text-ink truncate">{c.city}</span>
                        <span className="text-ink-2 font-medium tabular-nums">{formatNumber(c.sessions)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </div>
          )}

          {/* Mobile vs desktop conversion split + newsletter signups
              side-by-side. */}
          {(deviceSplit.mobile.visits > 0 || deviceSplit.desktop.visits > 0 || (newsletterCount ?? 0) > 0) && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <DeviceSplitCard
                title="Mobile"
                data={deviceSplit.mobile}
                compareData={deviceSplit.desktop}
              />
              <DeviceSplitCard
                title="Desktop"
                data={deviceSplit.desktop}
                compareData={deviceSplit.mobile}
              />
              <NewsletterCard count={newsletterCount ?? 0} rangeLabel={RANGE_OPTIONS[rangeKey].label} />
            </div>
          )}

          {/* Google search position over time. Inverted (lower
              position = better, so chart "going up" = improving). */}
          {positionSeries.length >= 3 && <PositionChart series={positionSeries} />}

          {/* 6. Google search performance. */}
          {insight.search.hasData && (
            <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
              <div className="flex items-center gap-2 mb-1">
                <Search className="w-3.5 h-3.5 text-brand" />
                <h2 className="text-sm font-semibold text-ink">Found on Google</h2>
              </div>
              {insight.search.insight ? (
                <p className="text-[12.5px] text-ink-2 leading-relaxed mb-4">{insight.search.insight}</p>
              ) : (
                <p className="text-[12.5px] text-ink-3 mb-4">Your presence in Google Search results.</p>
              )}
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <div className="text-[10px] text-ink-3 uppercase tracking-wide">Shown</div>
                  <div className="text-[24px] font-semibold text-ink tabular-nums leading-none mt-1">
                    {formatNumber(insight.search.impressions)}
                  </div>
                  <div className="text-[10px] text-ink-4 mt-0.5">times</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-3 uppercase tracking-wide">Clicked</div>
                  <div className="text-[24px] font-semibold text-ink tabular-nums leading-none mt-1">
                    {formatNumber(insight.search.clicks)}
                  </div>
                  <div className="text-[10px] text-ink-4 mt-0.5">
                    {insight.search.impressions > 0 ? ((insight.search.clicks / insight.search.impressions) * 100).toFixed(0) : 0}% of shows
                  </div>
                </div>
                {insight.search.topQuery && (
                  <div className="min-w-0">
                    <div className="text-[10px] text-ink-3 uppercase tracking-wide">Top search</div>
                    <div className="text-[14px] text-ink font-medium mt-1 truncate" title={insight.search.topQuery}>
                      &ldquo;{insight.search.topQuery}&rdquo;
                    </div>
                  </div>
                )}
              </div>
            </section>
          )}

          {/* 7. More details — bounce rate, time on site, etc. Collapsed. */}
          <details
            open={showAdvanced}
            onToggle={e => setShowAdvanced((e.target as HTMLDetailsElement).open)}
            className="rounded-2xl border border-ink-6 bg-white overflow-hidden group"
          >
            <summary className="px-5 py-3 cursor-pointer hover:bg-bg-2/40 flex items-center gap-2 list-none">
              <ChevronDown className={`w-4 h-4 text-ink-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <h3 className="text-sm font-semibold text-ink">More details</h3>
              <span className="text-[11px] text-ink-4">Time on site, returning visitors, entry pages, referrers</span>
            </summary>
            <div className="px-5 pb-5 pt-1 border-t border-ink-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 pt-4">
                <MiniStat label="Visits"      value={formatNumber(insight.advanced.sessions)} />
                <MiniStat label="Pageviews"   value={formatNumber(insight.advanced.pageViews)} />
                <MiniStat
                  label="Left without acting"
                  value={insight.advanced.bounceRate != null ? `${insight.advanced.bounceRate}%` : '—'}
                />
                <MiniStat
                  label="Time on site"
                  value={formatDuration(insight.advanced.avgSessionDuration)}
                />
                <MiniStat label="On mobile"   value={insight.advanced.mobilePct != null ? `${insight.advanced.mobilePct.toFixed(0)}%` : '—'} />
                <MiniStat label="New people"  value={formatNumber(insight.advanced.newUsers)} />
                <MiniStat label="Returning"   value={formatNumber(insight.advanced.returningUsers)} />
              </div>
              {insight.advanced.landingPages.length > 0 && (
                <div className="mt-5">
                  <h4 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider mb-2">First page they landed on</h4>
                  <ul className="space-y-1.5">
                    {insight.advanced.landingPages.slice(0, 6).map((p, i) => (
                      <li key={i} className="flex items-center gap-3 text-[12px]">
                        <span className="text-ink-4 font-mono w-4">{i + 1}</span>
                        <span className="flex-1 min-w-0 text-ink truncate font-mono">{p.path}</span>
                        <span className="text-ink-2 font-medium tabular-nums">{formatNumber(p.sessions)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {insight.advanced.referrers.length > 0 && (
                <div className="mt-5">
                  <h4 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider mb-2">Referring sites</h4>
                  <ul className="space-y-1.5">
                    {insight.advanced.referrers.slice(0, 6).map((r, i) => (
                      <li key={i} className="flex items-center gap-3 text-[12px]">
                        <span className="text-ink-4 font-mono w-4">{i + 1}</span>
                        <span className="flex-1 min-w-0 text-ink truncate">{r.source}</span>
                        <span className="text-ink-2 font-medium tabular-nums">{formatNumber(r.sessions)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </details>

          {/* Freshness footnote */}
          {latestSync && (
            <p className="text-[11px] text-ink-4 inline-flex items-center gap-1.5">
              <RefreshCw className="w-3 h-3" />
              Last updated {new Date(latestSync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(latestSync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}.
              {insight.meta.usingMonthlyAggregate
                ? ' Visitor count matches Google Analytics exactly.'
                : ' Visitor count uses a daily sum (may slightly overcount repeat visitors across days).'}
            </p>
          )}
        </>
      )}
    </div>
  )
}

// ─── Sub-components ────────────────────────────────────────────────────

function RangePills({ value, onChange }: { value: RangeKey; onChange: (k: RangeKey) => void }) {
  const keys = Object.keys(RANGE_OPTIONS) as RangeKey[]
  return (
    <div className="inline-flex rounded-full bg-bg-2 p-0.5 ring-1 ring-ink-6">
      {keys.map(k => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
            value === k ? 'bg-white text-ink shadow-sm' : 'text-ink-3 hover:text-ink-2'
          }`}
        >
          {RANGE_OPTIONS[k].label}
        </button>
      ))}
    </div>
  )
}

function TrendChip({ pct }: { pct: number }) {
  const up = pct >= 0
  const color = pct === 0 ? 'text-ink-4 bg-bg-2'
    : up ? 'text-emerald-700 bg-emerald-50'
    : 'text-rose-700 bg-rose-50'
  const Icon = pct === 0 ? null : up ? TrendingUp : TrendingDown
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-[12px] font-semibold ${color}`}>
      {Icon && <Icon className="w-3 h-3" />}
      {up ? '+' : ''}{pct}%
      <span className="font-normal opacity-70">vs prior period</span>
    </span>
  )
}

function TrendLine({ series }: { series: Array<{ date: string; visitors: number }> }) {
  if (series.length < 2) {
    return <p className="text-xs text-ink-4 text-center py-8">Need more days for a chart.</p>
  }
  const w = 800
  const h = 140
  const values = series.map(s => s.visitors)
  const max = Math.max(...values, 1)
  const stepX = w / (series.length - 1)
  const points = values.map((v, i) => `${i * stepX},${h - (v / max) * h}`).join(' ')
  const areaPath = `M0,${h} L${points.replace(/ /g, ' L')} L${w},${h} Z`
  const ticks = Array.from({ length: 5 }, (_, i) => series[Math.floor((i / 4) * (series.length - 1))])
  return (
    <div className="space-y-1.5">
      <svg viewBox={`0 0 ${w} ${h + 18}`} className="w-full h-32" preserveAspectRatio="none">
        <defs>
          <linearGradient id="trendfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4abd98" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#4abd98" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#trendfill)" />
        <polyline points={points} fill="none" stroke="#4abd98" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="0" y1={h} x2={w} y2={h} stroke="#e8e8e6" strokeWidth="1" />
      </svg>
      <div className="flex justify-between text-[10px] text-ink-4 px-0.5">
        {ticks.map((t, i) => (
          <span key={i}>{new Date(t.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        ))}
      </div>
    </div>
  )
}

const SOURCE_COLORS: Record<string, string> = {
  'Google Search': '#4abd98',
  'Direct': '#5b9bd5',
  'Social': '#f48fb1',
  'Email': '#ffb74d',
  'Referral': '#9575cd',
  'Paid Search': '#ff7043',
}
function sourceColor(label: string): string {
  return SOURCE_COLORS[label] ?? '#a0a0a0'
}

function StackedSources({ sources }: { sources: Array<{ label: string; count: number; pct: number }> }) {
  const total = sources.reduce((a, s) => a + s.count, 0)
  if (total === 0) return null
  const top = sources.slice(0, 6)
  return (
    <div className="flex w-full h-3 rounded-full overflow-hidden bg-bg-2">
      {top.map(s => (
        <div
          key={s.label}
          style={{ width: `${s.pct}%`, background: sourceColor(s.label) }}
          title={`${s.label}: ${s.pct.toFixed(0)}%`}
        />
      ))}
    </div>
  )
}

function ActionChip({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
}) {
  return (
    <div className="rounded-xl bg-bg-2/40 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="w-3 h-3 text-brand" />
        <span className="text-[10px] uppercase tracking-wider font-semibold text-ink-3">{label}</span>
      </div>
      <div className="text-[20px] font-semibold text-ink tabular-nums leading-none">{formatNumber(value)}</div>
    </div>
  )
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-bg-2/40 rounded-lg p-3">
      <div className="text-[10px] text-ink-3 uppercase tracking-wide">{label}</div>
      <div className="text-[14px] font-semibold text-ink mt-1">{value}</div>
    </div>
  )
}

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function CompareToggle({ value, onChange }: { value: 'prior' | 'yoy'; onChange: (v: 'prior' | 'yoy') => void }) {
  return (
    <div className="inline-flex rounded-full bg-bg-2 p-0.5 ring-1 ring-ink-6">
      <button
        onClick={() => onChange('prior')}
        className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium ${value === 'prior' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'}`}
      >
        vs prior period
      </button>
      <button
        onClick={() => onChange('yoy')}
        className={`px-3 py-1.5 rounded-full text-[11.5px] font-medium ${value === 'yoy' ? 'bg-white text-ink shadow-sm' : 'text-ink-3'}`}
      >
        vs last year
      </button>
    </div>
  )
}

function DeviceSplitCard({ title, data, compareData }: {
  title: string
  data: { visits: number; actions: number; rate: number }
  compareData: { rate: number }
}) {
  const isMobile = title === 'Mobile'
  const Icon = isMobile ? Mail : Globe  /* placeholder icons */
  const totalShare = data.visits + compareData.rate === 0 ? 0 : 0
  void totalShare
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <span className={`text-[10px] uppercase tracking-wider font-semibold ${isMobile ? 'text-blue-700' : 'text-purple-700'}`}>
          {isMobile ? '📱 ' : '🖥️ '}{title}
        </span>
      </div>
      <div className="text-[24px] font-semibold text-ink tabular-nums leading-none">{formatNumber(data.visits)}</div>
      <p className="text-[11px] text-ink-3 mt-0.5">visits</p>
      <div className="mt-3 pt-3 border-t border-ink-7 grid grid-cols-2 gap-2 text-[12px]">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-4">Actions</p>
          <p className="text-[14px] font-semibold text-ink tabular-nums">{formatNumber(data.actions)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-ink-4">Conversion</p>
          <p className={`text-[14px] font-semibold tabular-nums ${data.rate > compareData.rate ? 'text-emerald-700' : 'text-ink'}`}>
            {data.rate.toFixed(1)}%
          </p>
        </div>
      </div>
      {data.rate < compareData.rate && data.visits > 50 && (
        <p className="mt-2 text-[10.5px] text-rose-700">
          Converts lower than {isMobile ? 'desktop' : 'mobile'} ({compareData.rate.toFixed(1)}%).
        </p>
      )}
    </div>
  )
}

function NewsletterCard({ count, rangeLabel }: { count: number; rangeLabel: string }) {
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-center gap-2 mb-2">
        <Mail className="w-3.5 h-3.5 text-brand" />
        <h2 className="text-[11px] uppercase tracking-wider font-semibold text-brand-dark">Newsletter signups</h2>
      </div>
      <div className="text-[24px] font-semibold text-ink tabular-nums leading-none">{formatNumber(count)}</div>
      <p className="text-[11px] text-ink-3 mt-0.5">{rangeLabel.toLowerCase()}</p>
      <p className="text-[10.5px] text-ink-4 mt-3 leading-relaxed">
        Count of newsletter submissions through your site forms.
      </p>
    </div>
  )
}

function PositionChart({ series }: { series: Array<{ date: string; position: number }> }) {
  /* Position is "lower is better" (1 = top result). To show
     improvement as "up" on the y-axis, invert: y = max - position. */
  const max = Math.max(...series.map(s => s.position), 10)
  const w = 800, h = 100
  const stepX = w / Math.max(series.length - 1, 1)
  const points = series.map((s, i) => `${i * stepX},${(s.position / max) * h}`).join(' ')
  const latest = series[series.length - 1]?.position
  const earliest = series[0]?.position
  const delta = (earliest != null && latest != null) ? latest - earliest : null
  /* Improvement = decreased rank. */
  const improving = delta !== null && delta < 0
  return (
    <section className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Where you rank on Google</h2>
        </div>
        {delta !== null && Math.abs(delta) >= 0.5 && (
          <span className={`text-[11.5px] font-semibold ${improving ? 'text-emerald-700' : 'text-rose-700'}`}>
            {improving ? '↑' : '↓'} {Math.abs(delta).toFixed(1)} {improving ? 'improved' : 'dropped'}
          </span>
        )}
      </div>
      <p className="text-[12.5px] text-ink-3 mb-4">
        Average position in search results across your queries. Lower is better (1 = top spot).
      </p>
      <svg viewBox={`0 0 ${w} ${h + 16}`} className="w-full h-24" preserveAspectRatio="none">
        <polyline points={points} fill="none" stroke="#4abd98" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <line x1="0" y1={h} x2={w} y2={h} stroke="#e8e8e6" strokeWidth="1" />
      </svg>
      <div className="flex justify-between text-[10px] text-ink-4 mt-1.5">
        <span>{series[0] && new Date(series[0].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        <span className="font-medium text-ink-2">Latest: {latest?.toFixed(1) ?? '—'}</span>
        <span>{series[series.length - 1] && new Date(series[series.length - 1].date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
      </div>
    </section>
  )
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-12 text-center">
      <BarChart3 className="w-6 h-6 text-ink-4 mx-auto mb-3" />
      <p className="text-sm font-medium text-ink-2">No data for this period yet</p>
      <p className="text-xs text-ink-4 mt-1 max-w-sm mx-auto">
        If you just connected Google Analytics, data takes up to 24 hours to appear. Try widening the date range.
      </p>
    </div>
  )
}
