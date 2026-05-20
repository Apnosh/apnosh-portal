'use client'

/**
 * Inbox client view: filter chips + mobile-first card list.
 *
 * Filters are URL-aware (?filter=approvals) so deep links from the
 * AI chat and notification bell preserve context. Empty states are
 * specific to the active filter so the owner knows nothing's broken
 * when the list is clean.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Star, Calendar, Plug, ImageIcon, Sparkles, Filter,
} from 'lucide-react'
import type { InboxItem, InboxItemKind } from '@/lib/dashboard/get-inbox'

type FilterKey = 'all' | 'approvals' | 'reviews' | 'tasks' | 'connections'

const FILTERS: Array<{ key: FilterKey; label: string; kinds: InboxItemKind[] }> = [
  { key: 'all', label: 'All', kinds: ['approval', 'post_review', 'review', 'task', 'connection'] },
  { key: 'approvals', label: 'Approvals', kinds: ['approval', 'post_review'] },
  { key: 'reviews', label: 'Reviews', kinds: ['review'] },
  { key: 'tasks', label: 'Tasks', kinds: ['task'] },
  { key: 'connections', label: 'Connections', kinds: ['connection'] },
]

const KIND_META: Record<InboxItemKind, { label: string; icon: React.ComponentType<{ className?: string }>; tint: string }> = {
  approval:    { label: 'Approval',   icon: CheckCircle2,   tint: 'bg-brand-tint text-brand-dark' },
  post_review: { label: 'Post',       icon: ImageIcon,      tint: 'bg-blue-50 text-blue-700' },
  review:      { label: 'Review',     icon: Star,           tint: 'bg-amber-50 text-amber-700' },
  task:        { label: 'Task',       icon: Calendar,       tint: 'bg-purple-50 text-purple-700' },
  connection:  { label: 'Connection', icon: Plug,           tint: 'bg-rose-50 text-rose-700' },
}

const URGENCY_RING: Record<InboxItem['urgency'], string> = {
  high:   'before:bg-rose-500',
  medium: 'before:bg-amber-500',
  low:    'before:bg-emerald-500',
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

interface Props {
  items: InboxItem[]
  initialFilter: string
}

export default function InboxView({ items, initialFilter }: Props) {
  const [activeFilter, setActiveFilter] = useState<FilterKey>(() => {
    const k = initialFilter as FilterKey
    return FILTERS.some(f => f.key === k) ? k : 'all'
  })

  /* Counts per filter — drives chip badges. */
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, approvals: 0, reviews: 0, tasks: 0, connections: 0 }
    for (const f of FILTERS) {
      c[f.key] = items.filter(i => f.kinds.includes(i.kind)).length
    }
    return c
  }, [items])

  const visible = useMemo(() => {
    const f = FILTERS.find(x => x.key === activeFilter)
    if (!f) return items
    return items.filter(i => f.kinds.includes(i.kind))
  }, [items, activeFilter])

  return (
    <div className="max-w-2xl mx-auto pb-tabbar lg:pb-0">
      {/* Header */}
      <div className="px-4 lg:px-0 pt-2 pb-3">
        <h1 className="text-[24px] lg:text-[28px] font-semibold text-ink leading-tight">Inbox</h1>
        <p className="text-[13px] text-ink-3 mt-0.5">
          {counts.all === 0
            ? "You're all caught up."
            : `${counts.all} ${counts.all === 1 ? 'item' : 'items'} need you`}
        </p>
      </div>

      {/* Filter chips — horizontal scroll on mobile, wrap on desktop */}
      <div className="px-4 lg:px-0 mb-3">
        <div className="flex items-center gap-2 overflow-x-auto touch-scroll -mx-4 lg:mx-0 px-4 lg:px-0 pb-1 scrollbar-thin">
          <Filter className="w-3.5 h-3.5 text-ink-3 flex-shrink-0 hidden lg:block" />
          {FILTERS.map(f => {
            const active = activeFilter === f.key
            const count = counts[f.key]
            return (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={[
                  'inline-flex items-center gap-1.5 px-3.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap transition flex-shrink-0',
                  active
                    ? 'bg-ink text-white'
                    : 'bg-white border border-ink-6 text-ink-2 active:bg-ink-7',
                ].join(' ')}
                aria-pressed={active}
              >
                {f.label}
                {count > 0 && (
                  <span className={[
                    'text-[10.5px] font-bold rounded-full px-1.5',
                    active ? 'bg-white/20 text-white' : 'bg-ink-7 text-ink-3',
                  ].join(' ')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* List */}
      <div className="px-4 lg:px-0">
        {visible.length === 0 ? (
          <EmptyState filter={activeFilter} />
        ) : (
          <ul className="space-y-2">
            {visible.map(item => (
              <InboxRow key={item.id} item={item} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function InboxRow({ item }: { item: InboxItem }) {
  const meta = KIND_META[item.kind]
  const Icon = meta.icon

  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        className={[
          'relative block bg-white border border-ink-6 rounded-2xl p-4 active:bg-ink-7/30 transition',
          'before:absolute before:left-0 before:top-3 before:bottom-3 before:w-[3px] before:rounded-r',
          URGENCY_RING[item.urgency],
        ].join(' ')}
      >
        <div className="flex items-start gap-3 pl-1">
          <span className={`inline-flex items-center justify-center w-9 h-9 rounded-xl flex-shrink-0 ${meta.tint}`}>
            <Icon className="w-4 h-4" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-0.5">
              <p className="text-[14.5px] font-semibold text-ink leading-snug truncate">
                {item.title}
              </p>
              <span className="text-[11px] text-ink-3 flex-shrink-0">{relativeTime(item.whenIso)}</span>
            </div>
            {item.detail && (
              <p className="text-[12.5px] text-ink-2 line-clamp-2 leading-snug">{item.detail}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${meta.tint}`}>
                {meta.label}
              </span>
              {item.status && (
                <span className="text-[11px] text-ink-3">{item.status}</span>
              )}
            </div>
          </div>
        </div>
      </Link>
    </li>
  )
}

function EmptyState({ filter }: { filter: FilterKey }) {
  const messages: Record<FilterKey, { title: string; body: string }> = {
    all:         { title: 'Inbox zero', body: 'Nothing needs your attention. Nice work.' },
    approvals:   { title: 'No pending approvals', body: 'All your content is approved and scheduled.' },
    reviews:     { title: 'No unanswered reviews', body: 'Every review has a response. Keep it up.' },
    tasks:       { title: 'No open tasks', body: 'No to-dos waiting for you right now.' },
    connections: { title: 'All connections healthy', body: 'Every integration is working.' },
  }
  const m = messages[filter] ?? messages.all
  return (
    <div className="bg-white border border-ink-6 rounded-2xl p-10 text-center mt-2">
      <div className="w-12 h-12 rounded-full bg-brand-tint mx-auto mb-3 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-brand-dark" />
      </div>
      <p className="text-[15px] font-semibold text-ink mb-1">{m.title}</p>
      <p className="text-[12.5px] text-ink-3 max-w-xs mx-auto">{m.body}</p>
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1.5 mt-4 text-[12.5px] font-semibold text-brand-dark hover:text-brand"
      >
        Back to Today
      </Link>
    </div>
  )
}
