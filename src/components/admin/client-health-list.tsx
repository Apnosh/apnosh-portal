'use client'

/**
 * Admin home: Client Health list.
 *
 * Dense, scannable view of every client grouped by overall health
 * status. Each row shows the three underlying signals (cadence /
 * billing / sentiment) as dots so you can see the breakdown without
 * hovering. Primary detail text is inline too ("77d since contact"),
 * so the list works without any interaction.
 *
 * Rows link straight to the client detail page.
 */

import Link from 'next/link'
import { Clock, CreditCard, Smile, ArrowRight, Heart } from 'lucide-react'
import type { ClientHealth, HealthLevel, OverallHealth } from '@/types/database'
import { rollupHealth } from '@/types/database'

const GROUP_ORDER: OverallHealth[] = ['at_risk', 'needs_attention', 'stable', 'healthy', 'unknown']

const GROUP_META: Record<OverallHealth, {
  label: string
  dot: string
  text: string
  bg: string
  headerBg: string
}> = {
  at_risk:         { label: 'At risk',         dot: '#dc2626', text: 'text-red-700',     bg: 'bg-red-50',     headerBg: 'bg-red-50/40' },
  needs_attention: { label: 'Needs attention', dot: '#d97706', text: 'text-amber-700',   bg: 'bg-amber-50',   headerBg: 'bg-amber-50/40' },
  stable:          { label: 'Stable',          dot: '#6b7280', text: 'text-ink-3',       bg: 'bg-ink-6',      headerBg: 'bg-bg-2/60' },
  healthy:         { label: 'Healthy',         dot: '#16a34a', text: 'text-emerald-700', bg: 'bg-emerald-50', headerBg: 'bg-emerald-50/40' },
  unknown:         { label: 'Not enough data', dot: '#d1d5db', text: 'text-ink-4',       bg: 'bg-bg-2',       headerBg: 'bg-bg-2/40' },
}

const LEVEL_COLORS: Record<HealthLevel, string> = {
  good:    '#16a34a',
  warning: '#d97706',
  bad:     '#dc2626',
  unknown: '#d1d5db',
}

function pickLeadDetail(row: ClientHealth): string | null {
  // The most important detail to surface inline, in priority order:
  // what's actually bad → what's actually warning → silence.
  if (row.cadence_level === 'bad' && row.days_since_contact !== null) {
    return `${Math.round(Number(row.days_since_contact))}d since contact`
  }
  if (row.billing_level === 'bad') {
    if (row.billing_failed_count && row.billing_failed_count > 0) {
      return `${row.billing_failed_count} failed payment${row.billing_failed_count === 1 ? '' : 's'}`
    }
    if (row.billing_overdue_count && row.billing_overdue_count > 0) {
      return `${row.billing_overdue_count} invoice overdue ${Math.round(Number(row.billing_max_overdue_days))}d`
    }
    return 'Subscription canceled'
  }
  if (row.sentiment_level === 'bad') {
    return `${row.negatives_last_5} negative signals recently`
  }
  if (row.cadence_level === 'warning' && row.days_since_contact !== null) {
    return `${Math.round(Number(row.days_since_contact))}d since contact`
  }
  if (row.billing_level === 'warning' && row.billing_overdue_count) {
    return `${row.billing_overdue_count} invoice overdue`
  }
  if (row.sentiment_level === 'warning') {
    return 'Mixed sentiment recently'
  }
  // Good states — quietly show a reassuring signal
  if (row.billing_has_active_sub) return 'Subscription active'
  if (row.days_since_contact !== null) return `Last contact ${Math.round(Number(row.days_since_contact))}d ago`
  return null
}

export default function ClientHealthList({
  rows, loading,
}: {
  rows: ClientHealth[]
  loading: boolean
}) {
  if (loading) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5">
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-3 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-ink-6" />
              <div className="h-4 w-40 bg-ink-6 rounded" />
              <div className="flex-1" />
              <div className="h-4 w-24 bg-ink-6 rounded" />
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (rows.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-10 text-center">
        <Heart className="w-6 h-6 text-ink-5 mx-auto mb-2" />
        <p className="text-sm text-ink-3 font-medium">No clients yet</p>
        <p className="text-[12px] text-ink-4 mt-1">Add your first client to see health signals</p>
      </div>
    )
  }

  // Group by overall status
  const grouped = new Map<OverallHealth, ClientHealth[]>()
  for (const r of rows) {
    const key = rollupHealth(r)
    const list = grouped.get(key) ?? []
    list.push(r)
    grouped.set(key, list)
  }

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
        <div>
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Client Health</h2>
          <p className="text-[11px] text-ink-4 mt-0.5">
            Grouped by overall status · cadence + billing + sentiment signals
          </p>
        </div>
        <Link href="/admin/clients" className="text-xs text-brand-dark font-medium hover:underline inline-flex items-center gap-1">
          View all <ArrowRight className="w-3 h-3" />
        </Link>
      </div>

      {/* Legend — tiny hint of what the three dots mean */}
      <div className="flex items-center gap-4 px-5 py-2.5 border-b border-ink-6 bg-bg-2/40 text-[10.5px] text-ink-4">
        <span className="font-semibold uppercase tracking-wide">Signals</span>
        <span className="inline-flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> Cadence</span>
        <span className="inline-flex items-center gap-1"><CreditCard className="w-2.5 h-2.5" /> Billing</span>
        <span className="inline-flex items-center gap-1"><Smile className="w-2.5 h-2.5" /> Sentiment</span>
      </div>

      <div>
        {GROUP_ORDER.map(group => {
          const items = grouped.get(group)
          if (!items || items.length === 0) return null
          const meta = GROUP_META[group]
          return (
            <div key={group}>
              <div className={`flex items-center gap-2 px-5 py-2 ${meta.headerBg} border-b border-ink-6`}>
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: meta.dot }} />
                <span className={`text-[10.5px] font-semibold uppercase tracking-wide ${meta.text}`}>
                  {meta.label}
                </span>
                <span className="text-[10.5px] text-ink-4 tabular-nums">· {items.length}</span>
              </div>
              <ul>
                {items.map(row => {
                  const lead = pickLeadDetail(row)
                  return (
                    <li key={row.client_id} className="border-b border-ink-6 last:border-0">
                      <Link
                        href={`/admin/clients/${row.slug}`}
                        className="group flex items-center gap-4 px-5 py-3 hover:bg-bg-2 transition-colors"
                      >
                        {/* Signal dots — always visible, no hover needed */}
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVEL_COLORS[row.cadence_level] }} title={`Cadence: ${row.cadence_level}`} />
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVEL_COLORS[row.billing_level] }} title={`Billing: ${row.billing_level}`} />
                          <span className="w-1.5 h-1.5 rounded-full" style={{ background: LEVEL_COLORS[row.sentiment_level] }} title={`Sentiment: ${row.sentiment_level}`} />
                        </div>

                        <span className="text-[13.5px] text-ink font-medium truncate flex-1">
                          {row.name}
                        </span>

                        {lead && (
                          <span className={`text-[11.5px] truncate ${
                            group === 'at_risk' ? 'text-red-700'
                            : group === 'needs_attention' ? 'text-amber-700'
                            : 'text-ink-4'
                          }`}>
                            {lead}
                          </span>
                        )}

                        <ArrowRight className="w-3 h-3 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                      </Link>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </div>
    </div>
  )
}
