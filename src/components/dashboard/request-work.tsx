'use client'

/**
 * Request Work card — quick actions for owners to ask the team for
 * specific marketing work. The "every action is one click" promise
 * from PRODUCT-SPEC.md applied to the things owners do most often:
 *
 *   - Request a post / reel
 *   - Request a design
 *   - Request a video
 *   - Request a campaign
 *   - Message your strategist
 *
 * Each button routes to the existing request flow for that work type.
 * The strategist gets notified; AI starts drafting where applicable.
 */

import Link from 'next/link'
import { Sparkles, Image as ImageIcon, Video, Megaphone, MessageSquare, Plus } from 'lucide-react'

const ACTIONS = [
  {
    label: 'New post',
    detail: 'Caption + creative',
    href: '/dashboard/social/requests/new',
    Icon: Sparkles,
  },
  {
    label: 'Design',
    detail: 'Graphic / poster / menu',
    href: '/dashboard/social/requests/new?type=graphic',
    Icon: ImageIcon,
  },
  {
    label: 'Video',
    detail: 'Reel / short form',
    href: '/dashboard/social/requests/new?type=video',
    Icon: Video,
  },
  {
    label: 'Campaign',
    detail: 'Multi-channel push',
    href: '/dashboard/messages?topic=campaign',
    Icon: Megaphone,
  },
  {
    label: 'Message us',
    detail: 'Ask your strategist',
    href: '/dashboard/messages',
    Icon: MessageSquare,
  },
] as const

export default function RequestWork() {
  return (
    <section className="rounded-2xl p-4 mb-5 bg-white border" style={{ borderColor: 'var(--db-border)' }}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2">
          <Plus className="w-4 h-4 text-emerald-700" />
          <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Request work
          </p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {ACTIONS.map(a => (
          <Link
            key={a.label}
            href={a.href}
            className="group flex items-start gap-2.5 p-2.5 rounded-lg border bg-white hover:border-emerald-300 hover:shadow-sm transition-all"
            style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
          >
            <div className="w-8 h-8 rounded-md bg-emerald-50 flex items-center justify-center flex-shrink-0 group-hover:bg-emerald-100 transition-colors">
              <a.Icon className="w-4 h-4 text-emerald-700" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[13px] font-semibold text-ink leading-tight">{a.label}</p>
              <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{a.detail}</p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  )
}
