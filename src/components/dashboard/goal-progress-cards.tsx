'use client'

/**
 * GoalProgressCards — replaces channel-generic PulseCards when the
 * client has set active goals.
 *
 * Each card shows: goal title, what we measure for it, the current
 * direction (up/down/flat), and a one-line "what we're doing" note.
 * Click-through goes to the goal detail (or relevant channel page).
 *
 * Per decision 0006 (replace dashboard, keep channels) and
 * docs/PRODUCT-SPEC.md.
 */

import Link from 'next/link'
import {
  ArrowUpRight, ArrowDownRight, Minus,
  MapPin, Users, ShoppingCart, Calendar, Star, Sparkles, Clock, Briefcase,
  type LucideIcon,
} from 'lucide-react'
import type { GoalSlug } from '@/lib/goals/types'

export interface GoalCardData {
  slug: GoalSlug
  priority: 1 | 2 | 3
  displayName: string                // e.g. "More foot traffic"
  state: 'live' | 'no-data' | 'loading'
  value?: string                     // current metric value, e.g. "1.2k"
  delta?: string | null              // "+12%" or null
  up?: boolean | null
  signal?: string                    // what we're measuring, e.g. "GBP discovery searches"
  whatWereDoing?: string             // one-line "what your strategist + Apnosh are doing"
  benchmarkLine?: string             // contextual "typical for restaurants like yours is X-Y"
  href?: string                      // drill-down route
  connectLabel?: string              // empty-state CTA label
}

const GOAL_ICONS: Record<GoalSlug, LucideIcon> = {
  more_foot_traffic: MapPin,
  regulars_more_often: Users,
  more_online_orders: ShoppingCart,
  more_reservations: Calendar,
  better_reputation: Star,
  be_known_for: Sparkles,
  fill_slow_times: Clock,
  grow_catering: Briefcase,
}

/**
 * Renders metric cards for the dashboard "Your numbers" section.
 * (Cards are keyed off active goals, so the data shown reflects what
 * the owner cares about, but the visual framing is metrics-first --
 * goals live in their own sidebar tab.)
 */
export default function GoalProgressCards({ cards }: { cards: GoalCardData[] }) {
  if (cards.length === 0) return null
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map(c => <Card key={c.slug} card={c} />)}
    </div>
  )
}

function Card({ card }: { card: GoalCardData }) {
  const Icon = GOAL_ICONS[card.slug] ?? Sparkles

  if (card.state === 'loading') {
    return (
      <div className="rounded-xl p-4 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border)' }}>
        <div className="h-3 bg-ink-6 rounded w-32 mb-2" />
        <div className="h-7 bg-ink-6 rounded w-20 mb-2" />
        <div className="h-3 bg-ink-6 rounded w-full" />
      </div>
    )
  }

  if (card.state === 'no-data') {
    const trackLine = `We'll track ${card.signal?.toLowerCase() ?? 'progress'} once you're set up.`
    return (
      <div className="rounded-xl p-4 border-2 border-dashed bg-white" style={{ borderColor: 'var(--db-border, #d4e0db)' }}>
        <Header card={card} Icon={Icon} />
        <p className="text-[13px] text-ink-2 leading-relaxed mt-1.5">
          {trackLine}
        </p>
        {card.benchmarkLine && (
          <p className="text-[11px] text-ink-3 mt-1.5 leading-snug">{card.benchmarkLine}</p>
        )}
        {card.whatWereDoing && (
          <p className="text-[11px] text-ink-2 mt-2 italic leading-snug border-t border-ink-7 pt-2">
            {card.whatWereDoing}
          </p>
        )}
        {card.href && card.connectLabel && (
          <Link href={card.href} className="inline-flex items-center text-[11px] font-semibold mt-3 text-emerald-700 hover:text-emerald-800">
            {card.connectLabel} →
          </Link>
        )}
      </div>
    )
  }

  // live
  const tone =
    card.up === null || card.up === undefined ? 'text-ink-4' :
    card.up ? 'text-emerald-700' : 'text-rose-700'
  const Arrow = card.up === null || card.up === undefined ? Minus : card.up ? ArrowUpRight : ArrowDownRight

  const inner = (
    <div className="rounded-xl p-4 border bg-white hover:shadow-sm transition-shadow" style={{ borderColor: 'var(--db-border)' }}>
      <Header card={card} Icon={Icon} />
      <div className="flex items-baseline gap-2">
        <span className="text-2xl font-bold text-ink">{card.value ?? '—'}</span>
        {card.delta && (
          <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${tone}`}>
            <Arrow className="w-3 h-3" />{card.delta}
          </span>
        )}
      </div>
      <p className="text-[11px] text-ink-3 mt-1 leading-snug">{card.signal}</p>
      {card.benchmarkLine && (
        <p className="text-[11px] text-ink-3 mt-1.5 leading-snug">{card.benchmarkLine}</p>
      )}
      {card.whatWereDoing && (
        <p className="text-[11px] text-ink-2 mt-2 italic leading-snug border-t border-ink-7 pt-2">
          {card.whatWereDoing}
        </p>
      )}
    </div>
  )

  return card.href ? <Link href={card.href}>{inner}</Link> : inner
}

function Header({ card, Icon }: { card: GoalCardData; Icon: LucideIcon }) {
  // Use a tighter tracking on long labels so they fit in narrow cards.
  return (
    <div className="flex items-start gap-2 mb-1.5">
      <span className="text-[10px] font-bold w-4 h-4 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center flex-shrink-0 mt-0.5">
        {card.priority}
      </span>
      <Icon className="w-3.5 h-3.5 text-ink-4 flex-shrink-0 mt-0.5" />
      <p className="text-[10px] font-semibold uppercase tracking-wide text-ink-3 leading-tight flex-1 min-w-0">
        {card.displayName}
      </p>
    </div>
  )
}
