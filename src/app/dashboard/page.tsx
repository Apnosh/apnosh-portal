'use client'

import { useState, useEffect } from 'react'
import type { ViewType, TimeRange, DashboardView, DashboardData } from '@/types/dashboard'
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
import WaitingOnYou from '@/components/dashboard/waiting-on-you'

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

  // No client or no data - show welcoming empty state
  if (!dashboardData) {
    return (
      <div
        className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20"
        style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
      >
        <div className="text-center py-16">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-6 flex items-center justify-center"
            style={{ background: 'rgba(74, 189, 152, 0.1)' }}
          >
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#4abd98" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black, #111)' }}>
            We're setting up your dashboard
          </h2>
          <p className="text-[14px] max-w-md mx-auto mb-10" style={{ color: 'var(--db-ink-3, #888)' }}>
            Your performance data will appear here once your accounts are connected and content starts going out. Your account manager will help you get started.
          </p>

          <div className="max-w-sm mx-auto text-left space-y-4 mb-10">
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--db-ink-3, #888)' }}>What to expect</p>
            {[
              "We'll connect your social accounts",
              'Performance data starts flowing within 24-48 hours',
              "You'll see your metrics, insights, and trends right here",
            ].map((text, i) => (
              <div key={i} className="flex items-start gap-3">
                <span
                  className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                  style={{ background: '#4abd98' }}
                >
                  {i + 1}
                </span>
                <span className="text-sm pt-0.5" style={{ color: 'var(--db-ink-2, #555)' }}>{text}</span>
              </div>
            ))}
          </div>

          <a
            href="/dashboard/connect-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect your accounts
          </a>

          {/* Coming Soon channels */}
          <div className="mt-16 max-w-lg mx-auto">
            <p className="text-xs font-semibold uppercase tracking-wider text-center mb-4" style={{ color: 'var(--db-ink-3, #888)' }}>Coming soon to your dashboard</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { icon: '📊', label: 'Paid Ads', desc: 'Google & Meta ad performance' },
                { icon: '🍽️', label: 'Reservations', desc: 'Booking trends' },
                { icon: '📦', label: 'Online Orders', desc: 'DoorDash, Uber Eats' },
                { icon: '📞', label: 'Call Tracking', desc: 'Calls by source' },
                { icon: '📧', label: 'Email Campaigns', desc: 'Opens, clicks, revenue' },
                { icon: '🔍', label: 'SEO Rankings', desc: 'Search positions' },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border p-3 text-center opacity-60" style={{ borderColor: '#e5e5e5' }}>
                  <span className="text-lg">{item.icon}</span>
                  <p className="text-xs font-medium mt-1" style={{ color: 'var(--db-ink-2, #555)' }}>{item.label}</p>
                  <p className="text-[10px] mt-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
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

  // No metrics data yet
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
            Getting your data ready
          </h2>
          <p className="text-[14px] max-w-sm mx-auto" style={{ color: 'var(--db-ink-3)' }}>
            Your numbers will show up here soon. Give it about 48 hours.
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
      {/* Anything we need from you — renders nothing if no open client-visible tasks */}
      {client?.id && (
        <div className="db-fade db-d1 mb-4">
          <WaitingOnYou clientId={client.id} />
        </div>
      )}

      {/* How you're doing */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={dashboardData.businessName}
          pct={view.pct}
          up={view.up}
        />
      </div>

      {/* Pick what to look at */}
      <div className="db-fade db-d2">
        <ViewSelector current={currentView} onChange={handleViewChange} />
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
          animationKey={currentView}
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
