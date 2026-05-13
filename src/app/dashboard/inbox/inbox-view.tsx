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
  Search, Inbox as InboxIcon, Sparkles, Check, FileText, Star, MessageSquare, AtSign, MessageCircle,
  Calendar as CalIcon,
} from 'lucide-react'
import type { InboxThread, ThreadKind, ThreadSeverity } from '@/lib/dashboard/get-inbox-threads'
import { channelLabel, kindLabel } from '@/lib/dashboard/inbox-labels'

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

type KindTab = 'all' | 'approval' | 'review' | 'message'

export default function InboxView({
  threads, strategist,
}: {
  threads: InboxThread[]
  strategist: PrimaryStrategist | null
}) {
  /* One tab row replaces the older lens + kind chips. Messages collapses
     DMs, comments, and mentions because owners don't distinguish them. */
  const [tab, setTab] = useState<KindTab>('all')
  const [showHandled, setShowHandled] = useState(false)
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const strategistFirst = strategist?.firstName ?? 'your strategist'
  const StrategistFirst = strategist?.firstName ?? 'Your strategist'

  const matchesTab = useCallback((t: InboxThread) => {
    if (tab === 'all') return true
    if (tab === 'approval') return t.kind === 'approval'
    if (tab === 'review') return t.kind === 'review'
    return t.kind === 'dm' || t.kind === 'comment' || t.kind === 'mention'
  }, [tab])

  const filtered = useMemo(() => {
    return threads.filter(t => {
      if (!matchesTab(t)) return false
      if (!showHandled && t.severity === 'handled') return false
      if (search.trim()) {
        const q = search.trim().toLowerCase()
        const hay = `${t.authorName} ${t.text} ${t.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [threads, matchesTab, showHandled, search])

  /* Per-tab open counts (excluding handled). */
  const counts = useMemo(() => {
    const c = { all: 0, approval: 0, review: 0, message: 0 }
    for (const t of threads) {
      if (t.severity === 'handled') continue
      c.all += 1
      if (t.kind === 'approval') c.approval += 1
      else if (t.kind === 'review') c.review += 1
      else c.message += 1
    }
    return c
  }, [threads])

  /* Auto-select first thread when filter changes. */
  const selected = useMemo(() => {
    if (selectedId) {
      const match = filtered.find(t => t.id === selectedId)
      if (match) return match
    }
    return filtered[0] ?? null
  }, [filtered, selectedId])

  const bulkApprove5Star = useCallback(() => {
    /* Future: POST to a bulk-approve endpoint that runs through review-reply
       for every drafted 5★ in the current filter. v1 is a no-op stub. */
  }, [])

  const TABS: { key: KindTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'approval', label: 'Approvals', count: counts.approval },
    { key: 'review', label: 'Reviews', count: counts.review },
    { key: 'message', label: 'Messages', count: counts.message },
  ]

  return (
    <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-bg-2">

      {/* Header */}
      <div className="px-4 lg:px-8 pt-6 pb-3 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between bg-white border-b border-ink-6">
        <div>
          <h1 className="text-[26px] sm:text-[30px] font-semibold text-ink leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
            Inbox
          </h1>
          <p className="text-[12.5px] text-ink-3 mt-1.5">
            Everything that needs you. {StrategistFirst} drafts replies; you approve or rewrite.
          </p>
        </div>
        <div className="text-[12px] text-ink-3">
          <strong className="text-ink-2 font-medium">{filtered.length}</strong> shown
        </div>
      </div>

      {/* Simplified toolbar: kind tabs · show-handled toggle · search · bulk-approve (only on Reviews) */}
      <div className="px-4 lg:px-8 bg-white border-b border-ink-6 flex flex-wrap items-center gap-3">
        {/* Underline tabs */}
        <nav className="flex items-center gap-1 -mb-px">
          {TABS.map(t => {
            const active = tab === t.key
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-3.5 py-3 text-[13px] font-semibold transition-colors ${active ? 'text-ink' : 'text-ink-3 hover:text-ink-2'}`}
              >
                {t.label}
                <span className={`ml-1.5 text-[10.5px] font-normal ${active ? 'text-ink-3' : 'text-ink-4'}`}>{t.count}</span>
                {active && <span className="absolute left-0 right-0 -bottom-px h-[2px] bg-brand rounded-full" />}
              </button>
            )
          })}
        </nav>

        <div className="flex-1" />

        <label className="inline-flex items-center gap-1.5 text-[12px] text-ink-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showHandled}
            onChange={e => setShowHandled(e.target.checked)}
            className="rounded border-ink-5 text-brand focus:ring-brand"
          />
          Show handled
        </label>

        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-4 pointer-events-none" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search…"
            className="text-[12px] pl-8 pr-3 py-1.5 rounded-md ring-1 ring-ink-6 bg-white focus:outline-none focus:ring-ink-3 w-[180px]"
          />
        </div>

        {tab === 'review' && counts.review > 0 && (
          <button
            onClick={bulkApprove5Star}
            className="text-[12px] font-medium ring-1 ring-ink-5 text-ink-2 hover:text-ink rounded-md px-3 py-1.5 inline-flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Bulk approve · 5★
          </button>
        )}
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

function KindIcon({ kind, className = 'w-4 h-4' }: { kind: ThreadKind; className?: string }) {
  if (kind === 'approval') return <FileText className={className} />
  if (kind === 'review') return <Star className={className} />
  if (kind === 'dm') return <MessageSquare className={className} />
  if (kind === 'comment') return <MessageCircle className={className} />
  if (kind === 'mention') return <AtSign className={className} />
  return null
}

function ThreadRow({ thread, active, onClick }: { thread: InboxThread; active: boolean; onClick: () => void }) {
  const sev = SEVERITY[thread.severity]
  const ageLabel = relTime(thread.postedAt)
  const showStars = thread.rating !== null
  /* Kind icon tint: approvals neutral, reviews amber, social brand-green. */
  const iconTint =
    thread.kind === 'approval' ? 'bg-ink-7 text-ink-2'
    : thread.kind === 'review' ? 'bg-amber-50 text-amber-700'
    : 'bg-brand/15 text-brand-dark'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left block px-3 py-3 border-b border-ink-6 ${sev.leftBar} ${active ? 'bg-brand/8' : thread.severity === 'urgent' ? sev.rowBg : 'bg-white hover:bg-ink-7/40'}`}
    >
      <div className="flex items-start gap-2.5">
        {/* Kind icon — owners can scan and know what this is at a glance */}
        <div className={`w-7 h-7 rounded-lg ${iconTint} grid place-items-center flex-shrink-0 mt-0.5`}>
          <KindIcon kind={thread.kind} className="w-3.5 h-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            {thread.unread && <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />}
            <span className="text-[12.5px] font-medium text-ink truncate">{thread.authorName}</span>
            {showStars && thread.rating !== null && (
              <span className={`text-[11px] tracking-tight ${thread.rating <= 2 ? 'text-rose-600' : 'text-amber-600'}`}>
                {'★'.repeat(thread.rating)}{'☆'.repeat(Math.max(0, 5 - thread.rating))}
              </span>
            )}
            <span className="flex-1" />
            <span className="text-[10px] text-ink-4 whitespace-nowrap">{ageLabel}</span>
          </div>
          <div className="text-[9.5px] font-bold uppercase tracking-wider text-ink-4 mb-1">
            {kindLabel(thread.kind)} · <ChannelBadge platform={thread.platform} kind={thread.kind} />
          </div>
          <p className="text-[12px] text-ink-2 leading-snug line-clamp-2 mb-1.5">
            {thread.text || (thread.kind === 'comment' ? '(no text)' : '—')}
          </p>
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sev.pillBg} ${sev.pillFg}`}>
              {sev.label}
            </span>
            {thread.tags.slice(0, 2).map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-3">{t}</span>
            ))}
            {thread.kind === 'approval' && thread.approvalScheduledFor && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-3 inline-flex items-center gap-1">
                <CalIcon className="w-2.5 h-2.5" />
                {new Date(thread.approvalScheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
            )}
          </div>
        </div>
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

function ApprovalDetail({
  thread, strategistFirst, detailHref,
}: {
  thread: InboxThread
  strategistFirst: string
  detailHref: string
}) {
  const sev = SEVERITY[thread.severity]
  const caption = thread.approvalCaption ?? thread.text
  const media = thread.approvalMediaUrls ?? []
  const scheduled = thread.approvalScheduledFor ?? null
  const scheduledLabel = scheduled
    ? new Date(scheduled).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null
  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start gap-3.5 mb-5">
        <div className="w-11 h-11 rounded-2xl bg-ink-7 text-ink-2 grid place-items-center flex-shrink-0">
          <FileText className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[16px] font-semibold text-ink" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {thread.authorName}
            </span>
            <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${sev.pillBg} ${sev.pillFg}`}>{sev.label}</span>
          </div>
          <p className="text-[11.5px] text-ink-3 mt-1">
            Approval ready{scheduledLabel ? ` · planned for ${scheduledLabel}` : ''}
            {thread.tags.length > 0 && <> · {thread.tags.join(' · ')}</>}
          </p>
        </div>
      </div>

      {/* Media thumbnails */}
      {media.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-4">
          {media.slice(0, 3).map((u, i) => (
            <div key={i} className="aspect-square rounded-xl overflow-hidden ring-1 ring-ink-6 bg-ink-7">
              {/\.(mp4|mov|m4v|webm)(\?|$)/i.test(u) ? (
                <video src={u} className="w-full h-full object-cover" />
              ) : (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img src={u} alt="" className="w-full h-full object-cover"
                  onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none' }} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Caption preview */}
      <div className="bg-white ring-1 ring-ink-6 rounded-2xl p-4 mb-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-ink-4 mb-1.5 inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3 text-amber-600" />
          Caption · drafted by {strategistFirst}
        </div>
        {caption ? (
          <p className="text-[13.5px] text-ink leading-relaxed whitespace-pre-wrap">{caption}</p>
        ) : (
          <p className="text-[12.5px] text-ink-3 italic">No caption yet — open to add one.</p>
        )}
      </div>

      {/* Actions */}
      <div className="bg-white ring-1 ring-ink-6 rounded-2xl p-3 mb-4 flex items-center gap-2 flex-wrap">
        <Link
          href={detailHref}
          className="bg-brand hover:bg-brand-dark text-white rounded-full px-4 py-1.5 text-[12.5px] font-semibold inline-flex items-center gap-1.5"
        >
          <Check className="w-3.5 h-3.5" />
          Approve &amp; sign off
        </Link>
        <Link href={detailHref} className="text-[12px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-5 rounded-full px-3 py-1.5">
          Edit
        </Link>
        <Link href={detailHref} className="text-[12px] text-ink-3 hover:text-ink ml-2">
          Request changes
        </Link>
      </div>

      {/* What strategist did */}
      <div className="bg-brand-tint/40 rounded-2xl p-4">
        <div className="text-[10px] font-bold uppercase tracking-wider text-brand-dark mb-2">
          What {strategistFirst} did
        </div>
        <div className="space-y-1.5 text-[12px] text-ink-2">
          <div>· Approved internally {relTime(thread.postedAt)} ago — ready for your sign-off</div>
          {scheduledLabel && <div>· Planned to publish {scheduledLabel}</div>}
          {media.length > 0 && <div>· Attached {media.length} {media.length === 1 ? 'asset' : 'assets'}</div>}
        </div>
      </div>
    </div>
  )
}

function ThreadDetail({ thread, strategistFirst }: { thread: InboxThread; strategistFirst: string }) {
  const sev = SEVERITY[thread.severity]
  const stars = thread.rating !== null ? '★'.repeat(thread.rating) + '☆'.repeat(Math.max(0, 5 - thread.rating)) : null
  const detailHref = thread.kind === 'review'
    ? `/dashboard/local-seo/reviews?focus=${thread.refId}`
    : thread.kind === 'approval' ? (thread.approvalHref ?? `/dashboard/preview/${thread.refId}`)
    : `/dashboard/social/engage?focus=${thread.refId}`

  /* Approval kinds get a content-preview detail pane instead of the
     customer-message + draft-reply layout. */
  if (thread.kind === 'approval') {
    return <ApprovalDetail thread={thread} strategistFirst={strategistFirst} detailHref={detailHref} />
  }
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
