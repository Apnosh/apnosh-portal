'use client'

import { useState, useEffect } from 'react'
import type { ViewType, TimeRange, DashboardView, DashboardData } from '@/types/dashboard'
import { getFallbackDashboardData } from '@/lib/dashboard-data'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import ViewSelector from '@/components/dashboard/view-selector'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import BenchmarkBar from '@/components/dashboard/benchmark-bar'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

export default function DashboardPage() {
  const { client, loading: clientLoading } = useClient()
  const [currentView, setCurrentView] = useState<ViewType>('visibility')
  const [timeRange, setTimeRange] = useState<TimeRange>('1W')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (clientLoading) return

      if (client?.id) {
        try {
          const data = await getDashboardData(client.id)
          if (data) {
            setDashboardData(data)
            setLoading(false)
            return
          }
        } catch (err) {
          console.error('Failed to load dashboard data:', err)
        }
      }

      // Fallback to mock data if no client or no real data
      setDashboardData(getFallbackDashboardData())
      setLoading(false)
    }

    loadData()
  }, [client?.id, clientLoading])

  if (loading || !dashboardData) {
    return (
      <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pt-12 text-center">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-ink-6 rounded w-48 mx-auto" />
          <div className="h-12 bg-ink-6 rounded w-32 mx-auto" />
          <div className="h-64 bg-ink-6 rounded" />
        </div>
      </div>
    )
  }

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

  // Empty state: no metrics data yet
  if (view.num === '---') {
    return (
      <div
        className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20"
        style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
      >
        <div className="db-fade db-d2">
          <ViewSelector current={currentView} onChange={handleViewChange} />
        </div>
        <div className="db-fade db-d3 text-center py-20">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'var(--db-up-bg)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--db-up)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black)' }}>
            Setting up your dashboard
          </h2>
          <p className="text-[14px] max-w-sm mx-auto" style={{ color: 'var(--db-ink-3)' }}>
            We're collecting your first data. You'll see your numbers here within 48 hours.
          </p>
        </div>
      </div>
    )
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
      {view.insights.length > 0 && (
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
      )}

      {/* Account Manager Note */}
      {view.am.note && (
        <div className="db-fade db-d7">
          <AMNote
            name={view.am.name}
            initials={view.am.initials}
            role={view.am.role}
            note={view.am.note}
          />
        </div>
      )}
    </div>
  )
}
