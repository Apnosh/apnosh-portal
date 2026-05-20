'use client'

/**
 * Inbox view — Meta Business Suite style.
 *
 *   Header: title + search/filter/more icons
 *   Primary tabs: All / Action / Reviews / Updates with counts
 *   Filter chips: Unread / Priority + per-source filters
 *   Rich rows: avatar with source badge overlay + sender + preview + timestamp
 *
 * Built for one-handed thumb scrolling on phone. Each row is a 72px+
 * tap target with everything readable without zooming.
 */

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search, SlidersHorizontal, MoreHorizontal, ChevronRight,
  CheckCircle2, Star, Calendar, Plug, Image as ImageIcon, Sparkles,
  CheckCheck,
} from 'lucide-react'
import type { InboxItem, InboxItemKind, InboxSource } from '@/lib/dashboard/get-inbox'
import { markInboxRead, markAllInboxRead } from './actions'

type PrimaryTab = 'all' | 'action' | 'reviews' | 'updates'

const PRIMARY_TABS: Array<{ key: PrimaryTab; label: string; kinds: InboxItemKind[] }> = [
  { key: 'all',      label: 'All',      kinds: ['approval', 'post_review', 'review', 'task', 'connection'] },
  { key: 'action',   label: 'Action',   kinds: ['approval', 'post_review', 'task'] },
  { key: 'reviews',  label: 'Reviews',  kinds: ['review'] },
  { key: 'updates',  label: 'Updates',  kinds: ['connection'] },
]

/* Source filter chips with their visual treatment. */
const SOURCE_FILTERS: Array<{ key: InboxSource; label: string; badge: string; badgeBg: string }> = [
  { key: 'apnosh',    label: 'Apnosh',    badge: 'A',  badgeBg: 'bg-brand text-white' },
  { key: 'google',    label: 'Google',    badge: 'G',  badgeBg: 'bg-blue-600 text-white' },
  { key: 'yelp',      label: 'Yelp',      badge: 'Y',  badgeBg: 'bg-rose-600 text-white' },
  { key: 'instagram', label: 'Instagram', badge: 'IG', badgeBg: 'bg-gradient-to-br from-purple-500 via-pink-500 to-amber-400 text-white' },
  { key: 'facebook',  label: 'Facebook',  badge: 'f',  badgeBg: 'bg-blue-700 text-white' },
  { key: 'tiktok',    label: 'TikTok',    badge: 'TT', badgeBg: 'bg-black text-white' },
]

interface ChipFilter {
  unread: boolean
  priority: boolean
  sources: Set<InboxSource>
}

const KIND_ICONS: Record<InboxItemKind, React.ComponentType<{ className?: string }>> = {
  approval:    CheckCircle2,
  post_review: ImageIcon,
  review:      Star,
  task:        Calendar,
  connection:  Plug,
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function getInitials(name: string | null | undefined): string {
  if (!name) return '?'
  return name.split(' ').filter(Boolean).slice(0, 2).map(s => s[0].toUpperCase()).join('')
}

/* Synthesize an avatar background color from the name so cards have
   visual variety without random flicker. Same name => same color. */
function avatarColor(name: string | null | undefined): string {
  const colors = [
    'bg-rose-200 text-rose-900',
    'bg-amber-200 text-amber-900',
    'bg-emerald-200 text-emerald-900',
    'bg-blue-200 text-blue-900',
    'bg-purple-200 text-purple-900',
    'bg-pink-200 text-pink-900',
    'bg-cyan-200 text-cyan-900',
    'bg-orange-200 text-orange-900',
  ]
  if (!name) return colors[0]
  let h = 0
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0
  return colors[h % colors.length]
}

interface Props {
  items: InboxItem[]
  initialFilter: string
}

export default function InboxView({ items, initialFilter }: Props) {
  const [primaryTab, setPrimaryTab] = useState<PrimaryTab>(() => {
    const t = initialFilter as PrimaryTab
    return PRIMARY_TABS.some(x => x.key === t) ? t : 'all'
  })
  const [search, setSearch] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [chip, setChip] = useState<ChipFilter>({
    unread: false,
    priority: false,
    sources: new Set<InboxSource>(),
  })

  /* Optimistic read set — tracks ids we've marked read in this session
     so the dot disappears instantly without waiting for the page to
     re-fetch. Server state catches up via the action's revalidate. */
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [, startTransition] = useTransition()

  const isUnread = (item: InboxItem) => Boolean(item.unread) && !readIds.has(item.id)

  const markOneRead = (item: InboxItem) => {
    if (!item.unread || readIds.has(item.id)) return
    setReadIds(prev => {
      const next = new Set(prev)
      next.add(item.id)
      return next
    })
    startTransition(() => {
      markInboxRead(item.id).catch(() => { /* fire-and-forget; UI already updated */ })
    })
  }

  const markAllRead = () => {
    const unreadIds = items.filter(isUnread).map(i => i.id)
    if (unreadIds.length === 0) {
      setMoreOpen(false)
      return
    }
    setReadIds(prev => {
      const next = new Set(prev)
      unreadIds.forEach(id => next.add(id))
      return next
    })
    setMoreOpen(false)
    startTransition(() => {
      markAllInboxRead(unreadIds).catch(() => { /* fire-and-forget */ })
    })
  }

  /* Counts for primary tabs — computed from raw items so chips don't
     reduce them. */
  const primaryCounts = useMemo(() => {
    const c: Record<PrimaryTab, number> = { all: 0, action: 0, reviews: 0, updates: 0 }
    for (const tab of PRIMARY_TABS) {
      c[tab.key] = items.filter(i => tab.kinds.includes(i.kind)).length
    }
    return c
  }, [items])

  /* Available sources for the chip row — only show chips for sources
     that actually have items in the current primary tab. */
  const visibleSources = useMemo(() => {
    const present = new Set<InboxSource>()
    const tab = PRIMARY_TABS.find(t => t.key === primaryTab)
    if (!tab) return SOURCE_FILTERS
    for (const item of items) {
      if (tab.kinds.includes(item.kind)) present.add(item.source)
    }
    return SOURCE_FILTERS.filter(s => present.has(s.key))
  }, [items, primaryTab])

  /* Visible rows after all filtering. */
  const visible = useMemo(() => {
    const tab = PRIMARY_TABS.find(t => t.key === primaryTab)
    let out = items.filter(i => tab?.kinds.includes(i.kind))

    if (chip.unread) out = out.filter(i => i.unread && !readIds.has(i.id))
    if (chip.priority) out = out.filter(i => i.urgency === 'high')
    if (chip.sources.size > 0) out = out.filter(i => chip.sources.has(i.source))

    if (search.trim()) {
      const q = search.trim().toLowerCase()
      out = out.filter(i => {
        const hay = [i.title, i.detail ?? '', i.senderName ?? '', i.status ?? ''].join(' ').toLowerCase()
        return hay.includes(q)
      })
    }

    return out
  }, [items, primaryTab, chip, search, readIds])

  const toggleSource = (s: InboxSource) => {
    setChip(prev => {
      const next = new Set(prev.sources)
      if (next.has(s)) next.delete(s)
      else next.add(s)
      return { ...prev, sources: next }
    })
  }

  const totalChipsActive = (chip.unread ? 1 : 0) + (chip.priority ? 1 : 0) + chip.sources.size

  return (
    <div className="pb-tabbar -mx-4 -mt-4 lg:mx-0 lg:mt-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 bg-white border-b border-ink-6 sticky top-14 z-20">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-[24px] font-semibold text-ink">Inbox</h1>
          <div className="flex items-center gap-1">
            <button
              onClick={() => setShowSearch(s => !s)}
              className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-ink-7"
              aria-label="Search"
            >
              <Search className="w-5 h-5" />
            </button>
            <button
              className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-ink-7"
              aria-label="Filters"
              onClick={() => {
                /* Reset filters for v1. Phase B: open advanced filter sheet. */
                setChip({ unread: false, priority: false, sources: new Set() })
                setSearch('')
                setShowSearch(false)
              }}
            >
              <SlidersHorizontal className="w-5 h-5" />
            </button>
            <div className="relative">
              <button
                onClick={() => setMoreOpen(o => !o)}
                className="w-10 h-10 rounded-full flex items-center justify-center text-ink-2 active:bg-ink-7"
                aria-label="More"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal className="w-5 h-5" />
              </button>
              {moreOpen && (
                <>
                  {/* Backdrop dismisses on tap-outside. */}
                  <button
                    type="button"
                    aria-hidden="true"
                    onClick={() => setMoreOpen(false)}
                    className="fixed inset-0 z-30 cursor-default"
                  />
                  <div
                    role="menu"
                    className="absolute right-0 top-full mt-1 z-40 bg-white border border-ink-6 rounded-2xl shadow-lg overflow-hidden min-w-[200px]"
                  >
                    <button
                      onClick={markAllRead}
                      className="w-full flex items-center gap-2 px-4 py-3 text-left text-[13.5px] font-semibold text-ink-2 active:bg-ink-7 min-h-[44px]"
                      role="menuitem"
                    >
                      <CheckCheck className="w-4 h-4" />
                      Mark all as read
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Inline search */}
        {showSearch && (
          <div className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search inbox..."
                className="w-full bg-ink-7 rounded-full pl-10 pr-4 h-10 text-[14px] focus:outline-none touch-input"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* Primary tabs */}
        <div className="flex items-center gap-5 overflow-x-auto touch-scroll -mx-4 px-4 scrollbar-thin">
          {PRIMARY_TABS.map(tab => {
            const count = primaryCounts[tab.key]
            const active = primaryTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setPrimaryTab(tab.key)}
                className={[
                  'inline-flex items-center gap-1.5 pb-2 -mb-px border-b-2 transition-colors min-h-[36px] flex-shrink-0',
                  active ? 'border-ink text-ink' : 'border-transparent text-ink-3',
                ].join(' ')}
              >
                <span className={`text-[15px] font-semibold ${active ? 'text-ink' : 'text-ink-3'}`}>
                  {tab.label}
                </span>
                {count > 0 && (
                  <span className={[
                    'text-[11px] font-bold rounded-full px-1.5 min-w-[20px] h-5 inline-flex items-center justify-center',
                    active ? 'bg-ink-7 text-ink' : 'bg-ink-7 text-ink-3',
                  ].join(' ')}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter chips */}
      <div className="bg-white border-b border-ink-6 sticky top-[136px] z-10">
        <div className="flex items-center gap-2 overflow-x-auto touch-scroll px-4 py-3 scrollbar-thin">
          <FilterChip
            label="Unread"
            active={chip.unread}
            onClick={() => setChip(p => ({ ...p, unread: !p.unread }))}
          />
          <FilterChip
            label="Priority"
            active={chip.priority}
            onClick={() => setChip(p => ({ ...p, priority: !p.priority }))}
          />
          <div className="w-px h-5 bg-ink-6 mx-1 flex-shrink-0" />
          {visibleSources.map(s => (
            <SourceChip
              key={s.key}
              source={s}
              active={chip.sources.has(s.key)}
              onClick={() => toggleSource(s.key)}
            />
          ))}
          {totalChipsActive > 0 && (
            <button
              onClick={() => setChip({ unread: false, priority: false, sources: new Set() })}
              className="text-[12px] font-semibold text-brand-dark active:text-brand whitespace-nowrap flex-shrink-0 px-2"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState tab={primaryTab} />
      ) : (
        <ul className="bg-white divide-y divide-ink-7">
          {visible.map(item => (
            <InboxRow
              key={item.id}
              item={item}
              isUnread={isUnread(item)}
              onTap={() => markOneRead(item)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

function FilterChip({
  label, active, onClick,
}: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex items-center px-3.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap flex-shrink-0 transition',
        active ? 'bg-ink text-white' : 'bg-ink-7 text-ink-2 active:bg-ink-6',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function SourceChip({
  source, active, onClick,
}: { source: typeof SOURCE_FILTERS[number]; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={[
        'inline-flex items-center gap-1.5 px-2.5 h-9 rounded-full text-[13px] font-semibold whitespace-nowrap flex-shrink-0 transition',
        active ? 'bg-ink text-white' : 'bg-ink-7 text-ink-2 active:bg-ink-6',
      ].join(' ')}
    >
      <span className={`inline-flex items-center justify-center w-5 h-5 rounded-full text-[9px] font-black ${source.badgeBg}`}>
        {source.badge}
      </span>
      {source.label}
    </button>
  )
}

function InboxRow({
  item, isUnread, onTap,
}: { item: InboxItem; isUnread: boolean; onTap: () => void }) {
  const Icon = KIND_ICONS[item.kind] ?? Sparkles
  const senderName = item.senderName ?? item.title
  const previewText = item.kind === 'review' && item.detail
    ? `"${item.detail.replace(/^"|"$/g, '')}"`
    : (item.detail ?? item.title)
  const sourceFilter = SOURCE_FILTERS.find(s => s.key === item.source)
  const showPriorityBadge = item.urgency === 'high' && item.kind !== 'approval'
  const initials = getInitials(senderName)
  const color = avatarColor(senderName)

  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        onClick={onTap}
        className="flex items-start gap-3 px-4 py-3.5 min-h-[72px] active:bg-ink-7 transition-colors"
      >
        {/* Avatar with source badge overlay */}
        <div className="relative w-12 h-12 flex-shrink-0">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.avatarUrl}
              alt=""
              className="w-12 h-12 rounded-full object-cover"
            />
          ) : (
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-[14px] font-bold ${color}`}>
              {initials}
            </div>
          )}
          {sourceFilter && item.source !== 'apnosh' && (
            <span className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-black ring-2 ring-white ${sourceFilter.badgeBg}`}>
              {sourceFilter.badge}
            </span>
          )}
          {item.source === 'apnosh' && (
            <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center bg-brand text-white ring-2 ring-white">
              <Icon className="w-2.5 h-2.5" />
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2 mb-0.5">
            <p className={`text-[14.5px] truncate ${isUnread ? 'font-bold text-ink' : 'font-semibold text-ink-2'}`}>
              {senderName}
            </p>
            <span className="text-[11px] text-ink-3 flex-shrink-0">{relativeTime(item.whenIso)}</span>
          </div>
          <p className={[
            'text-[13.5px] line-clamp-2 leading-snug',
            isUnread ? 'text-ink' : 'text-ink-3',
          ].join(' ')}>
            {item.kind === 'review' && item.status && (
              <span className="text-amber-600 mr-1 font-semibold">{item.status}</span>
            )}
            {previewText}
          </p>
          <div className="flex items-center gap-2 mt-1.5">
            {showPriorityBadge && (
              <span className="text-[10px] font-bold uppercase tracking-wider bg-ink-7 text-ink-2 px-1.5 py-0.5 rounded">
                Priority
              </span>
            )}
            {item.status && item.kind !== 'review' && (
              <span className="text-[11px] text-ink-3">{item.status}</span>
            )}
          </div>
        </div>

        {/* Right side: unread dot OR chevron */}
        {isUnread ? (
          <span
            className="w-2.5 h-2.5 rounded-full bg-brand flex-shrink-0 mt-2"
            aria-label="Unread"
          />
        ) : (
          <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />
        )}
      </Link>
    </li>
  )
}

function EmptyState({ tab }: { tab: PrimaryTab }) {
  const messages: Record<PrimaryTab, { title: string; body: string }> = {
    all:      { title: 'Inbox zero', body: 'Nothing needs your attention. Nice work.' },
    action:   { title: 'No actions waiting', body: 'All your approvals and tasks are done.' },
    reviews:  { title: 'No new reviews', body: 'You\'re caught up on review responses.' },
    updates:  { title: 'Everything connected', body: 'All your integrations are healthy.' },
  }
  const m = messages[tab]
  return (
    <div className="bg-white p-10 text-center mt-2">
      <div className="w-12 h-12 rounded-full bg-brand-tint mx-auto mb-3 flex items-center justify-center">
        <Sparkles className="w-5 h-5 text-brand-dark" />
      </div>
      <p className="text-[15px] font-semibold text-ink mb-1">{m.title}</p>
      <p className="text-[12.5px] text-ink-3 max-w-xs mx-auto">{m.body}</p>
    </div>
  )
}
