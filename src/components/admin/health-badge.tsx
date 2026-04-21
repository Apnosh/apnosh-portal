'use client'

/**
 * Client health badge — a pill showing the overall rollup with a
 * tooltip that breaks down each signal (cadence / billing / sentiment)
 * with its level and detail text.
 *
 * Two modes:
 *  - "pill" (default): text label + dot, for hero headers
 *  - "dot":            just a colored dot, for dense lists
 */

import { useState } from 'react'
import { Clock, CreditCard, Smile, Heart } from 'lucide-react'
import type { ClientHealth, HealthLevel, OverallHealth } from '@/types/database'
import { rollupHealth } from '@/types/database'

const OVERALL_LABEL: Record<OverallHealth, string> = {
  healthy:         'Healthy',
  stable:          'Stable',
  needs_attention: 'Needs attention',
  at_risk:         'At risk',
  unknown:         'Unknown',
}

const OVERALL_TONE: Record<OverallHealth, { dot: string; text: string; bg: string }> = {
  healthy:         { dot: '#16a34a', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  stable:          { dot: '#6b7280', text: 'text-ink-3',       bg: 'bg-bg-2' },
  needs_attention: { dot: '#d97706', text: 'text-amber-700',   bg: 'bg-amber-50' },
  at_risk:         { dot: '#dc2626', text: 'text-red-700',     bg: 'bg-red-50' },
  unknown:         { dot: '#d1d5db', text: 'text-ink-4',       bg: 'bg-bg-2' },
}

const LEVEL_TONE: Record<HealthLevel, string> = {
  good:    'text-emerald-700',
  warning: 'text-amber-700',
  bad:     'text-red-700',
  unknown: 'text-ink-4',
}

const LEVEL_DOT: Record<HealthLevel, string> = {
  good:    '#16a34a',
  warning: '#d97706',
  bad:     '#dc2626',
  unknown: '#d1d5db',
}

function formatDays(n: number | null): string {
  if (n === null || n === undefined) return '—'
  if (n < 1) return '<1 day'
  const rounded = Math.round(n)
  return `${rounded} day${rounded === 1 ? '' : 's'}`
}

function cadenceDetail(h: ClientHealth): string {
  if ((h.interaction_count ?? 0) < 3) return 'Not enough history yet'
  if (h.days_since_contact === null) return 'No interactions logged'
  const median = h.cadence_median_days
  const days = formatDays(h.days_since_contact)
  if (median === null) return `Last contact ${days} ago`
  return `${days} since last contact (typical: ~${formatDays(median)})`
}

function billingDetail(h: ClientHealth): string {
  if (h.billing_failed_count && h.billing_failed_count > 0) return `${h.billing_failed_count} failed payment${h.billing_failed_count === 1 ? '' : 's'}`
  if (h.billing_overdue_count && h.billing_overdue_count > 0) {
    const days = h.billing_max_overdue_days ?? 0
    return `${h.billing_overdue_count} overdue · ${Math.round(days)}d late`
  }
  if (h.billing_has_active_sub) return 'Subscription active'
  if (h.billing_level === 'bad') return 'Subscription canceled'
  return 'No active subscription'
}

function sentimentDetail(h: ClientHealth): string {
  const count = h.sentiment_count ?? 0
  if (count === 0) return 'No sentiment logged'
  const neg = h.negatives_last_5 ?? 0
  const pos = h.positives_last_5 ?? 0
  return `${pos} positive · ${neg} negative (last ${count})`
}

export default function HealthBadge({
  health,
  mode = 'pill',
}: {
  health: ClientHealth | null
  mode?: 'pill' | 'dot'
}) {
  const [tooltipOpen, setTooltipOpen] = useState(false)

  if (!health) return null

  const overall = rollupHealth(health)
  const tone = OVERALL_TONE[overall]

  const signals: Array<{ key: string; label: string; icon: typeof Clock; level: HealthLevel; detail: string }> = [
    { key: 'cadence',   label: 'Cadence',   icon: Clock,      level: health.cadence_level,   detail: cadenceDetail(health) },
    { key: 'billing',   label: 'Billing',   icon: CreditCard, level: health.billing_level,   detail: billingDetail(health) },
    { key: 'sentiment', label: 'Sentiment', icon: Smile,      level: health.sentiment_level, detail: sentimentDetail(health) },
  ]

  if (mode === 'dot') {
    return (
      <span
        className="relative inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
        style={{ background: tone.dot }}
        title={`${OVERALL_LABEL[overall]} · ${signals.map(s => `${s.label}: ${s.level}`).join(' · ')}`}
      />
    )
  }

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setTooltipOpen(true)}
      onMouseLeave={() => setTooltipOpen(false)}
      onFocus={() => setTooltipOpen(true)}
      onBlur={() => setTooltipOpen(false)}
    >
      <span
        tabIndex={0}
        className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${tone.bg} ${tone.text} text-[12px] cursor-default`}
      >
        <Heart className="w-2.5 h-2.5" />
        {OVERALL_LABEL[overall]}
      </span>

      {tooltipOpen && (
        <div
          role="tooltip"
          className="absolute top-full left-0 mt-1.5 w-72 bg-white rounded-xl border border-ink-6 shadow-xl p-3 z-50"
        >
          <div className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-2">
            Health breakdown
          </div>
          <div className="space-y-2">
            {signals.map(s => {
              const Icon = s.icon
              return (
                <div key={s.key} className="flex items-start gap-2">
                  <div
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ background: LEVEL_DOT[s.level] }}
                  />
                  <Icon className="w-3 h-3 text-ink-4 mt-1 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[12px] font-medium text-ink">{s.label}</span>
                      <span className={`text-[10px] font-medium uppercase tracking-wide ${LEVEL_TONE[s.level]}`}>
                        {s.level}
                      </span>
                    </div>
                    <p className="text-[11.5px] text-ink-3 leading-snug mt-0.5">{s.detail}</p>
                  </div>
                </div>
              )
            })}
          </div>
          <div className="mt-2 pt-2 border-t border-ink-6 text-[10px] text-ink-4 leading-snug">
            Overall reflects the worst signal. Engagement signal coming soon.
          </div>
        </div>
      )}
    </span>
  )
}
