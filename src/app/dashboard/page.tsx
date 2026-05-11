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
import { useRouter } from 'next/navigation'
import { useClient } from '@/lib/client-context'
import TodayHero from '@/components/dashboard/today-hero'
import type { TodayHeroData } from '@/lib/dashboard/get-today-hero'
import type { AgendaItem } from '@/components/dashboard/agenda'
import ComingUp, { type ComingUpItem } from '@/components/dashboard/coming-up'
import type { PulseCard } from '@/components/dashboard/pulse-cards'
import type { GoalCardData } from '@/components/dashboard/goal-progress-cards'
import YourStrategist, { type StrategistCardData } from '@/components/dashboard/your-strategist'
import RequestWork from '@/components/dashboard/request-work'
import type { PlaybookExplanation } from '@/lib/dashboard/get-playbook-explanations'
import ServicesThisMonth from '@/components/dashboard/services-this-month'
import type { ServiceMonthRow } from '@/lib/services/delivery-matrix'

interface DashboardLoadResult {
  pulse: { customers: PulseCard; reputation: PulseCard; reach: PulseCard }
  weekly: { items: { label: string; detail?: string; icon: string }[] }
  agenda: AgendaItem[]
  services: ServiceMonthRow[]
  goalCards: GoalCardData[]
  strategist: StrategistCardData | null
  playbooks: PlaybookExplanation[]
  todayHero: TodayHeroData | null
  setup: {
    shapeSet: boolean
    goalsSet: boolean
    anyChannelConnected: boolean
  }
  comingUp: ComingUpItem[]
  reviews: unknown[]
  brief: { text: string; generatedAt: string; model: string; cached: boolean } | null
  counts: { unansweredReviews: number; pendingApprovals: number }
  tasks: unknown[]
}

export default function DashboardPage() {
  const router = useRouter()
  const { client, loading: clientLoading } = useClient()
  const [bundle, setBundle] = useState<DashboardLoadResult | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [retryToken, setRetryToken] = useState(0)

  // Setup gate: if the bundle reports shape or goals missing, send the
  // owner to the /setup wizard. Onboarding lives there, not on the
  // daily dashboard.
  useEffect(() => {
    if (!bundle) return
    if (!bundle.setup.shapeSet || !bundle.setup.goalsSet) {
      router.replace('/setup')
    }
  }, [bundle, router])

  // One consolidated fetch for everything the dashboard renders.
  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setLoadError(null)
    fetch(`/api/dashboard/load?clientId=${encodeURIComponent(client.id)}`)
      .then(async r => {
        if (!r.ok) {
          throw new Error(`Server returned ${r.status}`)
        }
        return r.json()
      })
      .then(data => {
        if (cancelled || !data) return
        setBundle(data as DashboardLoadResult)
      })
      .catch((err: Error) => {
        if (cancelled) return
        // Show retry UI instead of an endless skeleton.
        setLoadError(err.message || 'Could not load your dashboard')
      })
    return () => { cancelled = true }
  }, [client?.id, retryToken])

  // Trend fallback removed -- the bundle's pulse data carries reach/customer
  // deltas, which is what the brief pills were falling back to anyway. Saves
  // a duplicate getDashboardData() round-trip on every dashboard mount.

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

  if (loadError && !bundle) {
    return (
      <div className="max-w-[640px] mx-auto px-8 max-sm:px-4 pt-12 text-center">
        <div className="rounded-xl border p-8 bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <h2 className="text-lg font-bold mb-2" style={{ color: 'var(--db-black)' }}>
            Couldn&apos;t load your dashboard
          </h2>
          <p className="text-sm mb-5" style={{ color: 'var(--db-ink-3)' }}>
            Something went wrong on our end. {loadError ? `(${loadError})` : ''}
          </p>
          <button
            onClick={() => setRetryToken(t => t + 1)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
            style={{ background: '#4abd98' }}
          >
            Try again
          </button>
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

  return (
    <div
      className="max-w-[1280px] mx-auto px-8 max-sm:px-4 pb-20 max-sm:pb-16"
      style={{ fontFamily: "var(--font-dm-sans, 'DM Sans'), var(--font-inter, 'Inter'), -apple-system, system-ui, sans-serif" }}
    >
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] gap-x-6">
        {/* ═════════════ LEFT — the morning paper ═════════════ */}
        <div>
          {/* The Today hero owns the action surface end-to-end:
              headline -> AI narrative -> needs you -> shipping this week
              -> recently. No more standalone agenda or numbers blocks --
              the hero is the dashboard. */}
          <div className="db-fade db-d1">
            <TodayHero
              clientId={client.id}
              hero={bundle ? bundle.todayHero : null}
              initialBrief={bundle ? bundle.brief : undefined}
            />
          </div>

          {/* Service delivery this month -- only when we have active
              services to track against (else it's noise). */}
          {bundle && bundle.services.length > 0 && (
            <ServicesThisMonth rows={bundle.services} />
          )}
        </div>

        {/* ═════════════ RIGHT — context + actions column ═════════════ */}
        <div>
          {/* Strategist relationship card. */}
          <YourStrategist strategist={bundle ? bundle.strategist : null} />

          {/* Request work -- the "every action is one click" promise
              made surface-level. */}
          <RequestWork />

          {/* Coming up -- marketing calendar (holidays + food moments). */}
          <div className="db-fade db-d4">
            <ComingUp items={bundle ? bundle.comingUp : null} />
          </div>
        </div>
      </div>
    </div>
  )
}

// pills + BriefPills no longer used now that TodayHero composes its own
// pills internally. Suppress lint by re-exporting only what's used.
export {} // ensure file remains a module
