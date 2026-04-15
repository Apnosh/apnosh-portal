'use client'

import type { DashboardMetric } from '@/types/dashboard'
import Sparkline from './sparkline'

interface Props {
  metrics: DashboardMetric[]
}

export default function KPIStrip({ metrics }: Props) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {metrics.map((m, i) => (
        <KPICell key={i} metric={m} />
      ))}
    </div>
  )
}

function KPICell({ metric }: { metric: DashboardMetric }) {
  const trendNum = parseFloat(metric.trend)
  const isPositive = !isNaN(trendNum) && trendNum >= 0

  return (
    <div
      className="rounded-xl p-4 transition-colors"
      style={{
        background: 'white',
        border: '1px solid var(--db-border, #f0f0f0)',
      }}
    >
      {/* Label */}
      <p className="text-[11px] font-medium uppercase tracking-wider mb-1" style={{ color: 'var(--db-ink-3, #888)' }}>
        {metric.label}
      </p>

      {/* Value + Trend */}
      <div className="flex items-baseline gap-2 mb-2">
        <span className="text-[28px] font-bold leading-none" style={{ color: 'var(--db-black, #111)' }}>
          {metric.value}
        </span>
        <span
          className="text-[12px] font-semibold flex items-center gap-0.5"
          style={{ color: isPositive ? 'var(--db-up, #22c55e)' : 'var(--db-down, #ef4444)' }}
        >
          {isPositive ? '↑' : '↓'} {metric.trend}
        </span>
      </div>

      {/* Sparkline */}
      {metric.sparkline.length > 0 && (
        <Sparkline data={metric.sparkline} up={isPositive} height={28} />
      )}

      {/* Subtitle */}
      <p className="text-[11px] mt-1.5" style={{ color: 'var(--db-ink-4, #aaa)' }}>
        {metric.subtitle}
      </p>
    </div>
  )
}
