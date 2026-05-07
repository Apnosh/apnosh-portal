'use client'

/**
 * Quick actions row — the "I'm here to do something" entry points.
 * Stripe-style. 4 buttons with optional badge counts (e.g. "Reply to
 * reviews (3)" when 3 unanswered reviews exist).
 *
 * Counts are loaded from existing tables. If a count is zero, the
 * button is still shown (not the badge), so users learn the layout.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, MessageSquare, Target, Utensils } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

interface Counts {
  unansweredReviews: number
  pendingApprovals: number
}

export default function QuickActions({
  clientId,
  initialCounts,
}: {
  clientId: string
  initialCounts?: Counts
}) {
  const [counts, setCounts] = useState<Counts>(initialCounts ?? { unansweredReviews: 0, pendingApprovals: 0 })

  useEffect(() => {
    if (initialCounts) return // parent batch already loaded counts
    async function load() {
      const supabase = createClient()
      const [reviews, approvals] = await Promise.all([
        supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('client_id', clientId)
          .is('response_text', null),
        supabase
          .from('deliverables')
          .select('id', { count: 'exact', head: true })
          .eq('business_id', clientId)
          .eq('status', 'client_review'),
      ])
      setCounts({
        unansweredReviews: reviews.count ?? 0,
        pendingApprovals: approvals.count ?? 0,
      })
    }
    load().catch(() => { /* silent */ })
  }, [clientId, initialCounts])

  const actions: { href: string; label: string; icon: React.ReactNode; count?: number }[] = [
    { href: '/dashboard/social', label: 'New post', icon: <Plus className="w-4 h-4" /> },
    {
      href: '/dashboard/approvals',
      label: 'Review approvals',
      icon: <MessageSquare className="w-4 h-4" />,
      count: counts.pendingApprovals,
    },
    { href: '/dashboard/social/campaigns', label: 'Launch campaign', icon: <Target className="w-4 h-4" /> },
    {
      href: '/dashboard/website/specials',
      label: 'Update specials',
      icon: <Utensils className="w-4 h-4" />,
    },
  ]

  return (
    <div className="mb-4 grid grid-cols-2 sm:grid-cols-4 gap-2">
      {actions.map((a) => (
        <Link
          key={a.label}
          href={a.href}
          className="relative flex items-center gap-2 px-3 py-2.5 rounded-lg border bg-white hover:bg-bg-2 transition-colors"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <span className="text-ink-3" style={{ color: 'var(--db-ink-3, #888)' }}>{a.icon}</span>
          <span className="text-[12px] font-medium truncate" style={{ color: 'var(--db-black, #111)' }}>
            {a.label}
          </span>
          {a.count != null && a.count > 0 && (
            <span
              className="absolute -top-1.5 -right-1.5 min-w-[18px] h-[18px] rounded-full text-white text-[10px] font-bold flex items-center justify-center px-1"
              style={{ background: '#4abd98' }}
            >
              {a.count > 99 ? '99+' : a.count}
            </span>
          )}
        </Link>
      ))}
    </div>
  )
}
