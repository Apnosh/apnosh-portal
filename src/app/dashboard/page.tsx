'use client'

/**
 * Dashboard — marketing operator's daily briefing.
 *
 * Five sections, each with one job, no overlap.
 *
 *   1. Brief + status pills    — AI brief paragraph with 3 inline stats
 *                                 (scheduled today / needs you / trend)
 *   2. Agenda                  — unified action list (reviews, approvals,
 *                                 broken integrations, drafts, suggestions)
 *   3. Pulse                   — 3 metrics with sparklines (drilldown)
 *   4. This week               — proof of momentum, last 7 days
 *   5. Coming up               — marketing calendar, content opportunities
 *
 * Strictly marketing-only. No operations data: no weather, no walk-in
 * forecasts, no reservation counts. Apnosh is the marketing co-pilot.
 *
 * Two-column on desktop above 1024px:
 *   LEFT (60%): Brief → Agenda → Pulse
 *   RIGHT (40%): This week → Coming up
 */

import { useEffect, useState } from 'react'
import { getDashboardData } from '@/lib/dashboard/get-dashboard-data'
import type { DashboardData } from '@/types/dashboard'
import { useClient } from '@/lib/client-context'
import SetupChecklist from '@/components/dashboard/setup-checklist'
import TodaysBrief, { type BriefPills } from '@/components/dashboard/todays-brief'
import Agenda, { type AgendaItem } from '@/components/dashboard/agenda'
import YourMarketingWeek from '@/components/dashboard/your-marketing-week'
import ComingUp, { type ComingUpItem } from '@/components/dashboard/coming-up'
import PulseCards, { type PulseCard } from '@/components/dashboard/pulse-cards'
import ServicesThisMonth from '@/components/dashboard/services-this-month'
import type { ServiceMonthRow } from '@/lib/services/delivery-matrix'

interface DashboardLoadResult {
  pulse: { customers: PulseCard; reputation: PulseCard; reach: PulseCard }
  weekly: { items: { label: string; detail?: string; icon: string }[] }
  agenda: AgendaItem[]
  services: ServiceMonthRow[]
  comingUp: ComingUpItem[]
  reviews: unknown[]
  brief: { text: string; generatedAt: string; model: string; cached: boolean } | null
  counts: { unansweredReviews: number; pendingApprovals: number }
  tasks: unknown[]
}

export default function DashboardPage() {
  const { client, loading: clientLoading } = useClient()
  const [bundle, setBundle] = useState<DashboardLoadResult | null>(null)

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
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [client?.id])

  // Insights side-channel kept simple — used only to inform the brief
  // pills' trend signal as a fallback when bundle lacks it.
  const [trendFallback, setTrendFallback] = useState<{ value: string; up: boolean } | null>(null)
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    getDashboardData(client.id)
      .then((data: DashboardData | null) => {
        if (cancelled || !data) return
        const pct = data.visibility.pct
        const up = data.visibility.up
        if (pct && pct !== '---') setTrendFallback({ value: pct, up })
      })
      .catch(() => { /* silent */ })
    return () => { cancelled = true }
  }, [client?.id])

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

  // Pulse cards from bundle, with skeletons while loading.
  const pulseCardsToRender: PulseCard[] = bundle
    ? [bundle.pulse.customers, bundle.pulse.reputation, bundle.pulse.reach]
    : [
        { label: 'Your customers', state: 'loading', subtitle: '', href: '/dashboard/local-seo' },
        { label: 'Your reputation', state: 'loading', subtitle: '', href: '/dashboard/local-seo/reviews' },
        { label: 'Your reach', state: 'loading', subtitle: '', href: '/dashboard/social' },
      ]

  // Brief pills — derived from the same bundle so we stay consistent.
  const pills: BriefPills | null = bundle
    ? {
        scheduledToday: bundle.comingUp.filter(c => c.daysUntil === 0).reduce((acc, c) => acc + c.queuedCount, 0)
          + bundle.agenda.filter(a => a.type === 'draft').length,
        needsAttention: (() => {
          const top = bundle.agenda.find(a => a.urgency === 'high') ?? bundle.agenda.find(a => a.urgency === 'medium')
          if (!top) return null
          return { label: top.label, href: top.href, urgency: top.urgency }
        })(),
        trend: bundle.pulse.reach.state === 'live' && bundle.pulse.reach.delta
          ? { label: 'Reach this week', value: bundle.pulse.reach.delta, up: bundle.pulse.reach.up ?? null }
          : bundle.pulse.customers.state === 'live' && bundle.pulse.customers.delta
            ? { label: 'Customer actions this week', value: bundle.pulse.customers.delta, up: bundle.pulse.customers.up ?? null }
            : trendFallback
              ? { label: 'Reach this month', value: trendFallback.value, up: trendFallback.up }
              : null,
      }
    : null

  return (
    <div
      className="max-w-[1280px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      <SetupChecklist />

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-6">
        {/* ═════════════ LEFT — operational column ═════════════ */}
        <div>
          {/* 1. Brief + status pills (the lead) */}
          <div className="db-fade db-d1">
            <TodaysBrief
              clientId={client.id}
              initialBrief={bundle ? bundle.brief : undefined}
              pills={pills}
            />
          </div>

          {/* 1b. Your services this month — delivered vs expected per service */}
          {bundle && bundle.services.length > 0 && (
            <ServicesThisMonth rows={bundle.services} />
          )}

          {/* 2. Agenda (the operating surface — unified action list) */}
          <div className="db-fade db-d2">
            <Agenda items={bundle ? bundle.agenda : null} />
          </div>

          {/* 3. Pulse (the proof — 3 sparkline metrics, drilldown on tap) */}
          <div className="db-fade db-d3">
            <PulseCards cards={pulseCardsToRender} />
          </div>
        </div>

        {/* ═════════════ RIGHT — context column ═════════════ */}
        <div>
          {/* 4. This week — proof of momentum */}
          <div className="db-fade db-d4">
            <YourMarketingWeek
              clientId={client.id}
              initialItems={
                bundle
                  ? (bundle.weekly.items as { label: string; detail?: string; icon: 'check' | 'message' | 'image' | 'star' | 'megaphone' | 'sparkle' }[])
                  : undefined
              }
            />
          </div>

          {/* 5. Coming up — marketing calendar (content opportunities) */}
          <div className="db-fade db-d5">
            <ComingUp items={bundle ? bundle.comingUp : null} />
          </div>
        </div>
      </div>
    </div>
  )
}
