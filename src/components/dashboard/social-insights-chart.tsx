'use client'

import { useMemo, useState, useRef, useEffect, useCallback } from 'react'
import { Chart, registerables } from 'chart.js'
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

// Business-owner language. Keep labels plain, avoid jargon.
const METRICS: Array<{
  key: keyof Pick<SocialDailyRow, 'reach' | 'impressions' | 'engagement' | 'profile_visits' | 'followers_total'>
  label: string
  subtitle: string
  aggregate: 'sum' | 'latest'   // sum for rate metrics, latest for cumulative counts
  unit: string
}> = [
  { key: 'reach',          label: 'People reached',   subtitle: 'Unique people who saw your content',       aggregate: 'sum',    unit: 'people' },
  { key: 'impressions',    label: 'Views',            subtitle: 'Total views of your content',              aggregate: 'sum',    unit: 'views' },
  { key: 'engagement',     label: 'Engagement',       subtitle: 'Likes, comments, shares, saves',           aggregate: 'sum',    unit: 'actions' },
  { key: 'profile_visits', label: 'Profile visits',   subtitle: 'People who clicked through to your page',  aggregate: 'sum',    unit: 'visits' },
  { key: 'followers_total',label: 'Followers',        subtitle: 'Total followers (latest day in range)',    aggregate: 'latest', unit: 'followers' },
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
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M'
  if (n >= 10_000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  if (n >= 1000) return n.toLocaleString('en-US')
  return Math.round(n).toString()
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
  data: number[]
  total: number
}

function buildSeries(
  rows: SocialDailyRow[],
  days: number,
  metric: (typeof METRICS)[number],
  platformFilter: string | 'all',
): { series: Series[]; labels: string[]; resolution: 'day' | 'biday' | 'week' } {
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  const start = addDays(now, -(days - 1))
  const startStr = toDateStr(start)
  const nowStr = toDateStr(now)

  const inRange = rows.filter(r => r.date >= startStr && r.date <= nowStr)

  // Platforms to include
  const allPlatforms = Array.from(new Set(inRange.map(r => r.platform))).sort()
  const platforms = platformFilter === 'all'
    ? allPlatforms
    : allPlatforms.filter(p => p === platformFilter)

  // Resolution for x-axis smoothing
  const resolution: 'day' | 'biday' | 'week' =
    days <= 14 ? 'day' : days <= 60 ? 'day' : days <= 120 ? 'biday' : 'week'
  const step = resolution === 'week' ? 7 : resolution === 'biday' ? 2 : 1
  const buckets: Date[] = []
  for (let d = new Date(start); d <= now; d = addDays(d, step)) buckets.push(new Date(d))

  const series: Series[] = []
  for (const platform of platforms) {
    const platformRows = inRange.filter(r => r.platform === platform)
    const data: number[] = []
    for (const bucketStart of buckets) {
      const bucketEnd = addDays(bucketStart, step - 1)
      const bucketRows = platformRows.filter(r => r.date >= toDateStr(bucketStart) && r.date <= toDateStr(bucketEnd))
      if (metric.aggregate === 'sum') {
        data.push(bucketRows.reduce((acc, r) => acc + (Number(r[metric.key]) || 0), 0))
      } else {
        // 'latest': take the last value in the bucket
        const sorted = [...bucketRows].sort((a, b) => a.date.localeCompare(b.date))
        data.push(sorted.length > 0 ? Number(sorted[sorted.length - 1][metric.key]) || 0 : 0)
      }
    }

    // For 'latest' metrics (followers), total = the most recent non-zero value
    const total = metric.aggregate === 'latest'
      ? ([...data].reverse().find(v => v > 0) ?? 0)
      : data.reduce((a, b) => a + b, 0)

    series.push({
      platform,
      label: PLATFORM_LABELS[platform] ?? platform,
      color: PLATFORM_COLORS[platform] ?? '#888',
      data,
      total,
    })
  }

  // X-axis labels: pick readable breakpoints based on range
  const labels: string[] = []
  if (days <= 7) {
    for (const b of buckets) {
      const isToday = toDateStr(b) === nowStr
      labels.push(isToday ? 'Today' : b.toLocaleDateString('en-US', { weekday: 'short' }))
    }
  } else if (days <= 30) {
    // Show 5 markers across the range
    const markers = 5
    for (let i = 0; i < buckets.length; i++) {
      if (i % Math.max(1, Math.floor(buckets.length / markers)) === 0) {
        labels.push(buckets[i].toLocaleDateString('en-US', { month: 'short', day: 'numeric' }))
      } else {
        labels.push('')
      }
    }
  } else {
    // Month markers
    const seen = new Set<string>()
    for (const b of buckets) {
      const m = b.toLocaleDateString('en-US', { month: 'short' })
      if (!seen.has(m)) {
        seen.add(m)
        labels.push(m)
      } else {
        labels.push('')
      }
    }
  }

  return { series, labels, resolution }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

interface SocialInsightsChartProps {
  rows: SocialDailyRow[]
  platforms: string[]
}

export default function SocialInsightsChart({ rows, platforms }: SocialInsightsChartProps) {
  const [metricKey, setMetricKey] = useState<(typeof METRICS)[number]['key']>('reach')
  const [platformFilter, setPlatformFilter] = useState<string | 'all'>('all')
  const [timeRange, setTimeRange] = useState<TimeRange>('1M')
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  const metric = useMemo(() => METRICS.find(m => m.key === metricKey) ?? METRICS[0], [metricKey])
  const timeConfig = useMemo(() => TIME_RANGES.find(t => t.key === timeRange) ?? TIME_RANGES[1], [timeRange])

  const { series, labels } = useMemo(
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
      borderCapStyle: 'round' as const,
      borderJoinStyle: 'round' as const,
    }))

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
              callback(v) { return formatNumber(Number(v)) },
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
                return `  ${ctx.dataset.label}: ${formatNumber(val)} ${metric.unit}`
              },
            },
          },
        },
        onHover(_e, active) {
          setHoveredIdx(active[0]?.index ?? null)
        },
      },
    })
  }, [series, labels, metric.unit])

  useEffect(() => {
    drawChart()
    return () => {
      if (chartRef.current) chartRef.current.destroy()
    }
  }, [drawChart])

  useEffect(() => {
    const handler = () => drawChart()
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [drawChart])

  // Grand total across all visible series
  const grandTotal = series.reduce((acc, s) => acc + s.total, 0)
  const grandLabel = metric.aggregate === 'latest'
    ? formatNumber(series.reduce((acc, s) => acc + s.total, 0))
    : formatNumber(grandTotal)

  const hasAnyData = series.some(s => s.data.some(v => v > 0))

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
            onChange={e => setMetricKey(e.target.value as typeof metricKey)}
            className="appearance-none bg-white border border-ink-6 rounded-lg pl-3 pr-8 py-1.5 text-[13px] font-medium text-ink cursor-pointer focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
          >
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
          <svg className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-ink-4 pointer-events-none" viewBox="0 0 12 12" fill="none">
            <path d="M3 4.5L6 7.5L9 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>

        {/* Time range */}
        <div className="ml-auto flex gap-0.5">
          {TIME_RANGES.map(tr => (
            <button
              key={tr.key}
              onClick={() => setTimeRange(tr.key)}
              className="text-[12px] font-semibold rounded-md transition-colors px-3 py-1.5"
              style={{
                color: timeRange === tr.key ? 'var(--db-black)' : 'var(--db-ink-3)',
                background: timeRange === tr.key ? 'var(--db-bg-3)' : 'transparent',
              }}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grand total + subtitle */}
      <div className="mb-2">
        <div className="flex items-baseline gap-2">
          <span className="text-[13px] text-ink-4">{timeConfig.key === '1W' ? 'Last 7 days' : timeConfig.key === '1M' ? 'Last 30 days' : timeConfig.key === '3M' ? 'Last 3 months' : timeConfig.key === '6M' ? 'Last 6 months' : 'Last year'}</span>
        </div>
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="font-[family-name:var(--font-display)] text-4xl text-ink tabular-nums">
            {hasAnyData ? grandLabel : '—'}
          </span>
          <span className="text-sm text-ink-3">{metric.subtitle.toLowerCase()}</span>
        </div>
      </div>

      {/* Legend (multi-line only) */}
      {platformFilter === 'all' && series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-3">
          {series.map(s => (
            <div key={s.platform} className="flex items-center gap-2 text-xs">
              <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="font-medium text-ink">{s.label}</span>
              <span className="text-ink-4 tabular-nums">{formatNumber(s.total)}</span>
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

      {/* Footer hint about hover */}
      {hasAnyData && (
        <p className="text-[11px] text-ink-4 mt-3">
          {platformFilter === 'all' && series.length > 1
            ? 'Hover to see each platform at any point. Tap a tab above to zoom into one platform.'
            : 'Hover the chart to see the value for any day.'}
        </p>
      )}

      {/* Keep hoveredIdx around so re-renders aren't wasted (lint-safe use) */}
      <span className="sr-only">{hoveredIdx != null ? `index ${hoveredIdx}` : ''}</span>
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
