'use client'

/**
 * "Your strategist" card -- surfaces the human partner on the dashboard.
 *
 * Per docs/PRODUCT-SPEC.md: "Strategists are the moat. The platform
 * supports strategists; it doesn't replace them." Until this card
 * existed, the strategist relationship was invisible to clients.
 *
 * Phase B4. Hidden when no strategist is assigned (defaults to a
 * "your team will reach out" placeholder until assignment lands).
 */

import Link from 'next/link'
import { MessageSquare, ArrowRight } from 'lucide-react'

export interface StrategistCardData {
  name: string
  role: string
  avatarUrl: string | null
  lastInteractionAt: string | null
  lastInteractionSummary: string | null
}

function relativeTime(iso: string | null): string {
  if (!iso) return ''
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map(w => w.charAt(0).toUpperCase())
    .slice(0, 2)
    .join('')
}

export default function YourStrategist({ strategist }: { strategist: StrategistCardData | null }) {
  if (!strategist) {
    return (
      <section className="mb-6 db-fade db-d2">
        <div className="rounded-xl p-4 border bg-white" style={{ borderColor: 'var(--db-border)' }}>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-1.5">
            Your strategist
          </p>
          <p className="text-sm text-ink-2 leading-relaxed">
            Your strategist will be assigned within 24 hours of your first goals being set.
            They'll reach out to introduce themselves.
          </p>
        </div>
      </section>
    )
  }

  return (
    <section className="mb-6 db-fade db-d2">
      <div className="rounded-xl p-4 border bg-white hover:shadow-sm transition-shadow" style={{ borderColor: 'var(--db-border)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mb-3">
          Your strategist
        </p>
        <div className="flex items-start gap-3">
          {/* Avatar */}
          {strategist.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={strategist.avatarUrl}
              alt={strategist.name}
              className="w-10 h-10 rounded-full object-cover flex-shrink-0"
            />
          ) : (
            <div
              className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: '#4abd98' }}
            >
              {initialsOf(strategist.name)}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-ink truncate">{strategist.name}</p>
            <p className="text-[12px] text-ink-3 capitalize">{strategist.role.replace(/_/g, ' ')}</p>
            {strategist.lastInteractionSummary && (
              <p className="text-[12px] text-ink-2 mt-2 leading-snug">
                <span className="text-ink-4">{relativeTime(strategist.lastInteractionAt)}:</span>{' '}
                {strategist.lastInteractionSummary}
              </p>
            )}
          </div>
        </div>
        <div className="mt-3 pt-3 border-t border-ink-7 flex items-center justify-between">
          <Link
            href="/dashboard/messages"
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700 hover:text-emerald-800"
          >
            <MessageSquare className="w-3.5 h-3.5" />
            Send a message
          </Link>
          {/* "Next review" CTA hidden for v1 -- /dashboard/quarterly-review
              is a placeholder. Re-add when the review flow ships. */}
        </div>
      </div>
    </section>
  )
}
