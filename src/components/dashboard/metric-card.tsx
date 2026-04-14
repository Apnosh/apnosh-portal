'use client'

import type { DashboardMetric } from '@/types/dashboard'
import Sparkline from './sparkline'

interface MetricCardProps {
  metric: DashboardMetric
}

export default function MetricCard({ metric }: MetricCardProps) {
  return (
    <div
      className="rounded-[14px] p-[18px] transition-colors"
      style={{ background: 'var(--db-bg-2)' }}
      onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--db-bg-3)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--db-bg-2)')}
    >
      <div className="flex items-center justify-between mb-1">
        <span className="text-[12px] font-medium" style={{ color: 'var(--db-ink-3)' }}>
          {metric.label}
        </span>
        <span
          className="flex items-center gap-0.5 text-[12px] font-bold"
          style={{ color: metric.up ? 'var(--db-up)' : 'var(--db-down)' }}
        >
          {metric.up ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 8V2M5 2l3 3M5 2L2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
              <path d="M5 2v6M5 8l3-3M5 8L2 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          {metric.trend}
        </span>
      </div>
      <div
        className="text-[26px] font-bold leading-tight"
        style={{
          color: 'var(--db-black)',
          letterSpacing: '-0.8px',
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        {metric.value}
      </div>
      <div className="text-[11px] mt-0.5" style={{ color: 'var(--db-ink-3)' }}>
        {metric.subtitle}
      </div>
      <Sparkline data={metric.sparkline} up={metric.up} />
    </div>
  )
}
