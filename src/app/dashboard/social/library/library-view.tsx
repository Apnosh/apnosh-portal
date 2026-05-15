'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, BookOpen, Hash, FileText, Image as ImageIcon, Video, Layers,
  Copy, Check, Send, MessageSquare,
} from 'lucide-react'
import type { LibraryData, DraftPost, HashtagSet, MediaItem } from '@/lib/dashboard/get-library'

type Tab = 'drafts' | 'hashtags' | 'media'

export default function LibraryView({ data }: { data: LibraryData }) {
  const [tab, setTab] = useState<Tab>(
    data.drafts.length > 0 ? 'drafts' :
    data.media.length > 0 ? 'media' :
    data.hashtagSets.length > 0 ? 'hashtags' :
    'drafts'
  )

  return (
    <div className="max-w-6xl mx-auto py-8 px-4 lg:px-6">
      <Link
        href="/dashboard/social"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to social
      </Link>

      <header className="mb-7">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-violet-50 text-violet-700 ring-1 ring-violet-100">
            <BookOpen className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Library
          </p>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          Your social bank
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Drafts, hashtag sets, and media we&rsquo;ve used before. A reference for what&rsquo;s
          in the bank when you&rsquo;re thinking about the next post.
        </p>
      </header>

      <nav className="flex items-center gap-1 mb-5 border-b border-ink-6">
        <TabButton active={tab === 'drafts'} onClick={() => setTab('drafts')} label="Drafts" count={data.drafts.length} Icon={FileText} />
        <TabButton active={tab === 'media'} onClick={() => setTab('media')} label="Media" count={data.media.length} Icon={ImageIcon} />
        <TabButton active={tab === 'hashtags'} onClick={() => setTab('hashtags')} label="Hashtag sets" count={data.hashtagSets.length} Icon={Hash} />
      </nav>

      {tab === 'drafts' && <DraftsTab drafts={data.drafts} />}
      {tab === 'media' && <MediaTab media={data.media} />}
      {tab === 'hashtags' && <HashtagsTab sets={data.hashtagSets} />}
    </div>
  )
}

function TabButton({
  active, onClick, label, count, Icon,
}: {
  active: boolean; onClick: () => void; label: string; count: number; Icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 text-[13px] font-medium px-3 py-2 -mb-px transition-colors ${
        active
          ? 'text-ink border-b-2 border-ink'
          : 'text-ink-3 hover:text-ink-2 border-b-2 border-transparent'
      }`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
      <span className="text-ink-4 text-[11px] font-normal tabular-nums">{count}</span>
    </button>
  )
}

/* ─────────────────────────────── Drafts ─────────────────────────────── */

function DraftsTab({ drafts }: { drafts: DraftPost[] }) {
  if (drafts.length === 0) {
    return (
      <EmptyState
        title="No drafts right now"
        body="When your strategist drafts a post for your review, it shows up here. Approve from /dashboard/social/inbox."
        Icon={FileText}
      />
    )
  }
  return (
    <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {drafts.map(d => <DraftCard key={d.id} draft={d} />)}
    </ul>
  )
}

function DraftCard({ draft }: { draft: DraftPost }) {
  const MediaIcon = draft.mediaType === 'video' ? Video : draft.mediaType === 'carousel' ? Layers : ImageIcon
  const statusTone = draft.status === 'in_review'
    ? 'bg-amber-50 text-amber-700'
    : 'bg-ink-7 text-ink-3'
  const statusLabel = draft.status === 'in_review' ? 'In review' : 'Draft'
  return (
    <Link
      href="/dashboard/social/inbox"
      className="block rounded-2xl border bg-white overflow-hidden hover:shadow-sm transition-shadow"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="aspect-square bg-bg-2 relative">
        {draft.mediaUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={draft.mediaUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <MediaIcon className="w-6 h-6 text-ink-4" />
          </div>
        )}
        <span className={`absolute top-2 left-2 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${statusTone}`}>
          {statusLabel}
        </span>
      </div>
      <div className="p-3">
        <p className="text-[12px] text-ink-2 leading-snug line-clamp-3">
          {draft.text || 'No caption yet'}
        </p>
        {draft.platforms.length > 0 && (
          <p className="text-[10px] text-ink-4 mt-1.5 uppercase tracking-wider">
            {draft.platforms.join(' · ')}
          </p>
        )}
      </div>
    </Link>
  )
}

/* ─────────────────────────────── Media ─────────────────────────────── */

function MediaTab({ media }: { media: MediaItem[] }) {
  if (media.length === 0) {
    return (
      <EmptyState
        title="No media in the bank yet"
        body="As your strategist publishes posts, the photos and videos used show up here for reference and reuse."
        Icon={ImageIcon}
      />
    )
  }
  return (
    <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
      {media.map(m => <MediaCard key={m.url} item={m} />)}
    </ul>
  )
}

function MediaCard({ item }: { item: MediaItem }) {
  const isVideo = item.mediaType === 'video' || /\.(mp4|mov|webm)$/i.test(item.url)
  return (
    <div
      className="aspect-square rounded-xl overflow-hidden bg-bg-2 relative group"
      title={item.caption}
    >
      {isVideo ? (
        <video src={item.url} className="absolute inset-0 w-full h-full object-cover" muted playsInline />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.url} alt="" className="absolute inset-0 w-full h-full object-cover" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
        <p className="text-[10px] text-white line-clamp-2 leading-tight">
          {item.caption}
        </p>
      </div>
      {isVideo && (
        <div className="absolute top-2 right-2 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
          <Video className="w-3 h-3" />
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────── Hashtags ─────────────────────────────── */

function HashtagsTab({ sets }: { sets: HashtagSet[] }) {
  if (sets.length === 0) {
    return (
      <EmptyState
        title="No hashtag sets yet"
        body="Your strategist builds hashtag bundles tailored to your audience (locals, foodies, time-of-day). They show up here for your reference."
        Icon={Hash}
      />
    )
  }
  // Group by category
  const groups = useMemo(() => {
    const m = new Map<string, HashtagSet[]>()
    for (const s of sets) {
      const key = s.category ?? 'General'
      const arr = m.get(key) ?? []
      arr.push(s)
      m.set(key, arr)
    }
    return Array.from(m.entries())
  }, [sets])

  return (
    <div className="space-y-6">
      {groups.map(([category, list]) => (
        <section key={category}>
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">
            {category}
          </h2>
          <ul className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {list.map(s => <HashtagSetCard key={s.id} set={s} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function HashtagSetCard({ set }: { set: HashtagSet }) {
  const [copied, setCopied] = useState(false)
  const formatted = set.hashtags.map(t => t.startsWith('#') ? t : `#${t}`).join(' ')

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch { /* ignore */ }
  }

  return (
    <div
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-ink leading-tight">{set.name}</p>
          <p className="text-[11px] text-ink-3 mt-0.5">
            {set.hashtags.length} tag{set.hashtags.length === 1 ? '' : 's'}
          </p>
        </div>
        <button
          onClick={copy}
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-3 hover:text-ink bg-bg-2 hover:bg-bg-2/80 rounded-full px-2.5 py-1 transition-colors"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <p className="text-[12px] text-ink-2 font-mono leading-relaxed break-words">
        {formatted}
      </p>
    </div>
  )
}

/* ─────────────────────────────── Empty ─────────────────────────────── */

function EmptyState({
  title, body, Icon,
}: {
  title: string; body: string; Icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-violet-50 text-violet-700 flex items-center justify-center mb-3 ring-1 ring-violet-100">
        <Icon className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink">{title}</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        {body}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
        <Link
          href="/dashboard/social/request"
          className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-ink hover:bg-ink/90 text-white rounded-full px-3 py-1.5 transition-colors"
        >
          <Send className="w-3 h-3" />
          Request content
        </Link>
        <Link
          href="/dashboard/messages"
          className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink rounded-full px-3 py-1.5 transition-colors"
        >
          <MessageSquare className="w-3 h-3" />
          Message strategist
        </Link>
      </div>
    </div>
  )
}
