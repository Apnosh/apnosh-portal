'use client'

/**
 * Mobile home — operator-grade dashboard.
 *
 * Restaurant owners are operators, not players. No streaks, no scores,
 * no badges. This view answers four questions in 30 seconds:
 *
 *   1. What's the number I care about doing? — primary metric block
 *   2. What's the health of each channel? — health panel
 *   3. What did Apnosh ship for me? — activity feed with attribution
 *   4. What needs my eyes? — inbox preview
 *
 * The owner picks their primary metric and which channels to show.
 * Preferences persist in localStorage for v1; we'll back them with
 * a user_dashboard_layout table in Phase B.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight, ArrowUpRight, ArrowDownRight,
  Users, Star, TrendingUp, Globe, Settings2, Sparkles,
  CheckCircle2, Plug, Calendar as CalendarIcon, MapPin,
} from 'lucide-react'

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

interface WeeklyItem {
  label: string
  detail?: string
  icon?: string
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
  weekly: { items: WeeklyItem[]; generatedThisWeek?: number }
  strategist: PrimaryStrategist | null
  comingUp: ComingUpItem[]
  state: 'empty' | 'partial' | 'steady'
  totalNeeds: number
}

type MetricKey = 'customers' | 'reputation' | 'reach'
type ChannelKey = 'customers' | 'reputation' | 'reach' | 'website'

const PRIMARY_METRIC_LABELS: Record<MetricKey, { headline: string; sub: string }> = {
  customers:  { headline: 'New customers',          sub: 'Direction requests + calls' },
  reputation: { headline: 'Reputation',             sub: 'Average rating + new reviews' },
  reach:      { headline: 'Total reach',            sub: 'Views across your channels' },
}

const CHANNEL_META: Record<ChannelKey, { label: string; icon: React.ComponentType<{ className?: string }> }> = {
  customers:  { label: 'Get Found',   icon: MapPin },
  reputation: { label: 'Reputation',  icon: Star },
  reach:      { label: 'Social',      icon: TrendingUp },
  website:    { label: 'Website',     icon: Globe },
}

const DEFAULT_VISIBLE_CHANNELS: Record<ChannelKey, boolean> = {
  customers: true,
  reputation: true,
  reach: true,
  website: false, // Hidden by default until we wire website analytics into pulse.
}

const STORAGE_KEY_METRIC = 'apnosh:home:primaryMetric'
const STORAGE_KEY_CHANNELS = 'apnosh:home:visibleChannels'

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
  weekly,
  strategist,
  comingUp,
  totalNeeds,
}: Props) {
  /* Customization state — persisted in localStorage. Initialized
     lazily from storage on mount so we don't cascade re-renders from
     an effect-driven hydration. SSR-safe via typeof window check. */
  const [primaryMetric, setPrimaryMetric] = useState<MetricKey>(() => {
    if (typeof window === 'undefined') return 'customers'
    try {
      const m = localStorage.getItem(STORAGE_KEY_METRIC) as MetricKey | null
      if (m && m in PRIMARY_METRIC_LABELS) return m
    } catch { /* ignore */ }
    return 'customers'
  })
  const [visibleChannels, setVisibleChannels] = useState<Record<ChannelKey, boolean>>(() => {
    if (typeof window === 'undefined') return DEFAULT_VISIBLE_CHANNELS
    try {
      const raw = localStorage.getItem(STORAGE_KEY_CHANNELS)
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<Record<ChannelKey, boolean>>
        return { ...DEFAULT_VISIBLE_CHANNELS, ...parsed }
      }
    } catch { /* ignore */ }
    return DEFAULT_VISIBLE_CHANNELS
  })
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const updateMetric = (m: MetricKey) => {
    setPrimaryMetric(m)
    try { localStorage.setItem(STORAGE_KEY_METRIC, m) } catch { /* ignore */ }
  }
  const updateChannel = (c: ChannelKey, v: boolean) => {
    const next = { ...visibleChannels, [c]: v }
    setVisibleChannels(next)
    try { localStorage.setItem(STORAGE_KEY_CHANNELS, JSON.stringify(next)) } catch { /* ignore */ }
  }

  const firstName = displayName.split(' ')[0]

  /* Build the activity feed from weekly.items. Caps at 5. */
  const activityItems = useMemo(() => weekly.items.slice(0, 5), [weekly.items])

  /* Top inbox items shown inline (max 2). Owner taps through to full Inbox. */
  const topInbox = useMemo(
    () => agenda.filter(a => a.urgency !== 'low').slice(0, 2),
    [agenda],
  )

  /* Channels to render in the health panel, filtered by user preference
     AND data availability. A channel with no-data state is hidden so
     we don't show a row of dashes. */
  const channelsToShow: ChannelKey[] = (
    ['customers', 'reputation', 'reach', 'website'] as ChannelKey[]
  ).filter(c => visibleChannels[c]).filter(c => {
    if (c === 'website') return false /* not wired in pulse yet */
    return pulse[c as MetricKey].state === 'live'
  })

  return (
    <div className="px-4 pt-4 pb-2 space-y-5">
      {/* Greeting */}
      <div>
        <p className="text-[12px] text-ink-3">{shortDate()}</p>
        <h1 className="text-[22px] font-semibold text-ink leading-tight mt-0.5">
          {greeting()}, {firstName}
        </h1>
      </div>

      {/* Primary metric block — the headline number */}
      <PrimaryMetric
        metric={primaryMetric}
        pulse={pulse}
        onTap={() => setCustomizeOpen(true)}
      />

      {/* Health panel — channel-level KPIs */}
      {channelsToShow.length > 0 && (
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
          <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {channelsToShow.map(c => (
              <ChannelRow
                key={c}
                channel={c}
                pulse={c === 'website' ? null : pulse[c as MetricKey]}
              />
            ))}
          </div>
        </section>
      )}

      {/* Inbox preview */}
      {topInbox.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Needs your eyes ({totalNeeds})
            </p>
            <Link
              href="/dashboard/inbox"
              className="text-[12px] font-semibold text-brand-dark active:text-brand"
            >
              Open inbox
            </Link>
          </div>
          <ul className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {topInbox.map(item => {
              const Icon = TYPE_ICONS[item.type] ?? Sparkles
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex items-center gap-3 px-4 py-3 min-h-[56px] active:bg-ink-7"
                  >
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-ink-7 text-ink-2 flex-shrink-0">
                      <Icon className="w-[18px] h-[18px]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13.5px] font-semibold text-ink leading-snug line-clamp-1">
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

      {/* Activity feed — what Apnosh shipped this week */}
      {activityItems.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Apnosh shipped {weekly.generatedThisWeek ?? activityItems.length} things this week
            </p>
            <Link
              href="/dashboard/briefs"
              className="text-[12px] font-semibold text-brand-dark active:text-brand"
            >
              See all
            </Link>
          </div>
          <ul className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
            {activityItems.map((item, i) => (
              <li key={i} className="px-4 py-3 min-h-[56px]">
                <div className="flex items-start gap-3">
                  <span className="inline-flex items-center justify-center w-9 h-9 rounded-xl bg-brand-tint text-brand-dark flex-shrink-0">
                    <Sparkles className="w-[18px] h-[18px]" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13.5px] font-semibold text-ink leading-snug">
                      {item.label}
                    </p>
                    {item.detail && (
                      <p className="text-[12px] text-ink-2 mt-1 leading-snug">
                        → {item.detail}
                      </p>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Strategist line (no avatar, no fluff — operator tone) */}
      {strategist && (
        <section className="bg-white border border-ink-6 rounded-2xl p-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1.5">
            Your strategist · {strategist.firstName}
          </p>
          <p className="text-[13px] text-ink-2 leading-snug">
            {strategistNote({ totalNeeds })}
          </p>
          <Link
            href={`/dashboard/messages?to=${strategist.id}`}
            className="inline-flex items-center gap-1 text-[12px] font-semibold text-brand-dark active:text-brand mt-2"
          >
            Send a message
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      )}

      {/* Coming up */}
      {comingUp.length > 0 && (
        <section>
          <div className="flex items-baseline justify-between mb-2">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3">
              Next 7 days
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
              <li key={i} className="flex items-start gap-3 px-4 py-3 min-h-[52px]">
                <div className="flex flex-col items-center justify-center w-12 flex-shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none">
                    {weekdayLabel(item.daysUntil)}
                  </span>
                  <span className="text-[18px] font-semibold text-ink leading-none mt-0.5 tabular-nums">
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
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Customize button — subtle, bottom of page */}
      <div className="pt-2">
        <button
          onClick={() => setCustomizeOpen(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-3 active:text-ink py-3"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Customize home
        </button>
      </div>

      {/* Customize sheet */}
      {customizeOpen && (
        <CustomizeSheet
          primaryMetric={primaryMetric}
          visibleChannels={visibleChannels}
          onMetricChange={updateMetric}
          onChannelChange={updateChannel}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </div>
  )
}

function PrimaryMetric({
  metric,
  pulse,
  onTap,
}: {
  metric: MetricKey
  pulse: { customers: PulseCardData; reputation: PulseCardData; reach: PulseCardData }
  onTap: () => void
}) {
  const data = pulse[metric]
  const labels = PRIMARY_METRIC_LABELS[metric]

  const hasData = data.state === 'live' && data.value

  return (
    <section className="bg-white border border-ink-6 rounded-2xl p-5">
      <button
        onClick={onTap}
        className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 active:text-ink"
      >
        {labels.headline}
        <ChevronRight className="w-3 h-3 rotate-90" />
      </button>
      {hasData ? (
        <>
          <p className="text-[40px] font-bold text-ink tabular-nums leading-none mt-1.5">
            {data.value}
          </p>
          {data.delta && (
            <p className={`inline-flex items-center gap-1 text-[13.5px] font-semibold mt-2 ${data.up ? 'text-emerald-700' : data.up === false ? 'text-rose-700' : 'text-ink-3'}`}>
              {data.up === true && <ArrowUpRight className="w-4 h-4" />}
              {data.up === false && <ArrowDownRight className="w-4 h-4" />}
              {data.delta} <span className="text-ink-3 font-normal">vs last week</span>
            </p>
          )}
          <p className="text-[11.5px] text-ink-4 mt-2">{labels.sub}</p>
        </>
      ) : (
        <>
          <p className="text-[16px] font-semibold text-ink mt-2">
            No data yet
          </p>
          <p className="text-[12.5px] text-ink-3 mt-1">
            {data.state === 'no-data' ? 'Connect your channels to start seeing this.' : 'Loading...'}
          </p>
        </>
      )}
    </section>
  )
}

function ChannelRow({
  channel,
  pulse,
}: {
  channel: ChannelKey
  pulse: PulseCardData | null
}) {
  const meta = CHANNEL_META[channel]
  const Icon = meta.icon

  if (!pulse || pulse.state !== 'live') {
    return null
  }

  return (
    <div className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
      <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-ink-7 text-ink-2 flex-shrink-0">
        <Icon className="w-[16px] h-[16px]" />
      </span>
      <p className="flex-1 text-[13.5px] font-semibold text-ink">{meta.label}</p>
      <p className="text-[15px] font-bold text-ink tabular-nums">{pulse.value}</p>
      {pulse.delta && (
        <span className={`inline-flex items-center gap-0.5 text-[12px] font-semibold min-w-[52px] justify-end ${pulse.up ? 'text-emerald-700' : pulse.up === false ? 'text-rose-700' : 'text-ink-3'}`}>
          {pulse.up === true && <ArrowUpRight className="w-3.5 h-3.5" />}
          {pulse.up === false && <ArrowDownRight className="w-3.5 h-3.5" />}
          {pulse.delta}
        </span>
      )}
    </div>
  )
}

function CustomizeSheet({
  primaryMetric,
  visibleChannels,
  onMetricChange,
  onChannelChange,
  onClose,
}: {
  primaryMetric: MetricKey
  visibleChannels: Record<ChannelKey, boolean>
  onMetricChange: (m: MetricKey) => void
  onChannelChange: (c: ChannelKey, v: boolean) => void
  onClose: () => void
}) {
  /* Lock body scroll while open. */
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  /* Escape closes. */
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <>
      <button
        type="button"
        aria-label="Close customize"
        onClick={onClose}
        className="fixed inset-0 z-[60] bg-black/40 sheet-backdrop"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Customize home"
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl sheet-up safe-bottom max-h-[85vh] flex flex-col"
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-6" />
        </div>

        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="text-[17px] font-semibold text-ink">Customize home</h2>
          <button
            onClick={onClose}
            className="text-[13.5px] font-semibold text-brand-dark active:text-brand"
          >
            Done
          </button>
        </div>

        <div className="overflow-y-auto touch-scroll px-4 py-2 space-y-5">
          {/* Primary metric */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2 px-1">
              Headline metric
            </p>
            <p className="text-[12px] text-ink-3 mb-3 px-1">
              The big number at the top of your home.
            </p>
            <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
              {(['customers', 'reputation', 'reach'] as MetricKey[]).map(m => {
                const active = primaryMetric === m
                const meta = PRIMARY_METRIC_LABELS[m]
                return (
                  <button
                    key={m}
                    onClick={() => onMetricChange(m)}
                    className="w-full flex items-start gap-3 px-4 py-3 text-left active:bg-ink-7 transition-colors"
                  >
                    <span className={[
                      'inline-flex items-center justify-center w-6 h-6 rounded-full border-2 mt-0.5 flex-shrink-0 transition-all',
                      active ? 'bg-brand border-brand' : 'bg-white border-ink-5',
                    ].join(' ')}>
                      {active && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-semibold text-ink">{meta.headline}</p>
                      <p className="text-[12px] text-ink-3 mt-0.5">{meta.sub}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Channel toggles */}
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-2 px-1">
              Show on home
            </p>
            <p className="text-[12px] text-ink-3 mb-3 px-1">
              Which channels show in the &quot;This week&quot; panel.
            </p>
            <div className="bg-white border border-ink-6 rounded-2xl divide-y divide-ink-7 overflow-hidden">
              {(['customers', 'reputation', 'reach', 'website'] as ChannelKey[]).map(c => {
                const meta = CHANNEL_META[c]
                const Icon = meta.icon
                const on = visibleChannels[c]
                return (
                  <button
                    key={c}
                    onClick={() => onChannelChange(c, !on)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-left active:bg-ink-7 transition-colors"
                  >
                    <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-ink-7 text-ink-2 flex-shrink-0">
                      <Icon className="w-[16px] h-[16px]" />
                    </span>
                    <p className="flex-1 text-[14px] font-semibold text-ink">{meta.label}</p>
                    <span className={[
                      'relative w-11 h-6 rounded-full transition-colors flex-shrink-0',
                      on ? 'bg-brand' : 'bg-ink-6',
                    ].join(' ')}>
                      <span className={[
                        'absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform',
                        on ? 'translate-x-5' : 'translate-x-0',
                      ].join(' ')} />
                    </span>
                  </button>
                )
              })}
            </div>
          </section>

          {/* Coming-soon hint */}
          <p className="text-[11px] text-ink-4 text-center px-4 py-2">
            More customization (rearrange sections, set goals, hide widgets) coming soon.
          </p>
        </div>
      </div>
    </>
  )
}

function strategistNote({ totalNeeds }: { totalNeeds: number }): string {
  if (totalNeeds === 0) return "Nothing needs your eyes right now. I'm watching your data and will ping if something changes."
  if (totalNeeds === 1) return 'One item is waiting on your decision. Quick tap in the inbox handles it.'
  if (totalNeeds <= 3) return `${totalNeeds} items are waiting on you. Tap through the inbox when you have a minute.`
  return `${totalNeeds} items in your inbox. Let me know if you want help prioritizing.`
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
