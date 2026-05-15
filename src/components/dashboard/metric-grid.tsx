'use client'

import type { DashboardMetric } from '@/types/dashboard'
import MetricCard from './metric-card'

interface MetricGridProps {
  title: string
  metrics: DashboardMetric[]
}

export default function MetricGrid({ title, metrics }: MetricGridProps) {
  return (
    <div className="pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
      <h2 className="text-[15px] font-bold mb-4" style={{ color: 'var(--db-black)' }}>
        {title}
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map((m) => (
          <MetricCard key={m.label} metric={m} />
        ))}
      </div>
    </div>
  )
}
