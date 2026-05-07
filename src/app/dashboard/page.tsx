'use client'

/**
 * Dashboard — operator's marketing tool, not a managed-service report.
 *
 * Hierarchy (phone-first, top to bottom):
 *   1. Today's brief         — AI-generated 60-80 word morning briefing
 *   2. Quick actions         — 4 buttons to start common tasks
 *   3. Decisions to make     — items waiting for owner approval
 *   4. Your performance      — 3 pulse metrics, glanceable
 *   5. What's working        — AI insights with actionable suggestions
 *   6. Your marketing week   — proof of momentum, last 7 days
 *   7. Detailed analytics    — collapsed; the old chart-heavy view
 *
 * Old components (HeroMetric, TrendChart, MetricGrid, BenchmarkBar,
 * ViewSelector, StatusBanner, AMNote) live behind the analytics
 * collapse so power users can still drill in.
 */

import { useState, useEffect } from 'react'
import { ChevronDown } from 'lucide-react'
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
import WaitingOnYou from '@/components/dashboard/waiting-on-you'
import SetupChecklist from '@/components/dashboard/setup-checklist'
import TodaysBrief from '@/components/dashboard/todays-brief'
import QuickActions from '@/components/dashboard/quick-actions'
import YourMarketingWeek from '@/components/dashboard/your-marketing-week'
import PulseCards, { type PulseCard } from '@/components/dashboard/pulse-cards'

export default function DashboardPage() {
  const { client, loading: clientLoading } = useClient()
  const [currentView, setCurrentView] = useState<ViewType>('visibility')
  const [timeRange, setTimeRange] = useState<TimeRange>('1W')
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [analyticsOpen, setAnalyticsOpen] = useState(false)

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

  // Welcoming empty state for clients with no data yet
  if (!dashboardData || !client?.id) {
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
            Setting up your tools
          </h2>
          <p className="text-[14px] max-w-md mx-auto mb-10" style={{ color: 'var(--db-ink-3, #888)' }}>
            Connect your accounts and your daily brief, performance numbers, and approvals queue all show up here.
          </p>
          <a
            href="/dashboard/connected-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect your accounts
          </a>
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

  // Build pulse cards from existing dashboard data
  const visPct = parseInt(dashboardData.visibility.pct.replace(/[^\d-]/g, '')) || 0
  const ftPct = parseInt(dashboardData.footTraffic.pct.replace(/[^\d-]/g, '')) || 0

  const pulseCards: PulseCard[] = [
    {
      label: 'Your reach',
      value: dashboardData.visibility.num !== '---' ? dashboardData.visibility.num : '—',
      delta: dashboardData.visibility.pct === '---' ? '—' : dashboardData.visibility.pct,
      up: dashboardData.visibility.num === '---' ? null : dashboardData.visibility.up,
      subtitle: 'People who saw your content',
      href: '/dashboard/social',
      alert: visPct < -15,
    },
    {
      label: 'Your visibility',
      value: dashboardData.footTraffic.num !== '---' ? dashboardData.footTraffic.num : '—',
      delta: dashboardData.footTraffic.pct === '---' ? '—' : dashboardData.footTraffic.pct,
      up: dashboardData.footTraffic.num === '---' ? null : dashboardData.footTraffic.up,
      subtitle: 'People searching for you',
      href: '/dashboard/local-seo',
      alert: ftPct < -15,
    },
    {
      label: 'Decisions',
      value: String(dashboardData.pendingApprovals),
      delta: dashboardData.pendingApprovals > 0 ? 'open' : 'clear',
      up: dashboardData.pendingApprovals === 0 ? true : null,
      subtitle: dashboardData.pendingApprovals === 1 ? 'Item waiting on you' : 'Items waiting on you',
      href: '/dashboard/approvals',
      alert: dashboardData.pendingApprovals >= 5,
    },
  ]

  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* First-run setup checklist — self-hides once milestones are met */}
      <SetupChecklist />

      {/* 1. Today's brief — AI-generated morning briefing */}
      <div className="db-fade db-d1">
        <TodaysBrief clientId={client.id} />
      </div>

      {/* 2. Quick actions — start a common task */}
      <div className="db-fade db-d2">
        <QuickActions clientId={client.id} />
      </div>

      {/* 3. Decisions to make — owner-approval queue (was "Waiting on you") */}
      <div className="db-fade db-d3 mb-4">
        <WaitingOnYou clientId={client.id} />
      </div>

      {/* 4. Your performance — 3 pulse metrics, glanceable */}
      <div className="db-fade db-d4">
        <PulseCards cards={pulseCards} />
      </div>

      {/* 5. What's working — AI insights, only renders if there's something */}
      {view.insights.length > 0 && (
        <div className="db-fade db-d5 rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--db-ink-3, #888)' }}>
            What&apos;s working
          </h3>
          <div className="flex flex-col gap-2.5">
            {view.insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
            ))}
          </div>
        </div>
      )}

      {/* 6. Your marketing this week — proof of momentum */}
      <div className="db-fade db-d6">
        <YourMarketingWeek clientId={client.id} />
      </div>

      {/* 7. Detailed analytics — collapsed by default */}
      <div className="db-fade db-d7 mt-2">
        <button
          onClick={() => setAnalyticsOpen(o => !o)}
          className="w-full flex items-center justify-between rounded-xl p-4 border bg-white hover:bg-bg-2 transition-colors"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <span className="text-[13px] font-semibold" style={{ color: 'var(--db-black, #111)' }}>
            View detailed analytics
          </span>
          <ChevronDown
            className={`w-4 h-4 text-ink-4 transition-transform ${analyticsOpen ? 'rotate-180' : ''}`}
          />
        </button>

        {analyticsOpen && (
          <div className="mt-4 space-y-4 pb-4">
            <StatusBanner
              headline={view.headline}
              businessName={dashboardData.businessName}
              pct={view.pct}
              up={view.up}
            />
            <ViewSelector current={currentView} onChange={handleViewChange} />
            {view.num === '---' ? (
              <div className="text-center py-12 rounded-xl border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                <p className="text-[13px]" style={{ color: 'var(--db-ink-3, #888)' }}>
                  Connect your accounts to see numbers.
                </p>
                <a
                  href="/dashboard/connected-accounts"
                  className="inline-flex items-center gap-2 mt-3 px-4 py-2 rounded-lg text-[12px] font-semibold text-white"
                  style={{ background: '#4abd98' }}
                >
                  Connect accounts
                </a>
              </div>
            ) : (
              <>
                <HeroMetric ctx={view.ctx} num={view.num} pctFull={view.pctFull} up={view.up} />
                <TrendChart
                  data={view.chartData}
                  timeRange={timeRange}
                  onTimeRangeChange={setTimeRange}
                  up={view.up}
                  unit={view.unit}
                />
                <MetricGrid title={view.bdtitle} metrics={view.metrics} />
                <BenchmarkBar
                  yourValue={view.bmy}
                  avgValue={view.bmavg}
                  maxValue={view.bmmax}
                  rank={view.rank}
                  yourFormatted={fmtBenchmark(view.bmy)}
                  avgFormatted={fmtBenchmark(view.bmavg)}
                  animationKey={currentView}
                />
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
