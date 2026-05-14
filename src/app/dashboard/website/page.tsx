'use client'

/**
 * Website overview.
 *
 * Reading order optimized for restaurant owners:
 *   1. Status strip — "is it working?" in one glance
 *   2. Live preview — "what visitors see right now"
 *   3. Open requests + recent team work — accountability + activity
 *   4. Performance — hero number, trend, metric breakdown
 *   5. AM note (only when present)
 *
 * The legacy StatusBanner + standalone "What we noticed" insights
 * were dropped — both repeated information that the status strip
 * + performance section already cover.
 */

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Plus, Globe } from 'lucide-react'
import type { TimeRange, DashboardView } from '@/types/dashboard'
import { getWebsiteView } from '@/lib/dashboard/get-website-view'
import { useClient } from '@/lib/client-context'
import HeroMetric from '@/components/dashboard/hero-metric'
import TrendChart from '@/components/dashboard/trend-chart'
import MetricGrid from '@/components/dashboard/metric-grid'
import AMNote from '@/components/dashboard/am-note'
import SiteStatusStrip from '@/components/dashboard/site-status-strip'
import WebsitePreview from '@/components/dashboard/website-preview'
import HandledByTeamPanel from '@/components/dashboard/handled-by-team-panel'
import RequestStatusFeed from '@/components/dashboard/request-status-feed'
import FormInboxCard from '@/components/dashboard/form-inbox-card'

export default function WebsiteOverviewPage() {
  const { client, loading: clientLoading } = useClient()
  const [timeRange, setTimeRange] = useState<TimeRange>('1M')
  const [view, setView] = useState<DashboardView | null>(null)
  const [businessName, setBusinessName] = useState<string>('')
  const [loading, setLoading] = useState(true)
  const [analyticsConnected, setAnalyticsConnected] = useState<boolean | null>(null)

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

  /* Probe whether analytics is connected so the empty-state branch
     can distinguish "connect now" from "connected, no data yet". */
  useEffect(() => {
    if (!client?.id) return
    import('@/lib/website-health-score')
      .then(({ getWebsiteHealth }) => getWebsiteHealth(client.id))
      .then(h => {
        const analytics = h?.checks.find(c => c.id === 'analytics')
        setAnalyticsConnected(analytics?.status === 'pass')
      })
      .catch(() => setAnalyticsConnected(null))
  }, [client?.id])

  if (loading) {
    return (
      <div className="max-w-[840px] mx-auto px-8 max-sm:px-4 pt-12">
        <div className="animate-pulse space-y-4">
          <div className="h-6 bg-ink-6 rounded w-48" />
          <div className="h-12 bg-ink-6 rounded" />
          <div className="h-64 bg-ink-6 rounded" />
        </div>
      </div>
    )
  }

  /* Empty state — only when analytics genuinely not connected.
     If the view is empty but GA is connected, render the dashboard
     with zeros (handled later in the normal render path). */
  if (!view || (view.num === '---' && analyticsConnected === false)) {
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
      className="max-w-[1100px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16 space-y-5"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* Header + primary action — Request a change is the most
         common task on this page, so it sits in the page title row. */}
      <div className="pt-6 flex items-center justify-between gap-3 flex-wrap">
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

      {/* 1. Status strip — answers "is my site working?" in one line.
         The first thing owners need on every visit. */}
      {client?.id && (
        <div className="db-fade db-d1">
          <SiteStatusStrip clientId={client.id} />
        </div>
      )}

      {/* 2. Live preview — full width on mobile, takes the larger
         column on desktop. Visceral "this is what visitors see". */}
      <div className="db-fade db-d2 grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <WebsitePreview websiteUrl={client?.website ?? null} />
        </div>
        <div className="space-y-3">
          <FormInboxCard />
          <RequestStatusFeed />
          <HandledByTeamPanel />
        </div>
      </div>

      {/* 3. Performance section — grouped together so the chart +
         hero + breakdown read as one "how is this doing" answer.
         Hero number + metric cards now react to the time-range
         selector via view.byRange (was previously chart-only). */}
      <section className="db-fade db-d3 pt-4 mt-2" style={{ borderTop: '1px solid var(--db-border)' }}>
        <h2 className="text-[15px] font-bold mb-3 text-ink">How your website is doing</h2>
        {(() => {
          const r = view.byRange?.[timeRange]
          const num = r?.num ?? view.num
          const pct = r?.pct ?? view.pct
          const pctFull = r?.pctFull ?? view.pctFull
          const up = r?.up ?? view.up
          const metrics = r?.metrics ?? view.metrics
          void pct  /* used by the strip elsewhere */
          return (
            <div className="space-y-4">
              <HeroMetric ctx={view.ctx} num={num} pctFull={pctFull} up={up} />
              <TrendChart
                data={view.chartData}
                timeRange={timeRange}
                onTimeRangeChange={setTimeRange}
                up={up}
                unit={view.unit}
              />
              <MetricGrid title={view.bdtitle} metrics={metrics} />
            </div>
          )
        })()}
      </section>

      {/* 4. AM note — only shows when there's an actual note. */}
      {view.am.note && (
        <div className="db-fade db-d4 pt-4 mt-2" style={{ borderTop: '1px solid var(--db-border)' }}>
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
