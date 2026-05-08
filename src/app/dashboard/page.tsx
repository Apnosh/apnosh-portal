'use client'

/**
 * Dashboard — operator's marketing tool, not a managed-service report.
 *
 * Hierarchy (phone-first, top to bottom):
 *   1. Today's brief         — AI-generated 60-80 word morning briefing
 *   2. Quick actions         — 4 buttons to start common tasks
 *   3. Decisions to make     — items waiting for owner approval
 *   4. Your performance      — 3 pulse metrics, glanceable
 *   4b. Your reviews         — last 5 across sources
 *   5. What's working        — AI insights with actionable suggestions
 *   6. Your marketing week   — proof of momentum, last 7 days
 *
 * Per-metric drilldowns live on focused pages (/dashboard/social,
 * /dashboard/local-seo, /dashboard/local-seo/reviews) — each pulse
 * card routes there directly. The previous "View detailed analytics"
 * collapse is gone; chart-heavy analysis isn't a dashboard concern.
 */

import { useEffect, useState } from 'react'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import type { DashboardData, DashboardInsight } from '@/types/dashboard'
import { useClient } from '@/lib/client-context'
import InsightCard from '@/components/dashboard/insight-card'
import WaitingOnYou from '@/components/dashboard/waiting-on-you'
import SetupChecklist from '@/components/dashboard/setup-checklist'
import TodaysBrief from '@/components/dashboard/todays-brief'
import QuickActions from '@/components/dashboard/quick-actions'
import YourMarketingWeek from '@/components/dashboard/your-marketing-week'
import YourReviews from '@/components/dashboard/your-reviews'
import PulseCards, { type PulseCard } from '@/components/dashboard/pulse-cards'

interface DashboardLoadResult {
  pulse: { customers: PulseCard; reputation: PulseCard; reach: PulseCard }
  weekly: { items: { label: string; detail?: string; icon: string }[] }
  reviews: Array<{
    id: string
    source: string
    rating: number
    author_name: string | null
    review_text: string | null
    posted_at: string
    responded_at: string | null
  }>
  brief: { text: string; generatedAt: string; model: string; cached: boolean } | null
  counts: { unansweredReviews: number; pendingApprovals: number }
  tasks: unknown[]
}

export default function DashboardPage() {
  const { client, loading: clientLoading } = useClient()
  const [bundle, setBundle] = useState<DashboardLoadResult | null>(null)
  const [insights, setInsights] = useState<DashboardInsight[] | null>(null)

  // One consolidated fetch for everything the dashboard renders.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    fetch(`/api/dashboard/load?clientId=${encodeURIComponent(client.id)}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (cancelled || !data) return
        setBundle(data as DashboardLoadResult)
      })
      .catch(() => { /* silent — components fall back to their own fetches */ })
    return () => { cancelled = true }
  }, [client?.id])

  // Insights are computed by the legacy getDashboardData server action; we
  // fetch them as a side-channel so the "What's working" card can render.
  // When we build the per-metric narrative endpoint (Phase 2), this goes away.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    getDashboardData(client.id)
      .then((data: DashboardData | null) => {
        if (cancelled || !data) return
        // Use whichever view has insights (visibility usually has more)
        const merged = [...data.visibility.insights, ...data.footTraffic.insights]
        setInsights(merged.slice(0, 3))
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [client?.id])

  // Welcoming empty state for clients still resolving
  if (clientLoading) {
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

  if (!client?.id) {
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

  // Pulse cards come from the bundle. While loading, render three skeleton
  // cards so the layout doesn't shift.
  const pulseCardsToRender: PulseCard[] = bundle
    ? [bundle.pulse.customers, bundle.pulse.reputation, bundle.pulse.reach]
    : [
        { label: 'Your customers', state: 'loading', subtitle: '', href: '/dashboard/local-seo' },
        { label: 'Your reputation', state: 'loading', subtitle: '', href: '/dashboard/local-seo/reviews' },
        { label: 'Your reach', state: 'loading', subtitle: '', href: '/dashboard/social' },
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
        <TodaysBrief clientId={client.id} initialBrief={bundle ? bundle.brief : undefined} />
      </div>

      {/* 2. Quick actions — start a common task */}
      <div className="db-fade db-d2">
        <QuickActions clientId={client.id} initialCounts={bundle?.counts} />
      </div>

      {/* 3. Decisions to make — owner-approval queue (was "Waiting on you") */}
      <div className="db-fade db-d3 mb-4">
        <WaitingOnYou clientId={client.id} />
      </div>

      {/* 4. Your performance — 3 pulse metrics, glanceable. Each routes to a focused drilldown page. */}
      <div className="db-fade db-d4">
        <PulseCards cards={pulseCardsToRender} />
      </div>

      {/* 4b. Your reviews — last 5 across all sources */}
      <div className="db-fade db-d4">
        <YourReviews clientId={client.id} initialReviews={bundle?.reviews} />
      </div>

      {/* 5. What's working — AI insights, only renders if there's something */}
      {insights && insights.length > 0 && (
        <div className="db-fade db-d5 rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <h3 className="text-[11px] font-semibold uppercase tracking-widest mb-3" style={{ color: 'var(--db-ink-3, #888)' }}>
            What&apos;s working
          </h3>
          <div className="flex flex-col gap-2.5">
            {insights.map((ins, i) => (
              <InsightCard key={i} icon={ins.icon} title={ins.title} subtitle={ins.subtitle} />
            ))}
          </div>
        </div>
      )}

      {/* 6. Your marketing this week — proof of momentum */}
      <div className="db-fade db-d6">
        <YourMarketingWeek
          clientId={client.id}
          initialItems={
            bundle
              ? (bundle.weekly.items as { label: string; detail?: string; icon: 'check' | 'message' | 'image' | 'star' | 'megaphone' | 'sparkle' }[])
              : undefined
          }
        />
      </div>

      {/* 7. Want to go deeper — discoverable links to focused analytics pages */}
      <div className="db-fade db-d7 mt-2 grid grid-cols-3 max-sm:grid-cols-1 gap-2">
        <a
          href="/dashboard/local-seo"
          className="rounded-xl p-3 border bg-white hover:bg-bg-2 transition-colors text-[12px]"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="font-semibold mb-0.5" style={{ color: 'var(--db-black, #111)' }}>
            Customer analytics →
          </div>
          <div style={{ color: 'var(--db-ink-3, #888)' }}>
            Calls, directions, search performance
          </div>
        </a>
        <a
          href="/dashboard/local-seo/reviews"
          className="rounded-xl p-3 border bg-white hover:bg-bg-2 transition-colors text-[12px]"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="font-semibold mb-0.5" style={{ color: 'var(--db-black, #111)' }}>
            Review analytics →
          </div>
          <div style={{ color: 'var(--db-ink-3, #888)' }}>
            Star trend, sentiment, response rate
          </div>
        </a>
        <a
          href="/dashboard/social"
          className="rounded-xl p-3 border bg-white hover:bg-bg-2 transition-colors text-[12px]"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="font-semibold mb-0.5" style={{ color: 'var(--db-black, #111)' }}>
            Social analytics →
          </div>
          <div style={{ color: 'var(--db-ink-3, #888)' }}>
            Reach, impressions, engagement
          </div>
        </a>
      </div>
    </div>
  )
}
