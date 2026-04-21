'use client'

/**
 * KPI strip — five numbers that tell you the state of a client at
 * a glance. Placed directly under the hero so it's the first thing
 * you see after the identity.
 *
 * Each cell is left-aligned within a divided row. Money uses tabular
 * nums. Empty values render as em-dash to maintain layout rhythm.
 */

import { DollarSign, Repeat, Clock, ListTodo, Calendar } from 'lucide-react'

interface Props {
  retainerAmountCents: number | null
  // Fallback when there's no Stripe subscription — the manually-tracked
  // monthly_rate on the client record. Shown with a " · manual" hint.
  fallbackMonthlyRateDollars: number | null
  lifetimeRevenueCents: number | null
  daysSinceOnboarding: number | null
  openTaskCount: number
  overdueTaskCount: number
  daysSinceLastContact: number | null
}

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  if (cents === 0) return '$0'
  const dollars = cents / 100
  if (dollars >= 10000) {
    return '$' + Math.round(dollars / 1000) + 'k'
  }
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
  // Prefer the Stripe subscription amount. Fall back to the manually
  // tracked client.monthly_rate (stored as whole dollars) so clients
  // you track outside Stripe still show a real number.
  const mrrCents = retainerAmountCents
    ?? (fallbackMonthlyRateDollars ? fallbackMonthlyRateDollars * 100 : null)
  const mrrIsFallback = retainerAmountCents === null && fallbackMonthlyRateDollars !== null

  const cells: Array<{
    icon: typeof DollarSign
    label: string
    value: string
    tone?: string
    hint?: string
  }> = [
    {
      icon: Repeat,
      label: 'MRR',
      value: formatMoney(mrrCents),
      hint: mrrIsFallback ? 'Manual rate · Stripe not connected'
          : retainerAmountCents ? 'Active retainer'
          : 'No active retainer',
    },
    {
      icon: DollarSign,
      label: 'Lifetime',
      value: formatMoney(lifetimeRevenueCents),
      hint: 'Total paid to date',
    },
    {
      icon: Calendar,
      label: 'Client since',
      value: formatDays(daysSinceOnboarding),
      hint: daysSinceOnboarding !== null ? `${daysSinceOnboarding} days` : 'No onboarding date',
    },
    {
      icon: Clock,
      label: 'Last contact',
      value: formatDays(daysSinceLastContact),
      tone: daysSinceLastContact !== null && daysSinceLastContact > 30 ? 'text-amber-700'
        : daysSinceLastContact !== null && daysSinceLastContact > 14 ? 'text-ink-2'
        : undefined,
      hint: daysSinceLastContact === null ? 'No contact logged' : 'Since last interaction',
    },
    {
      icon: ListTodo,
      label: 'Open tasks',
      value: String(openTaskCount),
      tone: overdueTaskCount > 0 ? 'text-red-700' : undefined,
      hint: overdueTaskCount > 0 ? `${overdueTaskCount} overdue` : openTaskCount === 0 ? 'Nothing pending' : 'Active items',
    },
  ]

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-y sm:divide-y-0 lg:divide-x sm:divide-x divide-ink-6">
        {cells.map(cell => {
          const Icon = cell.icon
          return (
            <div key={cell.label} className="p-4 min-w-0">
              <div className="flex items-center gap-1.5 text-[10px] font-semibold text-ink-4 uppercase tracking-wide">
                <Icon className="w-3 h-3" />
                {cell.label}
              </div>
              <div className={`font-[family-name:var(--font-display)] text-[22px] leading-none mt-2 tabular-nums ${cell.tone ?? 'text-ink'}`}>
                {cell.value}
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
