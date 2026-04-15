'use client'

import { useState, useEffect } from 'react'
import type { TimeRange, DashboardData } from '@/types/dashboard'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import BenchmarkBar from '@/components/dashboard/benchmark-bar'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

export default function SocialOverviewPage() {
  const { client, loading: clientLoading } = useClient()
  const [timeRange, setTimeRange] = useState<TimeRange>('1M')
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
          console.error('Failed to load social data:', err)
        }
      }

      setDashboardData(null)
      setLoading(false)
    }

    loadData()
  }, [client?.id, clientLoading])

  if (loading) {
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

  if (!dashboardData) {
    return (
      <div
        className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20"
        style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
      >
        <div className="text-center py-20">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'rgba(74, 189, 152, 0.1)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4abd98" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black, #111)' }}>
            Connect your social accounts
          </h2>
          <p className="text-[14px] max-w-sm mx-auto mb-8" style={{ color: 'var(--db-ink-3, #888)' }}>
            Once your social accounts are connected, your numbers will show up here.
          </p>
          <a
            href="/dashboard/connect-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect accounts
          </a>
        </div>
      </div>
    )
  }

  // Use the visibility view (social metrics only)
  const view = dashboardData.visibility

  if (view.num === '---') {
    return (
      <div
        className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20"
        style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
      >
        <div className="text-center py-20">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'var(--db-up-bg)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--db-up)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black)' }}>
            Getting your social data ready
          </h2>
          <p className="text-[14px] max-w-sm mx-auto" style={{ color: 'var(--db-ink-3)' }}>
            Your social media numbers will show up here soon.
          </p>
        </div>
      </div>
    )
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
      {/* How your social media is doing */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={dashboardData.businessName}
          pct={view.pct}
          up={view.up}
        />
      </div>

      {/* Your main number */}
      <div className="db-fade db-d3">
        <HeroMetric ctx={view.ctx} num={view.num} pctFull={view.pctFull} up={view.up} />
      </div>

      {/* Your trend over time */}
      <div className="db-fade db-d4">
        <TrendChart
          data={view.chartData}
          timeRange={timeRange}
          onTimeRangeChange={setTimeRange}
          up={view.up}
          unit={view.unit}
        />
      </div>

      {/* The breakdown */}
      <div className="db-fade db-d5">
        <MetricGrid title={view.bdtitle} metrics={view.metrics} />
      </div>

      {/* How you compare */}
      <div className="db-fade db-d6">
        <BenchmarkBar
          yourValue={view.bmy}
          avgValue={view.bmavg}
          maxValue={view.bmmax}
          rank={view.rank}
          yourFormatted={fmtBenchmark(view.bmy)}
          avgFormatted={fmtBenchmark(view.bmavg)}
          animationKey="social"
        />
      </div>

      {/* What we noticed */}
      {view.insights.length > 0 && (
        <div className="db-fade db-d6 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
            What we noticed
          </h2>
          <div className="flex flex-col gap-2.5">
            {view.insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
            ))}
          </div>
        </div>
      )}

      {/* From your account manager */}
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
