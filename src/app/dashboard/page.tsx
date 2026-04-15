'use client'

import { useState, useEffect } from 'react'
import type { DashboardData } from '@/types/dashboard'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import KPIStrip from '@/components/dashboard/kpi-strip'
import ActionItems from '@/components/dashboard/action-items'
import TrendSnapshot from '@/components/dashboard/trend-snapshot'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

export default function DashboardPage() {
  const { client, loading: clientLoading } = useClient()
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

  // No client or no data — welcome screen
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
            Welcome to Apnosh
          </h2>
          <p className="text-[14px] max-w-sm mx-auto mb-8" style={{ color: 'var(--db-ink-3, #888)' }}>
            Your dashboard is being set up. Once your accounts are connected, your data will appear here.
          </p>
          <a
            href="/dashboard/connect-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect your accounts
          </a>
        </div>
      </div>
    )
  }

  const vis = dashboardData.visibility
  const ft = dashboardData.footTraffic

  // Empty state — metrics tables exist but no data
  if (vis.num === '---' && ft.num === '---') {
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
            Setting up your dashboard
          </h2>
          <p className="text-[14px] max-w-sm mx-auto" style={{ color: 'var(--db-ink-3, #888)' }}>
            We're collecting your first data. You'll see your numbers here within 48 hours.
          </p>
        </div>
      </div>
    )
  }

  // Pick the best 4 KPIs across both views
  const kpis = [
    vis.metrics[0],  // Social reach
    ...(ft.num !== '---'
      ? [ft.metrics[0]]  // Foot traffic actions
      : [vis.metrics[2]] // Impressions (fallback if no GBP)
    ),
    ...(ft.num !== '---'
      ? [ft.metrics[1]]  // Calls
      : [vis.metrics[1]] // Profile visits (fallback)
    ),
    vis.metrics[3],  // New followers
  ].filter(Boolean)

  // 30-day trend data from visibility chart
  const trendData = vis.chartData['1M']?.data || []
  const fmtK = (n: number) => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k' : String(n)
  const trendStart = trendData.length > 0 ? fmtK(trendData[0]) : ''
  const trendEnd = trendData.length > 0 ? fmtK(trendData[trendData.length - 1]) : ''

  // Combine insights from both views
  const allInsights = [
    ...vis.insights,
    ...ft.insights.filter(fi => !vis.insights.some(vi => vi.title === fi.title)),
  ].slice(0, 3)

  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* 1. Health Signal */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={dashboardData.healthHeadline}
          businessName={dashboardData.businessName}
          signal={dashboardData.healthSignal}
          rank={vis.rank || ft.rank || ''}
          pct={vis.pct}
          up={vis.up}
        />
      </div>

      {/* 2. KPI Strip */}
      <div className="db-fade db-d2 mb-6">
        <KPIStrip metrics={kpis} />
      </div>

      {/* 3. Action Items */}
      <div className="db-fade db-d3 mb-6">
        <ActionItems items={dashboardData.actionItems} />
      </div>

      {/* 4. Trend Snapshot */}
      {trendData.length > 1 && (
        <div className="db-fade db-d4 mb-6">
          <TrendSnapshot
            data={trendData}
            up={vis.up}
            startLabel={trendStart}
            endLabel={trendEnd}
          />
        </div>
      )}

      {/* 5. Insights */}
      {allInsights.length > 0 && (
        <div className="db-fade db-d5 pb-6 mb-6" style={{ borderBottom: '1px solid var(--db-border, #f0f0f0)' }}>
          <h3 className="text-[11px] font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--db-ink-3, #888)' }}>
            Insights
          </h3>
          <div className="flex flex-col gap-2.5">
            {allInsights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
            ))}
          </div>
        </div>
      )}

      {/* 6. AM Note */}
      {vis.am.note && (
        <div className="db-fade db-d6">
          <AMNote
            name={vis.am.name}
            initials={vis.am.initials}
            role={vis.am.role}
            note={vis.am.note}
          />
        </div>
      )}
    </div>
  )
}
