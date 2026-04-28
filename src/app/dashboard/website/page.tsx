'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Activity, ListTodo, BarChart3, ChevronRight, Globe, Settings2 } from 'lucide-react'
import type { TimeRange, DashboardView } from '@/types/dashboard'
import { getWebsiteView } from '@/lib/dashboard/get-website-view'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

export default function WebsiteOverviewPage() {
  const { client, loading: clientLoading } = useClient()
  const [timeRange, setTimeRange] = useState<TimeRange>('1M')
  const [view, setView] = useState<DashboardView | null>(null)
  const [businessName, setBusinessName] = useState<string>('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      if (clientLoading) return
      if (!client?.id) { setLoading(false); return }

      try {
        const v = await getWebsiteView(client.id)
        setView(v)
        setBusinessName(client.name ?? '')
      } catch (err) {
        console.error('Failed to load website view', err)
        setView(null)
      }
      setLoading(false)
    }
    loadData()
  }, [client?.id, client?.name, clientLoading])

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

  // No connection or empty state
  if (!view || view.num === '---') {
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
            <Globe className="w-7 h-7" style={{ color: '#4abd98' }} />
          </div>
          <h2 className="text-[20px] font-bold mb-2" style={{ color: 'var(--db-black, #111)' }}>
            Connect Google Analytics
          </h2>
          <p className="text-[14px] max-w-sm mx-auto mb-8" style={{ color: 'var(--db-ink-3, #888)' }}>
            Once Google Analytics and Search Console are connected, your website numbers will show up here.
          </p>
          <Link
            href="/dashboard/connected-accounts"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Connect accounts
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="max-w-[840px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* How your website is doing */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={businessName}
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
        <div className="db-fade db-d7 pb-8 mb-8" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <AMNote
            name={view.am.name}
            initials={view.am.initials}
            role={view.am.role}
            note={view.am.note}
          />
        </div>
      )}

      {/* Website tools -- quick links to other sections */}
      <div className="db-fade db-d7">
        <h2 className="text-[15px] font-bold mb-3" style={{ color: 'var(--db-black)' }}>
          Website tools
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-3">
          <Link
            href="/dashboard/website/manage"
            className="bg-white rounded-xl border-2 border-brand/30 p-4 flex items-center justify-between hover:border-brand hover:shadow-sm transition"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(74, 189, 152, 0.1)' }}>
                <Settings2 className="w-5 h-5" style={{ color: '#4abd98' }} />
              </div>
              <div>
                <div className="text-sm font-semibold text-ink">Manage your site</div>
                <div className="text-xs text-ink-4">Update hours, menu, promos and more</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Link
            href="/dashboard/website/health"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <Activity className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Site Health</div>
                <div className="text-xs text-ink-4">Uptime, speed, security</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
          <Link
            href="/dashboard/website/traffic"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <BarChart3 className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Full details</div>
                <div className="text-xs text-ink-4">Sources, pages, advanced</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
          <Link
            href="/dashboard/website/requests"
            className="bg-white rounded-xl border border-ink-6 p-4 flex items-center justify-between hover:shadow-sm transition-shadow"
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-bg-2 flex items-center justify-center">
                <ListTodo className="w-5 h-5 text-ink-3" />
              </div>
              <div>
                <div className="text-sm font-medium text-ink">Change requests</div>
                <div className="text-xs text-ink-4">Ask for updates</div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-ink-4" />
          </Link>
        </div>

        <div className="mt-4 flex justify-center">
          <Link
            href="/dashboard/website/requests/new"
            className="inline-flex items-center gap-2 text-sm font-medium text-brand hover:text-brand-dark"
          >
            <Plus className="w-4 h-4" />
            New change request
          </Link>
        </div>
      </div>
    </div>
  )
}
