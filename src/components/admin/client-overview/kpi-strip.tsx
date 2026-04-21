'use client'

/**
 * KPI strip — five numbers that tell you the state of a client at
 * a glance. Each cell has a subtle top-accent line whose color tracks
 * the cell's state (red for overdue tasks, amber for stale contact,
 * green for active retainer, etc). The accent is a 1px line at the
 * very top, so the cells stay visually calm unless something wants
 * your attention.
 */

import { DollarSign, Repeat, Clock, ListTodo, Calendar } from 'lucide-react'

interface Props {
  retainerAmountCents: number | null
  fallbackMonthlyRateDollars: number | null
  lifetimeRevenueCents: number | null
  daysSinceOnboarding: number | null
  openTaskCount: number
  overdueTaskCount: number
  daysSinceLastContact: number | null
}

type Tone = 'good' | 'warn' | 'bad' | 'neutral'

const TONE_ACCENT: Record<Tone, string> = {
  good:    'bg-emerald-400',
  warn:    'bg-amber-400',
  bad:     'bg-red-500',
  neutral: 'bg-transparent',
}

const TONE_VALUE_COLOR: Record<Tone, string> = {
  good:    'text-ink',
  warn:    'text-amber-700',
  bad:     'text-red-700',
  neutral: 'text-ink',
}

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 10000) return '$' + Math.round(dollars / 1000) + 'k'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0,
  }).format(dollars)
}

function formatDays(d: number | null): string {
  if (d === null || d === undefined) return '—'
  if (d === 0) return 'Today'
  if (d === 1) return '1 day'
  if (d < 30) return `${d} days`
  if (d < 365) return `${Math.round(d / 30)} mo`
  return `${(d / 365).toFixed(1)} yr`
}

export default function KPIStrip({
  retainerAmountCents,
  fallbackMonthlyRateDollars,
  lifetimeRevenueCents,
  daysSinceOnboarding,
  openTaskCount,
  overdueTaskCount,
  daysSinceLastContact,
}: Props) {
  const mrrCents = retainerAmountCents
    ?? (fallbackMonthlyRateDollars ? fallbackMonthlyRateDollars * 100 : null)
  const mrrIsFallback = retainerAmountCents === null && fallbackMonthlyRateDollars !== null

  const lastContactTone: Tone =
    daysSinceLastContact === null ? 'neutral'
    : daysSinceLastContact > 30 ? 'warn'
    : daysSinceLastContact > 60 ? 'bad'
    : 'good'

  const taskTone: Tone =
    overdueTaskCount > 0 ? 'bad'
    : openTaskCount > 0 ? 'neutral'
    : 'good'

  const mrrTone: Tone = mrrCents && mrrCents > 0 ? (mrrIsFallback ? 'neutral' : 'good') : 'neutral'

  const cells: Array<{
    icon: typeof DollarSign
    label: string
    value: string
    unit?: string
    hint?: string
    tone: Tone
  }> = [
    {
      icon: Repeat,
      label: 'Monthly recurring',
      value: formatMoney(mrrCents),
      unit: mrrCents ? '/month' : undefined,
      hint: mrrIsFallback ? 'Manual · Stripe not connected'
          : retainerAmountCents ? 'Active retainer'
          : 'No active retainer',
      tone: mrrTone,
    },
    {
      icon: DollarSign,
      label: 'Lifetime revenue',
      value: formatMoney(lifetimeRevenueCents),
      hint: lifetimeRevenueCents ? 'Total paid to date' : 'No paid invoices yet',
      tone: 'neutral',
    },
    {
      icon: Calendar,
      label: 'Client since',
      value: formatDays(daysSinceOnboarding),
      hint: daysSinceOnboarding !== null
        ? `${daysSinceOnboarding} days`
        : 'No onboarding date',
      tone: 'neutral',
    },
    {
      icon: Clock,
      label: 'Last contact',
      value: formatDays(daysSinceLastContact),
      hint: daysSinceLastContact === null ? 'No interactions yet'
        : daysSinceLastContact > 30 ? 'Overdue for check-in'
        : 'Since last touchpoint',
      tone: lastContactTone,
    },
    {
      icon: ListTodo,
      label: 'Open tasks',
      value: String(openTaskCount),
      hint: overdueTaskCount > 0 ? `${overdueTaskCount} overdue`
        : openTaskCount === 0 ? 'All caught up'
        : 'Active items',
      tone: taskTone,
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 lg:divide-x sm:divide-x divide-ink-6">
        {cells.map(cell => {
          const Icon = cell.icon
          return (
            <div
              key={cell.label}
              className="relative p-4 min-w-0 transition-colors hover:bg-bg-2/40"
            >
              {/* Top accent line — transparent for neutral cells */}
              <div className={`absolute top-0 left-0 right-0 h-0.5 ${TONE_ACCENT[cell.tone]}`} />

              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-4 uppercase tracking-wide">
                <Icon className="w-3 h-3" />
                {cell.label}
              </div>
              <div className="mt-2 flex items-baseline gap-1">
                <div className={`font-[family-name:var(--font-display)] text-[24px] leading-none tabular-nums tracking-tight ${TONE_VALUE_COLOR[cell.tone]}`}>
                  {cell.value}
                </div>
                {cell.unit && (
                  <span className="text-[12px] text-ink-4 font-normal">{cell.unit}</span>
                )}
              </div>
              {cell.hint && (
                <div className="text-[11px] text-ink-4 mt-1.5 truncate">{cell.hint}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
