'use client'

import { useState, useEffect } from 'react'
import type { DashboardData } from '@/types/dashboard'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import { getSocialBreakdown, type SocialDailyRow } from '@/lib/dashboard/get-social-breakdown'
import { getSocialPosts, type SocialPost } from '@/lib/dashboard/get-social-posts'
import { useClient } from '@/lib/client-context'
import StatusBanner from '@/components/dashboard/status-banner'
import SocialOverview from '@/components/dashboard/social-overview'
import SocialPerformance from '@/components/dashboard/social-performance'
import SocialInsightsChart from '@/components/dashboard/social-insights-chart'
import InsightCard from '@/components/dashboard/insight-card'
import AMNote from '@/components/dashboard/am-note'

type SocialTab = 'overview' | 'details'
const TAB_STORAGE_KEY = 'apnosh.social.tab'

export default function SocialOverviewPage() {
  const { client, loading: clientLoading } = useClient()
  const [dashboardData, setDashboardData] = useState<DashboardData | null>(null)
  const [breakdown, setBreakdown] = useState<{ rows: SocialDailyRow[]; platforms: string[] } | null>(null)
  const [posts, setPosts] = useState<SocialPost[]>([])
  const [loading, setLoading] = useState(true)

  // Tab state -- read from URL on first mount, fall back to localStorage, then
  // default to 'overview'. Writing to URL + localStorage keeps deep links and
  // the "last used" preference working.
  const [tab, setTab] = useState<SocialTab>('overview')

  useEffect(() => {
    if (typeof window === 'undefined') return
    const urlTab = new URLSearchParams(window.location.search).get('view') as SocialTab | null
    const stored = window.localStorage.getItem(TAB_STORAGE_KEY) as SocialTab | null
    const resolved: SocialTab = urlTab === 'details' || urlTab === 'overview'
      ? urlTab
      : stored === 'details' || stored === 'overview'
      ? stored
      : 'overview'
    setTab(resolved)
  }, [])

  const handleTabChange = (next: SocialTab) => {
    setTab(next)
    if (typeof window === 'undefined') return
    window.localStorage.setItem(TAB_STORAGE_KEY, next)
    const url = new URL(window.location.href)
    url.searchParams.set('view', next)
    window.history.replaceState({}, '', url.toString())
  }

  useEffect(() => {
    async function loadData() {
      if (clientLoading) return

      if (client?.id) {
        try {
          const [data, bd, p] = await Promise.all([
            getDashboardData(client.id),
            getSocialBreakdown(client.id),
            getSocialPosts(client.id, 90),
          ])
          if (data) {
            setDashboardData(data)
            setBreakdown({ rows: bd.rows, platforms: bd.platforms })
            setPosts(p)
            setLoading(false)
            return
          }
        } catch (err) {
          console.error('Failed to load social data:', err)
        }
      }

      setDashboardData(null)
      setBreakdown(null)
      setPosts([])
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

  return (
    <div
      className="max-w-[1080px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      {/* Compact status line -- same on both tabs */}
      <div className="db-fade db-d1">
        <StatusBanner
          headline={view.headline}
          businessName={dashboardData.businessName}
          pct={view.pct}
          up={view.up}
        />
      </div>

      {/* Tab switcher */}
      <div className="db-fade db-d2 mt-4 mb-6 flex items-center gap-2 border-b border-ink-6">
        <TabButton label="Overview" active={tab === 'overview'} onClick={() => handleTabChange('overview')} />
        <TabButton label="Details" active={tab === 'details'} onClick={() => handleTabChange('details')} />
        <span className="ml-auto text-[11px] text-ink-4">
          {tab === 'overview' ? 'For quick check-ins' : 'For deep analysis'}
        </span>
      </div>

      {/* AM note sits above the tab content so owners see it no matter which tab */}
      {view.am.note && (
        <div className="db-fade db-d3 pb-6 mb-6" style={{ borderBottom: '1px solid var(--db-border)' }}>
          <AMNote
            name={view.am.name}
            initials={view.am.initials}
            role={view.am.role}
            note={view.am.note}
          />
        </div>
      )}

      {tab === 'overview' ? (
        <div className="db-fade db-d4">
          <SocialOverview posts={posts} rows={breakdown?.rows ?? []} />
        </div>
      ) : (
        <div className="db-fade db-d4 space-y-10">
          {/* Group 1: Content performance */}
          <DetailsGroup
            title="Content performance"
            description="How your individual posts and content formats are doing."
          >
            <SocialPerformance posts={posts} />
          </DetailsGroup>

          {/* Group 2: AM observations */}
          {view.insights.length > 0 && (
            <DetailsGroup
              title="What we noticed"
              description="Signals your account manager pulled from this week."
            >
              <div className="flex flex-col gap-2.5">
                {view.insights.map((ins, i) => (
                  <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
                ))}
              </div>
            </DetailsGroup>
          )}

          {/* Group 3: Audience trends */}
          {breakdown && breakdown.rows.length > 0 && (
            <DetailsGroup
              title="Audience trends"
              description="How followers and other account-level numbers move over time."
            >
              <SocialInsightsChart rows={breakdown.rows} platforms={breakdown.platforms} />
            </DetailsGroup>
          )}
        </div>
      )}
    </div>
  )
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-[14px] font-semibold px-4 py-3 -mb-px transition-colors"
      style={{
        color: active ? 'var(--db-black)' : 'var(--db-ink-3)',
        borderBottom: active ? '2px solid var(--db-black)' : '2px solid transparent',
      }}
    >
      {label}
    </button>
  )
}

function DetailsGroup({
  title, description, children,
}: {
  title: string
  description: string
  children: React.ReactNode
}) {
  return (
    <section>
      <div className="mb-5 pb-3 border-b border-ink-6">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-ink-3">{title}</h3>
        <p className="text-xs text-ink-4 mt-0.5">{description}</p>
      </div>
      {children}
    </section>
  )
}
