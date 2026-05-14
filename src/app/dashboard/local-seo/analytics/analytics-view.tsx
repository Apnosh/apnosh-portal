'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, Eye, MapPin, Phone, Globe,
  Download, BarChart3, AlertCircle, Camera, MessageSquare, Calendar,
  UtensilsCrossed, ChevronDown, Search, FileText, Smartphone, Monitor, Map,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getGbpAnalytics, type AnalyticsRange, type AnalyticsSummary, type AnalyticsOptions } from '@/lib/dashboard/get-gbp-analytics'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import ConnectEmptyState from '../connect-empty-state'

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
  { value: 'custom', label: 'Custom' },
]

/* Default custom range = last 30 days ending 3 days ago (API lag). */
function defaultCustomRange(): { start: string; end: string } {
  const end = new Date()
  end.setUTCDate(end.getUTCDate() - 3)
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 29)
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  }
}

/* "2026-05-11" parsed via new Date() resolves to UTC midnight, which
   in PT renders as the prior calendar day. Treat the YMD string as
   local-midnight to keep the displayed date matching the DB date. */
function parseYmdLocal(ymd: string): Date {
  return new Date(ymd + 'T00:00:00')
}

function fmt(n: number): string {
  if (n >= 100_000) return `${(n / 1000).toFixed(0)}k`
  if (n >= 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n >= 1_000) return n.toLocaleString('en-US')
  return n.toString()
}

function pctDelta(curr: number, prev: number): { value: number; up: boolean; new: boolean } {
  if (prev === 0 && curr === 0) return { value: 0, up: false, new: false }
  if (prev === 0) return { value: 100, up: true, new: true }
  const v = Math.round(((curr - prev) / prev) * 100)
  return { value: Math.abs(v), up: v >= 0, new: false }
}

export default function AnalyticsView() {
  const { client, loading: clientLoading } = useClient()
  const [range, setRange] = useState<AnalyticsRange>('30d')
  const [customRange, setCustomRange] = useState(() => defaultCustomRange())
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<keyof AnalyticsSummary['totals']>('impressions')

  /* Load locations once — drives the location picker. */
  useEffect(() => {
    if (!client?.id) return
    getClientLocations(client.id).then(setLocations).catch(() => { /* keep empty */ })
  }, [client?.id])

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setLoading(true)
    setError(null)

    /* Cheap connection probe so we can surface the connect CTA
       instead of a confusing empty chart. */
    fetch('/api/dashboard/gbp/status')
      .then(r => r.ok ? r.json() : null)
      .then(json => {
        if (!cancelled && json) setConnected(json.connected !== false)
      })
      .catch(() => { /* ignore */ })

    const opts: AnalyticsOptions = {
      range,
      locationId,
      customStart: range === 'custom' ? customRange.start : undefined,
      customEnd: range === 'custom' ? customRange.end : undefined,
    }
    getGbpAnalytics(client.id, opts)
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError((err as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [client?.id, range, locationId, customRange.start, customRange.end])

  /* CSV export of the current range — owners and strategists frequently
     drop these into spreadsheets. */
  function exportCsv() {
    if (!data) return
    const header = 'date,impressions,directions,calls,website_clicks,post_views,post_clicks,photo_views,conversations,bookings,food_orders,food_menu_clicks\n'
    const body = data.daily.map(d =>
      [d.date, d.impressions, d.directions, d.calls, d.websiteClicks, d.postViews, d.postClicks, d.photoViews, d.conversations, d.bookings, d.foodOrders, d.foodMenuClicks].join(',')
    ).join('\n')
    const blob = new Blob([header + body], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `gbp-analytics-${data.range}-${data.end}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  const peakMetric = useMemo(() => {
    if (!data || data.daily.length === 0) return null
    return data.daily.reduce((max, d) => d[activeMetric] > max[activeMetric] ? d : max, data.daily[0])
  }, [data, activeMetric])

  if (clientLoading || loading) {
    return (
      <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-6 w-48 bg-ink-6 rounded" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-24 bg-ink-6 rounded-xl" />)}
          </div>
          <div className="h-72 bg-ink-6 rounded-2xl" />
        </div>
      </div>
    )
  }

  if (connected === false) {
    return <ConnectEmptyState context="full analytics" />
  }

  if (error) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12">
        <Link href="/dashboard/local-seo" className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink mb-6">
          <ArrowLeft className="w-3.5 h-3.5" /> Back to Local SEO
        </Link>
        <div className="rounded-2xl bg-amber-50 border border-amber-200 p-5 flex items-start gap-3">
          <AlertCircle className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
          <p className="text-sm text-amber-900">{error}</p>
        </div>
      </div>
    )
  }

  if (!data) return null

  const hasData = data.totals.impressions > 0 ||
                  data.totals.directions > 0 ||
                  data.totals.calls > 0 ||
                  data.totals.websiteClicks > 0

  return (
    <div className="max-w-6xl mx-auto px-4 lg:px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 grid place-items-center ring-1 ring-emerald-100">
            <BarChart3 className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-ink">Full analytics</h1>
            <p className="text-sm text-ink-3 mt-1">
              {locations.length > 1 && !locationId
                ? `Aggregated across ${locations.length} locations. `
                : locationId && locations.find(l => l.id === locationId)
                  ? `${locations.find(l => l.id === locationId)?.location_name}. `
                  : 'How customers are finding and interacting with your Google listing. '}
              <span className="text-ink-4 text-xs">
                {parseYmdLocal(data.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {parseYmdLocal(data.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {locations.length > 1 && (
            /* Native select — keeps the page lightweight and works on
               mobile without extra dropdown plumbing. Owners scan their
               5-6 locations at a glance. */
            <select
              value={locationId ?? ''}
              onChange={e => setLocationId(e.target.value || null)}
              className="text-[12px] font-medium text-ink-2 bg-white ring-1 ring-ink-6 rounded-full px-3 py-1.5 focus:outline-none focus:ring-ink-3"
            >
              <option value="">All {locations.length} locations</option>
              {locations.map(l => (
                <option key={l.id} value={l.id}>{l.location_name}</option>
              ))}
            </select>
          )}
          <div className="inline-flex rounded-full bg-bg-2 p-0.5 ring-1 ring-ink-6">
            {RANGE_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setRange(opt.value)}
                className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors ${
                  range === opt.value
                    ? 'bg-white text-ink shadow-sm'
                    : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={!hasData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-6 hover:ring-ink-4 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Download className="w-3 h-3" />
            CSV
          </button>
          {/* Manual backfill button removed — backfill now runs
             automatically when a client connects their listing.
             Kept the API + lib in place for admin tooling. */}
        </div>
      </div>

      {/* Custom date range inputs — only visible when "Custom" is active. */}
      {range === 'custom' && (
        <div className="rounded-2xl border border-ink-6 bg-white p-3 flex items-center gap-3 flex-wrap">
          <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">Range</span>
          <input
            type="date"
            value={customRange.start}
            max={customRange.end}
            onChange={e => setCustomRange(r => ({ ...r, start: e.target.value }))}
            className="text-[12.5px] text-ink-2 bg-white ring-1 ring-ink-6 rounded-lg px-2 py-1 focus:outline-none focus:ring-ink-3"
          />
          <span className="text-ink-4 text-[12px]">to</span>
          <input
            type="date"
            value={customRange.end}
            min={customRange.start}
            onChange={e => setCustomRange(r => ({ ...r, end: e.target.value }))}
            className="text-[12.5px] text-ink-2 bg-white ring-1 ring-ink-6 rounded-lg px-2 py-1 focus:outline-none focus:ring-ink-3"
          />
        </div>
      )}

      {/* KPI tiles */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Impressions"
          value={data.totals.impressions}
          prev={data.prevTotals.impressions}
          icon={Eye}
          active={activeMetric === 'impressions'}
          onClick={() => setActiveMetric('impressions')}
        />
        <KpiTile
          label="Directions"
          value={data.totals.directions}
          prev={data.prevTotals.directions}
          icon={MapPin}
          active={activeMetric === 'directions'}
          onClick={() => setActiveMetric('directions')}
        />
        <KpiTile
          label="Phone calls"
          value={data.totals.calls}
          prev={data.prevTotals.calls}
          icon={Phone}
          active={activeMetric === 'calls'}
          onClick={() => setActiveMetric('calls')}
        />
        <KpiTile
          label="Website clicks"
          value={data.totals.websiteClicks}
          prev={data.prevTotals.websiteClicks}
          icon={Globe}
          active={activeMetric === 'websiteClicks'}
          onClick={() => setActiveMetric('websiteClicks')}
        />
      </div>

      {!hasData && (
        <div className="rounded-2xl border border-ink-6 bg-white p-10 text-center">
          <BarChart3 className="w-8 h-8 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink">No data for this range yet</p>
          <p className="text-xs text-ink-3 mt-1 max-w-md mx-auto">
            Google&rsquo;s Performance API typically has a 3-day reporting lag — fresh data appears
            here a few days after the events happen. Try a wider date range.
          </p>
        </div>
      )}

      {/* Time-series chart for the active metric */}
      {hasData && (
        <div className="rounded-2xl border border-ink-6 bg-white p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <h2 className="text-sm font-semibold text-ink capitalize">
              {labelFor(activeMetric)} over time
            </h2>
            {peakMetric && peakMetric[activeMetric] > 0 && (
              <div className="text-xs text-ink-3">
                Peak: <strong className="text-ink-2">{fmt(peakMetric[activeMetric])}</strong>{' '}
                on {parseYmdLocal(peakMetric.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </div>
            )}
          </div>
          <Sparkline data={data.daily} metric={activeMetric} />
        </div>
      )}

      {/* Where impressions came from — surface vs platform breakdown.
         Only renders when at least one bucket has data (older rows
         from manual CSV imports don't carry the split). */}
      {hasData && (data.impressionBreakdown.searchMobile + data.impressionBreakdown.searchDesktop
        + data.impressionBreakdown.mapsMobile + data.impressionBreakdown.mapsDesktop) > 0 && (
        <ImpressionBreakdown data={data.impressionBreakdown} />
      )}

      {/* Engagement metrics — clickable like the primary tiles so the
         chart can plot any of them. */}
      {hasData && (
        <div>
          <h2 className="text-sm font-semibold text-ink mb-2">Engagement</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <SecondaryTile
              label="Post views"
              icon={FileText}
              value={data.totals.postViews}
              prev={data.prevTotals.postViews}
              active={activeMetric === 'postViews'}
              onClick={() => setActiveMetric('postViews')}
            />
            <SecondaryTile
              label="Post clicks"
              icon={FileText}
              value={data.totals.postClicks}
              prev={data.prevTotals.postClicks}
              active={activeMetric === 'postClicks'}
              onClick={() => setActiveMetric('postClicks')}
            />
            <SecondaryTile
              label="Photo views"
              icon={Camera}
              value={data.totals.photoViews}
              prev={data.prevTotals.photoViews}
              active={activeMetric === 'photoViews'}
              onClick={() => setActiveMetric('photoViews')}
            />
            <SecondaryTile
              label="Conversations"
              icon={MessageSquare}
              value={data.totals.conversations}
              prev={data.prevTotals.conversations}
              active={activeMetric === 'conversations'}
              onClick={() => setActiveMetric('conversations')}
            />
            <SecondaryTile
              label="Bookings"
              icon={Calendar}
              value={data.totals.bookings}
              prev={data.prevTotals.bookings}
              active={activeMetric === 'bookings'}
              onClick={() => setActiveMetric('bookings')}
            />
            <SecondaryTile
              label="Food orders"
              icon={UtensilsCrossed}
              value={data.totals.foodOrders}
              prev={data.prevTotals.foodOrders}
              active={activeMetric === 'foodOrders'}
              onClick={() => setActiveMetric('foodOrders')}
            />
            <SecondaryTile
              label="Menu clicks"
              icon={UtensilsCrossed}
              value={data.totals.foodMenuClicks}
              prev={data.prevTotals.foodMenuClicks}
              active={activeMetric === 'foodMenuClicks'}
              onClick={() => setActiveMetric('foodMenuClicks')}
            />
          </div>
        </div>
      )}

      {/* Top search queries — what people typed into Google to find
         the business. Surfaced when present (Looker CSV ingest only). */}
      {hasData && data.topQueries.length > 0 && (
        <TopQueries queries={data.topQueries} />
      )}

      {/* Day-level table — collapsed by default. Power users open it
         to sanity-check a specific day or grab a row for spreadsheets. */}
      {hasData && (
        <details className="rounded-2xl border border-ink-6 bg-white overflow-hidden group">
          <summary className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-2/40 list-none">
            <div className="flex items-center gap-2">
              <ChevronDown className="w-4 h-4 text-ink-3 transition-transform group-open:rotate-180" />
              <h2 className="text-sm font-semibold text-ink">Daily breakdown</h2>
              <span className="text-[11px] text-ink-4">{data.daily.length} day{data.daily.length === 1 ? '' : 's'}</span>
            </div>
            <span className="text-[11px] text-ink-4 group-open:hidden">Show table</span>
          </summary>
          <div className="overflow-x-auto border-t border-ink-6">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-2/40">
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-4">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold text-right">Impr.</th>
                  <th className="px-3 py-2 font-semibold text-right">Direct.</th>
                  <th className="px-3 py-2 font-semibold text-right">Calls</th>
                  <th className="px-3 py-2 font-semibold text-right">Web</th>
                  <th className="px-3 py-2 font-semibold text-right">Post v.</th>
                  <th className="px-3 py-2 font-semibold text-right">Post c.</th>
                  <th className="px-3 py-2 font-semibold text-right">Photo v.</th>
                  <th className="px-3 py-2 font-semibold text-right">Menu c.</th>
                  <th className="px-3 py-2 font-semibold text-right">Orders</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().map(d => (
                  <tr key={d.date} className="border-t border-ink-7 hover:bg-bg-2/40">
                    <td className="px-4 py-2 text-ink-2 tabular-nums whitespace-nowrap">
                      {parseYmdLocal(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.directions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.calls)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.websiteClicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.postViews)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.postClicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.photoViews)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.foodMenuClicks)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.foodOrders)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </div>
  )
}

function ImpressionBreakdown({ data }: { data: AnalyticsSummary['impressionBreakdown'] }) {
  const total = data.searchMobile + data.searchDesktop + data.mapsMobile + data.mapsDesktop
  const search = data.searchMobile + data.searchDesktop
  const maps = data.mapsMobile + data.mapsDesktop
  const mobile = data.searchMobile + data.mapsMobile
  const desktop = data.searchDesktop + data.mapsDesktop
  const pct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 100)
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <h2 className="text-sm font-semibold text-ink mb-1">Where you&rsquo;re being seen</h2>
      <p className="text-xs text-ink-4 mb-4">
        {fmt(total)} impressions across Google Search and Maps.
      </p>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <BreakdownTile label="Google Search" icon={Search} value={search} pct={pct(search)} />
        <BreakdownTile label="Google Maps" icon={Map} value={maps} pct={pct(maps)} />
        <BreakdownTile label="Mobile" icon={Smartphone} value={mobile} pct={pct(mobile)} />
        <BreakdownTile label="Desktop" icon={Monitor} value={desktop} pct={pct(desktop)} />
      </div>
    </div>
  )
}

function BreakdownTile({ label, icon: Icon, value, pct }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: number
  pct: number
}) {
  return (
    <div className="rounded-xl bg-bg-2/40 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-ink-3" />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">{label}</span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-[20px] font-semibold text-ink tabular-nums">{fmt(value)}</span>
        <span className="text-[11px] text-ink-4">{pct}%</span>
      </div>
      <div className="mt-1.5 h-1 rounded bg-ink-7 overflow-hidden">
        <div className="h-full bg-brand" style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

function TopQueries({ queries }: { queries: Array<{ query: string; impressions: number }> }) {
  const max = queries[0]?.impressions ?? 1
  return (
    <details className="rounded-2xl border border-ink-6 bg-white overflow-hidden group" open>
      <summary className="px-5 py-3 flex items-center justify-between cursor-pointer hover:bg-bg-2/40 list-none">
        <div className="flex items-center gap-2">
          <ChevronDown className="w-4 h-4 text-ink-3 transition-transform group-open:rotate-180" />
          <h2 className="text-sm font-semibold text-ink">Top search queries</h2>
          <span className="text-[11px] text-ink-4">{queries.length} term{queries.length === 1 ? '' : 's'}</span>
        </div>
      </summary>
      <div className="px-5 py-4 border-t border-ink-6">
        <p className="text-[11px] text-ink-4 mb-3">What people typed into Google to find you.</p>
        <ul className="space-y-1.5">
          {queries.map((q) => (
            <li key={q.query} className="flex items-center gap-3 text-[12.5px]">
              <span className="flex-1 text-ink-2 truncate">{q.query}</span>
              <span className="w-32 h-1.5 rounded bg-ink-7 overflow-hidden">
                <span className="block h-full bg-brand" style={{ width: `${(q.impressions / max) * 100}%` }} />
              </span>
              <span className="w-14 text-right tabular-nums text-ink-3">{fmt(q.impressions)}</span>
            </li>
          ))}
        </ul>
      </div>
    </details>
  )
}

function labelFor(m: keyof AnalyticsSummary['totals']): string {
  switch (m) {
    case 'impressions': return 'impressions'
    case 'directions': return 'direction requests'
    case 'calls': return 'phone calls'
    case 'websiteClicks': return 'website clicks'
    case 'postViews': return 'post views'
    case 'postClicks': return 'post clicks'
    case 'photoViews': return 'photo views'
    case 'conversations': return 'conversations'
    case 'bookings': return 'bookings'
    case 'foodOrders': return 'food orders'
    case 'foodMenuClicks': return 'menu clicks'
  }
}

function KpiTile({
  label, value, prev, icon: Icon, active, onClick,
}: {
  label: string
  value: number
  prev: number
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  onClick: () => void
}) {
  const delta = pctDelta(value, prev)
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all ${
        active
          ? 'border-brand bg-brand-tint/40 shadow-sm'
          : 'border-ink-6 bg-white hover:border-ink-4'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${active ? 'text-brand-dark' : 'text-ink-3'}`} />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">{label}</span>
      </div>
      <div className="mt-2 text-[26px] font-semibold text-ink tabular-nums leading-none">{fmt(value)}</div>
      <div className="mt-1.5 text-[11px] flex items-center gap-1">
        {delta.new ? (
          <span className="text-emerald-700 font-medium">First period with data</span>
        ) : value === 0 && prev === 0 ? (
          <span className="text-ink-4">No activity</span>
        ) : (
          <>
            {delta.up
              ? <ArrowUpRight className="w-3 h-3 text-emerald-700" />
              : <ArrowDownRight className="w-3 h-3 text-rose-700" />}
            <span className={delta.up ? 'text-emerald-700' : 'text-rose-700'}>
              {delta.value}%
            </span>
            <span className="text-ink-4">vs last year</span>
          </>
        )}
      </div>
    </button>
  )
}

function SecondaryTile({ label, icon: Icon, value, prev, active, onClick }: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  value: number
  prev: number
  active: boolean
  onClick: () => void
}) {
  const delta = pctDelta(value, prev)
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-2xl border p-4 transition-all ${
        active
          ? 'border-brand bg-brand-tint/40 shadow-sm'
          : 'border-ink-6 bg-white hover:border-ink-4'
      }`}
    >
      <div className="flex items-center gap-2">
        <Icon className={`w-3.5 h-3.5 ${active ? 'text-brand-dark' : 'text-ink-3'}`} />
        <span className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">{label}</span>
      </div>
      <div className="mt-1.5 text-[20px] font-semibold text-ink tabular-nums leading-none">{fmt(value)}</div>
      <div className="mt-1 text-[11px] text-ink-4">
        {value === 0 && prev === 0 ? '—' : delta.new ? 'New' : `${delta.up ? '+' : '-'}${delta.value}% YoY`}
      </div>
    </button>
  )
}

/* Compact inline sparkline for the active metric. Pure SVG, no chart
   library — keeps the page snappy and adds no bundle weight. */
function Sparkline({ data, metric }: {
  data: AnalyticsSummary['daily']
  metric: keyof AnalyticsSummary['totals']
}) {
  if (data.length < 2) return <p className="text-xs text-ink-4">Need more data to draw a chart.</p>

  const values = data.map(d => d[metric] as number)
  const max = Math.max(...values, 1)
  const min = 0
  const w = 1000
  const h = 200
  const stepX = w / (data.length - 1)
  const points = values.map((v, i) => {
    const x = i * stepX
    const y = h - ((v - min) / (max - min)) * h
    return `${x},${y}`
  }).join(' ')
  const areaPath = `M0,${h} L${points.replace(/ /g, ' L')} L${w},${h} Z`

  /* Sample 6 ticks across the x-axis for date labels. */
  const ticks = Array.from({ length: 6 }, (_, i) =>
    data[Math.floor((i / 5) * (data.length - 1))]
  )

  return (
    <div className="space-y-2">
      <svg viewBox={`0 0 ${w} ${h + 20}`} className="w-full h-48" preserveAspectRatio="none">
        <defs>
          <linearGradient id="sparkfill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4abd98" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4abd98" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#sparkfill)" />
        <polyline
          points={points}
          fill="none"
          stroke="#4abd98"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Top + bottom guide lines */}
        <line x1="0" y1="0" x2={w} y2="0" stroke="#e8e8e6" strokeWidth="1" />
        <line x1="0" y1={h} x2={w} y2={h} stroke="#e8e8e6" strokeWidth="1" />
      </svg>
      <div className="flex justify-between text-[10px] text-ink-4 px-1">
        {ticks.map((t, i) => (
          <span key={i}>{parseYmdLocal(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
        ))}
      </div>
    </div>
  )
}
