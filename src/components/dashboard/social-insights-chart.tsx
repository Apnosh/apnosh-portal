'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
import { ChevronDown, Info } from 'lucide-react'
import type { SocialDailyRow } from '@/lib/dashboard/get-social-breakdown'
import type { TimeRange } from '@/types/dashboard'

Chart.register(...registerables)

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const TIME_RANGES: Array<{ key: TimeRange; days: number; label: string }> = [
  { key: '1W', days: 7, label: '1W' },
  { key: '1M', days: 30, label: '1M' },
  { key: '3M', days: 90, label: '3M' },
  { key: '6M', days: 180, label: '6M' },
  { key: '1Y', days: 365, label: '1Y' },
]

/**
 * Metrics surfaced to business owners, in order of reliability.
 *
 * Ordered so the most trustworthy signals (real humans, not auto-plays)
 * come first. "Times shown" (Meta's `views` / `impressions`) is kept for
 * the curious but lives in the "Advanced" section, labelled honestly so
 * nobody walks around saying "we got 15k views!" when most are silent
 * auto-plays triggered by Instagram's algorithm.
 */
type AggMode = 'sum' | 'latest' | 'rate'

interface MetricDef {
  key: string
  label: string
  subtitle: string
  aggregate: AggMode
  unit: string
  advanced?: boolean
  // For rate metrics: numerator/denominator fields
  rateNum?: keyof SocialDailyRow
  rateDen?: keyof SocialDailyRow
  // For direct metrics: the field name
  field?: keyof SocialDailyRow
}

/**
 * Metric list -- ordered by trustworthiness. Metrics where Meta's v21 API
 * returns reliable numbers come first. Noisy/inflated metrics live in the
 * "Advanced" section with warnings.
 *
 * Intentionally NOT included:
 *   - Engagement Rate (engagement / reach): Meta counts reach as unique
 *     daily accounts but total_interactions is aggregated differently, so
 *     dividing them produces nonsense (e.g. 63,500% for a quiet account).
 *     We'd rather show nothing than a misleading number.
 *   - Reach (account-level daily): Meta v21 narrowed this metric so
 *     dramatically that it returns 3-10/day even for active accounts.
 *     Reach is fundamentally a per-post measurement -- it's surfaced in
 *     Top Posts, Content Type Breakdown, and the vs-median chips where
 *     it actually means something. Trying to force it into a daily time
 *     series misleads more than it informs.
 */
const METRICS: MetricDef[] = [
  { key: 'profile_visits', label: 'Profile visits', subtitle: 'People who clicked through to your page', aggregate: 'sum', unit: 'visits', field: 'profile_visits' },
  { key: 'followers_total', label: 'Followers', subtitle: 'Total followers (most recent day in range)', aggregate: 'latest', unit: 'followers', field: 'followers_total' },
  { key: 'followers_gained', label: 'New followers', subtitle: 'Net followers gained in this period', aggregate: 'sum', unit: 'followers', field: 'followers_gained' },
  { key: 'engagement', label: 'Interactions', subtitle: 'Likes, comments, shares, saves (Meta inflates this; treat as directional)', aggregate: 'sum', unit: 'actions', field: 'engagement', advanced: true },
  { key: 'impressions', label: 'Times shown', subtitle: 'All plays + displays (includes automated auto-plays; inflated number)', aggregate: 'sum', unit: 'times', field: 'impressions', advanced: true },
]

const PLATFORM_COLORS: Record<string, string> = {
  instagram: '#E1306C',
  facebook: '#1877F2',
  tiktok: '#000000',
  linkedin: '#0A66C2',
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'Instagram',
  facebook: 'Facebook',
  tiktok: 'TikTok',
  linkedin: 'LinkedIn',
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatNumber(n: number): string {
  if (!Number.isFinite(n)) return '0'
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return Math.round(n).toLocaleString('en-US')
  return Math.round(n).toString()
}

function formatValue(n: number, metric: MetricDef): string {
  if (metric.aggregate === 'rate') {
    // For rate metrics, show one decimal place
    return `${n.toFixed(1)}%`
  }
  return formatNumber(n)
}

function toDateStr(d: Date): string {
  return d.toISOString().split('T')[0]
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

interface Series {
  platform: string
  label: string
  color: string
  // null marks buckets with no synced data (so Chart.js draws a gap instead of
  // plummeting to 0). Non-null values are plotted normally.
  data: Array<number | null>
  total: number
}

function buildSeries(
  rows: SocialDailyRow[],
  days: number,
  metric: MetricDef,
  platformFilter: string | 'all',
): { series: Series[]; labels: string[]; daysWithData: number } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = addDays(now, -(days - 1))
  const startStr = toDateStr(start)
  const nowStr = toDateStr(now)

  const inRange = rows.filter(r => r.date >= startStr && r.date <= nowStr)
  const daysWithData = new Set(inRange.map(r => r.date)).size

  const allPlatforms = Array.from(new Set(inRange.map(r => r.platform))).sort()
  const platforms = platformFilter === 'all'
    ? allPlatforms
    : allPlatforms.filter(p => p === platformFilter)

  const resolution: 'day' | 'biday' | 'week' =
    days <= 14 ? 'day' : days <= 60 ? 'day' : days <= 120 ? 'biday' : 'week'
  const step = resolution === 'week' ? 7 : resolution === 'biday' ? 2 : 1
  const buckets: Date[] = []
  for (let d = new Date(start); d <= now; d = addDays(d, step)) buckets.push(new Date(d))

  const computeBucketValue = (bucketRows: SocialDailyRow[]): number | null => {
    // No rows in this bucket means we simply haven't synced yet -- return
    // null so the chart draws a gap rather than a misleading drop to zero.
    if (bucketRows.length === 0) return null
    if (metric.aggregate === 'sum' && metric.field) {
      return bucketRows.reduce((acc, r) => acc + (Number(r[metric.field!]) || 0), 0)
    }
    if (metric.aggregate === 'latest' && metric.field) {
      const sorted = [...bucketRows].sort((a, b) => a.date.localeCompare(b.date))
      const latest = sorted.length > 0 ? Number(sorted[sorted.length - 1][metric.field!]) : null
      return latest && latest > 0 ? latest : null
    }
    if (metric.aggregate === 'rate' && metric.rateNum && metric.rateDen) {
      const num = bucketRows.reduce((acc, r) => acc + (Number(r[metric.rateNum!]) || 0), 0)
      const den = bucketRows.reduce((acc, r) => acc + (Number(r[metric.rateDen!]) || 0), 0)
      return den > 0 ? (num / den) * 100 : null
    }
    return null
  }

  const series: Series[] = []
  for (const platform of platforms) {
    const platformRows = inRange.filter(r => r.platform === platform)
    const data: Array<number | null> = []
    for (const bucketStart of buckets) {
      const bucketEnd = addDays(bucketStart, step - 1)
      const bucketRows = platformRows.filter(r => r.date >= toDateStr(bucketStart) && r.date <= toDateStr(bucketEnd))
      data.push(computeBucketValue(bucketRows))
    }

    // Totals for the legend -- sum only non-null buckets so empty days don't
    // drag averages down or make the grand total look artificially precise.
    let total = 0
    if (metric.aggregate === 'latest') {
      total = [...data].reverse().find((v): v is number => v !== null && v > 0) ?? 0
    } else if (metric.aggregate === 'rate' && metric.rateNum && metric.rateDen) {
      const num = platformRows.reduce((acc, r) => acc + (Number(r[metric.rateNum!]) || 0), 0)
      const den = platformRows.reduce((acc, r) => acc + (Number(r[metric.rateDen!]) || 0), 0)
      total = den > 0 ? (num / den) * 100 : 0
    } else {
      total = data.reduce((a: number, b) => a + (b ?? 0), 0)
    }

    series.push({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      color: PLATFORM_COLORS[platform] ?? '#888',
      data,
      total,
    })
  }

  // X-axis labels
  const labels: string[] = []
  if (days <= 7) {
    for (const b of buckets) {
      const isToday = toDateStr(b) === nowStr
      labels.push(isToday ? 'Today' : b.toLocaleDateString('en-US', { weekday: 'short' }))
    }
  } else if (days <= 30) {
    const markers = 5
    for (let i = 0; i < buckets.length; i++) {
      if (i % Math.max(1, Math.floor(buckets.length / markers)) === 0) {
        labels.push(buckets[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      } else {
        labels.push('')
      }
    }
  } else {
    const seen = new Set<string>()
    for (const b of buckets) {
      const m = b.toLocaleDateString('en-US', { month: 'short' })
      if (!seen.has(m)) { seen.add(m); labels.push(m) } else { labels.push('') }
    }
  }

  return { series, labels, daysWithData }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SocialInsightsChartProps {
  rows: SocialDailyRow[]
  platforms: string[]
}

export default function SocialInsightsChart({ rows, platforms }: SocialInsightsChartProps) {
  // Total coverage of synced data -- used to disable time ranges we can't
  // actually fill and to render an honest "Data since X" badge.
  const coverage = useMemo(() => {
    if (rows.length === 0) return { dataSince: null as string | null, totalDays: 0 }
    const sortedDates = [...new Set(rows.map(r => r.date))].sort()
    const earliest = sortedDates[0]
    const latest = sortedDates[sortedDates.length - 1]
    const earliestMs = new Date(earliest).getTime()
    const latestMs = new Date(latest).getTime()
    const spanDays = Math.max(1, Math.round((latestMs - earliestMs) / (1000 * 60 * 60 * 24)) + 1)
    return { dataSince: earliest, totalDays: spanDays }
  }, [rows])

  // Pick a default range that matches our actual coverage. If we only have
  // 12 days, 1M is still fine (it won't show wrong data, just some gap), but
  // we prefer 1W so the chart looks full on first load.
  const defaultRange: TimeRange = coverage.totalDays <= 10 ? '1W' : '1M'

  const [metricKey, setMetricKey] = useState<string>('profile_visits')
  const [platformFilter, setPlatformFilter] = useState<string | 'all'>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>(defaultRange)
  const [showAdvanced, setShowAdvanced] = useState(false)

  const metric = useMemo(() => METRICS.find(m => m.key === metricKey) ?? METRICS[0], [metricKey])
  const timeConfig = useMemo(() => TIME_RANGES.find(t => t.key === timeRange) ?? TIME_RANGES[1], [timeRange])

  const { series, labels, daysWithData } = useMemo(
    () => buildSeries(rows, timeConfig.days, metric, platformFilter),
    [rows, timeConfig.days, metric, platformFilter],
  )

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const chartRef = useRef<Chart | null>(null)

  const drawChart = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (chartRef.current) {
      chartRef.current.destroy()
      chartRef.current = null
    }
    if (series.length === 0 || labels.length === 0) return

    const datasets = series.map(s => ({
      label: s.label,
      data: s.data,
      borderColor: s.color,
      backgroundColor: `${s.color}14`,
      borderWidth: 2.25,
      pointRadius: 0,
      pointHoverRadius: 5,
      pointHoverBackgroundColor: s.color,
      pointHoverBorderColor: '#fff',
      pointHoverBorderWidth: 2,
      tension: 0.3,
      fill: false,
      // Bridge single-day gaps with a dashed connector, leave larger gaps
      // empty so missing data is visually obvious.
      spanGaps: 1000 * 60 * 60 * 24 * 2,
      borderCapStyle: 'round' as const,
      borderJoinStyle: 'round' as const,
    }))

    const isRate = metric.aggregate === 'rate'

    chartRef.current = new Chart(canvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 600, easing: 'easeOutQuart' },
        layout: { padding: { left: 8, right: 16, top: 12, bottom: 4 } },
        scales: {
          x: {
            grid: { display: false },
            ticks: {
              color: '#888',
              font: { size: 11 },
              autoSkip: false,
              callback(_val, i) { return labels[i] },
            },
          },
          y: {
            grid: { color: 'rgba(0,0,0,0.05)' },
            border: { display: false },
            ticks: {
              color: '#aaa',
              font: { size: 11 },
              callback(v) { return isRate ? `${Number(v).toFixed(0)}%` : formatNumber(Number(v)) },
            },
          },
        },
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.9)',
            titleColor: '#fff',
            bodyColor: '#fff',
            titleFont: { size: 11, weight: 'normal' },
            bodyFont: { size: 13, weight: 'bold' },
            padding: 10,
            cornerRadius: 8,
            displayColors: true,
            callbacks: {
              label(ctx) {
                const val = Number(ctx.parsed.y)
                const display = isRate ? `${val.toFixed(1)}%` : `${formatNumber(val)} ${metric.unit}`
                return `  ${ctx.dataset.label}: ${display}`
              },
            },
          },
        },
      },
    })
  }, [series, labels, metric])

  useEffect(() => {
    drawChart()
    return () => { if (chartRef.current) chartRef.current.destroy() }
  }, [drawChart])

  useEffect(() => {
    const handler = () => drawChart()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [drawChart])

  // Grand total across all visible series
  const grandTotal = useMemo(() => {
    if (metric.aggregate === 'latest') {
      return series.reduce((acc, s) => acc + s.total, 0)
    }
    if (metric.aggregate === 'rate' && metric.rateNum && metric.rateDen) {
      const inRange = rows.filter(r => {
        const start = addDays(new Date(), -(timeConfig.days - 1))
        start.setHours(0, 0, 0, 0)
        return r.date >= toDateStr(start)
      })
      const filtered = platformFilter === 'all' ? inRange : inRange.filter(r => r.platform === platformFilter)
      const num = filtered.reduce((a, r) => a + (Number(r[metric.rateNum!]) || 0), 0)
      const den = filtered.reduce((a, r) => a + (Number(r[metric.rateDen!]) || 0), 0)
      return den > 0 ? (num / den) * 100 : 0
    }
    return series.reduce((acc, s) => acc + s.total, 0)
  }, [series, metric, rows, platformFilter, timeConfig.days])

  const hasAnyData = series.some(s => s.data.some(v => v !== null && v > 0))

  // Split metrics into primary (trusted) and advanced (noisy)
  const primaryMetrics = METRICS.filter(m => !m.advanced)
  const advancedMetrics = METRICS.filter(m => m.advanced)
  const isCurrentAdvanced = metric.advanced === true

  const timeLabel = timeConfig.key === '1W' ? 'Last 7 days'
    : timeConfig.key === '1M' ? 'Last 30 days'
    : timeConfig.key === '3M' ? 'Last 3 months'
    : timeConfig.key === '6M' ? 'Last 6 months'
    : 'Last year'

  // Format "Data since Apr 17" for the coverage badge.
  const dataSinceLabel = coverage.dataSince
    ? new Date(coverage.dataSince).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : null

  // Coverage ratio for the current range -- if less than 25% of the range has
  // real data, mark the range button as "low coverage" so the user knows the
  // trend shape is thin.
  const rangeCoverageRatio = timeConfig.days > 0 ? daysWithData / timeConfig.days : 0

  return (
    <div className="pb-10 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
      {/* Control row */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Platform tabs */}
        <div className="inline-flex bg-bg-2 rounded-lg p-0.5">
          <PlatformTab
            active={platformFilter === 'all'}
            onClick={() => setPlatformFilter('all')}
            label="All"
          />
          {platforms.map(p => (
            <PlatformTab
              key={p}
              active={platformFilter === p}
              onClick={() => setPlatformFilter(p)}
              label={PLATFORM_LABELS[p] ?? p}
              color={PLATFORM_COLORS[p]}
            />
          ))}
        </div>

        {/* Metric dropdown */}
        <div className="relative">
          <select
            value={metricKey}
            onChange={e => setMetricKey(e.target.value)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-[13px] font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            <optgroup label="Primary metrics">
              {primaryMetrics.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
            <optgroup label="Advanced (less reliable)">
              {advancedMetrics.map(m => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </optgroup>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-4 pointer-events-none" />
        </div>

        {/* Time range */}
        <div className="ml-auto flex gap-0.5">
          {TIME_RANGES.map(tr => {
            // "Exceeds coverage" = picking this range would show more empty
            // space than actual data. We still let the user click it (they
            // might want to see the full axis), but we dim it so the default
            // choice lands on something informative.
            const exceedsCoverage = coverage.totalDays > 0 && tr.days > coverage.totalDays * 2
            const isActive = timeRange === tr.key
            return (
              <button
                key={tr.key}
                onClick={() => setTimeRange(tr.key)}
                title={exceedsCoverage ? `Only ${coverage.totalDays} days of data synced -- this range will show gaps` : undefined}
                className="text-[12px] font-semibold rounded-md transition-colors px-3 py-1.5"
                style={{
                  color: isActive ? 'var(--db-black)' : exceedsCoverage ? 'var(--db-ink-4)' : 'var(--db-ink-3)',
                  background: isActive ? 'var(--db-bg-3)' : 'transparent',
                  opacity: !isActive && exceedsCoverage ? 0.5 : 1,
                }}
              >
                {tr.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Grand total + subtitle */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-[13px] text-ink-4">{timeLabel}</span>
          {dataSinceLabel && (
            <span className="text-[11px] text-ink-4 bg-bg-2 rounded-full px-2 py-0.5">
              Data since {dataSinceLabel}
            </span>
          )}
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-[family-name:var(--font-display)] text-4xl text-ink tabular-nums">
            {hasAnyData ? formatValue(grandTotal, metric) : '—'}
          </span>
          <span className="text-sm text-ink-3">{metric.subtitle.toLowerCase()}</span>
        </div>
      </div>

      {/* Honest disclaimer for advanced metrics */}
      {isCurrentAdvanced && (
        <div className="flex items-start gap-2 mb-3 text-[11px] text-amber-700 bg-amber-50 rounded-lg px-3 py-2">
          <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">Treat this number loosely.</span> Meta counts auto-plays, story slide advances, and reels in the explore tab all as events, even when a human didn&apos;t really engage. The number is often 100x the real attention your content got. Use <strong>Reach</strong> or <strong>Profile visits</strong> for reliable marketing signal.
          </span>
        </div>
      )}

      {/* Legend (multi-line only) */}
      {platformFilter === 'all' && series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-3">
          {series.map(s => (
            <div key={s.platform} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="font-medium text-ink">{s.label}</span>
              <span className="text-ink-4 tabular-nums">{formatValue(s.total, metric)}</span>
            </div>
          ))}
        </div>
      )}

      {/* Chart */}
      <div className="relative h-[320px] max-sm:h-[220px]">
        {hasAnyData ? (
          <canvas ref={canvasRef} />
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <p className="text-sm font-medium text-ink-2 mb-1">No data in this range yet</p>
              <p className="text-xs text-ink-4">Try a wider time range or wait for tomorrow&apos;s sync.</p>
            </div>
          </div>
        )}
      </div>

      {/* Coverage footer */}
      {daysWithData > 0 && (
        <p className="text-[11px] text-ink-4 mt-3">
          {daysWithData === 1
            ? `Showing 1 day of synced data. Trend shape will fill in as the daily sync runs.`
            : `${daysWithData} of ${timeConfig.days} days have synced data${rangeCoverageRatio < 0.5 ? ' — gaps are days we haven\u2019t synced yet, not drops to zero.' : '.'} ${platformFilter === 'all' && series.length > 1 ? 'Hover the chart to compare platforms at any day.' : 'Hover the chart for day-level detail.'}`}
        </p>
      )}

      {/* Advanced metrics toggle */}
      <button
        onClick={() => setShowAdvanced(v => !v)}
        className="text-[11px] text-ink-4 hover:text-ink-2 mt-3 inline-flex items-center gap-1 transition-colors"
      >
        {showAdvanced ? 'Hide metric definitions' : 'What do these metrics mean?'}
        <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
      </button>
      {showAdvanced && (
        <div className="mt-3 p-4 bg-bg-2 rounded-lg text-[12px] text-ink-3 leading-relaxed space-y-3">
          <div>
            <p className="font-semibold text-ink-2 mb-1">Metrics we trust for marketing decisions</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Profile visits</strong> &mdash; people who cared enough to click through to your page.</li>
              <li><strong>Followers</strong> and <strong>New followers</strong> &mdash; audience size and growth (new-followers becomes accurate once two consecutive days of sync exist).</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-2 mb-1">Metrics we show but don&apos;t trust</p>
            <ul className="list-disc list-inside space-y-1">
              <li><strong>Interactions</strong> &mdash; Meta&apos;s &ldquo;total interactions&rdquo; counts reel replays, story slide taps, and auto-play events. A quiet account can show thousands of &ldquo;interactions&rdquo; because Instagram keeps looping your reels.</li>
              <li><strong>Times shown</strong> (&ldquo;Views&rdquo;) &mdash; same inflation problem. Meta counts every play, including reels auto-played on the explore page to strangers who didn&apos;t engage.</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-ink-2 mb-1">Where reach lives now</p>
            <p>
              Reach is fundamentally a per-post measurement, so we removed it from this daily chart (Meta&apos;s v21 API returns misleading account-level numbers like 3-10/day). You&apos;ll find real reach figures in <strong>Top Posts</strong>, <strong>Content type breakdown</strong>, and the &ldquo;vs median&rdquo; chips above &mdash; which reflect true per-post reach from Meta.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}

function PlatformTab({
  active, onClick, label, color,
}: {
  active: boolean
  onClick: () => void
  label: string
  color?: string
}) {
  return (
    <button
      onClick={onClick}
      className="text-[13px] font-medium rounded-md transition-colors px-3 py-1.5 flex items-center gap-1.5"
      style={{
        color: active ? 'var(--db-black)' : 'var(--db-ink-3)',
        background: active ? 'white' : 'transparent',
        boxShadow: active ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
      }}
    >
      {color && <span className="w-2 h-2 rounded-full" style={{ background: color }} />}
      {label}
    </button>
  )
}
