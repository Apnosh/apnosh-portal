'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, ArrowUpRight, ArrowDownRight, Eye, MapPin, Phone, Globe,
  Send, Download, BarChart3, AlertCircle, History, Loader2, CheckCircle2,
} from 'lucide-react'
import { useClient } from '@/lib/client-context'
import { getGbpAnalytics, type AnalyticsRange, type AnalyticsSummary } from '@/lib/dashboard/get-gbp-analytics'
import { getClientLocations } from '@/lib/dashboard/get-client-locations'
import type { ClientLocation } from '@/lib/dashboard/location-helpers'
import ConnectEmptyState from '../connect-empty-state'

const RANGE_OPTIONS: Array<{ value: AnalyticsRange; label: string }> = [
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: '90d', label: '90 days' },
  { value: '12m', label: '12 months' },
]

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
  const [locationId, setLocationId] = useState<string | null>(null)
  const [locations, setLocations] = useState<ClientLocation[]>([])
  const [data, setData] = useState<AnalyticsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [activeMetric, setActiveMetric] = useState<keyof AnalyticsSummary['totals']>('impressions')
  const [backfilling, setBackfilling] = useState(false)
  const [backfillMsg, setBackfillMsg] = useState<string | null>(null)

  async function runBackfill() {
    if (!confirm('Pull the last 18 months of Google data for every linked location? Takes a few minutes and counts against the daily API quota.')) return
    setBackfilling(true)
    setBackfillMsg(null)
    try {
      const res = await fetch('/api/dashboard/gbp/backfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthsBack: 18 }),
      })
      const body = await res.json() as { ok: boolean; daysInserted?: number; locationsAttempted?: number; errors?: unknown[]; message?: string }
      if (!res.ok || !body.ok) {
        setBackfillMsg(`Failed: ${body.message || 'unknown error'}`)
      } else {
        setBackfillMsg(`Pulled ${body.daysInserted ?? 0} days across ${body.locationsAttempted ?? 0} locations${(body.errors?.length ?? 0) > 0 ? ` (with ${body.errors!.length} errors)` : ''}. Refresh to see.`)
      }
    } catch (err) {
      setBackfillMsg(`Failed: ${(err as Error).message}`)
    } finally {
      setBackfilling(false)
    }
  }

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

    getGbpAnalytics(client.id, range, locationId)
      .then(d => { if (!cancelled) setData(d) })
      .catch(err => { if (!cancelled) setError((err as Error).message) })
      .finally(() => { if (!cancelled) setLoading(false) })

    return () => { cancelled = true }
  }, [client?.id, range, locationId])

  /* CSV export of the current range — owners and strategists frequently
     drop these into spreadsheets. */
  function exportCsv() {
    if (!data) return
    const header = 'date,impressions,directions,calls,website_clicks,post_views,conversations,bookings,food_orders\n'
    const body = data.daily.map(d =>
      [d.date, d.impressions, d.directions, d.calls, d.websiteClicks, d.postViews, d.conversations, d.bookings, d.foodOrders].join(',')
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
          <button
            onClick={runBackfill}
            disabled={backfilling}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-6 hover:ring-ink-4 disabled:opacity-50"
            title="Pull historical Google Business Profile data going back 18 months"
          >
            {backfilling ? <Loader2 className="w-3 h-3 animate-spin" /> : <History className="w-3 h-3" />}
            {backfilling ? 'Pulling history…' : 'Backfill history'}
          </button>
        </div>
      </div>

      {backfillMsg && (
        <div className={`rounded-2xl border p-3 flex items-start gap-3 ${backfillMsg.startsWith('Failed') ? 'border-rose-200 bg-rose-50/70' : 'border-emerald-200 bg-emerald-50/70'}`}>
          {backfillMsg.startsWith('Failed')
            ? <AlertCircle className="w-4 h-4 text-rose-700 flex-shrink-0 mt-0.5" />
            : <CheckCircle2 className="w-4 h-4 text-emerald-700 flex-shrink-0 mt-0.5" />}
          <p className={`text-[12.5px] ${backfillMsg.startsWith('Failed') ? 'text-rose-900' : 'text-emerald-900'}`}>{backfillMsg}</p>
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

      {/* Secondary KPI grid (engagement actions) */}
      {hasData && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <SecondaryTile label="Post views" value={data.totals.postViews} prev={data.prevTotals.postViews} />
          <SecondaryTile label="Conversations" value={data.totals.conversations} prev={data.prevTotals.conversations} />
          <SecondaryTile label="Bookings" value={data.totals.bookings} prev={data.prevTotals.bookings} />
          <SecondaryTile label="Food orders" value={data.totals.foodOrders} prev={data.prevTotals.foodOrders} />
        </div>
      )}

      {/* Day-level table */}
      {hasData && (
        <div className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Daily breakdown</h2>
            <span className="text-[11px] text-ink-4">{data.daily.length} day{data.daily.length === 1 ? '' : 's'}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead className="bg-bg-2/40">
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-ink-4">
                  <th className="px-4 py-2 font-semibold">Date</th>
                  <th className="px-3 py-2 font-semibold text-right">Impressions</th>
                  <th className="px-3 py-2 font-semibold text-right">Directions</th>
                  <th className="px-3 py-2 font-semibold text-right">Calls</th>
                  <th className="px-3 py-2 font-semibold text-right">Web clicks</th>
                </tr>
              </thead>
              <tbody>
                {[...data.daily].reverse().slice(0, 30).map(d => (
                  <tr key={d.date} className="border-t border-ink-7 hover:bg-bg-2/40">
                    <td className="px-4 py-2 text-ink-2 tabular-nums">
                      {parseYmdLocal(d.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.impressions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.directions)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.calls)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{fmt(d.websiteClicks)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function labelFor(m: keyof AnalyticsSummary['totals']): string {
  switch (m) {
    case 'impressions': return 'impressions'
    case 'directions': return 'direction requests'
    case 'calls': return 'phone calls'
    case 'websiteClicks': return 'website clicks'
    case 'postViews': return 'post views'
    case 'conversations': return 'conversations'
    case 'bookings': return 'bookings'
    case 'foodOrders': return 'food orders'
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
            <span className="text-ink-4">vs prior period</span>
          </>
        )}
      </div>
    </button>
  )
}

function SecondaryTile({ label, value, prev }: { label: string; value: number; prev: number }) {
  const delta = pctDelta(value, prev)
  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-4">
      <div className="text-[11px] uppercase tracking-wider font-semibold text-ink-3">{label}</div>
      <div className="mt-1.5 text-[20px] font-semibold text-ink tabular-nums leading-none">{fmt(value)}</div>
      <div className="mt-1 text-[11px] text-ink-4">
        {value === 0 && prev === 0 ? '—' : delta.new ? 'New' : `${delta.up ? '+' : '-'}${delta.value}% prior`}
      </div>
    </div>
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
