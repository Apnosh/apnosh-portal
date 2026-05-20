'use client'

/**
 * Mobile analytics — visually-rich, scannable, owner-grade.
 *
 * Pulls data from getGbpAnalytics() via a server-action call. This
 * is the same fetcher /dashboard/local-seo/analytics uses and works
 * with the client_users path (gbp_metrics keyed by client_id) rather
 * than the legacy businesses-table path the desktop view uses.
 *
 * Layout:
 *   Header: title + period picker (7d / 30d / 90d)
 *   Hero: total reach number, animated sparkline
 *   Where they found you: source breakdown
 *   Actions: 3-up grid of action counters
 *   Reviews: rating + new-review count + distribution
 *   Social: top post + 3 metric tiles
 *   AI insights: 2-3 narrative observations
 *
 * All charts are inline SVG — no chart library imports.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Search, Phone, MapPin, Globe,
  Star, TrendingUp, Eye, Heart, Sparkles, Users, Calendar,
  ChevronRight, Settings2, AlertCircle,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getGbpAnalytics, type AnalyticsSummary, type AnalyticsRange } from '@/lib/dashboard/get-gbp-analytics'

type Period = '7d' | '30d' | '90d'

const PERIODS: Array<{ key: Period; label: string }> = [
  { key: '7d',  label: '7d' },
  { key: '30d', label: '30d' },
  { key: '90d', label: '90d' },
]

/* Helpers */

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 10_000) return `${(n / 1_000).toFixed(0)}k`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(Math.round(n))
}

function pctChange(curr: number, prev: number): { delta: string; up: boolean | null } {
  if (prev === 0) return { delta: curr > 0 ? '+∞' : '0%', up: curr > 0 ? true : null }
  const d = ((curr - prev) / prev) * 100
  const sign = d > 0 ? '+' : ''
  return { delta: `${sign}${d.toFixed(1)}%`, up: d > 0 ? true : d < 0 ? false : null }
}

/* ─── COMPONENT ──────────────────────────────────────────────────── */

export default function MobileAnalytics() {
  const { client, loading: clientLoading } = useClient()
  const [period, setPeriod] = useState<Period>('30d')
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    if (!client?.id) {
      /* No client_id from context — stop the spinner so we render the
         layout with zeros instead of an indefinite skeleton. */
      if (!clientLoading) setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setFetchError(null)
    ;(async () => {
      try {
        const result = await getGbpAnalytics(client.id, period as AnalyticsRange)
        if (!cancelled) setData(result)
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to load analytics'
        console.error('Mobile analytics fetch failed:', err)
        if (!cancelled) setFetchError(msg)
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [client?.id, period, clientLoading])

  /* TEMP DEBUG STRIP — visible diagnostic so we can see exactly which
     state the component is in on a real phone. Remove once analytics
     is confirmed rendering. */
  const debugStrip = (
    <div className="bg-ink text-white text-[10px] font-mono px-3 py-1.5 leading-tight break-all">
      clientLoading={String(clientLoading)} · clientId={client?.id ? client.id.slice(0, 8) : 'NONE'} · loading={String(loading)} · err={fetchError ? 'YES' : 'no'} · days={data?.daily.length ?? 'null'} · reach={data?.totals.impressions ?? 'null'}
    </div>
  )

  if (clientLoading || (loading && !data)) {
    return (
      <div className="-mx-4 -mt-4 lg:mx-0 lg:mt-0">
        {debugStrip}
        <SkeletonState />
      </div>
    )
  }

  /* If we have no data and no client, show the empty state. */
  if (!data && !client?.id) {
    return (
      <div className="-mx-4 -mt-4 lg:mx-0 lg:mt-0">
        {debugStrip}
        <EmptyState />
      </div>
    )
  }

  /* If the server action failed, render the layout with zeros and a
     visible error banner instead of hiding everything behind EmptyState.
     Owners can still see the design and we get clear feedback in the
     UI rather than a silent empty page. */
  const safeData: AnalyticsSummary = data ?? {
    range: period,
    start: '',
    end: '',
    daily: [],
    totals: {
      impressions: 0, directions: 0, calls: 0, websiteClicks: 0,
      postViews: 0, postClicks: 0, photoViews: 0, conversations: 0,
      bookings: 0, foodOrders: 0, foodMenuClicks: 0,
    },
    prevTotals: {
      impressions: 0, directions: 0, calls: 0, websiteClicks: 0,
      postViews: 0, postClicks: 0, photoViews: 0, conversations: 0,
      bookings: 0, foodOrders: 0, foodMenuClicks: 0,
    },
    impressionBreakdown: { searchMobile: 0, searchDesktop: 0, mapsMobile: 0, mapsDesktop: 0 },
    topQueries: [],
  }

  /* Derive a 7-point sparkline series from the daily impressions feed.
     If we have fewer than 7 days, pad with zeros at the start. */
  const sparkSeries = (() => {
    const series = safeData.daily.map(d => d.impressions)
    return series.length >= 2 ? series : [...Array(Math.max(0, 7 - series.length)).fill(0), ...series]
  })()

  const totalReach = safeData.totals.impressions
  const totalReachPrior = safeData.prevTotals.impressions
  const totalChange = pctChange(totalReach, totalReachPrior)

  const searchTotal = safeData.impressionBreakdown.searchMobile + safeData.impressionBreakdown.searchDesktop
  const mapsTotal = safeData.impressionBreakdown.mapsMobile + safeData.impressionBreakdown.mapsDesktop

  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 bg-bg-2 min-h-screen">
      {debugStrip}
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6">
        <div className="flex items-baseline justify-between mb-3">
          <div>
            <h1 className="text-[24px] font-semibold text-ink leading-tight">Analytics</h1>
            <p className="text-[12px] text-ink-3 mt-0.5">{client?.name ?? 'Your performance'}</p>
          </div>
          <button
            className="text-ink-3 active:text-ink p-1"
            aria-label="Settings"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
        {/* Period picker */}
        <div className="inline-flex bg-ink-7 rounded-full p-0.5">
          {PERIODS.map(p => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={[
                'px-4 h-9 rounded-full text-[12.5px] font-semibold transition-colors min-w-[56px]',
                period === p.key ? 'bg-white text-ink shadow-sm' : 'text-ink-3 active:text-ink-2',
              ].join(' ')}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Diagnostic banner: fetch error OR no client_id resolved.
          Renders inline above the hero so it's visible without
          masking the rest of the layout. */}
      {fetchError && (
        <div className="bg-rose-50 border-b border-rose-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-[12.5px] font-semibold text-rose-900">Couldn&apos;t load analytics data</p>
            <p className="text-[11.5px] text-rose-700 mt-0.5 break-words">{fetchError}</p>
          </div>
        </div>
      )}
      {!client?.id && !clientLoading && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-3 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-[12.5px] text-amber-900">
            No client account linked to your login. Analytics needs a client to query.
          </p>
        </div>
      )}

      {/* Hero */}
      <section className="bg-gradient-to-br from-brand to-brand-dark text-white px-5 pt-6 pb-5 relative overflow-hidden">
        <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
        <div className="relative">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70 mb-2">
            Total reach · {period}
          </p>
          <p className="text-[56px] font-bold tabular-nums leading-none">
            {formatNumber(totalReach)}
          </p>
          {totalChange.up !== null && totalReachPrior > 0 && (
            <p className={`inline-flex items-center gap-1 text-[14px] font-semibold mt-2 ${totalChange.up ? 'text-emerald-200' : 'text-rose-200'}`}>
              {totalChange.up ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
              {totalChange.delta}
              <span className="text-white/60 font-normal">vs prior {period}</span>
            </p>
          )}
          <div className="mt-5">
            <Sparkline values={sparkSeries} color="rgba(255,255,255,0.85)" fill="rgba(255,255,255,0.15)" />
          </div>
          <p className="text-[11px] text-white/70 mt-3">
            Search views + Maps views combined
          </p>
        </div>
      </section>

      {/* Where they found you */}
      <section className="px-4 py-5 bg-white border-b border-ink-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
          Where they found you
        </p>
        <SourceBars
          items={[
            { label: 'Google Search', value: searchTotal, color: 'bg-blue-500' },
            { label: 'Google Maps',   value: mapsTotal,   color: 'bg-emerald-500' },
          ]}
          total={totalReach}
        />
      </section>

      {/* Actions */}
      <section className="px-4 py-5 bg-bg-2">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
          Actions they took
        </p>
        <div className="grid grid-cols-3 gap-3">
          <ActionTile
            icon={Phone}
            label="Calls"
            value={safeData.totals.calls}
            delta={pctChange(safeData.totals.calls, safeData.prevTotals.calls)}
            tint="bg-amber-50 text-amber-700"
          />
          <ActionTile
            icon={MapPin}
            label="Directions"
            value={safeData.totals.directions}
            delta={pctChange(safeData.totals.directions, safeData.prevTotals.directions)}
            tint="bg-emerald-50 text-emerald-700"
          />
          <ActionTile
            icon={Globe}
            label="Website"
            value={safeData.totals.websiteClicks}
            delta={pctChange(safeData.totals.websiteClicks, safeData.prevTotals.websiteClicks)}
            tint="bg-blue-50 text-blue-700"
          />
        </div>
      </section>

      {/* Reviews snapshot */}
      <section className="px-4 py-5 bg-white border-y border-ink-6">
        <ReviewsSnapshot />
      </section>

      {/* Social */}
      <section className="px-4 py-5 bg-bg-2">
        <SocialSnapshot />
      </section>

      {/* AI Insights */}
      <section className="px-4 py-5 bg-white border-t border-ink-6">
        <div className="flex items-center justify-between mb-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Apnosh AI insights
          </p>
          <Link
            href="/dashboard/audit"
            className="text-[12px] font-semibold text-brand-dark active:text-brand"
          >
            See audit
          </Link>
        </div>
        <ul className="space-y-2.5">
          <InsightItem
            icon={Search}
            tint="bg-purple-100 text-purple-700"
            text="You appeared in"
            highlight={`${formatNumber(searchTotal)} searches`}
            tail={searchTotal > 0 ? "across Google. Solid search visibility." : "across Google in this window."}
          />
          <InsightItem
            icon={Calendar}
            tint="bg-amber-100 text-amber-700"
            text="Direction requests"
            highlight={pctChange(safeData.totals.directions, safeData.prevTotals.directions).delta || '—'}
            tail={safeData.totals.directions > 0 ? "vs prior period — real customers heading your way." : "no direction requests this period yet."}
          />
          <InsightItem
            icon={Sparkles}
            tint="bg-emerald-100 text-emerald-700"
            text="Conversion rate"
            highlight={`${totalReach > 0 ? ((safeData.totals.directions + safeData.totals.calls) / totalReach * 100).toFixed(1) : '0'}%`}
            tail="of views turned into real customer actions."
          />
        </ul>
      </section>

      {/* Top queries (if available) */}
      {safeData.topQueries.length > 0 && (
        <section className="px-4 py-5 bg-bg-2 border-t border-ink-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-3">
            Top searches finding you
          </p>
          <ul className="bg-white rounded-2xl border border-ink-6 divide-y divide-ink-7 overflow-hidden">
            {safeData.topQueries.slice(0, 5).map((q, i) => (
              <li key={i} className="flex items-center justify-between px-4 py-3">
                <span className="text-[13.5px] text-ink truncate flex-1">{q.query}</span>
                <span className="text-[12.5px] font-semibold text-ink-2 tabular-nums ml-3">
                  {formatNumber(q.impressions)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Deep dive footer */}
      <section className="px-4 py-5 bg-bg-2">
        <Link
          href="/dashboard/local-seo/analytics"
          className="block bg-white rounded-2xl border border-ink-6 p-4 active:bg-ink-7 transition-colors"
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[14px] font-semibold text-ink">Open full analytics</p>
              <p className="text-[12px] text-ink-3 mt-0.5">Drill into every metric and trend</p>
            </div>
            <ChevronRight className="w-5 h-5 text-ink-4" />
          </div>
        </Link>
      </section>
    </div>
  )
}

/* ─── CHARTS ────────────────────────────────────────────────────── */

function Sparkline({
  values,
  color,
  fill,
  height = 64,
}: { values: number[]; color: string; fill: string; height?: number }) {
  if (values.length < 2) return null
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const w = 100 / (values.length - 1)
  const points = values.map((v, i) => ({
    x: i * w,
    y: 100 - ((v - min) / range) * 100,
  }))
  const path = points.reduce((acc, p, i, arr) => {
    if (i === 0) return `M ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
    const prev = arr[i - 1]
    const cx = ((prev.x + p.x) / 2).toFixed(2)
    return `${acc} C ${cx} ${prev.y.toFixed(2)}, ${cx} ${p.y.toFixed(2)}, ${p.x.toFixed(2)} ${p.y.toFixed(2)}`
  }, '')
  const areaPath = `${path} L 100 100 L 0 100 Z`

  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
    >
      <path d={areaPath} fill={fill} />
      <path d={path} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      {points.length > 0 && (
        <circle
          cx={points[points.length - 1].x}
          cy={points[points.length - 1].y}
          r={1.5}
          fill={color}
        />
      )}
    </svg>
  )
}

function SourceBars({
  items,
  total,
}: { items: Array<{ label: string; value: number; color: string }>; total: number }) {
  if (total === 0) {
    return <p className="text-[12.5px] text-ink-3">No view data yet for this period.</p>
  }
  return (
    <div className="space-y-3">
      {items.map(item => {
        const pct = total > 0 ? (item.value / total) * 100 : 0
        return (
          <div key={item.label}>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-[13px] font-semibold text-ink">{item.label}</span>
              <div className="flex items-baseline gap-2">
                <span className="text-[15px] font-bold text-ink tabular-nums">{formatNumber(item.value)}</span>
                <span className="text-[11.5px] text-ink-3">{pct.toFixed(0)}%</span>
              </div>
            </div>
            <div className="h-2 bg-ink-7 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-700 ${item.color}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ActionTile({
  icon: Icon,
  label,
  value,
  delta,
  tint,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number
  delta: { delta: string; up: boolean | null }
  tint: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-3.5">
      <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl ${tint} mb-2`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[22px] font-bold text-ink tabular-nums leading-none">{formatNumber(value)}</p>
      {delta.up !== null && (
        <p className={`inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 ${delta.up ? 'text-emerald-700' : 'text-rose-700'}`}>
          {delta.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
          {delta.delta}
        </p>
      )}
    </div>
  )
}

function ReviewsSnapshot() {
  /* TODO Phase 2: wire real aggregates from the reviews table. */
  const rating = 4.6
  const newCount = 12
  const newDelta = '+3'
  const dist = [42, 18, 5, 2, 1]
  const distTotal = dist.reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Reviews</p>
        <Link
          href="/dashboard/local-seo/reviews"
          className="text-[12px] font-semibold text-brand-dark active:text-brand"
        >
          See all
        </Link>
      </div>
      <div className="flex items-start gap-5">
        <div className="flex-shrink-0">
          <p className="text-[44px] font-bold text-ink tabular-nums leading-none">{rating.toFixed(1)}</p>
          <div className="flex gap-0.5 mt-1.5">
            {[1, 2, 3, 4, 5].map(i => (
              <Star
                key={i}
                className={`w-3.5 h-3.5 ${i <= Math.round(rating) ? 'fill-amber-400 text-amber-400' : 'text-ink-6'}`}
              />
            ))}
          </div>
          <p className="text-[10.5px] text-ink-3 mt-2">
            {newCount} new this period <span className="text-emerald-700 font-semibold">{newDelta}</span>
          </p>
        </div>
        <div className="flex-1 space-y-1">
          {dist.map((count, i) => {
            const star = 5 - i
            const pct = distTotal > 0 ? (count / distTotal) * 100 : 0
            return (
              <div key={star} className="flex items-center gap-2 text-[10.5px] text-ink-3">
                <span className="w-3 tabular-nums">{star}</span>
                <Star className="w-3 h-3 text-ink-4" />
                <div className="flex-1 h-1.5 bg-ink-7 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-400 rounded-full transition-all duration-700"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="w-6 text-right tabular-nums">{count}</span>
              </div>
            )
          })}
        </div>
      </div>
    </>
  )
}

function SocialSnapshot() {
  /* TODO Phase 2: wire social_metrics. */
  return (
    <>
      <div className="flex items-baseline justify-between mb-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">Social performance</p>
        <Link
          href="/dashboard/social"
          className="text-[12px] font-semibold text-brand-dark active:text-brand"
        >
          Open social
        </Link>
      </div>
      <div className="bg-gradient-to-br from-pink-50 to-amber-50 border border-amber-100 rounded-2xl p-4 mb-3">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-purple-500 via-pink-500 to-amber-400 flex items-center justify-center text-white text-[10px] font-bold flex-shrink-0">
            🔥
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 mb-1">
              Top post this period
            </p>
            <p className="text-[14px] font-semibold text-ink leading-snug mb-2">
              Carnitas behind the scenes
            </p>
            <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11.5px] text-ink-2">
              <span><strong>1,247</strong> views</span>
              <span><strong>87</strong> likes</span>
              <span><strong>8</strong> saves</span>
              <span><strong>2</strong> visits</span>
            </div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3">
        <SocialTile icon={Eye}   label="Reach"      value={1247} delta="+42%" />
        <SocialTile icon={Heart} label="Engagement" value="4.2%" delta="+0.8" suffix="" />
        <SocialTile icon={Users} label="Followers"  value={24}   delta="+12" />
      </div>
    </>
  )
}

function SocialTile({
  icon: Icon, label, value, delta, suffix,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: number | string
  delta: string
  suffix?: string
}) {
  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-3.5">
      <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-purple-50 text-purple-700 mb-2">
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none mb-1">{label}</p>
      <p className="text-[20px] font-bold text-ink tabular-nums leading-none">
        {typeof value === 'number' ? formatNumber(value) : value}
        {suffix !== undefined ? suffix : ''}
      </p>
      <p className="inline-flex items-center gap-0.5 text-[11px] font-semibold mt-1 text-emerald-700">
        <ArrowUpRight className="w-3 h-3" />
        {delta}
      </p>
    </div>
  )
}

function InsightItem({
  icon: Icon, tint, text, highlight, tail,
}: {
  icon: React.ComponentType<{ className?: string }>
  tint: string
  text: string
  highlight: string
  tail: string
}) {
  return (
    <li className="flex items-start gap-3">
      <span className={`inline-flex items-center justify-center w-8 h-8 rounded-xl flex-shrink-0 mt-0.5 ${tint}`}>
        <Icon className="w-4 h-4" />
      </span>
      <p className="text-[13.5px] text-ink leading-snug flex-1">
        {text} <span className="font-bold">{highlight}</span> {tail}
      </p>
    </li>
  )
}

function SkeletonState() {
  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0 space-y-3 p-4">
      <div className="skel h-8 w-32" />
      <div className="skel h-12 w-full" />
      <div className="skel h-64 w-full rounded-2xl" />
      <div className="skel h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-3 gap-3">
        <div className="skel h-28 rounded-2xl" />
        <div className="skel h-28 rounded-2xl" />
        <div className="skel h-28 rounded-2xl" />
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div className="px-4 py-12 text-center -mx-4 -mt-4 lg:mx-0 lg:mt-0">
      <div className="w-16 h-16 rounded-full bg-brand-tint mx-auto mb-4 flex items-center justify-center">
        <TrendingUp className="w-7 h-7 text-brand-dark" />
      </div>
      <p className="text-[18px] font-semibold text-ink mb-2">No analytics yet</p>
      <p className="text-[13px] text-ink-3 max-w-xs mx-auto mb-6">
        Connect your Google Business Profile to start seeing how customers find you.
      </p>
      <Link
        href="/dashboard/connected-accounts"
        className="inline-flex items-center gap-1.5 bg-brand text-white rounded-full px-5 py-2.5 text-[13px] font-semibold active:bg-brand-dark"
      >
        Connect a channel
        <ChevronRight className="w-4 h-4" />
      </Link>
    </div>
  )
}
