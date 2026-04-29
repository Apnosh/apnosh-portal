/**
 * Tile linking from the manage-site hub to a focused editor page.
 *
 * Renders a clickable card with an icon, title, summary line, and any
 * optional "badges" (small uppercase pills like "3 with photos") that
 * preview the state of that content area at a glance.
 */

import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface Props {
  href: string
  icon: LucideIcon
  title: string
  summary: string
  badges?: string[]
}

export default function ContentTile({ href, icon: Icon, title, summary, badges }: Props) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-ink-6 bg-white p-4 hover:border-ink-4 hover:shadow-sm transition flex flex-col gap-2"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="w-9 h-9 rounded-lg bg-bg-2 flex items-center justify-center shrink-0">
          <Icon className="w-4.5 h-4.5 text-ink-3" />
        </div>
        <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-ink-2 group-hover:translate-x-0.5 transition" />
      </div>
      <div className="mt-1">
        <div className="text-[15px] font-semibold text-ink">{title}</div>
        <p className="text-xs text-ink-3 mt-0.5">{summary}</p>
      </div>
      {badges && badges.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-1">
          {badges.map(b => (
            <span
              key={b}
              className="text-[10px] uppercase tracking-wide text-ink-3 bg-bg-2 border border-ink-6 px-1.5 py-0.5 rounded"
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </Link>
  )
}
