'use client'

/**
 * "Your services this month" card (Q1 wk 11, 1.1b).
 *
 * Shows the current cycle's delivered-vs-expected per active service.
 * Renders on the client dashboard above the agenda. Replaces the
 * "what did we do for you this month" Slack thread.
 */

import type { ServiceMonthRow } from '@/lib/services/delivery-matrix'

interface Props {
  rows: ServiceMonthRow[]
}

export default function ServicesThisMonth({ rows }: Props) {
  if (rows.length === 0) return null

  return (
    <section className="mb-6 db-fade db-d2">
      <div className="mb-3">
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
          Your services this month
        </h2>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {rows.map(row => (
          <ServiceCard key={row.serviceSlug} row={row} />
        ))}
      </div>
    </section>
  )
}

function ServiceCard({ row }: { row: ServiceMonthRow }) {
  const delivered = row.totalDelivered
  const expected = row.totalExpected
  const ratio = expected > 0 ? delivered / expected : 1
  const tone =
    ratio >= 1 ? { bg: 'rgba(74, 189, 152, 0.08)', text: '#137a55', label: 'On track' } :
    ratio >= 0.7 ? { bg: 'rgba(251, 191, 36, 0.08)', text: '#a16207', label: 'In progress' } :
    { bg: 'rgba(239, 68, 68, 0.08)', text: '#b91c1c', label: 'Catching up' }

  const display = row.displayName ?? row.serviceSlug
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())

  return (
    <div
      className="rounded-xl p-4 border bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-baseline justify-between gap-3 mb-2">
        <h3 className="text-sm font-semibold text-ink truncate">{display}</h3>
        <span
          className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
          style={{ background: tone.bg, color: tone.text }}
        >
          {tone.label}
        </span>
      </div>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-2xl font-bold text-ink">{delivered}</span>
        {expected > 0 && (
          <span className="text-sm text-ink-3 font-normal">
            of {expected} expected
          </span>
        )}
      </div>
      {expected > 0 && (
        <div className="h-1.5 bg-ink-7 rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${Math.min(100, (delivered / expected) * 100)}%`,
              background: tone.text,
            }}
          />
        </div>
      )}
    </div>
  )
}
