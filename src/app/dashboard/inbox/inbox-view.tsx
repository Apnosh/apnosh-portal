'use client'

/**
 * Inbox — Gmail-style list.
 *
 * Single-line compact rows for at-a-glance scanning. Clicking a row
 * opens the full detail (review draft, approval preview, customer
 * message) in place of the list, with a back button. No always-on
 * preview pane — the list stays scannable.
 */

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  Search, Inbox as InboxIcon, Sparkles, Check, FileText, Star, MessageSquare, AtSign, MessageCircle,
  Calendar as CalIcon, ArrowLeft,
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

const SEVERITY: Record<ThreadSeverity, { label: string; pillBg: string; pillFg: string; dot: string }> = {
  urgent: { label: 'URGENT', pillBg: 'bg-rose-100', pillFg: 'text-rose-900', dot: 'bg-rose-500' },
  soon: { label: 'SOON', pillBg: 'bg-amber-100', pillFg: 'text-amber-900', dot: 'bg-amber-500' },
  none: { label: 'NO RUSH', pillBg: 'bg-ink-7', pillFg: 'text-ink-3', dot: 'bg-ink-5' },
  handled: { label: 'HANDLED', pillBg: 'bg-brand/15', pillFg: 'text-brand-dark', dot: 'bg-brand' },
}

type KindTab = 'all' | 'approval' | 'review' | 'message'

export default function InboxView({
  threads, strategist,
}: {
  threads: InboxThread[]
  strategist: PrimaryStrategist | null
}) {
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

  const selected = useMemo(
    () => (selectedId ? threads.find(t => t.id === selectedId) ?? null : null),
    [threads, selectedId],
  )

  const TABS: { key: KindTab; label: string; count: number }[] = [
    { key: 'all', label: 'All', count: counts.all },
    { key: 'approval', label: 'Approvals', count: counts.approval },
    { key: 'review', label: 'Reviews', count: counts.review },
    { key: 'message', label: 'Messages', count: counts.message },
  ]

  /* Detail view: replaces the list when a thread is selected. */
  if (selected) {
    return (
      <div className="flex flex-col h-[calc(100vh-3.5rem)] bg-bg-2">
        <div className="px-4 lg:px-8 py-3 bg-white border-b border-ink-6 flex items-center gap-3">
          <button
            onClick={() => setSelectedId(null)}
            className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink-2 hover:text-ink"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to inbox
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-7">
          <ThreadDetail thread={selected} strategistFirst={strategistFirst} />
        </div>
      </div>
    )
  }

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

      {/* Toolbar */}
      <div className="px-4 lg:px-8 bg-white border-b border-ink-6 flex flex-wrap items-center gap-3">
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
      </div>

      {/* Gmail-style list */}
      <div className="flex-1 min-h-0 overflow-y-auto bg-white">
        {filtered.length === 0 ? (
          <div className="p-8 text-center text-ink-3">
            <InboxIcon className="w-7 h-7 text-ink-4 mx-auto mb-2" />
            <p className="text-[13px] font-medium text-ink-2">No threads here</p>
            <p className="text-[11.5px] mt-1">Try a different filter, or check back as customers reach out.</p>
          </div>
        ) : (
          <ul className="divide-y divide-ink-6">
            {filtered.map(t => (
              <ThreadRow key={t.id} thread={t} onClick={() => setSelectedId(t.id)} />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

// ─── Thread row — single-line Gmail-style ────────────────────────────

function KindIcon({ kind, className = 'w-4 h-4' }: { kind: ThreadKind; className?: string }) {
  if (kind === 'approval') return <FileText className={className} />
  if (kind === 'review') return <Star className={className} />
  if (kind === 'dm') return <MessageSquare className={className} />
  if (kind === 'comment') return <MessageCircle className={className} />
  if (kind === 'mention') return <AtSign className={className} />
  return null
}

function ThreadRow({ thread, onClick }: { thread: InboxThread; onClick: () => void }) {
  const sev = SEVERITY[thread.severity]
  const ageLabel = relTime(thread.postedAt)
  const iconTint =
    thread.kind === 'approval' ? 'text-ink-3'
    : thread.kind === 'review' ? 'text-amber-600'
    : 'text-brand-dark'
  const snippet = thread.text?.trim().replace(/\s+/g, ' ') || (thread.kind === 'approval' ? thread.approvalCaption?.trim().replace(/\s+/g, ' ') ?? '' : '')

  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full text-left flex items-center gap-3 px-4 lg:px-6 py-2.5 hover:bg-ink-7/40 transition-colors ${thread.unread ? 'bg-white' : 'bg-bg-2/30'}`}
      >
        {/* Severity dot */}
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${sev.dot}`} title={sev.label} />

        {/* Kind icon */}
        <KindIcon kind={thread.kind} className={`w-4 h-4 flex-shrink-0 ${iconTint}`} />

        {/* Sender — fixed width on desktop for column alignment */}
        <span className={`text-[13px] truncate flex-shrink-0 w-[160px] ${thread.unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
          {thread.authorName}
        </span>

        {/* Stars (reviews only) */}
        {thread.rating !== null && (
          <span className={`text-[11px] tracking-tight flex-shrink-0 ${thread.rating <= 2 ? 'text-rose-600' : 'text-amber-600'}`}>
            {'★'.repeat(thread.rating)}
          </span>
        )}

        {/* Subject/snippet — eats remaining space, single line */}
        <span className="text-[12.5px] text-ink-2 truncate flex-1 min-w-0">
          <span className="text-ink-4 mr-1.5">[{kindLabel(thread.kind)}]</span>
          {snippet || <span className="text-ink-4 italic">(no preview)</span>}
        </span>

        {/* Channel chip */}
        <span className="text-[10.5px] text-ink-3 flex-shrink-0 hidden md:inline">
          <ChannelBadge platform={thread.platform} kind={thread.kind} />
        </span>

        {/* Scheduled date for approvals */}
        {thread.kind === 'approval' && thread.approvalScheduledFor && (
          <span className="text-[10.5px] text-ink-3 flex-shrink-0 hidden md:inline-flex items-center gap-1">
            <CalIcon className="w-2.5 h-2.5" />
            {new Date(thread.approvalScheduledFor).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </span>
        )}

        {/* Time */}
        <span className="text-[11px] text-ink-4 whitespace-nowrap flex-shrink-0 tabular-nums w-[44px] text-right">
          {ageLabel}
        </span>
      </button>
    </li>
  )
}

function ChannelBadge({ platform, kind }: { platform: string; kind: string }) {
  if (kind === 'dm') return <>{channelLabel(platform)} DM</>
  if (kind === 'comment') return <>{channelLabel(platform)} comment</>
  if (kind === 'mention') return <>{channelLabel(platform)} mention</>
  return <>{channelLabel(platform)}</>
}

// ─── Thread detail ───────────────────────────────────────────────────

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

  if (thread.kind === 'approval') {
    return <ApprovalDetail thread={thread} strategistFirst={strategistFirst} detailHref={detailHref} />
  }
  return (
    <div className="max-w-3xl mx-auto">
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
