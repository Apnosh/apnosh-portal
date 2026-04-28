'use client'

/**
 * Local SEO tab -- reads from gbp_metrics and surfaces the numbers
 * a restaurant owner actually cares about:
 *   - How many people saw my Google listing this month
 *   - What did they do next (call / directions / website)
 *   - Which search terms are bringing them in
 *   - Is this month better than last month
 */

import { useEffect, useState } from 'react'
import { Loader2, TrendingUp, TrendingDown, Minus, ExternalLink, Search, MapPin, Phone, Globe, Eye, Building2 } from 'lucide-react'
import {
  getLocalSeoSummary,
  getLocalSeoLocations,
  type LocalSeoSummary,
  type LocalSeoLocationRow,
} from '@/lib/gbp-backfill-actions'
import Link from 'next/link'

interface Props { clientId: string; clientSlug: string }

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'K'
  return n.toLocaleString()
}

function pctChange(curr: number, prev: number): number | null {
  if (prev === 0) return curr === 0 ? 0 : null
  return ((curr - prev) / prev) * 100
}

function DeltaBadge({ curr, prev }: { curr: number; prev: number }) {
  const pct = pctChange(curr, prev)
  if (pct === null) return <span className="text-xs text-ink-3">new</span>
  const up = pct > 0
  const flat = Math.abs(pct) < 1
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown
  const color = flat ? 'text-ink-3' : up ? 'text-emerald-600' : 'text-red-500'
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <Icon className="w-3 h-3" />
      {flat ? '0%' : `${Math.abs(pct).toFixed(0)}%`}
    </span>
  )
}

function MetricCard({
  label, icon: Icon, curr, prev,
}: { label: string; icon: React.ComponentType<{ className?: string }>; curr: number; prev: number }) {
  return (
    <div className="rounded-xl border border-ink-6 bg-white p-5">
      <div className="flex items-center justify-between mb-3">
        <Icon className="w-4 h-4 text-ink-3" />
        <DeltaBadge curr={curr} prev={prev} />
      </div>
      <div className="text-2xl font-bold text-ink">{formatNum(curr)}</div>
      <div className="text-xs text-ink-3 mt-0.5">{label}</div>
      <div className="text-[10px] text-ink-4 mt-2">vs {formatNum(prev)} prior 30d</div>
    </div>
  )
}

// Tiny sparkline built with SVG -- avoids pulling a chart lib
function Sparkline({ points, height = 48 }: { points: number[]; height?: number }) {
  if (points.length < 2) return <div className="h-12 text-xs text-ink-4 flex items-center">not enough data yet</div>
  const max = Math.max(...points, 1)
  const w = 100
  const step = w / (points.length - 1)
  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(2)},${(height - (p / max) * height).toFixed(2)}`).join(' ')
  const area = `${path} L${w},${height} L0,${height} Z`
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <path d={area} fill="currentColor" fillOpacity="0.12" className="text-brand" />
      <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" className="text-brand" />
    </svg>
  )
}

export default function LocalSeoTab({ clientId, clientSlug }: Props) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<LocalSeoSummary | null>(null)
  const [locations, setLocations] = useState<LocalSeoLocationRow[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    setLoading(true)
    Promise.all([
      getLocalSeoSummary(clientId, 90),
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
    return <div className="flex items-center gap-2 text-sm text-ink-3 py-10"><Loader2 className="w-4 h-4 animate-spin" /> Loading Local SEO data...</div>
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

  const { totals30d, totalsPrev30d, topQueries, daily, lastSyncAt, dateFirst, dateLast } = data

  return (
    <div className="space-y-6">
      {/* Header strip */}
      <div className="flex items-center justify-between text-xs text-ink-3">
        <div>
          Coverage: <span className="font-medium text-ink">{dateFirst}</span> → <span className="font-medium text-ink">{dateLast}</span> ({data.daysCovered} days)
        </div>
        {lastSyncAt && <div>Last sync: {new Date(lastSyncAt).toLocaleString()}</div>}
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Impressions (30d)" icon={Eye} curr={totals30d.impressions} prev={totalsPrev30d.impressions} />
        <MetricCard label="Website clicks"   icon={Globe} curr={totals30d.website} prev={totalsPrev30d.website} />
        <MetricCard label="Phone calls"      icon={Phone} curr={totals30d.calls} prev={totalsPrev30d.calls} />
        <MetricCard label="Directions"       icon={MapPin} curr={totals30d.directions} prev={totalsPrev30d.directions} />
      </div>

      {/* Trend chart */}
      <div className="rounded-xl border border-ink-6 bg-white p-5">
        <h3 className="text-sm font-bold text-ink mb-1">Impressions trend</h3>
        <p className="text-xs text-ink-3 mb-4">Daily total impressions across Search + Maps</p>
        <div className="text-brand">
          <Sparkline points={daily.map(d => d.impressions_total)} height={80} />
        </div>
        <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-ink-6 text-sm">
          <div>
            <div className="text-xs text-ink-3 mb-1">From Search</div>
            <div className="font-bold">{formatNum(daily.reduce((a, d) => a + d.impressions_search, 0))}</div>
          </div>
          <div>
            <div className="text-xs text-ink-3 mb-1">From Maps</div>
            <div className="font-bold">{formatNum(daily.reduce((a, d) => a + d.impressions_maps, 0))}</div>
          </div>
        </div>
      </div>

      {/* Engagement funnel */}
      <div className="rounded-xl border border-ink-6 bg-white p-5">
        <h3 className="text-sm font-bold text-ink mb-1">Engagement funnel (last 30 days)</h3>
        <p className="text-xs text-ink-3 mb-4">How many impressions turn into customer actions</p>
        {(() => {
          const imp = totals30d.impressions
          const actions = totals30d.actions
          const rate = imp > 0 ? (actions / imp) * 100 : 0
          const prevImp = totalsPrev30d.impressions
          const prevActions = totalsPrev30d.actions
          const prevRate = prevImp > 0 ? (prevActions / prevImp) * 100 : 0
          const delta = rate - prevRate
          return (
            <div>
              <div className="flex items-end gap-4">
                <div>
                  <div className="text-3xl font-bold text-ink">{rate.toFixed(1)}%</div>
                  <div className="text-xs text-ink-3">action rate</div>
                </div>
                <div className="text-xs text-ink-3 pb-1">
                  {actions.toLocaleString()} actions from {imp.toLocaleString()} impressions
                  <br />
                  <span className={delta >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                    {delta >= 0 ? '+' : ''}{delta.toFixed(2)}pp vs prior 30d
                  </span>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <div className="p-3 rounded-lg bg-bg-2">
                  <div className="text-ink-3">Website</div>
                  <div className="font-bold text-sm">{formatNum(totals30d.website)}</div>
                </div>
                <div className="p-3 rounded-lg bg-bg-2">
                  <div className="text-ink-3">Calls</div>
                  <div className="font-bold text-sm">{formatNum(totals30d.calls)}</div>
                </div>
                <div className="p-3 rounded-lg bg-bg-2">
                  <div className="text-ink-3">Directions</div>
                  <div className="font-bold text-sm">{formatNum(totals30d.directions)}</div>
                </div>
              </div>
            </div>
          )
        })()}
      </div>

      {/* By-location breakdown -- only meaningful for multi-location clients */}
      {locations.length > 1 && (
        <div className="rounded-xl border border-ink-6 bg-white p-5">
          <div className="flex items-center gap-2 mb-1">
            <Building2 className="w-4 h-4 text-ink-3" />
            <h3 className="text-sm font-bold text-ink">By location ({locations.length})</h3>
          </div>
          <p className="text-xs text-ink-3 mb-4">
            Last 30 days vs prior 30 days, ranked by impressions.
          </p>
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs">
              <thead className="border-y border-ink-6 bg-bg-2">
                <tr>
                  <th className="text-left px-5 py-2 font-medium text-ink-3">Location</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Impressions</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Calls</th>
                  <th className="text-right px-2 py-2 font-medium text-ink-3">Directions</th>
                  <th className="text-right px-5 py-2 font-medium text-ink-3">Website</th>
                </tr>
              </thead>
              <tbody>
                {locations.map(loc => (
                  <tr key={loc.locationId} className="border-b border-ink-6 last:border-0">
                    <td className="px-5 py-2.5">
                      <div className="font-medium text-ink truncate max-w-[280px]" title={loc.locationName}>
                        {loc.locationName}
                      </div>
                      {loc.address && (
                        <div className="text-[10px] text-ink-4 truncate max-w-[280px]" title={loc.address}>
                          {loc.address}
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="font-mono">{formatNum(loc.impressions)}</div>
                      <div className="text-[10px]"><DeltaBadge curr={loc.impressions} prev={loc.impressionsPrev} /></div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="font-mono">{formatNum(loc.calls)}</div>
                      <div className="text-[10px]"><DeltaBadge curr={loc.calls} prev={loc.callsPrev} /></div>
                    </td>
                    <td className="px-2 py-2.5 text-right">
                      <div className="font-mono">{formatNum(loc.directions)}</div>
                      <div className="text-[10px]"><DeltaBadge curr={loc.directions} prev={loc.directionsPrev} /></div>
                    </td>
                    <td className="px-5 py-2.5 text-right">
                      <div className="font-mono">{formatNum(loc.websiteClicks)}</div>
                      <div className="text-[10px]"><DeltaBadge curr={loc.websiteClicks} prev={loc.websiteClicksPrev} /></div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Top queries */}
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

      <div className="flex gap-2">
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
