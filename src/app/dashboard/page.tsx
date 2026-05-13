'use client'

/**
 * /dashboard — Direction D layout from the Claude Design export.
 *
 * Narrative greeting from the primary strategist + goal anchor at the
 * top, then a 60/40 split: Action on the left (urgency-tiered approvals
 * and "this week ahead"), Awareness on the right (latest reviews and
 * "since you last checked" timeline). Pulls everything from the
 * consolidated /api/dashboard/load endpoint.
 *
 * Empty / partial / steady states branch on what's connected. Strategist
 * name is real (role_assignments.is_primary_contact + profiles); falls
 * back to "your strategist" when none is assigned.
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react'
import Link from 'next/link'
import { useClient } from '@/lib/client-context'
import AdminClientPicker from '@/components/admin/admin-client-picker'
import {
  Sparkles, MessageSquare, Calendar as CalIcon, Check, Clock,
  Plug, Loader2, Pencil,
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

interface TimelineEvent {
  id: string
  whenLabel: string
  text: string
  emphasis: 'win' | 'info' | 'mute'
  big: boolean
  extra?: string
}

interface ComingUpItem {
  date: string
  label: string
  hook: string
  weight: number
  daysUntil: number
  queuedCount: number
}

interface GoalCard {
  slug: string
  priority: number
  displayName: string
  state: 'live' | 'no-data' | 'flat'
  delta?: number | null
  up?: boolean | null
  signal: string
  benchmarkLine?: string | null
  href?: string
  connectLabel?: string
}

interface DashboardLoad {
  agenda: AgendaItem[]
  goalCards: GoalCard[]
  primaryStrategist: PrimaryStrategist | null
  recentReviews: RecentReviewsBundle
  sinceLastChecked: TimelineEvent[]
  comingUp: ComingUpItem[]
  setup: { shapeSet: boolean; goalsSet: boolean; anyChannelConnected: boolean }
  counts: { unansweredReviews: number; pendingApprovals: number }
}

// ─── Page ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { client, isAdmin, loading: clientLoading } = useClient()
  const [data, setData] = useState<DashboardLoad | null>(null)
  const [loading, setLoading] = useState(true)
  const [toast, setToast] = useState<{ label: string; undoIn: number } | null>(null)
  const toastTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const [confirmGoal, setConfirmGoal] = useState(false)
  const [askOpen, setAskOpen] = useState(false)
  const askRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (askRef.current && !askRef.current.contains(e.target as Node)) setAskOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    ;(async () => {
      setLoading(true)
      try {
        const r = await fetch(`/api/dashboard/load?clientId=${encodeURIComponent(client.id)}`)
        if (!r.ok) return
        const j = (await r.json()) as DashboardLoad
        if (!cancelled) setData(j)
      } catch {
        /* silent — falls back to empty state */
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [client?.id])

  const fireToast = useCallback((label: string) => {
    if (toastTimer.current) clearInterval(toastTimer.current)
    let secs = 12
    setToast({ label, undoIn: secs })
    toastTimer.current = setInterval(() => {
      secs -= 1
      if (secs <= 0) {
        if (toastTimer.current) clearInterval(toastTimer.current)
        setToast(null)
      } else {
        setToast(prev => prev && { ...prev, undoIn: secs })
      }
    }, 1000)
  }, [])

  const strategist = data?.primaryStrategist ?? null
  const strategistFirst = strategist?.firstName ?? 'your strategist'
  const StrategistFirst = strategist?.firstName ?? 'Your strategist'

  /* Three top-level states. */
  const state: 'empty' | 'partial' | 'steady' = useMemo(() => {
    if (!data) return 'empty'
    if (!data.setup.anyChannelConnected) return 'empty'
    const goalLive = data.goalCards.some(g => g.state === 'live')
    if (goalLive && data.recentReviews.items.length > 0) return 'steady'
    return 'partial'
  }, [data])

  const hasData = state !== 'empty'
  const isCleared = hasData && (data?.agenda ?? []).filter(a => a.urgency === 'high' || a.urgency === 'medium').length === 0

  const topGoal = useMemo(() => (data?.goalCards ?? []).find(g => g.priority === 1) ?? data?.goalCards[0] ?? null, [data])

  const { urgentItem, otherItems } = useMemo(() => {
    const items = data?.agenda ?? []
    const high = items.find(a => a.urgency === 'high')
    const rest = items.filter(a => a !== high).slice(0, 4)
    return { urgentItem: high ?? null, otherItems: rest }
  }, [data])

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

  const urgentCount = (data?.agenda ?? []).filter(a => a.urgency === 'high').length
  const totalNeeds = (data?.agenda ?? []).filter(a => a.urgency !== 'low').length

  return (
    <div className="relative">
      {/* Page-level topbar */}
      <div className="sticky top-0 z-20 bg-white/95 backdrop-blur-md border-b border-ink-6 px-4 lg:px-8 h-14 flex items-center gap-4">
        <div className="font-semibold text-[15px] text-ink" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          Today
          <span className="text-ink-4 font-normal ml-2 text-[12px]">· {nowLabel()}</span>
        </div>
        <nav className="hidden md:flex items-center gap-5 ml-4 text-[12.5px] text-ink-3">
          <span className="text-ink font-semibold border-b-2 border-brand pb-[14px] -mb-[15px]">Today</span>
          <Link href="/dashboard/social/performance" className="hover:text-ink">Performance</Link>
          <Link href="/dashboard/calendar" className="hover:text-ink">Calendar</Link>
          <Link href="/dashboard/social/library" className="hover:text-ink">Library</Link>
        </nav>
        <div className="flex-1" />
        <Link
          href={strategist ? `/dashboard/messages?to=${strategist.id}` : '/dashboard/messages'}
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-6 hover:ring-ink-4 rounded-full px-3 py-1.5"
        >
          <MessageSquare className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Message {strategistFirst}</span>
        </Link>
      </div>

      <div className="px-4 lg:px-8 py-6 lg:grid lg:grid-cols-[1.5fr_1fr] lg:gap-5 pb-24">

        {/* ─── HERO ─────────────────────────────────────────────── */}
        <section
          className="lg:col-span-2 rounded-2xl bg-white ring-1 ring-ink-6 px-6 sm:px-8 py-6 mb-5 flex flex-col sm:flex-row gap-5"
          style={{ background: 'linear-gradient(180deg, rgba(74,189,152,.06) 0%, #fff 55%)' }}
        >
          <StrategistAvatar strategist={strategist} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.10em] text-brand-dark mb-2">
              {strategist ? `${strategist.name.toUpperCase()} · YOUR STRATEGIST` : 'YOUR STRATEGIST'}
              {strategist && <span className="text-ink-4 font-medium ml-2 normal-case tracking-wide">· Sent {timeOfDay()}</span>}
            </p>
            <h2
              className="text-[20px] sm:text-[22px] leading-snug tracking-tight font-normal text-ink max-w-[760px]"
              style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
            >
              {renderGreeting({ state, strategistFirst, StrategistFirst, urgentCount, totalNeeds, isCleared })}
            </h2>

            {hasData && (
              <p className="mt-2.5 text-[11.5px] text-ink-3 leading-relaxed">
                {strategistFirst} is on top of <strong className="text-ink-2 font-medium">{data?.counts.pendingApprovals ?? 0} approval{(data?.counts.pendingApprovals ?? 0) === 1 ? '' : 's'}</strong> and{' '}
                <strong className="text-ink-2 font-medium">{data?.counts.unansweredReviews ?? 0} review{(data?.counts.unansweredReviews ?? 0) === 1 ? '' : 's'}</strong> this week.
              </p>
            )}

            <GoalAnchor goal={topGoal} hasData={hasData} onEditGoal={() => setConfirmGoal(true)} />
          </div>
        </section>

        {/* ─── LEFT — Action ────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
            <div className="flex items-center justify-between mb-3.5">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3 whitespace-nowrap">
                {hasData && !isCleared ? `Needs you today · ${totalNeeds}` : 'Needs you today'}
              </div>
              {hasData && !isCleared && (
                <Link href="/dashboard/inbox" className="text-[12px] text-brand-dark hover:underline">
                  All approvals →
                </Link>
              )}
            </div>

            {state === 'empty' && <ConnectChecklist />}
            {isCleared && <ClearedState strategistFirst={strategistFirst} />}

            {hasData && !isCleared && (
              <div>
                {urgentItem && <UrgentItem item={urgentItem} strategistFirst={strategistFirst} onApprove={() => fireToast('Reply approved. The card moves to Since you last checked.')} />}
                {otherItems.map((item, i) => (
                  <AgendaRow
                    key={item.id}
                    item={item}
                    isFirst={i === 0 && !urgentItem}
                    onApprove={() => fireToast(`${item.actionLabel} sent.`)}
                  />
                ))}
              </div>
            )}
          </section>

          {hasData && (data?.comingUp ?? []).length > 0 && (
            <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">This week ahead</div>
                <Link href="/dashboard/calendar" className="text-[11.5px] text-brand-dark hover:underline">Full calendar →</Link>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(data?.comingUp ?? []).slice(0, 4).map(e => <WeekAheadCard key={e.date + e.label} event={e} />)}
              </div>
            </section>
          )}
        </div>

        {/* ─── RIGHT — Awareness ────────────────────────────────── */}
        <div className="flex flex-col gap-5 mt-5 lg:mt-0">

          {hasData && data && (
            <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
              <div className="flex items-center justify-between mb-3">
                <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">Latest reviews</div>
                <div className="flex items-center gap-2.5">
                  {data.recentReviews.avgRating !== null && (
                    <span className="text-[11px] text-ink-3">
                      ★ {data.recentReviews.avgRating.toFixed(1)} · {data.recentReviews.total} total
                    </span>
                  )}
                  <Link href="/dashboard/local-seo/reviews" className="text-[11.5px] text-brand-dark hover:underline">See all →</Link>
                </div>
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

          <section className="rounded-2xl bg-white ring-1 ring-ink-6 px-6 py-5">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-ink-3">
                Since you last checked
                {data?.sinceLastChecked?.[0] && (
                  <span className="font-normal normal-case tracking-normal text-ink-4 ml-1.5 text-[11px]">
                    · {data.sinceLastChecked[0].whenLabel.toLowerCase()}
                  </span>
                )}
              </div>
            </div>
            {(!data || data.sinceLastChecked.length === 0) ? (
              <p className="text-[12px] text-ink-3 py-2 leading-relaxed">
                Activity will appear once your strategist is on the account. First items typically within 48h of kickoff.
              </p>
            ) : (
              <TimelineList events={data.sinceLastChecked} />
            )}
          </section>
        </div>
      </div>

      {/* Toast w/ undo */}
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-ink text-white rounded-2xl shadow-xl flex items-center gap-3.5 px-4 py-2.5 z-50 min-w-[340px] max-w-[90vw]">
          <Check className="w-4 h-4 text-brand flex-shrink-0" />
          <span className="flex-1 text-[13px]">{toast.label}</span>
          <button
            onClick={() => { setToast(null); if (toastTimer.current) clearInterval(toastTimer.current) }}
            className="inline-flex items-center gap-1.5 bg-white/10 hover:bg-white/15 ring-1 ring-white/20 text-white rounded-full px-2.5 py-1 text-[12px] font-medium"
          >
            Undo
            <span className="text-[10px] text-white/60 tabular-nums">{toast.undoIn}s</span>
          </button>
        </div>
      )}

      {confirmGoal && (
        <div className="fixed inset-0 bg-ink/45 z-50 grid place-items-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md shadow-2xl">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-brand-dark mb-2">Change top goal</p>
            <h3 className="text-[18px] font-medium mb-2.5" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              Switching your goal resets your progress baseline.
            </h3>
            <p className="text-[12.5px] text-ink-3 leading-relaxed mb-4">
              The trend numbers above will recalculate against the new target, and {strategistFirst} will rework next week&rsquo;s plan around it. Your history isn&rsquo;t deleted — past goals stay in <strong>Settings › Goals</strong>.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmGoal(false)} className="text-[12.5px] font-medium ring-1 ring-ink-5 text-ink-2 rounded-full px-3.5 py-1.5 hover:bg-ink-7">Cancel</button>
              <Link
                href="/dashboard/goals"
                onClick={() => setConfirmGoal(false)}
                className="text-[12.5px] font-semibold bg-brand hover:bg-brand-dark text-white rounded-full px-3.5 py-1.5"
              >
                Continue to goal picker
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Ask FAB */}
      <div ref={askRef} className="fixed bottom-6 right-6 z-30">
        {askOpen && (
          <div className="absolute bottom-full mb-2.5 right-0 w-60 bg-white rounded-2xl ring-1 ring-ink-5 shadow-2xl overflow-hidden">
            {[
              { icon: <Sparkles className="w-4 h-4" />, t: 'Request content', s: 'Post, design, reel, campaign', href: '/dashboard/social/request' },
              { icon: <MessageSquare className="w-4 h-4" />, t: 'Send a message', s: 'Quick question or note', href: '/dashboard/messages' },
              { icon: <CalIcon className="w-4 h-4" />, t: 'Book a call', s: `30 min with ${strategistFirst}`, href: '/dashboard/messages?topic=book-call' },
              { icon: <Pencil className="w-4 h-4" />, t: 'Share an idea', s: 'No format needed', href: '/dashboard/messages?topic=idea' },
            ].map((x, i) => (
              <Link
                key={i}
                href={x.href}
                onClick={() => setAskOpen(false)}
                className="flex items-center gap-2.5 w-full px-3.5 py-2.5 text-left hover:bg-ink-7 transition-colors border-t border-ink-6 first:border-t-0"
              >
                <span className="text-brand flex-shrink-0">{x.icon}</span>
                <span>
                  <span className="block text-[12.5px] font-semibold text-ink">{x.t}</span>
                  <span className="block text-[11px] text-ink-3">{x.s}</span>
                </span>
              </Link>
            ))}
          </div>
        )}
        <button
          onClick={() => setAskOpen(o => !o)}
          className="bg-brand hover:bg-brand-dark text-white rounded-full px-5 py-3 shadow-xl inline-flex items-center gap-2 text-[13px] font-semibold"
        >
          <Sparkles className="w-3.5 h-3.5" />
          Ask {strategistFirst}
          <span className="text-[11px] opacity-70">{askOpen ? '▾' : '▴'}</span>
        </button>
      </div>
    </div>
  )
}

// ─── Sub-components ──────────────────────────────────────────────────

function StrategistAvatar({ strategist }: { strategist: PrimaryStrategist | null }) {
  return strategist?.avatarUrl ? (
    /* eslint-disable-next-line @next/next/no-img-element */
    <img src={strategist.avatarUrl} alt={strategist.name} className="rounded-full object-cover flex-shrink-0" style={{ width: 52, height: 52 }} />
  ) : (
    <div
      className="rounded-full text-white grid place-items-center flex-shrink-0 font-medium text-[18px]"
      style={{
        width: 52, height: 52,
        background: 'linear-gradient(135deg, #c9a880, #8b6b45)',
        fontFamily: 'var(--font-playfair, "Playfair Display"), serif',
      }}
    >
      {strategist?.initials ?? '?'}
    </div>
  )
}

function renderGreeting({
  state, strategistFirst, StrategistFirst, urgentCount, totalNeeds, isCleared,
}: {
  state: 'empty' | 'partial' | 'steady'
  strategistFirst: string
  StrategistFirst: string
  urgentCount: number
  totalNeeds: number
  isCleared: boolean
}) {
  const em = (s: string) => <em key={s} className="not-italic font-medium text-brand-dark">{s}</em>
  if (state === 'empty') {
    return <>Welcome to Apnosh. I&rsquo;ll be your strategist. Connect three sources below and I&rsquo;ll have your first briefing ready within 24 hours.</>
  }
  if (isCleared) {
    return <>Morning — you&rsquo;re {em('all clear')}. {StrategistFirst} is working on what&rsquo;s next; nothing needs you today.</>
  }
  if (state === 'partial') {
    return (
      <>Good morning. {StrategistFirst} drafted your first updates — {em(`${totalNeeds} thing${totalNeeds === 1 ? '' : 's'} need${totalNeeds === 1 ? 's' : ''} you`)}{urgentCount > 0 ? ', one urgent.' : '.'} More posts queue the moment you connect Instagram.</>
    )
  }
  return (
    <>Good morning. {strategistFirst} has been busy: {em(`${totalNeeds} thing${totalNeeds === 1 ? '' : 's'} need${totalNeeds === 1 ? 's' : ''} you`)}{urgentCount > 0 ? `, ${urgentCount} urgent.` : '.'} Everything else is moving on its own.</>
  )
}

function GoalAnchor({ goal, hasData, onEditGoal }: { goal: GoalCard | null; hasData: boolean; onEditGoal: () => void }) {
  if (!goal) return null
  const live = goal.state === 'live'
  return (
    <div className="mt-3.5 flex flex-wrap items-center gap-3 px-3.5 py-2.5 rounded-xl bg-white ring-1 ring-ink-6 max-w-[760px]">
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="w-1.5 h-1.5 rounded-full bg-brand" />
        <span className="text-[10.5px] font-bold uppercase tracking-[0.08em] text-ink-3">Top goal</span>
      </div>
      <span className="text-[12.5px] font-medium text-ink whitespace-nowrap">{goal.displayName}</span>
      {live && hasData ? (
        <>
          <div className="flex-1 h-1.5 bg-ink-6 rounded-full overflow-hidden max-w-[180px] min-w-[80px] relative">
            <div className="absolute inset-y-0 left-0 bg-brand rounded-full" style={{ width: '71%' }} />
          </div>
          <span className="text-[12px] text-ink-2 whitespace-nowrap">
            {goal.signal}{' '}
            <span className="text-brand-dark font-medium">{goal.delta ? `${goal.up ? '↑' : '↓'} ${Math.abs(goal.delta)}` : ''}</span>
          </span>
        </>
      ) : (
        <>
          <div className="flex-1" />
          <span className="text-[11.5px] text-ink-4">{goal.connectLabel ?? 'Connect to track'}</span>
        </>
      )}
      <button onClick={onEditGoal} className="text-[11px] font-medium ring-1 ring-ink-5 text-ink-2 hover:text-ink rounded-full px-2.5 py-1 flex-shrink-0">
        Edit goal
      </button>
    </div>
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
    <div className="py-2">
      <div className="flex items-center gap-3.5 py-3 px-1">
        <div className="w-11 h-11 rounded-full bg-brand/15 text-brand-dark grid place-items-center flex-shrink-0">
          <Check className="w-5 h-5" />
        </div>
        <div>
          <p className="text-[15px] font-medium text-ink">You&rsquo;re clear — {strategistFirst} has it from here.</p>
          <p className="text-[12px] text-ink-3 mt-0.5">Nothing needs your sign-off. Come back tomorrow morning.</p>
        </div>
      </div>
    </div>
  )
}

function UrgentItem({ item, strategistFirst, onApprove }: { item: AgendaItem; strategistFirst: string; onApprove: () => void }) {
  return (
    <div
      className="rounded-xl p-3.5 mb-2 border-l-[3px] border-rose-600"
      style={{ background: 'rgba(254,226,226,.45)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-white ring-1 ring-rose-200 grid place-items-center flex-shrink-0 text-rose-700 text-[12px] font-semibold">
          !
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-rose-700">{item.actionLabel}</span>
            <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-900">
              <Clock className="w-2.5 h-2.5" />
              DUE TODAY
            </span>
          </div>
          <p className="text-[13.5px] font-medium text-ink leading-snug">{item.label}</p>
          {item.detail && <p className="text-[12px] text-ink-2 mt-0.5 italic leading-snug">&ldquo;{item.detail}&rdquo;</p>}
          <div className="mt-3 bg-white rounded-lg ring-1 ring-rose-200 p-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-wider text-rose-900 mb-1 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-amber-600" />
              {strategistFirst}&rsquo;s draft is ready
            </p>
            <Link href={item.href} className="block text-[12.5px] text-ink-2 leading-snug hover:text-ink">
              Open to review and approve →
            </Link>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <button onClick={onApprove} className="bg-brand hover:bg-brand-dark text-white rounded-full px-3.5 py-1 text-[12px] font-semibold">
                Approve & post
              </button>
              <Link href={item.href} className="text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-5 rounded-full px-3 py-1">
                Edit text
              </Link>
              <button className="text-[11.5px] text-ink-3 hover:text-ink ml-auto">Skip</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AgendaRow({ item, isFirst, onApprove }: { item: AgendaItem; isFirst: boolean; onApprove: () => void }) {
  const [open, setOpen] = useState(false)
  const urgencyTone =
    item.urgency === 'medium'
      ? { pill: 'bg-amber-100 text-amber-900', border: 'border-l-[3px] border-amber-500' }
      : { pill: 'bg-ink-7 text-ink-3', border: 'border-l-[3px] border-transparent' }
  return (
    <div className={`${urgencyTone.border} -mx-3 px-3 ${isFirst ? '' : 'border-t border-ink-6'}`}>
      <div className="flex gap-3 py-3.5 items-center">
        <div className="w-9 h-9 rounded-lg bg-white ring-1 ring-ink-6 grid place-items-center flex-shrink-0 text-[15px]">
          {iconForType(item.type)}
        </div>
        <div className="flex-1 min-w-0 cursor-pointer" onClick={() => setOpen(o => !o)}>
          <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
            <span className="text-[9px] font-bold uppercase tracking-[0.08em] text-brand-dark">{item.actionLabel}</span>
            <span className={`inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${urgencyTone.pill}`}>
              {item.urgency === 'medium' && <Clock className="w-2.5 h-2.5" />}
              {item.urgency === 'medium' ? 'Soon' : 'No rush'}
            </span>
          </div>
          <p className="text-[13px] font-medium text-ink truncate">{item.label}</p>
          {item.detail && <p className="text-[11px] text-ink-3 truncate">{item.detail}</p>}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onApprove} className="bg-brand hover:bg-brand-dark text-white rounded-full px-3 py-1 text-[11.5px] font-semibold">
            {item.actionLabel}
          </button>
          <Link href={item.href} className="text-[11.5px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-5 rounded-full px-2.5 py-1">
            View
          </Link>
        </div>
      </div>
      {open && item.detail && (
        <div className="pb-3 pl-[50px] -mt-1">
          <p className="text-[12.5px] text-ink-2 italic bg-white ring-1 ring-ink-6 rounded-lg p-2.5">&ldquo;{item.detail}&rdquo;</p>
        </div>
      )}
    </div>
  )
}

function WeekAheadCard({ event }: { event: ComingUpItem }) {
  const isNothingQueued = event.queuedCount === 0
  return (
    <div className={`rounded-lg p-2.5 flex flex-col gap-1 min-h-[78px] ring-1 ${isNothingQueued ? 'bg-amber-50 ring-amber-200' : 'bg-white ring-ink-6'}`}>
      <div className="text-[9.5px] font-bold uppercase tracking-[0.08em] text-ink-4">
        {new Date(event.date).toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }).toUpperCase()}
      </div>
      <p className="text-[12px] font-medium text-ink leading-tight">{event.label}</p>
      <div className="flex-1" />
      {isNothingQueued ? (
        <Link href="/dashboard/social/request" className="text-[11px] text-amber-900 font-semibold hover:underline">Draft now →</Link>
      ) : (
        <p className="text-[10.5px] text-brand-dark">● {event.queuedCount} queued</p>
      )}
    </div>
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

function TimelineList({ events }: { events: TimelineEvent[] }) {
  return (
    <div className="relative pl-4">
      <div className="absolute left-1 top-1.5 bottom-1.5 w-px bg-ink-5" />
      {events.map(e => {
        const dot = e.emphasis === 'win' ? 'bg-brand border-brand' : e.emphasis === 'mute' ? 'bg-white border-ink-5' : 'bg-white border-ink-4'
        return (
          <div key={e.id} className="pb-3 relative">
            <span className={`absolute -left-4 top-[5px] w-2 h-2 rounded-full border-2 ${dot}`} />
            <div className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">{e.whenLabel}</div>
            <p className={`text-[12.5px] mt-0.5 ${e.big ? 'text-ink font-medium' : 'text-ink-2'}`}>{e.text}</p>
            {e.extra && <p className="text-[11px] text-brand-dark mt-0.5">{e.extra}</p>}
          </div>
        )
      })}
    </div>
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

function nowLabel(): string {
  const d = new Date()
  return `${d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`
}

function timeOfDay(): string {
  const d = new Date()
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })
}
