'use client'

/**
 * Mobile-only home view (lg: and below).
 *
 * Drastically simplified from the desktop dashboard. The phone-using
 * owner gets a 30-second scan from top to bottom:
 *
 *   1. Greeting (time-aware) + date
 *   2. Health hero — score-like callout with one big number + delta
 *   3. Needs You — top 3 agenda items as tap-rows
 *   4. This Week — 3-up metric strip (customers / rating / reach)
 *   5. Strategist nudge — compact letter if present
 *   6. Coming Up — next 3 calendar items
 *   7. Footer quick links
 *
 * Receives already-computed data + helpers as props so we don't
 * re-fetch or re-derive anything.
 */

import Link from 'next/link'
import {
  Sparkles, CheckCircle2, AlertCircle, AlertTriangle, ChevronRight,
  ArrowUpRight, ArrowDownRight, Star, Users, Eye, MessageCircle,
  Calendar as CalendarIcon, Plug,
} from 'lucide-react'

/* Local copies of the types from dashboard/page.tsx — keeping inline
   to avoid coupling the redesign to the desktop file. If the API
   shape evolves both views update together via that file. */
interface AgendaItem {
  id: string
  type: 'review' | 'approval' | 'connection' | 'draft' | 'task' | 'suggestion'
  urgency: 'high' | 'medium' | 'low'
  label: string
  detail?: string
  href: string
  actionLabel: string
}

interface PulseCardData {
  label: string
  state: 'live' | 'no-data' | 'loading'
  value?: string
  delta?: string | null
  up?: boolean | null
  subtitle?: string
}

interface ComingUpItem {
  date: string
  label: string
  hook: string
  weight: number
  daysUntil: number
}

interface PrimaryStrategist {
  id: string
  name: string
  firstName: string
  initials: string
}

interface Props {
  displayName: string
  agenda: AgendaItem[]
  pulse: { customers: PulseCardData; reputation: PulseCardData; reach: PulseCardData }
  strategist: PrimaryStrategist | null
  comingUp: ComingUpItem[]
  state: 'empty' | 'partial' | 'steady'
  totalNeeds: number
  /* Optional Apnosh Score, if we want to pass it down later. NULL for now. */
  apnoshScore?: number | null
  scoreDelta?: number | null
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function shortDate(): string {
  const d = new Date()
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

const URGENCY_META: Record<AgendaItem['urgency'], { dot: string; label: string }> = {
  high:   { dot: 'bg-rose-500',    label: 'High' },
  medium: { dot: 'bg-amber-500',   label: 'Med' },
  low:    { dot: 'bg-emerald-500', label: 'Low' },
}

const TYPE_ICONS: Record<AgendaItem['type'], React.ComponentType<{ className?: string }>> = {
  review:     Star,
  approval:   CheckCircle2,
  connection: Plug,
  draft:      Sparkles,
  task:       CalendarIcon,
  suggestion: Sparkles,
}

export default function MobileHome({
  displayName,
  agenda,
  pulse,
  strategist,
  comingUp,
  state,
  totalNeeds,
  apnoshScore = null,
  scoreDelta = null,
}: Props) {
  const top3 = agenda.filter(a => a.urgency !== 'low').slice(0, 3)
  const firstName = displayName.split(' ')[0]

  return (
    <div className="px-4 pt-4 pb-2 space-y-5">
      {/* Greeting */}
      <div>
        <h1 className="text-[24px] font-semibold text-ink leading-tight">
          {greeting()}, {firstName}
        </h1>
        <p className="text-[13px] text-ink-3 mt-0.5">{shortDate()}</p>
      </div>

      {/* Health hero — score or "all good" state */}
      <ScoreHero score={apnoshScore} delta={scoreDelta} totalNeeds={totalNeeds} state={state} />

      {/* Needs You */}
      {top3.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Needs you ({totalNeeds})
            </p>
            <Link
              href="/dashboard/inbox"
              className="text-[12px] font-semibold text-brand-dark active:text-brand"
            >
              See all
            </Link>
          </div>
          <ul className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {top3.map(item => {
              const Icon = TYPE_ICONS[item.type] ?? Sparkles
              const meta = URGENCY_META[item.urgency]
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-3 min-h-[60px] active:bg-ink-7 transition-colors"
                  >
                    <span className={`w-1 h-9 rounded-full ${meta.dot} flex-shrink-0`} />
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-ink-7 text-ink-2 flex-shrink-0">
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink leading-snug line-clamp-1">
                        {item.label}
                      </p>
                      {item.detail && (
                        <p className="text-[11.5px] text-ink-3 mt-0.5 line-clamp-1">
                          {item.detail}
                        </p>
                      )}
                    </div>
                    <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {top3.length === 0 && state !== 'empty' && (
        <section className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-start gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[14px] font-semibold text-ink">All caught up</p>
            <p className="text-[12.5px] text-ink-2 mt-0.5">
              Nothing needs you right now. Nice work.
            </p>
          </div>
        </section>
      )}

      {/* This week — 3-up metric strip */}
      <section>
        <div className="flex items-baseline justify-between mb-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
            This week
          </p>
          <Link
            href="/dashboard/analytics"
            className="text-[12px] font-semibold text-brand-dark active:text-brand"
          >
            Open analytics
          </Link>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <MetricTile icon={Users}        label="Customers"  pulse={pulse.customers} />
          <MetricTile icon={Star}         label="Reputation" pulse={pulse.reputation} />
          <MetricTile icon={Eye}          label="Reach"      pulse={pulse.reach} />
        </div>
      </section>

      {/* Strategist nudge */}
      {strategist && (
        <section className="bg-gradient-to-br from-brand-tint/50 to-white border border-brand/20 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-brand text-white text-[13px] font-bold flex items-center justify-center flex-shrink-0">
              {strategist.initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-dark mb-1">
                {strategist.firstName} · Your strategist
              </p>
              <p className="text-[13.5px] text-ink leading-snug">
                {nudgeMessage({ state, totalNeeds, firstName })}
              </p>
              <div className="flex gap-2 mt-3">
                <Link
                  href={`/dashboard/messages?to=${strategist.id}`}
                  className="inline-flex items-center gap-1 bg-ink text-white text-[12px] font-semibold rounded-full px-3 py-1.5 active:bg-ink-2"
                >
                  <MessageCircle className="w-3.5 h-3.5" />
                  Reply
                </Link>
                <Link
                  href="/dashboard/weekly-briefs"
                  className="inline-flex items-center gap-1 bg-white border border-ink-6 text-ink-2 text-[12px] font-semibold rounded-full px-3 py-1.5 active:bg-ink-7"
                >
                  This week&apos;s brief
                </Link>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Coming up */}
      {comingUp.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Coming up
            </p>
            <Link
              href="/dashboard/calendar"
              className="text-[12px] font-semibold text-brand-dark active:text-brand"
            >
              Calendar
            </Link>
          </div>
          <ul className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {comingUp.slice(0, 3).map((item, i) => (
              <li key={i}>
                <div className="flex items-start gap-3 px-4 py-3 min-h-[56px]">
                  <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none">
                      {weekdayLabel(item.daysUntil)}
                    </span>
                    <span className="text-[18px] font-semibold text-ink leading-none mt-0.5">
                      {dayOfMonth(item.date)}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink leading-snug line-clamp-1">
                      {item.label}
                    </p>
                    {item.hook && (
                      <p className="text-[11.5px] text-ink-3 mt-0.5 line-clamp-1">{item.hook}</p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Quick links footer */}
      <section className="grid grid-cols-2 gap-2 pt-2">
        <QuickLink href="/dashboard/audit"        label="Audit"      tint="bg-brand-tint text-brand-dark" />
        <QuickLink href="/dashboard/marketplace"  label="Explore"    tint="bg-blue-50 text-blue-700" />
      </section>
    </div>
  )
}

function ScoreHero({
  score,
  delta,
  totalNeeds,
  state,
}: {
  score: number | null
  delta: number | null
  totalNeeds: number
  state: 'empty' | 'partial' | 'steady'
}) {
  /* If we don't have a score yet (no data feed), render a state-aware
     hero instead of a meaningless 0. */
  if (score === null) {
    const isEmpty = state === 'empty'
    return (
      <section className="bg-white border border-ink-6 rounded-2xl p-5">
        <div className="flex items-center gap-3">
          <div className={`w-12 h-12 rounded-2xl flex items-center justify-center flex-shrink-0 ${isEmpty ? 'bg-amber-50 text-amber-700' : 'bg-brand-tint text-brand-dark'}`}>
            {isEmpty ? <AlertCircle className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[16px] font-semibold text-ink leading-tight">
              {isEmpty ? 'Let\'s get you set up' : "You're on track"}
            </p>
            <p className="text-[12.5px] text-ink-3 mt-0.5">
              {isEmpty
                ? 'Connect your channels to start seeing your score.'
                : totalNeeds > 0
                  ? `${totalNeeds} ${totalNeeds === 1 ? 'thing needs' : 'things need'} your attention.`
                  : "You're all caught up."}
            </p>
          </div>
          <Link
            href={isEmpty ? '/dashboard/connected-accounts' : '/dashboard/audit'}
            className="inline-flex items-center gap-0.5 text-[12.5px] font-semibold text-brand-dark active:text-brand flex-shrink-0"
          >
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>
      </section>
    )
  }

  /* Real score render. */
  const status = score >= 70 ? 'on-track' : score >= 50 ? 'mid' : 'behind'
  const ring = status === 'on-track' ? 'ring-emerald-200' : status === 'mid' ? 'ring-amber-200' : 'ring-rose-200'
  const badge = status === 'on-track' ? 'On track' : status === 'mid' ? 'Improving' : 'Needs work'
  const badgeCls = status === 'on-track' ? 'bg-emerald-100 text-emerald-700'
    : status === 'mid' ? 'bg-amber-100 text-amber-800'
    : 'bg-rose-100 text-rose-700'

  return (
    <Link
      href="/dashboard/audit"
      className={`block bg-white border border-ink-6 rounded-2xl p-5 ring-4 ${ring} active:opacity-90 transition-opacity`}
    >
      <div className="flex items-center gap-4">
        <div className="flex flex-col items-center">
          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1">Score</span>
          <span className="text-[44px] font-bold text-ink leading-none tabular-nums">{score}</span>
          <span className="text-[11px] text-ink-4 mt-0.5">/ 100</span>
        </div>
        <div className="flex-1 min-w-0">
          <span className={`inline-block text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${badgeCls} mb-2`}>
            {badge}
          </span>
          {delta !== null && delta !== 0 && (
            <div className={`flex items-center gap-1 text-[13px] font-semibold ${delta > 0 ? 'text-emerald-700' : 'text-rose-700'} mb-1`}>
              {delta > 0 ? <ArrowUpRight className="w-3.5 h-3.5" /> : <ArrowDownRight className="w-3.5 h-3.5" />}
              {Math.abs(delta)} this week
            </div>
          )}
          <p className="text-[12.5px] text-ink-3 leading-snug">
            {totalNeeds > 0
              ? `${totalNeeds} ${totalNeeds === 1 ? 'thing needs' : 'things need'} you. Tap to see audit.`
              : 'Tap to see breakdown.'}
          </p>
        </div>
      </div>
    </Link>
  )
}

function MetricTile({
  icon: Icon,
  label,
  pulse,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  pulse: PulseCardData
}) {
  const showData = pulse.state === 'live' && pulse.value
  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-3 flex flex-col">
      <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-ink-7 text-ink-3 mb-1.5">
        <Icon className="w-3.5 h-3.5" />
      </span>
      <p className="text-[10px] uppercase tracking-wider font-bold text-ink-3 leading-none mb-1">{label}</p>
      {showData ? (
        <>
          <p className="text-[20px] font-bold text-ink tabular-nums leading-none">{pulse.value}</p>
          {pulse.delta && (
            <p className={`text-[10.5px] font-semibold mt-0.5 flex items-center gap-0.5 ${pulse.up ? 'text-emerald-700' : pulse.up === false ? 'text-rose-700' : 'text-ink-3'}`}>
              {pulse.up === true && <ArrowUpRight className="w-3 h-3" />}
              {pulse.up === false && <ArrowDownRight className="w-3 h-3" />}
              {pulse.delta}
            </p>
          )}
        </>
      ) : (
        <p className="text-[12px] text-ink-4 mt-0.5">No data yet</p>
      )}
    </div>
  )
}

function QuickLink({ href, label, tint }: { href: string; label: string; tint: string }) {
  return (
    <Link
      href={href}
      className={`flex items-center justify-between rounded-2xl px-4 py-3 min-h-[56px] active:opacity-90 transition ${tint}`}
    >
      <span className="text-[14px] font-semibold">{label}</span>
      <ChevronRight className="w-4 h-4" />
    </Link>
  )
}

function nudgeMessage({
  state, totalNeeds, firstName,
}: { state: 'empty' | 'partial' | 'steady'; totalNeeds: number; firstName: string }) {
  if (state === 'empty') {
    return `Welcome ${firstName}. Connect your channels and I'll start finding ways to help.`
  }
  if (totalNeeds === 0) {
    return "You're all caught up. I'm watching your data and will ping if anything needs attention."
  }
  if (totalNeeds >= 3) {
    return `${totalNeeds} things need your eyes today. Let me know if you want help prioritizing.`
  }
  return `A couple things need you today. Quick taps in your inbox handle them.`
}

function weekdayLabel(daysUntil: number): string {
  if (daysUntil === 0) return 'Today'
  if (daysUntil === 1) return 'Tmrw'
  const d = new Date()
  d.setDate(d.getDate() + daysUntil)
  return d.toLocaleDateString('en-US', { weekday: 'short' }).toUpperCase()
}

function dayOfMonth(iso: string): string {
  const d = new Date(iso)
  return String(d.getDate())
}
