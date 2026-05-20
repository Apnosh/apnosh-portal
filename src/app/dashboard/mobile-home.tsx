'use client'

/**
 * Mobile home — operator-grade, calm, action-first.
 *
 * Restaurant owners are operators, not players. No streaks, no scores,
 * no badges. The screen answers, in order:
 *
 *   1. How am I doing?      — the hero metric + trend chart (Robinhood-style)
 *   2. Is anything on me?   — Needs you (the daily action list)
 *   3. What's coming up?    — Next 7 days (the planning view)
 *   4. What did I get?      — one quiet "Apnosh shipped" line (proof of value)
 *   5. Who has my back?     — the strategist line
 *
 * Design: cardless and airy. Sections are separated by whitespace and
 * hairline dividers, not nested boxes, so content reads big and clean.
 * The owner can switch the headline metric; the choice persists in
 * localStorage for v1.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronRight, ChevronDown, ArrowUpRight, ArrowDownRight,
  Star, Sparkles, CheckCircle2, Plug, Calendar as CalendarIcon, Settings2,
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
  series?: number[]
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

const PRIMARY_METRIC_LABELS: Record<MetricKey, { headline: string; sub: string }> = {
  customers:  { headline: 'Customers this week', sub: 'Calls, directions, and bookings' },
  reputation: { headline: 'Reputation',          sub: 'Average rating and new reviews' },
  reach:      { headline: 'Reach this week',     sub: 'People who saw your content' },
}

const STORAGE_KEY_METRIC = 'apnosh:home:primaryMetric'

const TYPE_ICONS: Record<AgendaItem['type'], React.ComponentType<{ className?: string }>> = {
  review:     Star,
  approval:   CheckCircle2,
  connection: Plug,
  draft:      Sparkles,
  task:       CalendarIcon,
  suggestion: Sparkles,
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
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
  const [primaryMetric, setPrimaryMetric] = useState<MetricKey>(() => {
    if (typeof window === 'undefined') return 'customers'
    try {
      const m = localStorage.getItem(STORAGE_KEY_METRIC) as MetricKey | null
      if (m && m in PRIMARY_METRIC_LABELS) return m
    } catch { /* ignore */ }
    return 'customers'
  })
  const [customizeOpen, setCustomizeOpen] = useState(false)

  const updateMetric = (m: MetricKey) => {
    setPrimaryMetric(m)
    try { localStorage.setItem(STORAGE_KEY_METRIC, m) } catch { /* ignore */ }
  }

  const firstName = displayName.split(' ')[0]

  /* Needs you — the action core. Hide the low-urgency noise; show the
     few that actually want a decision. */
  const topNeeds = useMemo(
    () => agenda.filter(a => a.urgency !== 'low').slice(0, 3),
    [agenda],
  )

  const shippedCount = weekly.generatedThisWeek ?? weekly.items.length

  return (
    <div className="px-5 pt-5 pb-3 space-y-7">
      {/* Quiet greeting — the hero number leads, not the greeting */}
      <p className="text-[13px] text-ink-3">{greeting()}, {firstName}</p>

      {/* Hero metric + trend chart */}
      <Hero
        metric={primaryMetric}
        data={pulse[primaryMetric]}
        onSwitch={() => setCustomizeOpen(true)}
      />

      {/* Needs you — the daily action list, right under the hero */}
      {topNeeds.length > 0 && (
        <section>
          <SectionHead
            label={`Needs you${totalNeeds > 0 ? ` · ${totalNeeds}` : ''}`}
            href="/dashboard/inbox"
            cta="Open inbox"
          />
          <ul className="divide-y divide-ink-7">
            {topNeeds.map(item => {
              const Icon = TYPE_ICONS[item.type] ?? Sparkles
              return (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    prefetch={false}
                    className="flex items-center gap-3.5 py-3.5 min-h-[56px] active:opacity-60"
                  >
                    <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-ink-7 text-ink-2 flex-shrink-0">
                      <Icon className="w-[17px] h-[17px]" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14.5px] font-semibold text-ink leading-snug line-clamp-1">
                        {item.label}
                      </p>
                      {item.detail && (
                        <p className="text-[12px] text-ink-3 mt-0.5 line-clamp-1">{item.detail}</p>
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

      {/* Next 7 days — the planning view */}
      {comingUp.length > 0 && (
        <section>
          <SectionHead label="Next 7 days" href="/dashboard/calendar" cta="Calendar" />
          <ul className="divide-y divide-ink-7">
            {comingUp.slice(0, 3).map((item, i) => (
              <li key={i} className="flex items-center gap-3.5 py-3.5 min-h-[52px]">
                <div className="flex flex-col items-center justify-center w-10 flex-shrink-0">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-ink-3 leading-none">
                    {weekdayLabel(item.daysUntil)}
                  </span>
                  <span className="text-[19px] font-semibold text-ink leading-none mt-0.5 tabular-nums">
                    {dayOfMonth(item.date)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-semibold text-ink leading-snug line-clamp-1">
                    {item.label}
                  </p>
                  {item.hook && (
                    <p className="text-[12px] text-ink-3 mt-0.5 line-clamp-1">{item.hook}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Apnosh shipped — one quiet proof-of-value line */}
      {shippedCount > 0 && (
        <Link
          href="/dashboard/briefs"
          className="flex items-center gap-2.5 py-1 active:opacity-60"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-brand-tint text-brand-dark flex-shrink-0">
            <Sparkles className="w-[17px] h-[17px]" />
          </span>
          <p className="flex-1 text-[14px] font-semibold text-ink leading-snug">
            Apnosh shipped {shippedCount} {shippedCount === 1 ? 'thing' : 'things'} this week
          </p>
          <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0" />
        </Link>
      )}

      {/* Strategist line */}
      {strategist && (
        <section className="pt-1">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3 mb-1.5">
            {strategist.firstName}, your strategist
          </p>
          <p className="text-[13px] text-ink-2 leading-snug">
            {strategistNote({ totalNeeds })}
          </p>
          <Link
            href={`/dashboard/messages?to=${strategist.id}`}
            className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-brand-dark active:text-brand mt-2"
          >
            Send a message
            <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </section>
      )}

      {/* Customize — subtle, bottom */}
      <div className="pt-1">
        <button
          onClick={() => setCustomizeOpen(true)}
          className="w-full inline-flex items-center justify-center gap-1.5 text-[12px] font-semibold text-ink-3 active:text-ink py-3"
        >
          <Settings2 className="w-3.5 h-3.5" />
          Customize home
        </button>
      </div>

      {customizeOpen && (
        <CustomizeSheet
          primaryMetric={primaryMetric}
          onMetricChange={updateMetric}
          onClose={() => setCustomizeOpen(false)}
        />
      )}
    </div>
  )
}

function Hero({
  metric,
  data,
  onSwitch,
}: {
  metric: MetricKey
  data: PulseCardData
  onSwitch: () => void
}) {
  const labels = PRIMARY_METRIC_LABELS[metric]
  const hasData = data.state === 'live' && !!data.value
  const series = data.series ?? []

  return (
    <section>
      <button
        onClick={onSwitch}
        className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3 active:text-ink"
      >
        {labels.headline}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {hasData ? (
        <Link href="/dashboard/analytics" className="block active:opacity-70">
          <p className="text-[52px] font-bold text-ink tabular-nums leading-none tracking-tight mt-1.5">
            {data.value}
          </p>
          {data.delta ? (
            <p className={`inline-flex items-center gap-1 text-[14px] font-semibold mt-2.5 ${
              data.up ? 'text-emerald-700' : data.up === false ? 'text-rose-700' : 'text-ink-3'
            }`}>
              {data.up === true && <ArrowUpRight className="w-4 h-4" />}
              {data.up === false && <ArrowDownRight className="w-4 h-4" />}
              {data.delta}
              <span className="text-ink-3 font-normal">vs last week</span>
            </p>
          ) : (
            <p className="text-[12.5px] text-ink-4 mt-2">{labels.sub}</p>
          )}

          {series.length >= 2 && (
            <div className="mt-4">
              <HeroChart values={series} up={data.up ?? null} />
            </div>
          )}
        </Link>
      ) : (
        <div className="mt-2">
          <p className="text-[17px] font-semibold text-ink">No data yet</p>
          <p className="text-[12.5px] text-ink-3 mt-1">
            {data.state === 'no-data'
              ? 'Connect your channels to start seeing this.'
              : 'Loading…'}
          </p>
        </div>
      )}
    </section>
  )
}

/* Robinhood-style area chart. Minimal: a soft fill, a clean line, no
   axes or gridlines. Brand green when flat or up, muted red when down. */
function HeroChart({ values, up }: { values: number[]; up: boolean | null }) {
  const w = 320, h = 76, pad = 4
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const step = w / (values.length - 1)
  const y = (v: number) => h - pad - ((v - min) / range) * (h - pad * 2)
  const line = values
    .map((v, i) => `${i === 0 ? 'M' : 'L'}${(i * step).toFixed(1)},${y(v).toFixed(1)}`)
    .join(' ')
  const area = `${line} L${w},${h} L0,${h} Z`
  const color = up === false ? '#e11d48' : '#2e9a78'
  const gradId = `heroFill-${up === false ? 'down' : 'up'}`

  return (
    <svg
      width="100%"
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      preserveAspectRatio="none"
      className="block"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.16" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  )
}

function SectionHead({ label, href, cta }: { label: string; href?: string; cta?: string }) {
  return (
    <div className="flex items-baseline justify-between mb-1.5">
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">{label}</p>
      {href && cta && (
        <Link href={href} className="text-[12.5px] font-semibold text-brand-dark active:text-brand">
          {cta}
        </Link>
      )}
    </div>
  )
}

function CustomizeSheet({
  primaryMetric,
  onMetricChange,
  onClose,
}: {
  primaryMetric: MetricKey
  onMetricChange: (m: MetricKey) => void
  onClose: () => void
}) {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

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
          <button onClick={onClose} className="text-[13.5px] font-semibold text-brand-dark active:text-brand">
            Done
          </button>
        </div>

        <div className="overflow-y-auto touch-scroll px-4 py-2 space-y-5">
          <section>
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-ink-3 mb-1.5 px-1">
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
                    onClick={() => { onMetricChange(m); onClose() }}
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

          <p className="text-[11px] text-ink-4 text-center px-4 py-2">
            More customization coming soon.
          </p>
        </div>
      </div>
    </>
  )
}

function strategistNote({ totalNeeds }: { totalNeeds: number }): string {
  if (totalNeeds === 0) return "Nothing needs you right now. I'm watching your data and will reach out if something changes."
  if (totalNeeds === 1) return 'One item is waiting on your decision. A quick tap in the inbox handles it.'
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
