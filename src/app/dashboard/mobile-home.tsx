'use client'

/**
 * Mobile home — Apnosh design-system look (radical typography minimalism).
 *
 * Matches the Claude Design prototype: Cal Sans display numerals, a large
 * hero metric with an edge-to-edge trend chart and a range selector, then
 * quiet full-width row lists separated by hairline dividers. No colored
 * icon tiles, no cards. Type, spacing, and a single brand accent do the
 * work. 22px edge padding, generous vertical rhythm.
 *
 * Answers two things at a glance: how am I doing (hero) and what's on me
 * (Needs you), with a compact "This week" list linking to the detail tabs.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ChevronRight, ChevronDown } from 'lucide-react'

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

type RangeKey = '1W' | '1M' | '3M' | '1Y' | 'ALL'
interface RangePoint { value: string; delta: string | null; up: boolean | null; series: number[] }
interface MetricRanges { available: RangeKey[]; ranges: Partial<Record<RangeKey, RangePoint>> }
interface MetricHistory { customers: MetricRanges | null; reach: MetricRanges | null }

interface Props {
  displayName: string
  agenda: AgendaItem[]
  pulse: { customers: PulseCardData; reputation: PulseCardData; reach: PulseCardData }
  metricHistory: MetricHistory | null
  weekly: { items: WeeklyItem[]; generatedThisWeek?: number }
  strategist: PrimaryStrategist | null
  comingUp: ComingUpItem[]
  state: 'empty' | 'partial' | 'steady'
  totalNeeds: number
}

type MetricKey = 'customers' | 'reputation' | 'reach'

const PRIMARY_METRIC_LABELS: Record<MetricKey, { headline: string; sub: string }> = {
  customers:  { headline: 'Customers', sub: 'Calls, directions, and bookings' },
  reputation: { headline: 'Reputation', sub: 'Average rating and new reviews' },
  reach:      { headline: 'Reach', sub: 'People who saw your content' },
}

const RANGE_SUFFIX: Record<RangeKey, string> = {
  '1W': 'vs last week', '1M': 'vs last month', '3M': 'vs prior 3 months', '1Y': 'vs last year', 'ALL': '',
}

const STORAGE_KEY_METRIC = 'apnosh:home:primaryMetric'

export default function MobileHome({
  agenda,
  pulse,
  metricHistory,
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

  /* Needs you — the action core. The few items that want a decision. */
  const topNeeds = agenda.filter(a => a.urgency !== 'low').slice(0, 4)
  const shippedCount = weekly.generatedThisWeek ?? weekly.items.length

  return (
    <div className="px-[22px] pt-4 pb-5 space-y-9">
      {/* Hero metric + trend chart */}
      <Hero
        metric={primaryMetric}
        data={pulse[primaryMetric]}
        history={
          primaryMetric === 'customers' ? metricHistory?.customers ?? null
          : primaryMetric === 'reach' ? metricHistory?.reach ?? null
          : null
        }
        onSwitch={() => setCustomizeOpen(true)}
      />

      {/* Needs you — pure type rows, dividers, no icon tiles */}
      {topNeeds.length > 0 && (
        <section>
          <Eyebrow>{`Needs you${totalNeeds > 0 ? ` · ${totalNeeds}` : ''}`}</Eyebrow>
          <ul className="divide-y divide-ink-6">
            {topNeeds.map(item => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  prefetch={false}
                  className="flex items-center gap-3 py-4 active:opacity-50"
                >
                  <span className="flex-1 min-w-0 text-[15.5px] font-medium text-ink leading-snug line-clamp-1">
                    {item.label}
                  </span>
                  <ChevronRight className="w-[18px] h-[18px] text-ink-4 flex-shrink-0" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* This week — compact links into the detail tabs */}
      {(shippedCount > 0 || comingUp.length > 0 || strategist) && (
        <section>
          <Eyebrow>This week</Eyebrow>
          <ul className="divide-y divide-ink-6">
            {shippedCount > 0 && (
              <RowLink href="/dashboard/briefs" label={`${shippedCount} shipped`} />
            )}
            {comingUp.length > 0 && (
              <RowLink href="/dashboard/calendar" label={`${comingUp.length} coming up`} />
            )}
            {strategist && (
              <RowLink href={`/dashboard/messages?to=${strategist.id}`} label={strategist.firstName} />
            )}
          </ul>
        </section>
      )}

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

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3 mb-1.5">
      {children}
    </p>
  )
}

function RowLink({ href, label }: { href: string; label: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center py-4 active:opacity-50">
        <span className="flex-1 text-[15.5px] font-medium text-ink">{label}</span>
        <ChevronRight className="w-[18px] h-[18px] text-ink-4 flex-shrink-0" />
      </Link>
    </li>
  )
}

function Hero({
  metric,
  data,
  history,
  onSwitch,
}: {
  metric: MetricKey
  data: PulseCardData
  history: MetricRanges | null
  onSwitch: () => void
}) {
  const labels = PRIMARY_METRIC_LABELS[metric]
  const available = history?.available ?? []
  const [range, setRange] = useState<RangeKey>(() =>
    available.includes('1W') ? '1W' : (available[0] ?? '1W'),
  )
  useEffect(() => {
    if (available.length && !available.includes(range)) {
      setRange(available.includes('1W') ? '1W' : (available[0] ?? '1W'))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history])

  const rp = history?.ranges?.[range]
  const value = rp?.value ?? data.value
  const delta = rp ? rp.delta : (data.delta ?? null)
  const up = rp ? rp.up : (data.up ?? null)
  const series = rp?.series ?? data.series ?? []
  const suffix = rp ? RANGE_SUFFIX[range] : 'vs last week'
  const hasData = data.state === 'live' && !!value
  const showSelector = available.length > 1

  return (
    <section>
      <button
        onClick={onSwitch}
        className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-ink-3 active:text-ink"
      >
        {labels.headline}
        <ChevronDown className="w-3.5 h-3.5" />
      </button>

      {hasData ? (
        <>
          <Link href="/dashboard/analytics" className="block active:opacity-70">
            <p className="font-cal text-[84px] font-semibold text-ink tabular-nums leading-[0.9] mt-1">
              {value}
            </p>
            {delta ? (
              <p className={`inline-flex items-center gap-1.5 text-[15px] font-semibold mt-3 ${
                up ? 'text-brand-dark' : up === false ? 'text-rose-600' : 'text-ink-3'
              }`}>
                {up != null && <Tri up={up} />}
                {delta}
                {suffix && <span className="text-ink-3 font-normal">{suffix}</span>}
              </p>
            ) : (
              <p className="text-[13px] text-ink-4 mt-2.5">{labels.sub}</p>
            )}

            {series.length >= 2 && (
              <div className="mt-6 -mx-[22px]">
                <HeroChart values={series} up={up} />
              </div>
            )}
          </Link>

          {/* Range selector — outside the Link so taps switch range. */}
          {showSelector ? (
            <div className="flex items-center gap-1 mt-4">
              {available.map(rk => (
                <button
                  key={rk}
                  onClick={() => setRange(rk)}
                  className={[
                    'px-3 py-1.5 rounded-full text-[12.5px] font-semibold transition-colors',
                    range === rk ? 'bg-brand text-white' : 'text-brand-dark active:bg-brand-tint',
                  ].join(' ')}
                >
                  {rk}
                </button>
              ))}
            </div>
          ) : series.length >= 2 ? (
            <p className="text-[11px] text-ink-4 mt-3">{history ? 'All time' : 'Past 14 days'}</p>
          ) : null}
        </>
      ) : (
        <div className="mt-2">
          <p className="text-[18px] font-semibold text-ink">No data yet</p>
          <p className="text-[13px] text-ink-3 mt-1">
            {data.state === 'no-data'
              ? 'Connect your channels to start seeing this.'
              : 'Loading…'}
          </p>
        </div>
      )}
    </section>
  )
}

/* Small filled triangle delta indicator. */
function Tri({ up }: { up: boolean }) {
  return (
    <svg width="9" height="8" viewBox="0 0 9 8" className="inline-block" aria-hidden="true">
      <path d={up ? 'M4.5 0 9 8H0z' : 'M4.5 8 0 0h9z'} fill="currentColor" />
    </svg>
  )
}

/* Edge-to-edge trend chart. Clean line, barely-there fill, no axes. */
function HeroChart({ values, up }: { values: number[]; up: boolean | null }) {
  const w = 360, h = 116, pad = 8
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
          <stop offset="0%" stopColor={color} stopOpacity="0.12" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth="2.5"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
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
        aria-label="Choose headline metric"
        className="fixed bottom-0 left-0 right-0 z-[61] bg-white rounded-t-3xl sheet-up safe-bottom max-h-[85vh] flex flex-col"
      >
        <div className="flex justify-center pt-2 pb-1">
          <div className="w-10 h-1 rounded-full bg-ink-6" />
        </div>

        <div className="flex items-center justify-between px-5 py-2">
          <h2 className="text-[17px] font-semibold text-ink">Headline metric</h2>
          <button onClick={onClose} className="text-[13.5px] font-semibold text-brand-dark active:text-brand">
            Done
          </button>
        </div>

        <div className="overflow-y-auto touch-scroll px-[22px] py-2">
          <ul className="divide-y divide-ink-6">
            {(['customers', 'reputation', 'reach'] as MetricKey[]).map(m => {
              const active = primaryMetric === m
              const meta = PRIMARY_METRIC_LABELS[m]
              return (
                <li key={m}>
                  <button
                    onClick={() => { onMetricChange(m); onClose() }}
                    className="w-full flex items-center gap-3 py-3.5 text-left active:opacity-50"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-medium text-ink">{meta.headline}</p>
                      <p className="text-[12.5px] text-ink-3 mt-0.5">{meta.sub}</p>
                    </div>
                    <span className={[
                      'inline-flex items-center justify-center w-6 h-6 rounded-full border-2 flex-shrink-0',
                      active ? 'bg-brand border-brand' : 'bg-white border-ink-5',
                    ].join(' ')}>
                      {active && <span className="w-2.5 h-2.5 rounded-full bg-white" />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      </div>
    </>
  )
}
