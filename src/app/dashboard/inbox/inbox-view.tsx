'use client'

/**
 * Inbox — Direction D customer-conversations layout.
 *
 * Toolbar: 3-segment lens (Needs you / Strategist handling / All),
 * channel filter, sentiment filter, search, bulk-approve-5★.
 * Two-pane: thread list (left) + detail with strategist's draft reply,
 * customer history, and per-thread audit log (right).
 *
 * The reply-approval flow currently routes out to the channel-specific
 * surface (reviews queue, social engage page). Inline approval will
 * land when the reply API is unified.
 */

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, MessageSquare, Star, AtSign, Inbox as InboxIcon, Sparkles, Check,
} from 'lucide-react'
import type { InboxThread, ThreadSeverity } from '@/lib/dashboard/get-inbox-threads'
import { channelLabel } from '@/lib/dashboard/inbox-labels'

interface PrimaryStrategist {
  id: string
  name: string
  firstName: string
  email: string | null
  avatarUrl: string | null
  initials: string
}

type Lens = 'needs' | 'handling' | 'all'

const SEVERITY: Record<ThreadSeverity, { label: string; rowBg: string; pillBg: string; pillFg: string; leftBar: string }> = {
  urgent: {
    label: 'URGENT',
    rowBg: 'bg-rose-50/60',
    pillBg: 'bg-rose-100',
    pillFg: 'text-rose-900',
    leftBar: 'border-l-[3px] border-rose-600',
  },
  soon: {
    label: 'NEEDS REPLY SOON',
    rowBg: 'bg-white',
    pillBg: 'bg-amber-100',
    pillFg: 'text-amber-900',
    leftBar: 'border-l-[3px] border-amber-500',
  },
  none: {
    label: 'NO RUSH',
    rowBg: 'bg-white',
    pillBg: 'bg-ink-7',
    pillFg: 'text-ink-3',
    leftBar: 'border-l-[3px] border-transparent',
  },
  handled: {
    label: 'HANDLED',
    rowBg: 'bg-white',
    pillBg: 'bg-brand/15',
    pillFg: 'text-brand-dark',
    leftBar: 'border-l-[3px] border-transparent',
  },
}

export default function InboxView({
  threads, strategist,
}: {
  threads: InboxThread[]
  strategist: PrimaryStrategist | null
}) {
  const [lens, setLens] = useState<Lens>(() => {
    const needsCount = threads.filter(t => t.severity === 'urgent' || t.severity === 'soon').length
    return needsCount > 0 ? 'needs' : 'all'
  })
  const [channel, setChannel] = useState<string>('all')
  const [sentiment, setSentiment] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const strategistFirst = strategist?.firstName ?? 'your strategist'
  const StrategistFirst = strategist?.firstName ?? 'Your strategist'

  const filtered = useMemo(() => {
    return threads.filter(t => {
      if (lens === 'needs' && !(t.severity === 'urgent' || t.severity === 'soon')) return false
      if (lens === 'handling' && t.severity !== 'handled') return false
      if (channel !== 'all' && t.platform !== channel) return false
      if (sentiment !== 'all') {
        const matchesPositive = sentiment === 'positive' && ((t.rating ?? 0) >= 4 || t.tags.includes('positive'))
        const matchesNeutral = sentiment === 'neutral' && (t.rating === 3 || t.tags.includes('neutral'))
        const matchesNegative = sentiment === 'negative' && ((t.rating ?? 0) <= 2 && t.rating !== null || t.tags.includes('negative'))
        if (!matchesPositive && !matchesNeutral && !matchesNegative) return false
      }
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${t.authorName} ${t.text} ${t.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [threads, lens, channel, sentiment, search])

  /* Auto-select first thread when filter changes. */
  const selected = useMemo(() => {
    if (selectedId) {
      const match = filtered.find(t => t.id === selectedId)
      if (match) return match
    }
    return filtered[0] ?? null
  }, [filtered, selectedId])

  const needsCount = threads.filter(t => t.severity === 'urgent' || t.severity === 'soon').length
  const handlingCount = threads.filter(t => t.severity === 'handled').length

  const bulkApprove5Star = useCallback(() => {
    // Future: POST to a bulk-approve endpoint that runs through review-reply
    // for every drafted 5★ in the current filter. v1 is a no-op stub —
    // routed out to the reviews queue.
  }, [])

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-bg-2">

      {/* Header */}
      <div className="px-4 lg:px-8 pt-6 pb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between bg-white border-b border-ink-6">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-ink leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
            Inbox
          </h1>
          <p className="text-[12.5px] text-ink-3 mt-1.5">
            Every place customers reach you. {StrategistFirst} drafts replies; you approve or rewrite.
          </p>
        </div>
        <div className="text-[12px] text-ink-3">
          <strong className="text-ink-2 font-medium">{filtered.length}</strong> thread{filtered.length === 1 ? '' : 's'} shown
        </div>
      </div>

      {/* Toolbar */}
      <div className="px-4 lg:px-8 py-3 bg-white border-b border-ink-6 flex flex-wrap items-center gap-2">
        {/* Lens segmented control */}
        <div className="inline-flex bg-ink-7 rounded-full p-0.5">
          {[
            ['needs', 'Needs you', needsCount],
            ['handling', `${strategistFirst} handling`, handlingCount],
            ['all', 'All', threads.length],
          ].map(([v, l, n]) => {
            const active = lens === v
            return (
              <button
                key={String(v)}
                onClick={() => setLens(v as Lens)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full text-[12px] font-medium transition-colors ${active ? 'bg-white shadow-sm text-ink' : 'text-ink-2 hover:text-ink'}`}
              >
                {l}
                <span className="text-[10px] text-ink-4 font-normal">{n}</span>
              </button>
            )
          })}
        </div>

        <div className="w-px h-5 bg-ink-6" />

        <select value={channel} onChange={e => setChannel(e.target.value)} className="text-[12px] px-2.5 py-1 rounded-md ring-1 ring-ink-6 bg-white text-ink-2 focus:outline-none focus:ring-ink-3">
          <option value="all">All channels</option>
          <option value="google">Google</option>
          <option value="yelp">Yelp</option>
          <option value="instagram">Instagram</option>
          <option value="facebook">Facebook</option>
        </select>
        <select value={sentiment} onChange={e => setSentiment(e.target.value)} className="text-[12px] px-2.5 py-1 rounded-md ring-1 ring-ink-6 bg-white text-ink-2 focus:outline-none focus:ring-ink-3">
          <option value="all">Any sentiment</option>
          <option value="positive">Positive</option>
          <option value="neutral">Neutral</option>
          <option value="negative">Negative</option>
        </select>

        <div className="flex-1" />

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search inbox…"
            className="text-[12px] pl-8 pr-3 py-1.5 rounded-md ring-1 ring-ink-6 bg-white focus:outline-none focus:ring-ink-3 w-[200px]"
          />
        </div>

        <button onClick={bulkApprove5Star} className="text-[12px] font-medium ring-1 ring-ink-5 text-ink-2 hover:text-ink rounded-md px-3 py-1.5 inline-flex items-center gap-1.5">
          <Check className="w-3.5 h-3.5" />
          Bulk approve · 5★
        </button>
      </div>

      {/* Two pane */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[380px_1fr] bg-white">

        {/* Thread list */}
        <div className="border-r border-ink-6 overflow-y-auto bg-white">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-ink-3">
              <InboxIcon className="w-7 h-7 text-ink-4 mx-auto mb-2" />
              <p className="text-[13px] font-medium text-ink-2">No threads here</p>
              <p className="text-[11.5px] mt-1">Try a different filter, or check back as customers reach out.</p>
            </div>
          ) : (
            filtered.map(t => (
              <ThreadRow
                key={t.id}
                thread={t}
                active={selected?.id === t.id}
                onClick={() => setSelectedId(t.id)}
              />
            ))
          )}
        </div>

        {/* Detail pane */}
        <div className="overflow-y-auto bg-bg-2 p-7">
          {selected ? (
            <ThreadDetail thread={selected} strategistFirst={strategistFirst} />
          ) : (
            <div className="text-center py-16">
              <InboxIcon className="w-8 h-8 text-ink-4 mx-auto mb-3" />
              <p className="text-[13px] text-ink-3">Select a thread to see the conversation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Thread row (left pane) ──────────────────────────────────────────

function ThreadRow({ thread, active, onClick }: { thread: InboxThread; active: boolean; onClick: () => void }) {
  const sev = SEVERITY[thread.severity]
  const ageLabel = relTime(thread.postedAt)
  const showStars = thread.rating !== null
  return (
    <button
      onClick={onClick}
      className={`w-full text-left block px-4 py-3.5 border-b border-ink-6 ${sev.leftBar} ${active ? 'bg-brand/8' : thread.severity === 'urgent' ? sev.rowBg : 'bg-white hover:bg-ink-7/40'}`}
    >
      <div className="flex items-center gap-2 mb-1">
        {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />}
        <span className="text-[12.5px] font-medium text-ink truncate">{thread.authorName}</span>
        {showStars && thread.rating !== null && (
          <span className={`text-[11px] tracking-tight ${thread.rating <= 2 ? 'text-rose-600' : 'text-amber-600'}`}>
            {'★'.repeat(thread.rating)}{'☆'.repeat(Math.max(0, 5 - thread.rating))}
          </span>
        )}
        <span className="flex-1" />
        <span className="text-[10px] text-ink-4 whitespace-nowrap">
          <ChannelBadge platform={thread.platform} kind={thread.kind} /> · {ageLabel}
        </span>
      </div>
      <p className="text-[12px] text-ink-2 leading-snug line-clamp-2 mb-1.5">{thread.text || (thread.kind === 'comment' ? '(no text)' : '—')}</p>
      <div className="flex items-center gap-1.5 flex-wrap">
        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sev.pillBg} ${sev.pillFg}`}>
          {sev.label}
        </span>
        {thread.tags.slice(0, 2).map(t => (
          <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-3">{t}</span>
        ))}
      </div>
    </button>
  )
}

function ChannelBadge({ platform, kind }: { platform: string; kind: string }) {
  if (kind === 'dm') return <>{channelLabel(platform)} DM</>
  if (kind === 'comment') return <>{channelLabel(platform)} comment</>
  if (kind === 'mention') return <>{channelLabel(platform)} mention</>
  return <>{channelLabel(platform)}</>
}

// ─── Thread detail (right pane) ──────────────────────────────────────

function ThreadDetail({ thread, strategistFirst }: { thread: InboxThread; strategistFirst: string }) {
  const sev = SEVERITY[thread.severity]
  const stars = thread.rating !== null ? '★'.repeat(thread.rating) + '☆'.repeat(Math.max(0, 5 - thread.rating)) : null
  const detailHref = thread.kind === 'review'
    ? `/dashboard/local-seo/reviews?focus=${thread.refId}`
    : `/dashboard/social/engage?focus=${thread.refId}`
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3.5 mb-5">
        <div
          className="w-11 h-11 rounded-full bg-brand/15 text-brand-dark grid place-items-center text-[14px] font-medium flex-shrink-0"
          style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}
        >
          {thread.authorName.charAt(0).toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-semibold text-ink" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {thread.authorName}
            </span>
            {stars && (
              <span className={`text-[13px] tracking-tight ${(thread.rating ?? 0) <= 2 ? 'text-rose-600' : 'text-amber-600'}`}>{stars}</span>
            )}
            <span className="text-[11.5px] text-ink-3">· <ChannelBadge platform={thread.platform} kind={thread.kind} /> · {relTime(thread.postedAt)} ago</span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sev.pillBg} ${sev.pillFg}`}>{sev.label}</span>
          </div>
          {thread.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {thread.tags.map(t => (
                <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-3">{t}</span>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Customer message */}
      <div className="bg-white ring-1 ring-ink-6 rounded-2xl p-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4 mb-1.5">
          {thread.authorName} said · {relTime(thread.postedAt)} ago
        </div>
        <p className="text-[13.5px] text-ink leading-relaxed">&ldquo;{thread.text || '(no text in this comment)'}&rdquo;</p>
        {thread.postCaption && (
          <div className="text-[11px] text-ink-3 mt-2.5 pl-3 border-l-2 border-ink-6 italic">
            on your post: &ldquo;{thread.postCaption}&rdquo;
          </div>
        )}
      </div>

      {/* Strategist's draft reply OR replied/awaiting */}
      {thread.replied ? (
        <div className="bg-brand-tint/40 ring-1 ring-brand/30 rounded-2xl p-4 mb-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-brand-dark mb-1.5 inline-flex items-center gap-1.5">
            <Check className="w-3 h-3" />
            Replied {thread.repliedAt ? `· ${relTime(thread.repliedAt)} ago` : ''}
          </div>
          <p className="text-[12.5px] text-ink-2 leading-relaxed">
            This thread is handled. Open the channel page to see the full conversation.
          </p>
        </div>
      ) : (
        <div className="bg-white ring-1 ring-ink-6 rounded-2xl mb-4 overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-2.5 border-b border-ink-6">
            <Sparkles className="w-3 h-3 text-amber-600" />
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-brand-dark">
              {strategistFirst}&rsquo;s draft reply
            </span>
            <span className="flex-1" />
            <span className="text-[10px] text-ink-4">
              matched tone: {thread.severity === 'urgent' ? 'apologetic, concrete' : 'warm, casual'}
            </span>
          </div>
          <p className="px-4 py-3.5 text-[13px] text-ink leading-relaxed">
            {/* social_interactions doesn't carry drafts yet — show a pointer to where the draft lives */}
            Draft is being prepared by {strategistFirst}. Open the channel page to review.
          </p>
          <div className="px-4 py-2.5 border-t border-ink-6 flex items-center gap-2">
            <Link
              href={detailHref}
              className={`rounded-full px-3.5 py-1.5 text-[12px] font-semibold text-white ${thread.severity === 'urgent' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-brand hover:bg-brand-dark'}`}
            >
              Approve &amp; send
            </Link>
            <Link href={detailHref} className="text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-5 rounded-full px-3 py-1.5">
              Edit
            </Link>
            <button className="text-[11.5px] text-ink-3 hover:text-ink ml-2">Ask {strategistFirst} to rewrite</button>
          </div>
        </div>
      )}

      {/* Customer history */}
      <div className="bg-white ring-1 ring-ink-6 rounded-2xl p-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-3 mb-3">Customer history</div>
        <div className="flex flex-wrap gap-x-7 gap-y-3">
          <div>
            <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-0.5">Previous reviews</div>
            <div className="text-[14px] text-ink font-medium" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {thread.kind === 'review' ? '—' : '—'}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-0.5">Last interaction</div>
            <div className="text-[14px] text-ink font-medium" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {new Date(thread.postedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
          </div>
          <div>
            <div className="text-[10px] text-ink-4 uppercase tracking-wider mb-0.5">Sentiment</div>
            <div className={`text-[14px] font-medium ${thread.severity === 'urgent' ? 'text-rose-600' : 'text-brand-dark'}`} style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {thread.severity === 'urgent' ? '↓ needs attention' : thread.severity === 'handled' ? '✓ handled' : '↑ neutral'}
            </div>
          </div>
        </div>
      </div>

      {/* What strategist did */}
      <div className="bg-brand-tint/40 rounded-2xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-dark mb-2">
          What {strategistFirst} did on this thread
        </div>
        <AuditList thread={thread} strategistFirst={strategistFirst} />
      </div>
    </div>
  )
}

function AuditList({ thread, strategistFirst }: { thread: InboxThread; strategistFirst: string }) {
  // Synthetic for now — when social_interactions stores per-thread audit
  // we'll join it. Useful starting story for the owner.
  const items: { t: string; e: string }[] = []
  items.push({ t: relTime(thread.postedAt) + ' ago', e: `Surfaced from ${channelLabel(thread.platform)} · flagged ${thread.severity}` })
  if (thread.tags.length > 0) {
    items.push({ t: '—', e: `Tagged ${thread.tags.join(', ')} automatically` })
  }
  if (thread.replied) {
    items.push({ t: thread.repliedAt ? relTime(thread.repliedAt) + ' ago' : '—', e: `${strategistFirst} sent the reply` })
  } else {
    items.push({ t: '—', e: `Draft prepared, awaiting your approval` })
  }
  return (
    <div className="space-y-1.5">
      {items.map((x, i) => (
        <div key={i} className="flex gap-3 text-[12px] text-ink-2">
          <span className="text-[10px] text-ink-4 min-w-[60px] tabular-nums" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>{x.t}</span>
          <span>{x.e}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Helpers ────────────────────────────────────────────────────────

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return '1d'
  if (d < 7) return `${d}d`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
