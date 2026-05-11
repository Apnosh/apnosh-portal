'use client'

/**
 * DashboardStats -- the 5-second glance strip above the hero.
 *
 * Three universal restaurant marketing metrics:
 *   - Customer activity (GBP actions: calls, directions, bookings)
 *   - Reputation (avg star + recent review velocity)
 *   - Reach (social impressions across connected platforms)
 *
 * Delta-first display: the number alone is noise, the +12% is insight.
 * For no-data states, a compact "Connect to track" link in-line, not
 * a giant dashed placeholder.
 *
 * Click-through always lands on the relevant channel page so owners can
 * dig in when they want to.
 */

import Link from 'next/link'
import { ArrowUpRight, ArrowDownRight, Minus, MapPin, Star, Megaphone } from 'lucide-react'
import type { PulseCard } from './pulse-cards'
import Sparkline from './sparkline'

interface Props {
  customers: PulseCard
  reputation: PulseCard
  reach: PulseCard
}

const ICONS = { customers: MapPin, reputation: Star, reach: Megaphone }

export default function DashboardStats({ customers, reputation, reach }: Props) {
  return (
    <section className="mb-5 db-fade db-d0">
      <div className="grid grid-cols-3 gap-3">
        <StatTile card={customers} label="Customers" iconKey="customers" connectHref="/dashboard/connected-accounts" />
        <StatTile card={reputation} label="Reputation" iconKey="reputation" connectHref="/dashboard/connected-accounts" />
        <StatTile card={reach} label="Reach" iconKey="reach" connectHref="/dashboard/connected-accounts" />
      </div>
    </section>
  )
}

function parseCompact(s: string): number | null {
  const m = s.match(/^([\d.]+)([kKmM]?)/)
  if (!m) return null
  const n = parseFloat(m[1])
  if (isNaN(n)) return null
  if (m[2] === 'k' || m[2] === 'K') return n * 1000
  if (m[2] === 'm' || m[2] === 'M') return n * 1_000_000
  return n
}

function StatTile({
  card, label, iconKey, connectHref,
}: {
  card: PulseCard
  label: string
  iconKey: keyof typeof ICONS
  connectHref: string
}) {
  const Icon = ICONS[iconKey]

  if (card.state === 'loading') {
    return (
      <div className="rounded-xl p-3.5 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border)' }}>
        <div className="h-2.5 bg-ink-6 rounded w-16 mb-2" />
        <div className="h-6 bg-ink-6 rounded w-20 mb-1" />
        <div className="h-2.5 bg-ink-6 rounded w-24" />
      </div>
    )
  }

  // Treat live-with-zero-value as no-data visually. A giant "0" reads
  // as broken; "—  Connect to track →" reads as "not set up yet."
  const valueAsNumber = typeof card.value === 'string' ? parseCompact(card.value) : null
  const effectivelyNoData = card.state === 'live' && (valueAsNumber === null || valueAsNumber === 0)

  if (card.state === 'no-data' || effectivelyNoData) {
    return (
      <Link
        href={card.href ?? connectHref}
        className="block rounded-xl p-3.5 border bg-white hover:bg-bg-2 transition-colors"
        style={{ borderColor: 'var(--db-border)' }}
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <Icon className="w-3 h-3 text-ink-4" />
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {label}
          </span>
        </div>
        <p className="text-[15px] text-ink-4 font-semibold leading-tight">—</p>
        <p className="text-[11px] text-emerald-700 font-semibold mt-1">
          {card.connectLabel ?? 'Connect to track'} →
        </p>
      </Link>
    )
  }

  // live
  const tone =
    card.up === null || card.up === undefined ? 'text-ink-4' :
    card.up ? 'text-emerald-700' : 'text-rose-700'
  const Arrow = card.up === null || card.up === undefined ? Minus : card.up ? ArrowUpRight : ArrowDownRight

  return (
    <Link
      href={card.href ?? '#'}
      className={`block rounded-xl p-3.5 border bg-white hover:shadow-sm transition-shadow ${card.alert ? 'border-rose-300 ring-1 ring-rose-200' : ''}`}
      style={{ borderColor: card.alert ? undefined : 'var(--db-border)' }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <Icon className="w-3 h-3 text-ink-4" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span className="text-[22px] font-bold text-ink leading-none">{card.value ?? '—'}</span>
        {card.delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
            <Arrow className="w-3 h-3" />{card.delta}
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-3 mt-1 leading-snug line-clamp-1">{card.subtitle}</p>
      {card.series && card.series.length > 1 && card.series.some(v => v > 0) && (
        <div className="mt-2 -mb-1">
          <Sparkline data={card.series} up={card.up !== false} height={24} />
        </div>
      )}
    </Link>
  )
}
