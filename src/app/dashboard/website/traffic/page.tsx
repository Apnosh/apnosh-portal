'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BarChart3, Users, Eye, TrendingUp, TrendingDown, Minus,
  ChevronDown, FileText, Search, Share2, Link as LinkIcon, Mail, DollarSign,
  RefreshCw, Phone, MapPin, Navigation, Send, Calendar, Target, Globe, Repeat,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'

// ---------------------------------------------------------------------------
// Source labels (covers GA4 default channel groups, normalized to lowercase)
// ---------------------------------------------------------------------------

const SOURCE_LABELS: Record<string, { label: string; icon: typeof Search }> = {
  direct: { label: 'Direct', icon: LinkIcon },
  'organic search': { label: 'Search', icon: Search },
  search: { label: 'Search', icon: Search },
  'organic social': { label: 'Social', icon: Share2 },
  social: { label: 'Social', icon: Share2 },
  'paid social': { label: 'Paid Social', icon: DollarSign },
  'paid search': { label: 'Paid Search', icon: DollarSign },
  paid: { label: 'Paid Ads', icon: DollarSign },
  referral: { label: 'Referral', icon: LinkIcon },
  email: { label: 'Email', icon: Mail },
  unassigned: { label: 'Other', icon: LinkIcon },
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ConversionEvents {
  phone_clicks: number
  direction_clicks: number
  form_submits: number
  booking_clicks: number
  other: number
  total: number
}

interface DailyMetric {
  date: string
  visitors: number | null
  page_views: number | null
  sessions: number | null
  bounce_rate: number | null
  avg_session_duration: number | null
  mobile_pct: number | null
  traffic_sources: Record<string, number> | null
  top_pages: Array<{ path: string; views: number }> | null
  conversion_events: ConversionEvents | null
  top_cities: Array<{ city: string; sessions: number }> | null
  landing_pages: Array<{ path: string; sessions: number }> | null
  new_users: number | null
  returning_users: number | null
  top_referrers: Array<{ source: string; sessions: number }> | null
  created_at: string
}

interface SearchDaily {
  date: string
  total_impressions: number | null
  total_clicks: number | null
  avg_ctr: number | null
  avg_position: number | null
  top_queries: Array<{ query: string; clicks: number; impressions: number; position: number }> | null
  top_pages: Array<{ page: string; clicks: number; impressions: number }> | null
}

interface MonthlyAggregate {
  year: number
  month: number
  visitors: number
  pageviews: number
  sessions: number
  bounce_rate: number | null
  avg_session_duration: number | null
  traffic_sources: Record<string, number>
  top_pages: Array<{ path: string; title?: string; pageviews: number }>
  conversion_events: ConversionEvents
  top_cities: Array<{ city: string; sessions: number }>
  landing_pages: Array<{ path: string; sessions: number }>
  new_users: number
  returning_users: number
  top_referrers: Array<{ source: string; sessions: number }>
  days_with_data: number
  latest_sync: string | null
  // search (GSC) rolled up for the same month
  search: {
    impressions: number
    clicks: number
    avg_ctr: number | null
    avg_position: number | null
    top_queries: Array<{ query: string; clicks: number; impressions: number }>
    days_with_data: number
  }
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

function formatDuration(seconds: number | null): string {
  if (seconds == null) return '—'
  const m = Math.floor(seconds / 60)
  const s = Math.round(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

function cleanReferrerDomain(source: string): string {
  // GA4 sessionSource can include "/referral" etc; trim to bare domain
  return source.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0]
}

// ---------------------------------------------------------------------------
// Aggregation: daily GA4 + daily GSC into unified monthly buckets
// ---------------------------------------------------------------------------

function aggregateByMonth(daily: DailyMetric[], searchDaily: SearchDaily[]): MonthlyAggregate[] {
  type Bucket = MonthlyAggregate & {
    _bounceNumerator: number
    _bounceDenominator: number
    _durationNumerator: number
    _durationDenominator: number
    _queryMap: Map<string, { query: string; clicks: number; impressions: number }>
    _ctrSum: number
    _positionSum: number
    _ctrCount: number
  }
  const buckets = new Map<string, Bucket>()

  const getBucket = (year: number, month: number): Bucket => {
    const key = `${year}-${month}`
    let agg = buckets.get(key)
    if (!agg) {
      agg = {
        year, month,
        visitors: 0, pageviews: 0, sessions: 0,
        bounce_rate: null, avg_session_duration: null,
        traffic_sources: {},
        top_pages: [],
        conversion_events: { phone_clicks: 0, direction_clicks: 0, form_submits: 0, booking_clicks: 0, other: 0, total: 0 },
        top_cities: [],
        landing_pages: [],
        new_users: 0, returning_users: 0,
        top_referrers: [],
        days_with_data: 0,
        latest_sync: null,
        search: {
          impressions: 0, clicks: 0,
          avg_ctr: null, avg_position: null,
          top_queries: [],
          days_with_data: 0,
        },
        _bounceNumerator: 0,
        _bounceDenominator: 0,
        _durationNumerator: 0,
        _durationDenominator: 0,
        _queryMap: new Map(),
        _ctrSum: 0,
        _positionSum: 0,
        _ctrCount: 0,
      }
      buckets.set(key, agg)
    }
    return agg
  }

  // --- GA4 daily rollups
  for (const d of daily) {
    const [year, month] = d.date.split('-').map(Number)
    const agg = getBucket(year, month)

    agg.visitors += d.visitors ?? 0
    agg.pageviews += d.page_views ?? 0
    agg.sessions += d.sessions ?? 0
    agg.days_with_data += 1

    const sessionsForWeighting = d.sessions ?? 0
    if (d.bounce_rate != null && sessionsForWeighting > 0) {
      agg._bounceNumerator += d.bounce_rate * sessionsForWeighting
      agg._bounceDenominator += sessionsForWeighting
    }
    if (d.avg_session_duration != null && sessionsForWeighting > 0) {
      agg._durationNumerator += d.avg_session_duration * sessionsForWeighting
      agg._durationDenominator += sessionsForWeighting
    }

    if (d.traffic_sources) {
      for (const [k, v] of Object.entries(d.traffic_sources)) {
        if (typeof v === 'number') agg.traffic_sources[k] = (agg.traffic_sources[k] ?? 0) + v
      }
    }

    if (d.top_pages) {
      for (const p of d.top_pages) {
        const existing = agg.top_pages.find(x => x.path === p.path)
        if (existing) existing.pageviews += p.views ?? 0
        else agg.top_pages.push({ path: p.path, pageviews: p.views ?? 0 })
      }
    }

    if (d.conversion_events) {
      const ce = d.conversion_events
      agg.conversion_events.phone_clicks += ce.phone_clicks ?? 0
      agg.conversion_events.direction_clicks += ce.direction_clicks ?? 0
      agg.conversion_events.form_submits += ce.form_submits ?? 0
      agg.conversion_events.booking_clicks += ce.booking_clicks ?? 0
      agg.conversion_events.other += ce.other ?? 0
      agg.conversion_events.total += ce.total ?? 0
    }

    if (d.top_cities) {
      for (const c of d.top_cities) {
        const existing = agg.top_cities.find(x => x.city === c.city)
        if (existing) existing.sessions += c.sessions ?? 0
        else agg.top_cities.push({ city: c.city, sessions: c.sessions ?? 0 })
      }
    }

    if (d.landing_pages) {
      for (const p of d.landing_pages) {
        const existing = agg.landing_pages.find(x => x.path === p.path)
        if (existing) existing.sessions += p.sessions ?? 0
        else agg.landing_pages.push({ path: p.path, sessions: p.sessions ?? 0 })
      }
    }

    agg.new_users += d.new_users ?? 0
    agg.returning_users += d.returning_users ?? 0

    if (d.top_referrers) {
      for (const r of d.top_referrers) {
        const domain = cleanReferrerDomain(r.source)
        const existing = agg.top_referrers.find(x => x.source === domain)
        if (existing) existing.sessions += r.sessions ?? 0
        else agg.top_referrers.push({ source: domain, sessions: r.sessions ?? 0 })
      }
    }

    if (!agg.latest_sync || d.created_at > agg.latest_sync) {
      agg.latest_sync = d.created_at
    }
  }

  // --- GSC daily rollups (same buckets)
  for (const s of searchDaily) {
    const [year, month] = s.date.split('-').map(Number)
    const agg = getBucket(year, month)

    const imp = s.total_impressions ?? 0
    const clk = s.total_clicks ?? 0
    agg.search.impressions += imp
    agg.search.clicks += clk
    agg.search.days_with_data += 1

    if (imp > 0) {
      agg._ctrCount += 1
      agg._ctrSum += s.avg_ctr ?? 0
      agg._positionSum += s.avg_position ?? 0
    }

    if (s.top_queries) {
      for (const q of s.top_queries) {
        const existing = agg._queryMap.get(q.query)
        if (existing) {
          existing.clicks += q.clicks ?? 0
          existing.impressions += q.impressions ?? 0
        } else {
          agg._queryMap.set(q.query, {
            query: q.query,
            clicks: q.clicks ?? 0,
            impressions: q.impressions ?? 0,
          })
        }
      }
    }
  }

  // --- Finalize
  const result: MonthlyAggregate[] = []
  for (const agg of buckets.values()) {
    if (agg._bounceDenominator > 0) {
      agg.bounce_rate = Math.round((agg._bounceNumerator / agg._bounceDenominator) * 1000) / 10
    }
    if (agg._durationDenominator > 0) {
      agg.avg_session_duration = Math.round(agg._durationNumerator / agg._durationDenominator)
    }
    agg.top_pages.sort((a, b) => b.pageviews - a.pageviews)
    agg.top_pages = agg.top_pages.slice(0, 10)
    agg.top_cities.sort((a, b) => b.sessions - a.sessions)
    agg.top_cities = agg.top_cities.slice(0, 10)
    agg.landing_pages.sort((a, b) => b.sessions - a.sessions)
    agg.landing_pages = agg.landing_pages.slice(0, 10)
    agg.top_referrers.sort((a, b) => b.sessions - a.sessions)
    agg.top_referrers = agg.top_referrers.slice(0, 10)

    // Search query rollup
    const queries = Array.from(agg._queryMap.values()).sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    agg.search.top_queries = queries.slice(0, 10)
    if (agg._ctrCount > 0) {
      agg.search.avg_ctr = Math.round((agg._ctrSum / agg._ctrCount) * 1000) / 10
      agg.search.avg_position = Math.round((agg._positionSum / agg._ctrCount) * 10) / 10
    }

    result.push({
      year: agg.year, month: agg.month,
      visitors: agg.visitors, pageviews: agg.pageviews, sessions: agg.sessions,
      bounce_rate: agg.bounce_rate, avg_session_duration: agg.avg_session_duration,
      traffic_sources: agg.traffic_sources,
      top_pages: agg.top_pages,
      conversion_events: agg.conversion_events,
      top_cities: agg.top_cities,
      landing_pages: agg.landing_pages,
      new_users: agg.new_users, returning_users: agg.returning_users,
      top_referrers: agg.top_referrers,
      days_with_data: agg.days_with_data,
      latest_sync: agg.latest_sync,
      search: agg.search,
    })
  }

  result.sort((a, b) => (b.year - a.year) || (b.month - a.month))
  return result
}

// ---------------------------------------------------------------------------

export default function WebsiteTrafficPage() {
  const supabase = createClient()
  const { client, loading: clientLoading } = useClient()

  const [daily, setDaily] = useState<DailyMetric[]>([])
  const [searchDaily, setSearchDaily] = useState<SearchDaily[]>([])
  const [loading, setLoading] = useState(true)

  const now = new Date()
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(now.getFullYear())

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [ga, gsc] = await Promise.all([
      supabase
        .from('website_metrics')
        .select('date, visitors, page_views, sessions, bounce_rate, avg_session_duration, mobile_pct, traffic_sources, top_pages, conversion_events, top_cities, landing_pages, new_users, returning_users, top_referrers, created_at')
        .eq('client_id', client.id)
        .order('date', { ascending: false }),
      supabase
        .from('search_metrics')
        .select('date, total_impressions, total_clicks, avg_ctr, avg_position, top_queries, top_pages')
        .eq('client_id', client.id)
        .order('date', { ascending: false }),
    ])

    setDaily((ga.data ?? []) as DailyMetric[])
    setSearchDaily((gsc.data ?? []) as SearchDaily[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['website_metrics', 'search_metrics'], load)

  const traffic = useMemo(() => aggregateByMonth(daily, searchDaily), [daily, searchDaily])

  useEffect(() => {
    if (traffic.length === 0) return
    const hasCurrent = traffic.some(r => r.month === selectedMonth && r.year === selectedYear)
    if (!hasCurrent) {
      setSelectedMonth(traffic[0].month)
      setSelectedYear(traffic[0].year)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [traffic])

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
  const sourcesTotal = current
    ? Object.values(current.traffic_sources).reduce<number>((sum, v) => sum + (v ?? 0), 0)
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
            <p className="text-ink-3 text-sm mt-0.5">Visitors, conversions, and search performance.</p>
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
            We sync Google Analytics and Search Console daily. If you&apos;ve just connected, give it up to 24 hours for your first data to show up here.
          </p>
        </div>
      ) : (
        <>
          {/* Sync freshness indicator */}
          {current.latest_sync && (
            <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
              <RefreshCw className="w-3 h-3" />
              <span>
                Last synced {new Date(current.latest_sync).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} at {new Date(current.latest_sync).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                {' · '}
                {current.days_with_data} {current.days_with_data === 1 ? 'day' : 'days'} of data this month
              </span>
            </div>
          )}

          {/* CONVERSIONS — the most important section for local biz */}
          <ConversionsSection current={current.conversion_events} previous={previous?.conversion_events ?? null} />

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
              {current.avg_session_duration != null && (
                <div className="text-[10px] text-ink-4 mt-1">Avg session {formatDuration(current.avg_session_duration)}</div>
              )}
            </div>
          </div>

          {/* Audience split: new vs returning */}
          {(current.new_users > 0 || current.returning_users > 0) && (
            <AudienceSplit newUsers={current.new_users} returningUsers={current.returning_users} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Traffic sources */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4">Traffic Sources</h2>
              {sourcesTotal === 0 ? (
                <p className="text-sm text-ink-4">No source data</p>
              ) : (
                <div className="space-y-3">
                  {Object.entries(current.traffic_sources)
                    .filter(([, v]) => (v ?? 0) > 0)
                    .sort(([, a], [, b]) => (b ?? 0) - (a ?? 0))
                    .map(([key, value]) => {
                      const cfg = SOURCE_LABELS[key] || { label: key.replace(/^\w/, c => c.toUpperCase()), icon: LinkIcon }
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

            {/* Top referrers (detail of the Referral bucket) */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <Globe className="w-4 h-4 text-ink-4" />
                Top Referring Sites
              </h2>
              {current.top_referrers.length === 0 ? (
                <p className="text-sm text-ink-4">No referrals this month</p>
              ) : (
                <div className="space-y-2">
                  {current.top_referrers.slice(0, 8).map((r, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-ink-4 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0 text-xs text-ink truncate">{r.source}</div>
                      <span className="text-xs text-ink-2 font-medium">{formatNumber(r.sessions)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Top pages (all views) */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <FileText className="w-4 h-4 text-ink-4" />
                Top Pages
              </h2>
              {current.top_pages.length === 0 ? (
                <p className="text-sm text-ink-4">No page data</p>
              ) : (
                <div className="space-y-2">
                  {current.top_pages.slice(0, 8).map((p, i) => (
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

            {/* Landing pages (entry points) */}
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <Navigation className="w-4 h-4 text-ink-4" />
                Top Landing Pages
              </h2>
              <p className="text-[10px] text-ink-4 mb-3">Where visitors first arrive on your site</p>
              {current.landing_pages.length === 0 ? (
                <p className="text-sm text-ink-4">No landing page data</p>
              ) : (
                <div className="space-y-2">
                  {current.landing_pages.slice(0, 8).map((p, i) => (
                    <div key={i} className="flex items-center gap-3">
                      <span className="text-[10px] text-ink-4 font-mono w-5">{i + 1}</span>
                      <div className="flex-1 min-w-0 text-xs text-ink truncate font-mono">{p.path}</div>
                      <span className="text-xs text-ink-2 font-medium">{formatNumber(p.sessions)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Top cities */}
          {current.top_cities.length > 0 && (
            <div className="bg-white rounded-xl border border-ink-6 p-5">
              <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-ink-4" />
                Where Your Visitors Are
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                {current.top_cities.slice(0, 10).map((c, i) => (
                  <div key={i} className="bg-bg-2 rounded-lg p-3">
                    <div className="text-xs text-ink-3 truncate">{c.city}</div>
                    <div className="text-lg font-[family-name:var(--font-display)] text-ink mt-0.5">
                      {formatNumber(c.sessions)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* GSC search performance */}
          <SearchSection search={current.search} prevSearch={previous?.search ?? null} />
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ConversionsSection({
  current, previous,
}: {
  current: ConversionEvents
  previous: ConversionEvents | null
}) {
  const items = [
    { key: 'phone_clicks', label: 'Phone Calls', icon: Phone, value: current.phone_clicks, prev: previous?.phone_clicks ?? 0 },
    { key: 'direction_clicks', label: 'Directions', icon: Navigation, value: current.direction_clicks, prev: previous?.direction_clicks ?? 0 },
    { key: 'form_submits', label: 'Form Submits', icon: Send, value: current.form_submits, prev: previous?.form_submits ?? 0 },
    { key: 'booking_clicks', label: 'Bookings', icon: Calendar, value: current.booking_clicks, prev: previous?.booking_clicks ?? 0 },
  ]
  const hasAnyConversions = current.total > 0

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-ink flex items-center gap-2">
          <Target className="w-4 h-4 text-brand" />
          Conversions
        </h2>
        {hasAnyConversions && (
          <span className="text-xs text-ink-3">
            {formatNumber(current.total)} total actions taken
          </span>
        )}
      </div>
      {!hasAnyConversions ? (
        <div className="text-xs text-ink-4 py-2">
          We haven&apos;t seen any phone clicks, direction clicks, form submits, or bookings yet. These show up automatically once your website has GA4 events set up for them.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map(item => {
            const change = previous ? (item.prev === 0 ? (item.value > 0 ? 100 : 0) : Math.round(((item.value - item.prev) / item.prev) * 1000) / 10) : null
            const Icon = item.icon
            const trendColor = change == null ? 'text-ink-4' : change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-ink-4'
            return (
              <div key={item.key} className="bg-bg-2 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <Icon className="w-4 h-4 text-brand" />
                  {change != null && change !== 0 && (
                    <span className={`text-[10px] font-medium ${trendColor}`}>
                      {change > 0 ? '+' : ''}{change}%
                    </span>
                  )}
                </div>
                <div className="font-[family-name:var(--font-display)] text-xl text-ink">{formatNumber(item.value)}</div>
                <div className="text-[10px] text-ink-3 mt-0.5 uppercase tracking-wide">{item.label}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function AudienceSplit({ newUsers, returningUsers }: { newUsers: number; returningUsers: number }) {
  const total = newUsers + returningUsers
  const newPct = total > 0 ? (newUsers / total) * 100 : 0
  const returningPct = total > 0 ? (returningUsers / total) * 100 : 0

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
        <Repeat className="w-4 h-4 text-ink-4" />
        Audience
      </h2>
      <div className="flex gap-1 h-8 rounded-lg overflow-hidden mb-3">
        {newUsers > 0 && (
          <div className="bg-brand flex items-center justify-center" style={{ width: `${newPct}%` }}>
            {newPct > 15 && <span className="text-[10px] text-white font-medium">New</span>}
          </div>
        )}
        {returningUsers > 0 && (
          <div className="bg-brand/50 flex items-center justify-center" style={{ width: `${returningPct}%` }}>
            {returningPct > 15 && <span className="text-[10px] text-white font-medium">Returning</span>}
          </div>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-ink-3">New visitors</div>
          <div className="font-semibold text-ink">{formatNumber(newUsers)} <span className="text-[10px] text-ink-4">({newPct.toFixed(0)}%)</span></div>
        </div>
        <div>
          <div className="text-ink-3">Returning</div>
          <div className="font-semibold text-ink">{formatNumber(returningUsers)} <span className="text-[10px] text-ink-4">({returningPct.toFixed(0)}%)</span></div>
        </div>
      </div>
    </div>
  )
}

function SearchSection({
  search, prevSearch,
}: {
  search: MonthlyAggregate['search']
  prevSearch: MonthlyAggregate['search'] | null
}) {
  const hasAnySearch = search.impressions > 0 || search.clicks > 0 || search.days_with_data > 0

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <h2 className="text-sm font-semibold text-ink mb-4 flex items-center gap-2">
        <Search className="w-4 h-4 text-ink-4" />
        Google Search Performance
      </h2>

      {!hasAnySearch ? (
        <div className="text-xs text-ink-4">
          No search data yet. Google Search Console has a 2-3 day delay on new data. If you just connected, give it a few days.
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
            <SearchMetric
              label="Impressions"
              value={search.impressions}
              change={prevSearch ? calcChange(search.impressions, prevSearch.impressions) : null}
            />
            <SearchMetric
              label="Clicks"
              value={search.clicks}
              change={prevSearch ? calcChange(search.clicks, prevSearch.clicks) : null}
            />
            <SearchMetric
              label="CTR"
              value={search.avg_ctr ?? 0}
              suffix="%"
              change={null}
            />
            <SearchMetric
              label="Avg Position"
              value={search.avg_position ?? 0}
              change={null}
              noFormat
            />
          </div>

          {search.top_queries.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-ink-2 mb-2">What people search to find you</h3>
              <div className="space-y-2">
                {search.top_queries.slice(0, 10).map((q, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-[10px] text-ink-4 font-mono w-5">{i + 1}</span>
                    <div className="flex-1 min-w-0 text-xs text-ink truncate">{q.query}</div>
                    <span className="text-[10px] text-ink-4">{formatNumber(q.impressions)} imp</span>
                    <span className="text-xs text-ink-2 font-medium min-w-[3ch] text-right">{formatNumber(q.clicks)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}

function SearchMetric({
  label, value, change, suffix, noFormat,
}: {
  label: string
  value: number
  change: number | null
  suffix?: string
  noFormat?: boolean
}) {
  const trendColor = change == null ? 'text-ink-4' : change > 0 ? 'text-emerald-600' : change < 0 ? 'text-red-500' : 'text-ink-4'
  return (
    <div className="bg-bg-2 rounded-lg p-3">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-ink-3 uppercase tracking-wide">{label}</span>
        {change != null && change !== 0 && (
          <span className={`text-[10px] font-medium ${trendColor}`}>
            {change > 0 ? '+' : ''}{change}%
          </span>
        )}
      </div>
      <div className="font-[family-name:var(--font-display)] text-xl text-ink">
        {noFormat ? value.toFixed(1) : formatNumber(value)}{suffix}
      </div>
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
