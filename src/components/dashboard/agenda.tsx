'use client'

/**
 * Agenda — the dashboard's unified action surface.
 *
 * Replaces three previously-separate cards (Decisions queue / Reviews
 * card / Quick actions / What's working insights). Owner sees ONE
 * prioritized list of every item that wants their attention or action.
 *
 * Each row: urgency dot · plain-language label · optional draft preview
 * line · single-tap action button. Phone-friendly, dense without being
 * crowded.
 */

import Link from 'next/link'
import {
  Star, ClipboardCheck, PlugZap, FileText, ListTodo, Sparkles,
} from 'lucide-react'

export type AgendaUrgency = 'high' | 'medium' | 'low'
export type AgendaType = 'review' | 'approval' | 'connection' | 'draft' | 'task' | 'suggestion'

export interface AgendaItem {
  id: string
  type: AgendaType
  urgency: AgendaUrgency
  label: string
  detail?: string
  href: string
  actionLabel: string
}

const ICONS: Record<AgendaType, React.ReactNode> = {
  review: <Star className="w-3.5 h-3.5" />,
  approval: <ClipboardCheck className="w-3.5 h-3.5" />,
  connection: <PlugZap className="w-3.5 h-3.5" />,
  draft: <FileText className="w-3.5 h-3.5" />,
  task: <ListTodo className="w-3.5 h-3.5" />,
  suggestion: <Sparkles className="w-3.5 h-3.5" />,
}

const URGENCY_DOT: Record<AgendaUrgency, string> = {
  high: 'bg-rose-500',
  medium: 'bg-amber-400',
  low: 'bg-sky-400',
}

export default function Agenda({ items }: { items: AgendaItem[] | null }) {
  if (items === null) {
    return (
      <div className="rounded-xl p-5 mb-4 border bg-white animate-pulse" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="h-3 bg-ink-6 rounded w-24 mb-3" />
        <div className="space-y-3">
          <div className="h-4 bg-ink-6 rounded w-full" />
          <div className="h-4 bg-ink-6 rounded w-5/6" />
          <div className="h-4 bg-ink-6 rounded w-4/5" />
        </div>
      </div>
    )
  }

  return (
    <div className="rounded-xl p-5 mb-4 border bg-white" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-widest" style={{ color: 'var(--db-ink-3, #888)' }}>
          Today&apos;s agenda
        </h3>
        {items.length > 0 && (
          <span className="text-[11px]" style={{ color: 'var(--db-ink-3, #888)' }}>
            {items.length} item{items.length === 1 ? '' : 's'}
          </span>
        )}
      </div>

      {items.length === 0 ? (
        <div className="py-4 text-center">
          <p className="text-[13px]" style={{ color: 'var(--db-ink-3, #888)' }}>
            You&apos;re caught up. ✓
          </p>
        </div>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          {items.map((item) => (
            <li key={item.id} className="py-3 first:pt-0 last:pb-0">
              <div className="flex items-start gap-3">
                <span
                  className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${URGENCY_DOT[item.urgency]}`}
                  aria-label={item.urgency + ' priority'}
                />
                <span className="shrink-0 mt-0.5" style={{ color: 'var(--db-ink-3, #888)' }}>
                  {ICONS[item.type]}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-medium leading-snug" style={{ color: 'var(--db-black, #111)' }}>
                    {item.label}
                  </p>
                  {item.detail && (
                    <p className="text-[12px] mt-0.5 leading-snug truncate" style={{ color: 'var(--db-ink-3, #888)' }}>
                      {item.detail}
                    </p>
                  )}
                </div>
                <Link
                  href={item.href}
                  className="shrink-0 text-[11px] font-semibold rounded-md px-2.5 py-1 hover:bg-emerald-50"
                  style={{ color: 'var(--db-up, #00C805)', border: '1px solid var(--db-border, #e5e5e5)' }}
                >
                  {item.actionLabel}
                </Link>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
