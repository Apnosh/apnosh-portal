'use client'

/**
 * Inbox view — tabbed unified list of action items.
 *
 * Filters:
 *   - All
 *   - Approvals (deliverables + posts in review)
 *   - Reviews (customer reviews waiting on a response)
 *   - Tasks (strategist-surfaced tasks)
 *
 * Each row shows: icon by kind, title, optional detail, urgency tone,
 * relative timestamp, status chip, and an action chevron. Click goes
 * to the relevant detail page (approval workflow, reviews queue, etc.).
 */

import { useState, useMemo } from 'react'
import Link from 'next/link'
import {
  CheckSquare, MessageSquare, ListTodo, FileText, Send, Inbox as InboxIcon,
  ChevronRight, PlugZap,
} from 'lucide-react'
import type { InboxItem, InboxItemKind } from '@/lib/dashboard/get-inbox'

type Filter = 'all' | 'approval' | 'review' | 'task'

const FILTER_LABEL: Record<Filter, string> = {
  all: 'All',
  approval: 'Approvals',
  review: 'Reviews',
  task: 'Tasks',
}

function kindToFilter(k: InboxItemKind): Filter {
  if (k === 'approval' || k === 'post_review') return 'approval'
  if (k === 'review') return 'review'
  // Connection-fix items live alongside tasks in the Tasks filter —
  // both are "things you need to do," and adding a 5th tab for one
  // rarely-shown kind isn't worth the UI weight.
  return 'task'
}

const KIND_ICON: Record<InboxItemKind, React.ComponentType<{ className?: string }>> = {
  approval: CheckSquare,
  post_review: Send,
  review: MessageSquare,
  task: ListTodo,
  connection: PlugZap,
}

const URGENCY_TONE: Record<InboxItem['urgency'], string> = {
  high: 'text-rose-700 border-l-2 border-rose-500',
  medium: 'text-amber-800 border-l-2 border-amber-400',
  low: 'text-ink-2 border-l-2 border-transparent',
}

const STATUS_TONE: Record<string, string> = {
  'Awaiting your review': 'bg-amber-50 text-amber-700',
  'In review': 'bg-amber-50 text-amber-700',
  'Overdue': 'bg-rose-50 text-rose-700',
  'Due today': 'bg-rose-50 text-rose-700',
  'Received': 'bg-sky-50 text-sky-700',
  'In progress': 'bg-purple-50 text-purple-700',
  'Drafting': 'bg-purple-50 text-purple-700',
  'Expired': 'bg-rose-50 text-rose-700',
  'Disconnected': 'bg-rose-50 text-rose-700',
  'Needs attention': 'bg-amber-50 text-amber-700',
}

function statusClass(s: string | undefined): string {
  if (!s) return 'bg-ink-7 text-ink-3'
  if (STATUS_TONE[s]) return STATUS_TONE[s]
  if (s.startsWith('Due ')) return 'bg-amber-50 text-amber-700'
  if (/★/.test(s)) {
    const n = parseInt(s, 10)
    if (n <= 3) return 'bg-rose-50 text-rose-700'
    if (n === 4) return 'bg-amber-50 text-amber-700'
    return 'bg-emerald-50 text-emerald-700'
  }
  return 'bg-ink-7 text-ink-3'
}

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function InboxView({ items }: { items: InboxItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { all: items.length, approval: 0, review: 0, task: 0 }
    for (const it of items) c[kindToFilter(it.kind)]++
    return c
  }, [items])

  const filtered = useMemo(() => {
    if (filter === 'all') return items
    return items.filter(i => kindToFilter(i.kind) === filter)
  }, [items, filter])

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <InboxIcon className="w-4 h-4 text-ink-3" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Inbox
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ink">
          {items.length === 0
            ? 'You’re caught up'
            : `${items.length} item${items.length === 1 ? '' : 's'} need${items.length === 1 ? 's' : ''} your attention`}
        </h1>
        <p className="text-sm text-ink-3 mt-1">
          Approvals, reviews, and tasks in one place. Most urgent at the top.
        </p>
      </header>

      {/* Filter tabs */}
      <nav className="flex items-center gap-1 mb-5 border-b border-ink-6 overflow-x-auto">
        {(Object.keys(FILTER_LABEL) as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`text-[13px] font-medium px-3 py-2 -mb-px transition-colors whitespace-nowrap ${
              filter === f
                ? 'text-ink border-b-2 border-ink'
                : 'text-ink-3 hover:text-ink-2 border-b-2 border-transparent'
            }`}
          >
            {FILTER_LABEL[f]}
            <span className="ml-1.5 text-ink-4 text-[11px] font-normal">{counts[f]}</span>
          </button>
        ))}
      </nav>

      {/* List */}
      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <ul className="space-y-2">
          {filtered.map(item => <Row key={item.id} item={item} />)}
        </ul>
      )}
    </div>
  )
}

function Row({ item }: { item: InboxItem }) {
  const Icon = KIND_ICON[item.kind] ?? FileText
  return (
    <li>
      <Link
        href={item.href}
        className={`block rounded-xl border bg-white p-4 hover:shadow-sm transition-shadow ${URGENCY_TONE[item.urgency]}`}
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-md bg-bg-2 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Icon className="w-4 h-4 text-ink-3" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[14px] font-semibold text-ink leading-snug">
              {item.title}
            </p>
            {item.detail && (
              <p className="text-[12px] text-ink-3 mt-0.5 leading-snug">
                {item.detail}
              </p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              {item.status && (
                <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusClass(item.status)}`}>
                  {item.status}
                </span>
              )}
              <span className="text-[11px] text-ink-4">{relativeTime(item.whenIso)}</span>
            </div>
          </div>
          <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />
        </div>
      </Link>
    </li>
  )
}

function EmptyState({ filter }: { filter: Filter }) {
  const copy: Record<Filter, { title: string; body: string }> = {
    all: {
      title: 'You’re caught up',
      body: 'Nothing needs your attention right now. New approvals, reviews, and tasks show up here as they come in.',
    },
    approval: {
      title: 'No approvals waiting',
      body: 'Content drafted by your strategist will appear here for your review. First drafts typically land within 48 hours of your kickoff call.',
    },
    review: {
      title: 'No unanswered reviews',
      body: 'When customers leave reviews on Google or Yelp, the ones that need a response show up here.',
    },
    task: {
      title: 'No open tasks',
      body: 'Your strategist will sometimes surface specific things for you to do (provide a photo, confirm a hours change, etc.) — those show up here.',
    },
  }
  const c = copy[filter]
  return (
    <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border)' }}>
      <h2 className="text-base font-semibold text-ink mb-1.5">{c.title}</h2>
      <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">{c.body}</p>
    </div>
  )
}
