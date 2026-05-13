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
} from 'lucide-react'
import type { InboxThread, ThreadKind } from '@/lib/dashboard/get-inbox-threads'
import { channelLabel } from '@/lib/dashboard/inbox-labels'

/* Kind-aware status line — replaces the generic "URGENT / NEEDS REPLY"
   labels with something an owner actually understands at a glance.
   Approval: when it publishes. Review: rating + reply state. Message:
   how long the customer has been waiting. */
function statusFor(t: InboxThread): { text: string; tone: 'rose' | 'amber' | 'ink' | 'brand' } {
  if (t.replied || t.severity === 'handled') return { text: 'Handled', tone: 'brand' }
  if (t.kind === 'approval') {
    const sched = t.approvalScheduledFor ? new Date(t.approvalScheduledFor) : null
    if (!sched) return { text: 'Ready to sign off', tone: 'ink' }
    const h = (sched.getTime() - Date.now()) / 3_600_000
    if (h < 0) return { text: 'Overdue · sign off now', tone: 'rose' }
    if (h < 24) return { text: `Publishes in ${Math.max(1, Math.round(h))}h`, tone: 'rose' }
    if (h < 72) return { text: `Publishes ${sched.toLocaleDateString('en-US', { weekday: 'short' })}`, tone: 'amber' }
    return { text: `Publishes ${sched.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`, tone: 'ink' }
  }
  if (t.kind === 'review') {
    const r = t.rating ?? 0
    if (r > 0 && r <= 2) return { text: `${r}★ · reply needed`, tone: 'rose' }
    if (r === 3) return { text: '3★ · reply soon', tone: 'amber' }
    if (r >= 4) return { text: `${r}★ · quick thanks`, tone: 'ink' }
    return { text: 'Reply needed', tone: 'amber' }
  }
  /* dm / comment / mention — how long the customer has been waiting */
  const mins = Math.floor((Date.now() - new Date(t.postedAt).getTime()) / 60_000)
  if (t.severity === 'urgent') return { text: 'Customer waiting · reply now', tone: 'rose' }
  if (mins < 60) return { text: `Customer waiting ${mins}m`, tone: 'amber' }
  const h = Math.floor(mins / 60)
  if (h < 24) return { text: `Customer waiting ${h}h`, tone: 'amber' }
  const d = Math.floor(h / 24)
  return { text: `Customer waiting ${d}d`, tone: 'ink' }
}

const TONE: Record<'rose' | 'amber' | 'ink' | 'brand', { bg: string; fg: string; dot: string }> = {
  rose: { bg: 'bg-rose-50', fg: 'text-rose-700', dot: 'bg-rose-500' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-800', dot: 'bg-amber-500' },
  ink: { bg: 'bg-ink-7', fg: 'text-ink-3', dot: 'bg-ink-5' },
  brand: { bg: 'bg-brand/10', fg: 'text-brand-dark', dot: 'bg-brand' },
}

interface PrimaryStrategist {
  id: string
  name: string
  firstName: string
  email: string | null
  avatarUrl: string | null
  initials: string
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

      {/* Header — short, scannable */}
      <div className="px-4 lg:px-8 pt-5 pb-2 flex items-end justify-between gap-3 bg-white border-b border-ink-6">
        <h1 className="text-[24px] sm:text-[28px] font-semibold text-ink leading-none" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
          Inbox
        </h1>
        <div className="text-[11.5px] text-ink-3 pb-0.5">
          {filtered.length === 0 ? 'You\'re all caught up' : `${filtered.length} need${filtered.length === 1 ? 's' : ''} you`}
        </div>
      </div>

      {/* Simplified toolbar: kind tabs · show-handled toggle · search · bulk-approve (only on Reviews) */}
      <div className="px-4 lg:px-8 bg-white border-b border-ink-6 flex flex-wrap items-center gap-3">
        {/* Underline tabs */}
        <nav className="flex items-center gap-1 -mb-px">
          {TABS.map(t => {
            const active = tab === t.key
            const empty = t.count === 0
            return (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`relative px-3.5 py-3 text-[13px] font-semibold transition-colors ${active ? 'text-ink' : empty ? 'text-ink-4 hover:text-ink-3' : 'text-ink-3 hover:text-ink-2'}`}
              >
                {t.label}
                {t.count > 0 && (
                  <span className={`ml-1.5 text-[10.5px] font-medium px-1.5 py-0.5 rounded-full ${active ? 'bg-brand/15 text-brand-dark' : 'bg-ink-7 text-ink-3'}`}>{t.count}</span>
                )}
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
            <div className="p-10 text-center">
              <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-brand/15 text-brand-dark grid place-items-center">
                <Check className="w-5 h-5" />
              </div>
              <p className="text-[14px] font-medium text-ink">You&rsquo;re all caught up</p>
              <p className="text-[11.5px] text-ink-3 mt-1">Nothing needs you right now. {StrategistFirst} is on it.</p>
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
  const status = statusFor(thread)
  const tone = TONE[status.tone]
  const ageLabel = relTime(thread.postedAt)
  const iconTint =
    thread.kind === 'approval' ? 'bg-ink-7 text-ink-2'
    : thread.kind === 'review' ? 'bg-amber-50 text-amber-700'
    : 'bg-brand/15 text-brand-dark'
  return (
    <button
      onClick={onClick}
      className={`w-full text-left block px-3.5 py-2.5 border-b border-ink-6 transition-colors ${active ? 'bg-brand/8' : 'bg-white hover:bg-ink-7/40'}`}
    >
      <div className="flex items-center gap-2.5">
        {/* Severity dot — at-a-glance urgency */}
        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${tone.dot}`} />

        {/* Kind icon */}
        <div className={`w-7 h-7 rounded-lg ${iconTint} grid place-items-center flex-shrink-0`}>
          <KindIcon kind={thread.kind} className="w-3.5 h-3.5" />
        </div>

        <div className="min-w-0 flex-1">
          {/* Line 1: title + age */}
          <div className="flex items-center gap-1.5">
            <span className={`text-[13px] truncate ${thread.unread ? 'font-semibold text-ink' : 'font-medium text-ink-2'}`}>
              {thread.authorName}
            </span>
            <span className="flex-1" />
            <span className="text-[10.5px] text-ink-4 whitespace-nowrap flex-shrink-0">{ageLabel}</span>
          </div>
          {/* Line 2: kind-aware status (replaces redundant snippet + generic pill) */}
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className={`text-[11px] font-medium ${tone.fg}`}>{status.text}</span>
            <span className="text-[10.5px] text-ink-4">· <ChannelBadge platform={thread.platform} kind={thread.kind} /></span>
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
  const status = statusFor(thread)
  const tone = TONE[status.tone]
  const caption = thread.approvalCaption ?? thread.text
  const media = thread.approvalMediaUrls ?? []
  const scheduled = thread.approvalScheduledFor ?? null
  const scheduledLabel = scheduled
    ? new Date(scheduled).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : null
  return (
    <div className="max-w-3xl mx-auto">
      {/* Action-first header: title + status + primary CTA all visible immediately */}
      <div className="bg-white ring-1 ring-ink-6 rounded-2xl p-4 mb-4">
        <div className="flex items-start gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-ink-7 text-ink-2 grid place-items-center flex-shrink-0">
            <FileText className="w-4.5 h-4.5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[15.5px] font-semibold text-ink leading-tight" style={{ fontFamily: 'var(--font-playfair, "Playfair Display"), serif' }}>
              {thread.authorName}
            </div>
            <div className="flex items-center gap-1.5 mt-1">
              <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tone.bg} ${tone.fg}`}>{status.text}</span>
              {thread.tags.length > 0 && (
                <span className="text-[11px] text-ink-3">· {thread.tags.join(' · ')}</span>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href={detailHref}
            className="bg-brand hover:bg-brand-dark text-white rounded-full px-4 py-2 text-[13px] font-semibold inline-flex items-center gap-1.5"
          >
            <Check className="w-3.5 h-3.5" />
            Approve &amp; sign off
          </Link>
          <Link href={detailHref} className="text-[12.5px] font-medium text-ink-2 hover:text-ink ring-1 ring-ink-5 rounded-full px-3.5 py-2">
            Edit
          </Link>
          <Link href={detailHref} className="text-[12px] text-ink-3 hover:text-ink ml-1">
            Request changes
          </Link>
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
  const status = statusFor(thread)
  const tone = TONE[status.tone]
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
          </div>
          <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
            <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${tone.bg} ${tone.fg}`}>{status.text}</span>
            {thread.tags.map(t => (
              <span key={t} className="text-[10px] px-1.5 py-0.5 rounded-full bg-ink-7 text-ink-3">{t}</span>
            ))}
          </div>
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
