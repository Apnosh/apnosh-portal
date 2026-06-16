'use client'

/**
 * /dashboard — Direction A ("Daily Briefing") from the Claude Design export.
 *
 * Topbar: title + date + last-synced pill. The global header already
 * carries the notification bell and avatar, so we don't double them.
 *
 * Hero: warm concierge-style note from the primary strategist, with
 * key phrases highlighted in brand green. Two CTAs underneath
 * (Open briefing + Message {strategist}) and a "Sent X · Y min read"
 * footer.
 *
 * Two-column layout below:
 *   LEFT  — Needs you today (urgency-tiered rows with Review buttons)
 *           + This week vs last (4 stat tiles with sparklines)
 *   RIGHT — Request work (2x2 quick picks + Custom request)
 *           + Latest reviews + Coming up
 *
 * Pulls from /api/dashboard/load. Empty/partial/steady states render
 * gracefully when data isn't fully wired yet.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useClient } from '@/lib/client-context'
import AdminClientPicker from '@/components/admin/admin-client-picker'
import FinishProfileBanner, { useFinishProfileNudge } from '@/components/dashboard/finish-profile-banner'
import GettingStarted from '@/components/dashboard/getting-started'
import MobileHome from './mobile-home'
import type { SinceEvent } from '@/components/dashboard/since-last-checked'
import DesktopHome from '@/components/dashboard/desktop-home'
import type { HomeMetrics } from '@/lib/dashboard/get-home-metrics'
import type { HomeSectionsData } from '@/lib/dashboard/get-home-sections'
import {
  Sparkles, MessageSquare, Image as ImgIcon, Video, Megaphone, Brush, Plus,
  Plug, Loader2, Users as UsersIcon, Clock, Check,
} from 'lucide-react'

// ─── Types mirror the /api/dashboard/load shape ──────────────────────

interface PrimaryStrategist {
  id: string
  name: string
  firstName: string
  email: string | null
  avatarUrl: string | null
  initials: string
}

interface AgendaItem {
  id: string
  type: 'review' | 'approval' | 'connection' | 'draft' | 'task' | 'suggestion'
  urgency: 'high' | 'medium' | 'low'
  label: string
  detail?: string
  href: string
  actionLabel: string
}

interface RecentReview {
  id: string
  authorName: string
  rating: number
  text: string | null
  source: string
  postedAt: string
  replied: boolean
  needsReply: boolean
}

interface RecentReviewsBundle {
  items: RecentReview[]
  avgRating: number | null
  total: number
}

interface PulseCardData {
  label: string
  state: 'live' | 'no-data' | 'loading'
  value?: string
  delta?: string | null
  up?: boolean | null
  subtitle?: string
  connectLabel?: string
  href?: string
  alert?: boolean
  series?: number[]
}

interface ComingUpItem {
  date: string
  label: string
  hook: string
  weight: number
  daysUntil: number
  queuedCount: number
}

type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'ALL'
interface RangePoint { value: string; delta: string | null; up: boolean | null; series: number[] }
interface MetricRanges { available: RangeKey[]; ranges: Partial<Record<RangeKey, RangePoint>> }
interface MetricHistory { customers: MetricRanges | null; reach: MetricRanges | null }

interface DashboardLoad {
  agenda: AgendaItem[]
  primaryStrategist: PrimaryStrategist | null
  recentReviews: RecentReviewsBundle
  pulse: { customers: PulseCardData; reputation: PulseCardData; reach: PulseCardData }
  metricHistory: MetricHistory | null
  weekly: { items: { label: string; detail?: string; icon: string }[]; generatedThisWeek?: number }
  comingUp: ComingUpItem[]
  setup: { shapeSet: boolean; goalsSet: boolean; anyChannelConnected: boolean }
  counts: { unansweredReviews: number; pendingApprovals: number }
  homeMetrics: HomeMetrics | null
  homeSections: HomeSectionsData | null
  sinceLastChecked: SinceEvent[]
}

// ─── Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { client, isAdmin, loading: clientLoading } = useClient()
  const [data, setData] = useState<DashboardLoad | null>(null)
  const [loading, setLoading] = useState(true)
  const [health, setHealth] = useState<{
    score: number
    grade: 'great' | 'good' | 'needs-work'
    checks: Array<{ key: string; label: string; status: string; fixLabel?: string; fixHref?: string }>
  } | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Finish-your-profile nudge. We lift its visibility here so the home
  // content below can drop its negative top margin when the banner shows,
  // preventing the home from riding up and clipping the banner.
  const nudge = useFinishProfileNudge()
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const bannerVisible = nudge.show && !nudgeDismissed

  useEffect(() => {
    // Wait until the client context has finished resolving. Until then the
    // gate below keeps the spinner up.
    if (clientLoading) return
    // Context resolved but there's no client (e.g. a skipped or incomplete
    // profile that never provisioned one). Stop loading so the page renders
    // the getting-started / finish-profile state instead of spinning forever.
    if (!client?.id) { setLoading(false); return }
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/dashboard/load?clientId=${encodeURIComponent(client.id)}`)
        if (!r.ok) return
        const j = (await r.json()) as DashboardLoad
        if (!cancelled) setData(j)
      } catch {
        /* silent — empty state renders */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [client?.id, clientLoading])

  // Listing health drives the "next win" card. Fetched separately because it
  // makes a live Google call — don't block the rest of the dashboard on it.
  useEffect(() => {
    if (clientLoading || !client?.id) return
    let cancelled = false
    fetch('/api/dashboard/listing/health')
      .then(r => r.ok ? r.json() : null)
      .then(h => { if (!cancelled && h) setHealth(h) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [client?.id, clientLoading])

  const fireToast = useCallback((msg: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast(msg)
    toastTimer.current = setTimeout(() => setToast(null), 4000)
  }, [])

  const strategist = data?.primaryStrategist ?? null
  const strategistFirst = strategist?.firstName ?? 'your strategist'
  const StrategistFirst = strategist?.firstName ?? 'Your strategist'

  const state: 'empty' | 'partial' | 'steady' = useMemo(() => {
    if (!data) return 'empty'
    if (!data.setup.anyChannelConnected) return 'empty'
    if (data.recentReviews.items.length > 0 && data.pulse.customers.state === 'live') return 'steady'
    return 'partial'
  }, [data])

  const hasData = state !== 'empty'
  const totalNeeds = (data?.agenda ?? []).filter(a => a.urgency !== 'low').length
  const urgentCount = (data?.agenda ?? []).filter(a => a.urgency === 'high').length
  const visibleAgenda = (data?.agenda ?? []).filter(a => a.urgency !== 'low').slice(0, 3)

  if (clientLoading || (loading && !data)) {
    return (
      <div className="flex items-center justify-center py-24 text-ink-3">
        <Loader2 className="w-4 h-4 animate-spin mr-2" />
        Loading your dashboard…
      </div>
    )
  }

  if (isAdmin && !client) {
    return <AdminClientPicker />
  }

  /* First-run experience: fresh client with no platforms connected
     and no active paid services sees a guided 4-card welcome rather
     than the empty 'Today' briefing meant for active clients.
     On mobile we render the new MobileHome instead — its own state
     handling shows the right empty UI without the heavy GettingStarted
     deck that's tuned for desktop. */
  const noActiveServices = (client?.services_active?.length ?? 0) === 0
  const showGettingStarted = state === 'empty' && noActiveServices
  if (showGettingStarted) {
    return (
      <>
        {/* Finish-your-profile nudge for clients who skipped or paused
            setup — show it here too, not just on the full dashboard. */}
        <FinishProfileBanner
          show={bannerVisible}
          stepLeftOff={nudge.stepLeftOff}
          onDismiss={() => setNudgeDismissed(true)}
        />
        {/* Phones stack (MobileHome); desktop gets a real full-screen
            layout (DesktopHome) that reuses the same pieces and data.
            Negative margins bleed the home edge-to-edge; we keep the top
            bleed only when the banner is hidden so it never overlaps. */}
        <div className={`-mx-4 -mb-4 ${bannerVisible ? '' : '-mt-4'} lg:hidden`}>
          <MobileHome
            homeMetrics={data?.homeMetrics ?? null}
            homeSections={data?.homeSections ?? null}
            agenda={data?.agenda ?? null}
            avatarText={client?.name ?? ''}
            sinceLastChecked={data?.sinceLastChecked ?? []}
            loading={loading}
            failed={!loading && !!client?.id && !data}
          />
        </div>
        <div className={`hidden lg:block lg:-mx-6 lg:-mb-6 ${bannerVisible ? '' : 'lg:-mt-6'}`}>
          <DesktopHome
            homeMetrics={data?.homeMetrics ?? null}
            homeSections={data?.homeSections ?? null}
            loading={loading}
            failed={!loading && !!client?.id && !data}
          />
        </div>
        {/* Old desktop empty state kept (hidden) so it's easy to restore. */}
        <div className="hidden">
          <GettingStarted clientName={client?.name ?? ''} />
        </div>
      </>
    )
  }

  return (
    <div className="relative">
      {/* Finish-your-profile nudge for clients who used 'Save and explore' */}
      <FinishProfileBanner
        show={bannerVisible}
        stepLeftOff={nudge.stepLeftOff}
        onDismiss={() => setNudgeDismissed(true)}
      />

      {/* ─── MOBILE HOME ────────────────────────────────────────────
          Simplified, thumb-first home for phones. Receives the same
          DashboardLoad data and renders a 30-second scan: greeting →
          health hero → top 3 needs → 3-metric strip → strategist nudge
          → coming up. Phones get the stacked column (MobileHome);
          desktop gets a real full-screen layout (DesktopHome) built from
          the same pieces and the same data. Negative margins bleed the
          home edge-to-edge; keep the top bleed only when the banner is
          hidden so it never overlaps. */}
      <div className={`-mx-4 -mb-4 ${bannerVisible ? '' : '-mt-4'} lg:hidden`}>
        <MobileHome
          homeMetrics={data?.homeMetrics ?? null}
          homeSections={data?.homeSections ?? null}
          agenda={data?.agenda ?? null}
          avatarText={client?.name ?? ''}
          sinceLastChecked={data?.sinceLastChecked ?? []}
          loading={loading}
          failed={!loading && !!client?.id && !data}
        />
      </div>
      <div className={`hidden lg:block lg:-mx-6 lg:-mb-6 ${bannerVisible ? '' : 'lg:-mt-6'}`}>
        <DesktopHome
          homeMetrics={data?.homeMetrics ?? null}
          homeSections={data?.homeSections ?? null}
          loading={loading}
          failed={!loading && !!client?.id && !data}
        />
      </div>

      {/* ─── OLD DESKTOP HOME (hidden, kept for easy rollback) ────── */}
      <div className="hidden">

      {/* Page-level topbar: title + date + sync pill */}
      <div className="px-4 lg:px-8 pt-6 pb-2 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <h1 className="text-[28px] sm:text-[32px] font-semibold text-ink leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
            Today
          </h1>
          <span className="text-ink-4 text-[14px] sm:text-[16px]">· {longDate()}</span>
        </div>
        {hasData && (
          <span className="inline-flex items-center gap-1.5 text-[11px] text-ink-3 bg-ink-7 rounded-full px-2.5 py-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
            Last synced just now
          </span>
        )}
      </div>

      <div className="px-4 lg:px-8 py-4 pb-20">

        {/* ─── HERO ─────────────────────────────────────────────── */}
        <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 sm:px-8 py-6 mb-5 flex flex-col sm:flex-row gap-5">
          <StrategistAvatar strategist={strategist} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-dark mb-2">
              {strategist ? <>Your strategist · {strategist.name}</> : <>Your strategist</>}
            </p>
            <h2
              className="text-[22px] sm:text-[26px] leading-[1.35] tracking-tight font-normal text-ink max-w-[800px]"
              style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
            >
              {renderGreeting({ state, StrategistFirst, totalNeeds, urgentCount })}
            </h2>

            <div className="mt-4 flex items-center gap-2.5 flex-wrap">
              <Link
                href="/dashboard/briefs"
                className="inline-flex items-center gap-1.5 bg-brand hover:bg-brand-dark text-white rounded-full px-4 py-2 text-[13px] font-semibold"
              >
                Open briefing
              </Link>
              <Link
                href={strategist ? `/dashboard/messages?to=${strategist.id}` : '/dashboard/messages'}
                className="inline-flex items-center gap-1.5 bg-white hover:bg-brand-tint text-brand-dark ring-1 ring-brand rounded-full px-4 py-2 text-[13px] font-semibold"
              >
                Message {strategistFirst}
              </Link>
              <span className="text-[11.5px] text-ink-4 ml-1">
                Sent {timeOfDay()} · 2 min read
              </span>
            </div>
          </div>
        </section>

        {/* Two-column grid */}
        <div className="lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-5 space-y-5 lg:space-y-0">

          {/* ─── LEFT ─── */}
          <div className="flex flex-col gap-5">

            {/* Listing health — the "do one thing today" front door */}
            {health && (() => {
              const topFix = health.checks.find(c => c.status === 'fail' && c.fixHref)
              const color = health.grade === 'great' ? '#16a34a' : health.grade === 'good' ? '#d97706' : '#dc2626'
              const C = 2 * Math.PI * 24
              return (
                <Link
                  href={topFix?.fixHref ?? '/dashboard/local-seo/health'}
                  className="block rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5 hover:ring-brand/30 transition-all"
                >
                  <div className="flex items-center gap-4">
                    <div className="relative w-14 h-14 flex-shrink-0">
                      <svg viewBox="0 0 56 56" className="w-14 h-14 -rotate-90">
                        <circle cx="28" cy="28" r="24" fill="none" stroke="var(--ink-6,#e5e5ea)" strokeWidth="6" />
                        <circle cx="28" cy="28" r="24" fill="none" stroke={color} strokeWidth="6" strokeLinecap="round" strokeDasharray={C} strokeDashoffset={(1 - health.score / 100) * C} />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center text-[17px] font-bold text-ink">{health.score}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Listing health</div>
                      {topFix ? (
                        <p className="text-sm text-ink mt-0.5"><span className="font-semibold">Next win:</span> {topFix.label}</p>
                      ) : (
                        <p className="text-sm text-ink mt-0.5 font-semibold">Your Google listing looks great</p>
                      )}
                    </div>
                    <span className="text-[12px] font-medium text-brand-dark flex-shrink-0">{topFix ? (topFix.fixLabel ?? 'Fix') : 'View'} →</span>
                  </div>
                </Link>
              )
            })()}

            {/* Needs you today */}
            <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
              <div className="flex items-center justify-between mb-3.5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 whitespace-nowrap">
                  {hasData && totalNeeds > 0 ? `Needs you today · ${totalNeeds}` : 'Needs you today'}
                </div>
                {hasData && totalNeeds > 0 && (
                  <Link href="/dashboard/inbox" className="text-[12px] text-brand-dark hover:underline">
                    All approvals →
                  </Link>
                )}
              </div>

              {state === 'empty' && <ConnectChecklist />}
              {hasData && totalNeeds === 0 && <ClearedState strategistFirst={strategistFirst} />}
              {hasData && totalNeeds > 0 && (
                <div>
                  {visibleAgenda.map((item, i) => (
                    <AgendaRow key={item.id} item={item} isFirst={i === 0} onReview={() => fireToast('Opening review…')} />
                  ))}
                </div>
              )}
            </section>

            {/* This week vs last — 4 stat tiles with sparklines */}
            {hasData && data && (
              <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-3.5">
                  This week vs last
                </div>
                <div className="grid grid-cols-2 gap-5">
                  <StatTile label="Foot traffic" card={data.pulse.customers} />
                  <StatTile label="Reach" card={data.pulse.reach} />
                  <StatTile
                    label="Avg rating"
                    card={{
                      ...data.pulse.reputation,
                      value: data.recentReviews.avgRating !== null ? data.recentReviews.avgRating.toFixed(1) : data.pulse.reputation.value,
                    }}
                  />
                  <StatTile label="Posts" card={postsTile(data)} />
                </div>
              </section>
            )}
          </div>

          {/* ─── RIGHT ─── */}
          <div className="flex flex-col gap-5">

            {/* Request work */}
            <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 mb-3.5">
                Request work
              </div>
              <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                <RequestTile icon={<Sparkles className="w-4 h-4" />} label="New post" sub="Caption + creative" href="/dashboard/social/request?type=post" />
                <RequestTile icon={<ImgIcon className="w-4 h-4" />} label="Design" sub="Graphic / poster" href="/dashboard/social/request?type=design" />
                <RequestTile icon={<Video className="w-4 h-4" />} label="Video" sub="Reel / short form" href="/dashboard/social/request?type=video" />
                <RequestTile icon={<Megaphone className="w-4 h-4" />} label="Campaign" sub="Multi-channel" href="/dashboard/social/request?type=campaign" />
              </div>
              <Link
                href="/dashboard/social/request"
                className="block bg-brand hover:bg-brand-dark text-white text-center rounded-xl py-2.5 text-[13px] font-semibold"
              >
                + Custom request
              </Link>
            </section>

            {/* Latest reviews */}
            {hasData && data && (
              <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Latest reviews</div>
                  {data.recentReviews.avgRating !== null && (
                    <span className="text-[11px] text-ink-3">
                      ★ {data.recentReviews.avgRating.toFixed(1)} · {data.recentReviews.total} total
                    </span>
                  )}
                </div>
                {data.recentReviews.items.length === 0 ? (
                  <p className="text-[12px] text-ink-3 py-2 leading-relaxed">
                    Reviews will appear here as they come in.
                  </p>
                ) : (
                  data.recentReviews.items.map((r, i) => <ReviewRow key={r.id} review={r} isFirst={i === 0} />)
                )}
              </section>
            )}

            {/* Coming up */}
            {hasData && (data?.comingUp ?? []).length > 0 && (
              <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
                <div className="flex items-center justify-between mb-3">
                  <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Coming up</div>
                  <Link href="/dashboard/calendar" className="text-[11.5px] text-brand-dark hover:underline">Calendar →</Link>
                </div>
                <ul className="space-y-2">
                  {(data?.comingUp ?? []).slice(0, 4).map(e => <ComingUpRow key={e.date + e.label} event={e} />)}
                </ul>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white rounded-2xl shadow-xl flex items-center gap-3 px-4 py-2.5 z-50 text-[13px]">
          <Check className="w-4 h-4 text-brand flex-shrink-0" />
          {toast}
        </div>
      )}
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function StrategistAvatar({ strategist }: { strategist: PrimaryStrategist | null }) {
  if (strategist?.avatarUrl) {
    /* eslint-disable-next-line @next/next/no-img-element */
    return <img src={strategist.avatarUrl} alt={strategist.name} className="rounded-full object-cover flex-shrink-0" style={{ width: 56, height: 56 }} />
  }
  if (strategist) {
    return (
      <div
        className="rounded-full text-white grid place-items-center flex-shrink-0 font-medium text-[19px]"
        style={{
          width: 56, height: 56,
          background: 'linear-gradient(135deg, #c9a880, #8b6b45)',
          fontFamily: 'var(--font-playfair, "Playfair Display"), serif',
        }}
      >
        {strategist.initials}
      </div>
    )
  }
  return (
    <div
      className="rounded-full text-white grid place-items-center flex-shrink-0"
      style={{
        width: 56, height: 56,
        background: 'linear-gradient(135deg, #c9a880, #8b6b45)',
      }}
    >
      <UsersIcon className="w-6 h-6 opacity-90" />
    </div>
  )
}

function renderGreeting({
  state, StrategistFirst, totalNeeds, urgentCount,
}: {
  state: 'empty' | 'partial' | 'steady'
  StrategistFirst: string
  totalNeeds: number
  urgentCount: number
}) {
  const em = (s: string) => <em key={s} className="not-italic font-medium text-brand-dark">{s}</em>
  if (state === 'empty') {
    return (
      <>Welcome to Apnosh. {StrategistFirst} will be in touch within 24 hours of your first connection — start by connecting Google Business below.</>
    )
  }
  if (totalNeeds === 0) {
    return <>Morning — you&rsquo;re {em('all clear')}. {StrategistFirst} is working on what&rsquo;s next; nothing needs you today.</>
  }
  const needsPhrase = `${totalNeeds} thing${totalNeeds === 1 ? '' : 's'} need${totalNeeds === 1 ? 's' : ''} you today`
  if (state === 'partial') {
    return (
      <>Good morning. {StrategistFirst} drafted your first updates — {em(needsPhrase)}{urgentCount > 0 ? ', one urgent.' : '.'} More posts queue the moment you connect Instagram.</>
    )
  }
  return (
    <>Good morning. {StrategistFirst} has been busy: {em(needsPhrase)}{urgentCount > 0 ? `, ${urgentCount} urgent.` : '.'} Everything else is moving on its own.</>
  )
}

function ConnectChecklist() {
  const items = [
    { l: 'Connect Google Business Profile', n: '1 of 3', active: true, href: '/dashboard/connected-accounts' },
    { l: 'Connect Instagram', n: '2 of 3', href: '/dashboard/connected-accounts' },
    { l: 'Upload brand assets', n: '3 of 3', href: '/dashboard/settings/brand' },
  ]
  return (
    <div className="py-1 text-[13px] text-ink-2">
      {items.map((r, i) => (
        <Link key={i} href={r.href} className={`flex items-center gap-2.5 py-2.5 ${i ? 'border-t border-ink-6' : ''} hover:bg-ink-7 -mx-2 px-2 rounded`}>
          <Plug className={`w-4 h-4 flex-shrink-0 ${r.active ? 'text-brand' : 'text-ink-3'}`} />
          <span className="flex-1">{r.l}</span>
          <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${r.active ? 'bg-brand/15 text-brand-dark' : 'bg-ink-7 text-ink-3'}`}>
            {r.n}
          </span>
        </Link>
      ))}
    </div>
  )
}

function ClearedState({ strategistFirst }: { strategistFirst: string }) {
  return (
    <div className="py-2 flex items-center gap-3.5 px-1">
      <div className="w-11 h-11 rounded-full bg-brand/15 text-brand-dark grid place-items-center flex-shrink-0">
        <Check className="w-5 h-5" />
      </div>
      <div>
        <p className="text-[15px] font-medium text-ink">You&rsquo;re clear — {strategistFirst} has it from here.</p>
        <p className="text-[12px] text-ink-3 mt-0.5">Nothing needs your sign-off. Come back tomorrow morning.</p>
      </div>
    </div>
  )
}

function AgendaRow({ item, isFirst, onReview }: { item: AgendaItem; isFirst: boolean; onReview: () => void }) {
  const tone =
    item.urgency === 'high'
      ? {
          row: 'bg-rose-50/60',
          tag: 'text-rose-700',
          pill: 'bg-rose-100 text-rose-900',
          border: 'border-l-[3px] border-rose-600',
          dueLabel: 'DUE TODAY',
          showClock: true,
          btn: 'bg-rose-600 hover:bg-rose-700 text-white',
          icon: '⚠️',
        }
      : item.urgency === 'medium'
      ? {
          row: 'bg-white',
          tag: 'text-amber-700',
          pill: 'bg-amber-100 text-amber-900',
          border: 'border-l-[3px] border-amber-500',
          dueLabel: 'APPROVE BY 5PM',
          showClock: true,
          btn: 'bg-brand hover:bg-brand-dark text-white',
          icon: iconForType(item.type),
        }
      : {
          row: 'bg-white',
          tag: 'text-ink-3',
          pill: 'bg-ink-7 text-ink-3',
          border: 'border-l-[3px] border-transparent',
          dueLabel: 'NO RUSH',
          showClock: false,
          btn: 'bg-brand hover:bg-brand-dark text-white',
          icon: iconForType(item.type),
        }
  return (
    <div className={`${tone.row} ${tone.border} -mx-3 px-3 rounded-lg ${isFirst ? '' : 'mt-1'}`}>
      <div className="flex gap-3 py-3 items-center">
        <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-ink-6 grid place-items-center flex-shrink-0 text-[15px]">
          {tone.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className={`text-[9px] font-bold uppercase tracking-[0.08em] ${tone.tag}`}>{item.actionLabel}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${tone.pill}`}>
              {tone.showClock && <Clock className="w-2.5 h-2.5" />}
              {tone.dueLabel}
            </span>
          </div>
          <p className="text-[13px] font-medium text-ink truncate">{item.label}</p>
          {item.detail && <p className="text-[11px] text-ink-3 truncate mt-0.5">{item.detail}</p>}
        </div>
        <Link
          href={item.href}
          onClick={onReview}
          className={`${tone.btn} rounded-full px-3.5 py-1.5 text-[12px] font-semibold flex-shrink-0`}
        >
          Review
        </Link>
      </div>
    </div>
  )
}

function StatTile({ label, card }: { label: string; card: PulseCardData }) {
  const live = card.state === 'live'
  return (
    <div>
      <div className="text-[11px] text-ink-3 mb-1">{label}</div>
      {live ? (
        <>
          <div className="flex items-baseline gap-1.5">
            <span className="text-[22px] font-semibold text-ink tabular-nums leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {card.value ?? '—'}
            </span>
            {card.delta && (
              <span className={`text-[11px] font-medium ${card.up === false ? 'text-rose-600' : 'text-brand-dark'}`}>
                {card.delta}
              </span>
            )}
          </div>
          {card.series && card.series.length > 0 && (
            <Sparkline values={card.series} color="var(--color-brand-dark, #2e9a78)" />
          )}
        </>
      ) : (
        <>
          <div className="text-[18px] text-ink-4 font-medium leading-none">—</div>
          <p className="text-[10.5px] text-ink-4 mt-1.5 truncate">{card.connectLabel ?? card.subtitle ?? 'Not connected'}</p>
        </>
      )}
    </div>
  )
}

function postsTile(data: DashboardLoad): PulseCardData {
  /* Derive a "posts this week" stat from the existing weekly-activity
     count. Same shape as a pulse card so StatTile renders it the same. */
  const count = data.weekly.generatedThisWeek ?? 0
  return {
    label: 'Posts',
    state: count > 0 ? 'live' : 'no-data',
    value: count.toString(),
    delta: null,
    series: count > 0 ? [count * 0.6, count * 0.7, count * 0.85, count] : undefined,
    connectLabel: 'No posts this week',
  }
}

function RequestTile({ icon, label, sub, href }: { icon: React.ReactNode; label: string; sub: string; href: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl ring-1 ring-ink-6 hover:ring-brand hover:bg-brand-tint/40 transition-colors p-3 flex items-start gap-2.5"
    >
      <span className="text-brand-dark mt-0.5 flex-shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-[12.5px] font-semibold text-ink leading-tight">{label}</p>
        <p className="text-[10.5px] text-ink-3 mt-0.5 leading-tight">{sub}</p>
      </div>
    </Link>
  )
}

function ReviewRow({ review, isFirst }: { review: RecentReview; isFirst: boolean }) {
  const stars = '★'.repeat(review.rating) + '☆'.repeat(Math.max(0, 5 - review.rating))
  return (
    <div className={`py-3 flex gap-2.5 ${isFirst ? '' : 'border-t border-ink-6'}`}>
      <div className="w-6 h-6 rounded-full bg-brand/15 text-brand-dark grid place-items-center text-[10px] font-semibold flex-shrink-0" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
        {review.authorName.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
          <span className="font-medium text-ink">{review.authorName}</span>
          <span className="text-amber-600 tracking-tight">{stars}</span>
          <span className="text-ink-4">· {review.source} · {relTime(review.postedAt)}</span>
          {review.needsReply && <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-900">needs reply</span>}
          {review.replied && <span className="text-[9px] text-ink-4">· replied</span>}
        </div>
        {review.text && <p className="text-[12px] text-ink-2 leading-snug mt-1">&ldquo;{review.text}&rdquo;</p>}
      </div>
    </div>
  )
}

function ComingUpRow({ event }: { event: ComingUpItem }) {
  const isNothingQueued = event.queuedCount === 0
  return (
    <li className="flex items-start gap-3">
      <div className="flex-shrink-0 w-10 rounded-md bg-ink-7 grid place-items-center py-1.5 text-center">
        <div className="text-[9px] font-bold uppercase tracking-wider text-ink-4">
          {new Date(event.date).toLocaleDateString('en-US', { month: 'short' }).toUpperCase()}
        </div>
        <div className="text-[14px] font-semibold text-ink leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          {new Date(event.date).getDate()}
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12.5px] font-medium text-ink leading-tight">{event.label}</p>
        {isNothingQueued ? (
          <Link href="/dashboard/social/request" className="inline-block mt-1 text-[11px] font-semibold text-amber-700 hover:underline">
            Nothing queued — draft now →
          </Link>
        ) : (
          <p className="text-[10.5px] text-brand-dark mt-1">● {event.queuedCount} queued</p>
        )}
      </div>
    </li>
  )
}

// ─── Sparkline ──────────────────────────────────────────────────────

function Sparkline({ values, color = '#2e9a78' }: { values: number[]; color?: string }) {
  if (values.length < 2) return null
  const w = 100, h = 24
  const min = Math.min(...values), max = Math.max(...values)
  const range = max - min || 1
  const step = w / (values.length - 1)
  const pts = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${(h - ((v - min) / range) * h).toFixed(1)}`)
    .join(' ')
  const area = `${pts} L${w},${h} L0,${h} Z`
  return (
    <svg className="block mt-1.5" width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <path d={area} fill={color} opacity="0.1" />
      <path d={pts} stroke={color} strokeWidth="1.5" fill="none" />
    </svg>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function iconForType(t: AgendaItem['type']): string {
  return ({ approval: '✓', review: '★', connection: '🔌', draft: '✎', task: '☑', suggestion: '✦' } as Record<string, string>)[t] ?? '•'
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return '1d'
  return `${d}d`
}

function longDate(): string {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
}

function timeOfDay(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
