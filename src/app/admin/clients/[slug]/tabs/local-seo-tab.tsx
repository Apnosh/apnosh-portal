'use client'

/**
 * Local SEO tab -- the headline view for an agency-managed restaurant
 * client. Reads from gbp_metrics and surfaces, in this order:
 *
 *   1. Hero card with one-line story (auto-generated)
 *   2. Anomaly callouts (top 3 most dramatic per-location movers)
 *   3. KPI grid: 6 metrics across Discovery (impressions/photos)
 *      and Action (calls/directions/website) categories
 *   4. Trend chart with stacked surface mix (Search Mobile / Search
 *      Desktop / Maps Mobile / Maps Desktop)
 *   5. Search vs Maps split with insight text
 *   6. Engagement funnel showing impressions -> action rate
 *   7. Per-location table with inline sparkline trend
 *   8. Top search queries when populated
 *
 * Built to render the truth about monthly aggregate data (GMB Insights
 * CSVs) and daily data (Looker / API) interchangeably.
 */

import { useEffect, useState } from 'react'
import {
  Loader2, TrendingUp, TrendingDown, Minus, ExternalLink, Search, MapPin, Phone,
  Globe, Eye, Building2, Image as ImageIcon, MessageCircle, ArrowUpRight,
  ArrowDownRight, Sparkles, UtensilsCrossed, BookOpen,
} from 'lucide-react'
import {
  getLocalSeoSummary,
  getLocalSeoLocations,
  type LocalSeoSummary,
  type LocalSeoLocationRow,
  type AnomalyCallout,
} from '@/lib/gbp-backfill-actions'
import Link from 'next/link'

interface Props { clientId: string; clientSlug: string }

// ─── Number formatting ────────────────────────────────────────────────────
function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 10_000) return (n / 1_000).toFixed(0) + 'K'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null
  return ((curr - prev) / prev) * 100
}

// Hide a KPI card when both periods are zero -- avoids cluttering the
// dashboard with metrics that the data source doesn't supply (e.g. monthly
// CSVs don't include photo views, so showing "0 / vs 0" is just noise).
function hasNonZero(a: number, b: number): boolean {
  return a > 0 || b > 0
}

// ─── Reusable bits ────────────────────────────────────────────────────────

function DeltaBadge({ curr, prev, size = 'sm' }: { curr: number; prev: number; size?: 'xs' | 'sm' }) {
  const pct = pctChange(curr, prev)
  if (pct === null) return <span className={`${size === 'xs' ? 'text-[10px]' : 'text-xs'} text-ink-3`}>new</span>
  const flat = Math.abs(pct) < 1
  const up = pct > 0
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  const color = flat ? 'text-ink-3' : up ? 'text-emerald-600' : 'text-red-500'
  const sizeClass = size === 'xs' ? 'text-[10px]' : 'text-xs'
  const iconSize = size === 'xs' ? 'w-2.5 h-2.5' : 'w-3 h-3'
  return (
    <span className={`inline-flex items-center gap-0.5 ${sizeClass} font-medium ${color}`}>
      <Icon className={iconSize} />
      {flat ? '0%' : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  )
}

function Sparkline({ points, height = 32, color = 'text-brand' }: { points: number[]; height?: number; color?: string }) {
  if (points.length < 2) return <div className={`h-${Math.floor(height/4)} text-[10px] text-ink-4 flex items-center`}>—</div>
  const max = Math.max(...points, 1)
  const w = 80
  const step = w / (points.length - 1)
  const pathD = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - (p / max) * height).toFixed(2)}`).join(' ')
  const areaD = `${pathD} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={`w-full ${color}`} style={{ height }}>
      <path d={areaD} fill="currentColor" fillOpacity="0.1" />
      <path d={pathD} fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  )
}

// Stacked monthly bars: Search Mobile / Search Desktop / Maps Mobile / Maps Desktop
function StackedSurfaceBars({ daily, height = 140 }: {
  daily: Array<{ date: string; impressions_search: number; impressions_maps: number }>
  height?: number
}) {
  if (daily.length < 1) return <div className="h-32 text-xs text-ink-4 flex items-center justify-center">no data yet</div>
  const max = Math.max(...daily.map(d => d.impressions_search + d.impressions_maps), 1)
  const monthShort = (iso: string) => new Date(iso + 'T00:00:00Z').toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })
  return (
    <div>
      <div className="flex items-end gap-3" style={{ height: height + 28 }}>
        {daily.map(d => {
          const total = d.impressions_search + d.impressions_maps
          const totalH = (total / max) * height
          const searchH = total > 0 ? (d.impressions_search / total) * totalH : 0
          const mapsH = totalH - searchH
          return (
            <div key={d.date} className="flex-1 flex flex-col items-center gap-1.5 min-w-0">
              <div className="text-[10px] font-mono text-ink-3 truncate w-full text-center" title={`${total.toLocaleString()} total`}>
                {formatNum(total)}
              </div>
              <div className="w-full flex flex-col-reverse rounded-t-md overflow-hidden" style={{ height: totalH }}>
                <div className="w-full bg-brand" style={{ height: searchH }} title={`Search: ${d.impressions_search.toLocaleString()}`} />
                <div className="w-full bg-brand/40" style={{ height: mapsH }} title={`Maps: ${d.impressions_maps.toLocaleString()}`} />
              </div>
              <div className="text-[10px] text-ink-3">{monthShort(d.date)}</div>
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-ink-3">
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand" /> Search</span>
        <span className="inline-flex items-center gap-1.5"><span className="w-2 h-2 rounded-sm bg-brand/40" /> Maps</span>
      </div>
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────

function MetricCard({
  label, icon: Icon, curr, prev, currentPeriodLabel, priorPeriodLabel,
}: {
  label: string; icon: React.ComponentType<{ className?: string }>
  curr: number; prev: number
  currentPeriodLabel: string; priorPeriodLabel: string
}) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-4">
      <div className="flex items-center justify-between mb-2.5">
        <Icon className="w-4 h-4 text-ink-4" />
        <DeltaBadge curr={curr} prev={prev} />
      </div>
      <div className="text-2xl font-bold text-ink leading-none">{formatNum(curr)}</div>
      <div className="text-xs text-ink-3 mt-1">{label}</div>
      <div className="text-[10px] text-ink-4 mt-2 leading-tight">
        vs {formatNum(prev)} in {priorPeriodLabel}
      </div>
    </div>
  )
}

// ─── Hero summary ─────────────────────────────────────────────────────────

function buildHeroNarrative(s: LocalSeoSummary): { headline: string; subheadline: string } {
  const { totals30d, totalsPrev30d, currentPeriodLabel, priorPeriodLabel } = s
  const impPct = pctChange(totals30d.impressions, totalsPrev30d.impressions)
  const actionPct = pctChange(totals30d.actions, totalsPrev30d.actions)

  const headline = `${formatNum(totals30d.impressions)} impressions and ${formatNum(totals30d.actions)} customer actions in ${currentPeriodLabel}.`

  let sub = ''
  if (impPct === null) {
    sub = `No ${priorPeriodLabel} data to compare yet.`
  } else if (Math.abs(impPct) < 5) {
    sub = `About flat vs ${priorPeriodLabel}.`
  } else {
    const dir = impPct > 0 ? 'up' : 'down'
    sub = `Impressions ${dir} ${Math.abs(impPct).toFixed(0)}% from ${priorPeriodLabel}`
    if (actionPct !== null) {
      const aDir = actionPct > 0 ? 'up' : 'down'
      sub += `, actions ${aDir} ${Math.abs(actionPct).toFixed(0)}%.`
    } else {
      sub += '.'
    }
  }
  return { headline, subheadline: sub }
}

// ─── Anomaly card ─────────────────────────────────────────────────────────

function AnomalyCard({ a }: { a: AnomalyCallout }) {
  const Icon = a.tone === 'good' ? ArrowUpRight : ArrowDownRight
  const bg = a.tone === 'good' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'
  const iconColor = a.tone === 'good' ? 'text-emerald-600' : 'text-red-500'
  return (
    <div className={`rounded-xl border p-3.5 ${bg}`}>
      <div className="flex items-start gap-2.5">
        <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${iconColor}`} />
        <div className="min-w-0">
          <div className="text-sm font-semibold text-ink leading-snug">{a.headline}</div>
          <div className="text-xs text-ink-3 mt-0.5">{a.body}</div>
        </div>
      </div>
    </div>
  )
}

// ─── Main ─────────────────────────────────────────────────────────────────

export default function LocalSeoTab({ clientId, clientSlug }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LocalSeoSummary | null>(null)
  const [locations, setLocations] = useState<LocalSeoLocationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      getLocalSeoSummary(clientId, 365),
      getLocalSeoLocations(clientId),
    ]).then(([summaryRes, locsRes]) => {
      if (!mounted) return
      if (summaryRes.success) setData(summaryRes.data)
      else setError(summaryRes.error)
      if (locsRes.success) setLocations(locsRes.data)
      setLoading(false)
    })
    return () => { mounted = false }
  }, [clientId])

  if (loading) {
    return <div className="flex items-center gap-2 text-sm text-ink-3 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Loading...</div>
  }

  if (error) {
    return <div className="text-sm text-red-500 py-10">{error}</div>
  }

  if (!data || data.daysCovered === 0) {
    return (
      <div className="rounded-xl border border-dashed border-ink-5 p-10 text-center">
        <MapPin className="w-8 h-8 text-ink-4 mx-auto mb-3" />
        <h3 className="text-sm font-bold text-ink mb-1">No GBP data yet</h3>
        <p className="text-xs text-ink-3 mb-5 max-w-md mx-auto">
          Upload a CSV from Google Business Profile, or run the bulk Looker Studio backfill to populate insights for every client at once.
        </p>
        <div className="flex gap-2 justify-center">
          <Link
            href={`/admin/clients/${clientSlug}/import-gbp`}
            className="px-4 py-2 bg-ink text-white text-sm font-medium rounded-lg hover:bg-ink-2"
          >
            Import for this client
          </Link>
          <Link
            href="/admin/gbp/backfill"
            className="px-4 py-2 border border-ink-5 text-sm font-medium rounded-lg hover:bg-bg-2"
          >
            Bulk backfill all
          </Link>
        </div>
      </div>
    )
  }

  const { totals30d, totalsPrev30d, topQueries, daily, lastSyncAt, dateFirst, dateLast, granularity, currentPeriodLabel, priorPeriodLabel, anomalies } = data
  const distinctDates = daily.length
  const hero = buildHeroNarrative(data)

  // Surface mix for the split card
  const totalImp = totals30d.impressions || 1
  const searchPct = (totals30d.impressionsSearch / totalImp) * 100
  const mapsPct = (totals30d.impressionsMaps / totalImp) * 100

  return (
    <div className="space-y-5">
      {/* ── Hero strip: narrative + meta ───────────────────────────────── */}
      <div className="rounded-xl bg-gradient-to-br from-brand/5 to-brand/0 border border-ink-6 p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <Sparkles className="w-3.5 h-3.5 text-brand" />
              <span className="text-[10px] font-semibold tracking-wider uppercase text-brand">Snapshot</span>
            </div>
            <h2 className="text-lg font-bold text-ink leading-snug">{hero.headline}</h2>
            <p className="text-sm text-ink-3 mt-1">{hero.subheadline}</p>
          </div>
          <div className="text-right text-[11px] text-ink-3 shrink-0">
            <div>
              {dateFirst} → {dateLast}
            </div>
            <div className="text-ink-4 mt-0.5">
              {distinctDates} {granularity === 'monthly' ? (distinctDates === 1 ? 'month' : 'months') : (distinctDates === 1 ? 'day' : 'days')}
              {locations.length > 1 ? ` · ${locations.length} locations` : ''}
            </div>
            {lastSyncAt && (
              <div className="text-ink-4 mt-0.5">
                Last sync {new Date(lastSyncAt).toLocaleDateString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Anomalies ──────────────────────────────────────────────────── */}
      {anomalies.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {anomalies.slice(0, 3).map((a, i) => (
            <AnomalyCard key={i} a={a} />
          ))}
        </div>
      )}

      {/* ── KPI grid: Discovery / Action / Restaurant rows ─────────────── */}
      <div>
        <div className="text-[10px] font-semibold tracking-wider uppercase text-ink-4 mb-2 ml-1">Discovery</div>
        <div className={`grid gap-3 mb-4 grid-cols-2 md:grid-cols-${[true, hasNonZero(totals30d.photoViews, totalsPrev30d.photoViews), hasNonZero(totals30d.postViews, totalsPrev30d.postViews)].filter(Boolean).length}`}>
          <MetricCard label="Impressions" icon={Eye} curr={totals30d.impressions} prev={totalsPrev30d.impressions} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
          {hasNonZero(totals30d.photoViews, totalsPrev30d.photoViews) && (
            <MetricCard label="Photo views" icon={ImageIcon} curr={totals30d.photoViews} prev={totalsPrev30d.photoViews} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
          )}
          {hasNonZero(totals30d.postViews, totalsPrev30d.postViews) && (
            <MetricCard label="Post views" icon={MessageCircle} curr={totals30d.postViews} prev={totalsPrev30d.postViews} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
          )}
        </div>

        <div className="text-[10px] font-semibold tracking-wider uppercase text-ink-4 mb-2 ml-1">Action</div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <MetricCard label="Website clicks" icon={Globe} curr={totals30d.website} prev={totalsPrev30d.website} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
          <MetricCard label="Phone calls" icon={Phone} curr={totals30d.calls} prev={totalsPrev30d.calls} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
          <MetricCard label="Directions" icon={MapPin} curr={totals30d.directions} prev={totalsPrev30d.directions} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
        </div>

        {(hasNonZero(totals30d.foodOrders, totalsPrev30d.foodOrders) || hasNonZero(totals30d.foodMenuClicks, totalsPrev30d.foodMenuClicks)) && (
          <>
            <div className="text-[10px] font-semibold tracking-wider uppercase text-ink-4 mb-2 mt-4 ml-1">Restaurant</div>
            <div className="grid grid-cols-2 md:grid-cols-2 gap-3">
              {hasNonZero(totals30d.foodMenuClicks, totalsPrev30d.foodMenuClicks) && (
                <MetricCard label="Menu clicks" icon={BookOpen} curr={totals30d.foodMenuClicks} prev={totalsPrev30d.foodMenuClicks} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
              )}
              {hasNonZero(totals30d.foodOrders, totalsPrev30d.foodOrders) && (
                <MetricCard label="Food orders" icon={UtensilsCrossed} curr={totals30d.foodOrders} prev={totalsPrev30d.foodOrders} currentPeriodLabel={currentPeriodLabel} priorPeriodLabel={priorPeriodLabel} />
              )}
            </div>
          </>
        )}
      </div>

      {/* ── Trend + Search/Maps split ──────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-ink-6 bg-white p-5">
          <h3 className="text-sm font-bold text-ink mb-1">Impressions trend</h3>
          <p className="text-xs text-ink-3 mb-4">
            {granularity === 'monthly' ? 'Monthly impressions' : 'Daily impressions'} stacked by surface.
          </p>
          <StackedSurfaceBars daily={daily} height={140} />
        </div>

        {/* Search vs Maps split with insight */}
        <div className="rounded-xl border border-ink-6 bg-white p-5 flex flex-col">
          <h3 className="text-sm font-bold text-ink mb-1">Where they find you</h3>
          <p className="text-xs text-ink-3 mb-4">{currentPeriodLabel}</p>

          <div className="space-y-3 flex-1">
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium inline-flex items-center gap-1.5"><Search className="w-3 h-3" /> Google Search</span>
                <span className="font-mono text-ink-3">{searchPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
                <div className="h-full bg-brand transition-all" style={{ width: `${searchPct}%` }} />
              </div>
              <div className="text-[10px] text-ink-4 mt-1">{formatNum(totals30d.impressionsSearch)} impressions</div>
            </div>
            <div>
              <div className="flex items-center justify-between text-xs mb-1.5">
                <span className="font-medium inline-flex items-center gap-1.5"><MapPin className="w-3 h-3" /> Google Maps</span>
                <span className="font-mono text-ink-3">{mapsPct.toFixed(0)}%</span>
              </div>
              <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
                <div className="h-full bg-brand/40 transition-all" style={{ width: `${mapsPct}%` }} />
              </div>
              <div className="text-[10px] text-ink-4 mt-1">{formatNum(totals30d.impressionsMaps)} impressions</div>
            </div>
          </div>

          <p className="text-[10px] text-ink-4 mt-4 leading-snug">
            {searchPct > 60
              ? 'Customers find you mostly on Google Search. Strong organic discovery.'
              : mapsPct > 60
              ? 'Customers find you mostly on Maps. Strong proximity intent.'
              : 'Balanced mix between Search and Maps discovery.'}
          </p>
        </div>
      </div>

      {/* ── Engagement funnel ──────────────────────────────────────────── */}
      <div className="rounded-xl border border-ink-6 bg-white p-5">
        <h3 className="text-sm font-bold text-ink mb-1">Engagement funnel</h3>
        <p className="text-xs text-ink-3 mb-5">{currentPeriodLabel} · how many impressions become actions</p>
        {(() => {
          const imp = totals30d.impressions
          const actions = totals30d.actions
          const rate = imp > 0 ? (actions / imp) * 100 : 0
          const prevImp = totalsPrev30d.impressions
          const prevActions = totalsPrev30d.actions
          const prevRate = prevImp > 0 ? (prevActions / prevImp) * 100 : 0
          const delta = rate - prevRate
          return (
            <>
              <div className="flex items-end gap-6 mb-5">
                <div>
                  <div className="text-3xl font-bold text-ink leading-none">{rate.toFixed(2)}%</div>
                  <div className="text-xs text-ink-3 mt-1">action rate</div>
                </div>
                <div className="text-xs text-ink-3 pb-1">
                  {actions.toLocaleString()} of {imp.toLocaleString()} impressions
                  <br />
                  <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp vs {priorPeriodLabel}
                  </span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2 text-xs">
                <FunnelStep label="Website" value={totals30d.website} prev={totalsPrev30d.website} icon={Globe} />
                <FunnelStep label="Calls" value={totals30d.calls} prev={totalsPrev30d.calls} icon={Phone} />
                <FunnelStep label="Directions" value={totals30d.directions} prev={totalsPrev30d.directions} icon={MapPin} />
              </div>
            </>
          )
        })()}
      </div>

      {/* ── Per-location table with sparklines ─────────────────────────── */}
      {locations.length > 1 && (
        <div className="rounded-xl border border-ink-6 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-ink-3" />
            <h3 className="text-sm font-bold text-ink">By location ({locations.length})</h3>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            {currentPeriodLabel} vs {priorPeriodLabel} · ranked by impressions
          </p>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead className="border-y border-ink-6 bg-bg-2">
                <tr>
                  <th className="text-left px-5 py-2 font-medium text-ink-3">Location</th>
                  <th className="text-left px-2 py-2 font-medium text-ink-3 w-[88px]">12mo trend</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Impressions</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Calls</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Directions</th>
                  <th className="text-right px-5 py-2 font-medium text-ink-3">Website</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.locationId} className="border-b border-ink-6 last:border-0 hover:bg-bg-2/50">
                    <td className="px-5 py-3">
                      <div className="font-medium text-ink truncate max-w-[260px]" title={loc.locationName}>
                        {loc.locationName}
                      </div>
                      {loc.address && (
                        <div className="text-[10px] text-ink-4 truncate max-w-[260px]" title={loc.address}>
                          {loc.address}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-3">
                      <Sparkline points={loc.trend} height={28} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="font-mono text-ink">{formatNum(loc.impressions)}</div>
                      <DeltaBadge curr={loc.impressions} prev={loc.impressionsPrev} size="xs" />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="font-mono text-ink">{formatNum(loc.calls)}</div>
                      <DeltaBadge curr={loc.calls} prev={loc.callsPrev} size="xs" />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <div className="font-mono text-ink">{formatNum(loc.directions)}</div>
                      <DeltaBadge curr={loc.directions} prev={loc.directionsPrev} size="xs" />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="font-mono text-ink">{formatNum(loc.websiteClicks)}</div>
                      <DeltaBadge curr={loc.websiteClicks} prev={loc.websiteClicksPrev} size="xs" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Top queries ────────────────────────────────────────────────── */}
      {topQueries.length > 0 && (
        <div className="rounded-xl border border-ink-6 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Search className="w-4 h-4 text-ink-3" />
            <h3 className="text-sm font-bold text-ink">Top search queries</h3>
          </div>
          <p className="text-xs text-ink-3 mb-4">What people searched to find this business</p>
          <div className="space-y-1.5">
            {topQueries.map(q => {
              const max = topQueries[0].impressions
              const pct = (q.impressions / max) * 100
              return (
                <div key={q.query} className="relative h-8 rounded-md overflow-hidden bg-bg-2">
                  <div className="absolute inset-y-0 left-0 bg-brand/15" style={{ width: `${pct}%` }} />
                  <div className="relative flex items-center justify-between h-full px-3 text-xs">
                    <span className="font-medium truncate">{q.query}</span>
                    <span className="text-ink-3">{formatNum(q.impressions)}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── Footer actions ─────────────────────────────────────────────── */}
      <div className="flex gap-2 pt-2">
        <Link
          href="/admin/gbp/backfill"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2"
        >
          <ExternalLink className="w-3 h-3" /> Bulk backfill
        </Link>
        <Link
          href={`/admin/clients/${clientSlug}/import-gbp`}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-ink-5 hover:bg-bg-2"
        >
          <ExternalLink className="w-3 h-3" /> Single-client import
        </Link>
      </div>
    </div>
  )
}

// ─── Funnel step (used inside engagement card) ────────────────────────────

function FunnelStep({ label, value, prev, icon: Icon }: {
  label: string
  value: number
  prev: number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div className="p-3 rounded-lg bg-bg-2">
      <div className="flex items-center justify-between mb-1.5">
        <Icon className="w-3.5 h-3.5 text-ink-3" />
        <DeltaBadge curr={value} prev={prev} size="xs" />
      </div>
      <div className="font-bold text-sm text-ink">{formatNum(value)}</div>
      <div className="text-[10px] text-ink-3 mt-0.5">{label}</div>
    </div>
  )
}
