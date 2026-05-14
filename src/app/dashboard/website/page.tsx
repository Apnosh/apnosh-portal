'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Globe } from 'lucide-react'
import type { TimeRange, DashboardView } from '@/types/dashboard'
import { getWebsiteView } from '@/lib/dashboard/get-website-view'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'
import WebsiteHealthCard from '@/components/dashboard/website-health-card'
import WebsitePreview from '@/components/dashboard/website-preview'
import HandledByTeamPanel from '@/components/dashboard/handled-by-team-panel'
import RequestStatusFeed from '@/components/dashboard/request-status-feed'

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
      {/* Top-right primary action: Request a change. Promoted from
         the buried 3rd-tier tile so owners realize this is the
         fastest way to get help. */}
      <div className="pt-6 pb-4 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            Website
          </p>
          <h1 className="text-[26px] font-semibold text-ink leading-tight mt-1">
            {businessName || 'Your website'}
          </h1>
        </div>
        <Link
          href="/dashboard/website/requests/new"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-semibold text-white bg-brand hover:bg-brand-dark shadow-sm shadow-brand/20"
        >
          <Plus className="w-3.5 h-3.5" />
          Request a change
        </Link>
      </div>

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

      {/* Live preview + health side-by-side */}
      {client?.id && (
        <div className="db-fade db-d4 mt-4 grid grid-cols-1 lg:grid-cols-2 gap-3">
          <WebsitePreview websiteUrl={client.website ?? null} />
          <div className="space-y-3">
            <WebsiteHealthCard clientId={client.id} />
            <RequestStatusFeed />
            <HandledByTeamPanel />
          </div>
        </div>
      )}

      {/* Your trend over time */}
      <div className="db-fade db-d4 mt-4">
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

    </div>
  )
}
