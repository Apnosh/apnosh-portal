'use client'

import { useState, useMemo } from 'react'
import type { ViewType, TimeRange, DashboardView } from '@/types/dashboard'
import { getFallbackDashboardData } from '@/lib/dashboard-data'
import StatusBanner from '@/components/dashboard/status-banner'
import ViewSelector from '@/components/dashboard/view-selector'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import BenchmarkBar from '@/components/dashboard/benchmark-bar'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

export default function DashboardPage() {
  const [currentView, setCurrentView] = useState<ViewType>('visibility')
  const [timeRange, setTimeRange] = useState<TimeRange>('1W')

  // Load both views on mount so switching is instant
  const dashboardData = useMemo(() => getFallbackDashboardData(), [])

  const view: DashboardView =
    currentView === 'visibility' ? dashboardData.visibility : dashboardData.footTraffic

  const handleViewChange = (v: ViewType) => {
    setCurrentView(v)
    setTimeRange('1W')
  }

  const fmtBenchmark = (n: number): string => {
    if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
    return n.toLocaleString()
  }

  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* Status Banner */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={dashboardData.businessName}
          pct={view.pct}
          up={view.up}
        />
      </div>

      {/* View Selector */}
      <div className="db-fade db-d2">
        <ViewSelector current={currentView} onChange={handleViewChange} />
      </div>

      {/* Hero Metric */}
      <div className="db-fade db-d3">
        <HeroMetric ctx={view.ctx} num={view.num} pctFull={view.pctFull} up={view.up} />
      </div>

      {/* Chart */}
      <div className="db-fade db-d4">
        <TrendChart
          data={view.chartData}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          up={view.up}
          unit={view.unit}
        />
      </div>

      {/* Metric Breakdown Grid */}
      <div className="db-fade db-d5">
        <MetricGrid title={view.bdtitle} metrics={view.metrics} />
      </div>

      {/* Benchmark */}
      <div className="db-fade db-d6">
        <BenchmarkBar
          yourValue={view.bmy}
          avgValue={view.bmavg}
          maxValue={view.bmmax}
          rank={view.rank}
          yourFormatted={fmtBenchmark(view.bmy)}
          avgFormatted={fmtBenchmark(view.bmavg)}
          animationKey={currentView}
        />
      </div>

      {/* Insights */}
      <div className="db-fade db-d6 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
        <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
          Insights
        </h2>
        <div className="flex flex-col gap-2.5">
          {view.insights.map((ins, i) => (
            <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
          ))}
        </div>
      </div>

      {/* Account Manager Note */}
      <div className="db-fade db-d7">
        <AMNote
          name={view.am.name}
          initials={view.am.initials}
          role={view.am.role}
          note={view.am.note}
        />
      </div>
    </div>
  )
}
