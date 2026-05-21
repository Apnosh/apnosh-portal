'use client'

/**
 * Inbox view — restyled to match the approved mobile home aesthetic.
 *
 *   Header: Cal Sans "Inbox" title + search / more
 *   Primary tabs: All / Action / Reviews / Updates with counts
 *   Filter chips: Unread / Priority + per-source filters (monochrome)
 *   Calm rows: kind-tinted icon (or reviewer photo) + sender + preview
 *              + subtle source/status meta + unread dot / chevron
 *
 * Mobile-only (capped at 440px like the home screen). All visual
 * styling lives in src/app/m-inbox.css, scoped under .m-inbox.
 * Behaviour (filtering, optimistic mark-read, transitions) is
 * unchanged from the previous version.
 */

import { useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import {
  Search, MoreHorizontal, ChevronRight,
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

/* Source filter chips. Badge is a short monochrome label — no rainbow
   colours, to keep rows calm and on-brand. */
const SOURCE_FILTERS: Array<{ key: InboxSource; label: string; badge: string }> = [
  { key: 'apnosh',    label: 'Apnosh',    badge: 'A'  },
  { key: 'google',    label: 'Google',    badge: 'G'  },
  { key: 'yelp',      label: 'Yelp',      badge: 'Y'  },
  { key: 'instagram', label: 'Instagram', badge: 'IG' },
  { key: 'facebook',  label: 'Facebook',  badge: 'f'  },
  { key: 'tiktok',    label: 'TikTok',    badge: 'TT' },
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

/* Maps a kind to an icon-circle modifier class for tinting. */
function kindClass(kind: InboxItemKind): string {
  if (kind === 'review') return 'k-review'
  if (kind === 'connection') return 'k-connection'
  return ''
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
     so the dot disappears instantly without waiting for a re-fetch. */
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
      markInboxRead(item.id).catch(() => { /* fire-and-forget */ })
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

  /* Available sources for the chip row — only those present in the
     current primary tab. */
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
  const clearFilters = () => setChip({ unread: false, priority: false, sources: new Set() })

  return (
    <div className="m-inbox pb-tabbar">
      {/* Header */}
      <div className="ib-head">
        <div className="ib-bar">
          <h1 className="ib-title">Inbox</h1>
          <div className="ib-acts">
            <button
              onClick={() => setShowSearch(s => !s)}
              className="ib-iconbtn"
              aria-label="Search"
              aria-pressed={showSearch}
            >
              <Search />
            </button>
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setMoreOpen(o => !o)}
                className="ib-iconbtn"
                aria-label="More"
                aria-expanded={moreOpen}
              >
                <MoreHorizontal />
              </button>
              {moreOpen && (
                <>
                  <button
                    type="button"
                    aria-hidden="true"
                    onClick={() => setMoreOpen(false)}
                    className="ib-backdrop"
                  />
                  <div role="menu" className="ib-menu">
                    <button onClick={markAllRead} role="menuitem">
                      <CheckCheck />
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
          <div className="ib-search">
            <Search />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search inbox…"
              autoFocus
            />
          </div>
        )}

        {/* Primary tabs */}
        <div className="ib-tabs">
          {PRIMARY_TABS.map(tab => {
            const count = primaryCounts[tab.key]
            const active = primaryTab === tab.key
            return (
              <button
                key={tab.key}
                onClick={() => setPrimaryTab(tab.key)}
                className={`ib-tab${active ? ' on' : ''}`}
              >
                {tab.label}
                {count > 0 && <span className="ib-tab-n">{count}</span>}
              </button>
            )
          })}
        </div>
      </div>

      {/* Filter chips */}
      {(visibleSources.length > 0) && (
        <div className="ib-filters">
          <button
            className={`ib-fchip${chip.unread ? ' on' : ''}`}
            onClick={() => setChip(p => ({ ...p, unread: !p.unread }))}
          >
            Unread
          </button>
          <button
            className={`ib-fchip${chip.priority ? ' on' : ''}`}
            onClick={() => setChip(p => ({ ...p, priority: !p.priority }))}
          >
            Priority
          </button>
          {visibleSources.length > 0 && <span className="ib-fdiv" />}
          {visibleSources.map(s => (
            <button
              key={s.key}
              className={`ib-fchip${chip.sources.has(s.key) ? ' on' : ''}`}
              onClick={() => toggleSource(s.key)}
            >
              {s.label}
            </button>
          ))}
          {totalChipsActive > 0 && (
            <button className="ib-fclear" onClick={clearFilters}>Clear</button>
          )}
        </div>
      )}

      {/* List */}
      {visible.length === 0 ? (
        <EmptyState tab={primaryTab} />
      ) : (
        <ul className="ib-list">
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

function InboxRow({
  item, isUnread, onTap,
}: { item: InboxItem; isUnread: boolean; onTap: () => void }) {
  const Icon = KIND_ICONS[item.kind] ?? Sparkles
  const senderName = item.senderName ?? item.title
  const previewText = item.kind === 'review' && item.detail
    ? `“${item.detail.replace(/^"|"$/g, '')}”`
    : (item.detail ?? item.title)
  const sourceFilter = SOURCE_FILTERS.find(s => s.key === item.source)
  const showPriorityTag = item.urgency === 'high' && item.kind !== 'approval'
  const showSourceBadge = sourceFilter && item.source !== 'apnosh'

  return (
    <li>
      <Link
        href={item.href}
        prefetch={false}
        onClick={onTap}
        className={`ib-row${isUnread ? ' unread' : ''}`}
      >
        {/* Avatar: reviewer photo if present, else kind-tinted icon */}
        <div className="ib-ava">
          {item.avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.avatarUrl} alt="" className="ib-photo" />
          ) : (
            <div className={`ib-ic ${kindClass(item.kind)}`}>
              <Icon />
            </div>
          )}
          {showSourceBadge && <span className="ib-src">{sourceFilter!.badge}</span>}
        </div>

        {/* Content */}
        <div className="ib-main">
          <div className="ib-top">
            <p className="ib-name">{senderName}</p>
            <span className="ib-time">{relativeTime(item.whenIso)}</span>
          </div>
          <p className="ib-prev">
            {item.kind === 'review' && item.status && (
              <span className="ib-rating">{item.status}</span>
            )}
            {previewText}
          </p>
          {(showPriorityTag || (item.status && item.kind !== 'review')) && (
            <div className="ib-tagrow">
              {showPriorityTag && <span className="ib-tag">Priority</span>}
              {item.status && item.kind !== 'review' && (
                <span className="ib-status">{item.status}</span>
              )}
            </div>
          )}
        </div>

        {/* End: unread dot OR chevron */}
        <div className="ib-end">
          {isUnread
            ? <span className="ib-dot" aria-label="Unread" />
            : <ChevronRight className="ib-chev" />}
        </div>
      </Link>
    </li>
  )
}

function EmptyState({ tab }: { tab: PrimaryTab }) {
  const messages: Record<PrimaryTab, { title: string; body: string }> = {
    all:      { title: 'Inbox zero', body: 'Nothing needs your attention. Nice work.' },
    action:   { title: 'No actions waiting', body: 'All your approvals and tasks are done.' },
    reviews:  { title: 'No new reviews', body: 'You’re caught up on review responses.' },
    updates:  { title: 'Everything connected', body: 'All your integrations are healthy.' },
  }
  const m = messages[tab]
  return (
    <div className="ib-empty">
      <div className="ib-empty-ic"><CheckCircle2 /></div>
      <p className="ib-empty-t">{m.title}</p>
      <p className="ib-empty-s">{m.body}</p>
    </div>
  )
}
