'use client'

import { useMemo } from 'react'
import { Bar } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js'
import annotationPlugin from 'chartjs-plugin-annotation'
import type { GBPMonthlyData } from '@/types/database'
import { formatMonth } from '@/lib/gbp-data'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Legend, Filler, annotationPlugin)

interface GBPChartProps {
  data: GBPMonthlyData[]
  /** Which metrics to show as stacked bars */
  metrics?: {
    key: keyof GBPMonthlyData
    label: string
    color: string
  }[]
  title?: string
}

const DEFAULT_METRICS: GBPChartProps['metrics'] = [
  { key: 'calls', label: 'Calls', color: 'rgba(74,189,152,0.8)' },
  { key: 'directions', label: 'Directions', color: 'rgba(46,154,120,0.8)' },
  { key: 'website_clicks', label: 'Website', color: 'rgba(130,170,255,0.7)' },
  { key: 'bookings', label: 'Bookings', color: 'rgba(255,200,100,0.7)' },
]

const VIEWS_METRICS: GBPChartProps['metrics'] = [
  { key: 'search_mobile', label: 'Search Mobile', color: 'rgba(74,189,152,0.7)' },
  { key: 'search_desktop', label: 'Search Desktop', color: 'rgba(46,154,120,0.7)' },
  { key: 'maps_mobile', label: 'Maps Mobile', color: 'rgba(130,170,255,0.7)' },
  { key: 'maps_desktop', label: 'Maps Desktop', color: 'rgba(155,143,255,0.7)' },
]

export { DEFAULT_METRICS, VIEWS_METRICS }

export function GBPChart({ data, metrics = DEFAULT_METRICS, title }: GBPChartProps) {
  const sorted = useMemo(() =>
    [...data].sort((a, b) => a.year === b.year ? a.month - b.month : a.year - b.year),
    [data]
  )

  const labels = useMemo(() =>
    sorted.map(d => formatMonth(d.month, d.year)),
    [sorted]
  )

  const chartData = useMemo(() => ({
    labels,
    datasets: (metrics || []).map(m => ({
      label: m.label,
      data: sorted.map(d => (d[m.key] as number) ?? 0),
      backgroundColor: m.color,
      borderRadius: 4,
      borderSkipped: false as const,
    })),
  }), [labels, sorted, metrics])

  const options = useMemo(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: {
        position: 'bottom' as const,
        labels: {
          boxWidth: 12,
          boxHeight: 12,
          borderRadius: 3,
          useBorderRadius: true,
          padding: 16,
          font: { size: 11, family: 'Inter, sans-serif' },
          color: '#6e6e73',
        },
      },
      tooltip: {
        backgroundColor: 'rgba(29,29,31,0.92)',
        titleFont: { size: 12, family: 'Inter, sans-serif' },
        bodyFont: { size: 11, family: 'Inter, sans-serif' },
        padding: 12,
        cornerRadius: 10,
        boxPadding: 4,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#aeaeb2' },
      },
      y: {
        stacked: true,
        grid: { color: 'rgba(0,0,0,0.04)' },
        ticks: { font: { size: 11, family: 'Inter, sans-serif' }, color: '#aeaeb2' },
      },
    },
  }), [])

  if (!sorted.length) {
    return (
      <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-8 text-center">
        <p className="text-sm text-ink-4">No data yet for this period.</p>
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-white/55 backdrop-blur-xl border border-white/70 p-5">
      {title && <h3 className="font-[family-name:var(--font-display)] text-base text-ink mb-4">{title}</h3>}
      <div style={{ height: 320 }}>
        <Bar data={chartData} options={options} />
      </div>
    </div>
  )
}
