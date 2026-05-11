'use client'

/**
 * Engage view — unified comments + DMs inbox with AI-suggested replies.
 *
 * Three tabs: Comments / DMs / Mentions (mentions stubbed).
 * Each item shows commenter, text, age, AI-suggested reply with
 * tone badge, Send / Edit / Ignore actions.
 */

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  MessageSquare, Send, Sparkles, AlertTriangle, Check, X, Loader2,
  Camera, Globe, Image as ImageIcon, Inbox as InboxIcon, ArrowLeft,
  Wand2, RefreshCw, Heart,
} from 'lucide-react'

type Tab = 'comments' | 'dms' | 'mentions'

interface RawComment {
  id: string
  platform: 'instagram' | 'facebook' | string
  text?: string
  message?: string
  username?: string
  from?: { name?: string }
  timestamp?: string
  created_time?: string
  media?: { id?: string; caption?: string; permalink?: string }
  post?: { caption?: string }
}

interface RawConversation {
  id: string
  platform: 'instagram' | 'facebook' | string
  username?: string
  participants?: { name?: string }[]
  snippet?: string
  updated_time?: string
}

interface NormalizedItem {
  id: string
  kind: 'comment' | 'dm' | 'mention'
  platform: string
  who: string
  text: string
  postCaption?: string
  postUrl?: string
  ageIso: string | null
}

interface ReplySuggestion {
  reply: string
  confidence: number
  tone: 'warm' | 'neutral' | 'cautious' | 'escalate'
  reasoning: string
}

const TONE_TINT: Record<ReplySuggestion['tone'], { bg: string; text: string; label: string; Icon: React.ComponentType<{ className?: string }> }> = {
  warm:     { bg: 'bg-emerald-50', text: 'text-emerald-700', label: 'Warm',      Icon: Heart },
  neutral:  { bg: 'bg-sky-50',     text: 'text-sky-700',     label: 'Neutral',   Icon: Sparkles },
  cautious: { bg: 'bg-amber-50',   text: 'text-amber-700',   label: 'Cautious',  Icon: AlertTriangle },
  escalate: { bg: 'bg-rose-50',    text: 'text-rose-700',    label: 'Escalate',  Icon: AlertTriangle },
}

const PLATFORM_TINT: Record<string, { bg: string; text: string; Icon: React.ComponentType<{ className?: string }> }> = {
  instagram: { bg: 'bg-rose-50',   text: 'text-rose-700',   Icon: Camera },
  facebook:  { bg: 'bg-sky-50',    text: 'text-sky-700',    Icon: Globe },
}

interface Props {
  clientId: string
  connectedPlatforms: string[]
}

export default function EngageView({ clientId, connectedPlatforms }: Props) {
  const [tab, setTab] = useState<Tab>('comments')
  const [comments, setComments] = useState<NormalizedItem[] | null>(null)
  const [dms, setDms] = useState<NormalizedItem[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)

  // AI suggestions are keyed by item id; lazily fetched.
  const [suggestions, setSuggestions] = useState<Record<string, ReplySuggestion | null>>({})
  const [loadingSuggestion, setLoadingSuggestion] = useState<Record<string, boolean>>({})

  // Reply state, per item
  const [editing, setEditing] = useState<Record<string, string>>({})
  const [sending, setSending] = useState<Record<string, boolean>>({})
  const [sent, setSent] = useState<Record<string, boolean>>({})
  const [ignored, setIgnored] = useState<Set<string>>(new Set())

  const hasConnections = connectedPlatforms.length > 0

  async function fetchAll() {
    if (!hasConnections) {
      setComments([])
      setDms([])
      return
    }
    setRefreshing(true)
    setError(null)
    try {
      const [c, d] = await Promise.all([
        fetch('/api/social/inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, action: 'fetch_comments' }),
        }).then(r => r.ok ? r.json() : Promise.reject(new Error(`fetch_comments ${r.status}`))),
        fetch('/api/social/inbox', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ clientId, action: 'fetch_conversations' }),
        }).then(r => r.ok ? r.json() : Promise.reject(new Error(`fetch_conversations ${r.status}`))),
      ])
      setComments(normalizeComments(c.results ?? c.comments ?? []))
      setDms(normalizeConversations(d.results ?? d.conversations ?? []))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not fetch inbox')
    } finally {
      setRefreshing(false)
    }
  }

  useEffect(() => {
    void fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId])

  async function loadSuggestion(item: NormalizedItem) {
    if (suggestions[item.id] !== undefined) return
    setLoadingSuggestion(prev => ({ ...prev, [item.id]: true }))
    try {
      const res = await fetch('/api/social/engage/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          commentText: item.text,
          commenterName: item.who,
          postCaption: item.postCaption,
          kind: item.kind,
        }),
      })
      if (!res.ok) throw new Error(`Server returned ${res.status}`)
      const data: { suggestion: ReplySuggestion | null } = await res.json()
      setSuggestions(prev => ({ ...prev, [item.id]: data.suggestion ?? null }))
    } catch {
      setSuggestions(prev => ({ ...prev, [item.id]: null }))
    } finally {
      setLoadingSuggestion(prev => ({ ...prev, [item.id]: false }))
    }
  }

  async function send(item: NormalizedItem, replyText: string) {
    if (!replyText.trim()) return
    setSending(prev => ({ ...prev, [item.id]: true }))
    try {
      const action = item.kind === 'dm' ? 'send_dm' : 'reply_comment'
      const params: Record<string, unknown> = {
        clientId,
        action,
        platform: item.platform,
        message: replyText.trim(),
      }
      if (item.kind === 'comment') params.commentId = item.id
      else if (item.kind === 'dm') params.conversationId = item.id

      const res = await fetch('/api/social/inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      })
      if (!res.ok) throw new Error((await res.text()) || `Server returned ${res.status}`)
      setSent(prev => ({ ...prev, [item.id]: true }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send reply')
    } finally {
      setSending(prev => ({ ...prev, [item.id]: false }))
    }
  }

  function ignore(itemId: string) {
    setIgnored(prev => new Set([...prev, itemId]))
  }

  const items = useMemo(() => {
    const source = tab === 'comments' ? comments : tab === 'dms' ? dms : []
    return (source ?? []).filter(i => !ignored.has(i.id))
  }, [tab, comments, dms, ignored])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4 lg:px-6">
      <Link
        href="/dashboard/social"
        className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink mb-4"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        Back to social
      </Link>

      <header className="mb-7">
        <div className="flex items-start justify-between gap-3 mb-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
              <MessageSquare className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Engage
            </p>
          </div>
          <button
            onClick={() => fetchAll()}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink bg-white border border-ink-6 hover:border-ink-4 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
        <h1 className="text-[28px] sm:text-[30px] leading-tight font-bold text-ink tracking-tight">
          Reply to your customers
        </h1>
        <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
          Comments and DMs from Instagram and Facebook in one place.
          AI drafts a reply for each — you hit send, edit, or skip.
        </p>
      </header>

      {/* Tabs */}
      <nav className="flex items-center gap-1 mb-5 border-b border-ink-6">
        <TabButton active={tab === 'comments'} onClick={() => setTab('comments')} label="Comments" count={comments?.length ?? null} />
        <TabButton active={tab === 'dms'} onClick={() => setTab('dms')} label="DMs" count={dms?.length ?? null} />
        <TabButton active={tab === 'mentions'} onClick={() => setTab('mentions')} label="Mentions" count={0} dim />
      </nav>

      {!hasConnections && (
        <ConnectAccountsCard />
      )}

      {error && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 px-4 py-3 text-[13px] text-rose-700 mb-4">
          {error}
        </div>
      )}

      {hasConnections && (comments === null || dms === null) && !error && (
        <div className="flex items-center justify-center py-16 text-ink-4">
          <Loader2 className="w-5 h-5 animate-spin" />
        </div>
      )}

      {hasConnections && items.length === 0 && (comments !== null && dms !== null) && (
        <EmptyState tab={tab} />
      )}

      {tab === 'mentions' && (
        <MentionsStub />
      )}

      {tab !== 'mentions' && items.length > 0 && (
        <ul className="space-y-3">
          {items.map(item => (
            <li key={item.id}>
              <ItemCard
                item={item}
                suggestion={suggestions[item.id]}
                suggestionLoading={loadingSuggestion[item.id]}
                onLoadSuggestion={() => loadSuggestion(item)}
                editingText={editing[item.id]}
                onEditChange={(v) => setEditing(prev => ({ ...prev, [item.id]: v }))}
                onSend={(txt) => send(item, txt)}
                sending={!!sending[item.id]}
                sent={!!sent[item.id]}
                onIgnore={() => ignore(item.id)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/* ─────────────────────────────── Item card ─────────────────────────────── */

function ItemCard({
  item, suggestion, suggestionLoading, onLoadSuggestion,
  editingText, onEditChange, onSend, sending, sent, onIgnore,
}: {
  item: NormalizedItem
  suggestion: ReplySuggestion | null | undefined
  suggestionLoading: boolean | undefined
  onLoadSuggestion: () => void
  editingText: string | undefined
  onEditChange: (v: string) => void
  onSend: (text: string) => void
  sending: boolean
  sent: boolean
  onIgnore: () => void
}) {
  const platform = PLATFORM_TINT[item.platform] ?? PLATFORM_TINT.instagram
  const PlatformIcon = platform.Icon
  const hasSuggestionAttempt = suggestion !== undefined && !suggestionLoading

  // Auto-load the suggestion the first time the card mounts.
  useEffect(() => {
    if (suggestion === undefined && !suggestionLoading) onLoadSuggestion()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const currentText = editingText ?? (suggestion?.reply ?? '')
  const tone = suggestion ? TONE_TINT[suggestion.tone] : null
  const ToneIcon = tone?.Icon

  return (
    <div
      className="rounded-2xl border bg-white p-4 sm:p-5"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      {/* Header: who, where, when */}
      <div className="flex items-start gap-3 mb-3">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${platform.bg} ${platform.text}`}>
          <PlatformIcon className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-[13px] font-semibold text-ink leading-tight">
              {item.who}
            </p>
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-4">
              {item.kind === 'dm' ? 'DM' : 'Comment'}
            </span>
            {item.ageIso && (
              <span className="text-[11px] text-ink-4">· {rel(item.ageIso)}</span>
            )}
          </div>
          <p className="text-[14px] text-ink-2 mt-1.5 leading-relaxed whitespace-pre-wrap">
            {item.text}
          </p>
          {item.postCaption && (
            <p className="text-[11px] text-ink-4 mt-1.5 italic line-clamp-1">
              On post: {item.postCaption}
            </p>
          )}
        </div>
      </div>

      {/* AI suggestion */}
      {suggestionLoading && (
        <div className="flex items-center gap-2 text-[12px] text-ink-3 px-3 py-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          AI drafting a reply…
        </div>
      )}

      {hasSuggestionAttempt && suggestion && suggestion.tone !== 'escalate' && (
        <div className="rounded-xl bg-bg-2/50 p-3.5">
          <div className="flex items-center gap-2 mb-2">
            <Wand2 className="w-3 h-3 text-emerald-700" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
              AI suggestion
            </p>
            {tone && ToneIcon && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone.bg} ${tone.text}`}>
                <ToneIcon className="w-2.5 h-2.5" />
                {tone.label}
              </span>
            )}
            <span className="text-[10px] text-ink-4 tabular-nums">
              {Math.round(suggestion.confidence * 100)}%
            </span>
          </div>
          <textarea
            value={currentText}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            className="w-full bg-white border border-ink-6 rounded-lg px-3 py-2 text-[13px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-none"
            disabled={sending || sent}
          />
          {suggestion.reasoning && (
            <p className="text-[10px] text-ink-4 italic mt-1.5">
              {suggestion.reasoning}
            </p>
          )}
        </div>
      )}

      {hasSuggestionAttempt && suggestion && suggestion.tone === 'escalate' && (
        <div className="rounded-xl bg-rose-50 border border-rose-200 p-3.5">
          <div className="flex items-center gap-2 mb-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
            <p className="text-[10px] font-semibold uppercase tracking-wider text-rose-700">
              AI flagged — needs your eyes
            </p>
          </div>
          <p className="text-[12px] text-ink-2 leading-relaxed">
            {suggestion.reasoning || 'This one is too sensitive for an AI draft. Reply yourself.'}
          </p>
          <textarea
            value={currentText}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            placeholder="Write your reply here…"
            className="w-full mt-2 bg-white border border-ink-6 rounded-lg px-3 py-2 text-[13px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-rose-300 focus:border-rose-400 transition-all resize-none"
            disabled={sending || sent}
          />
        </div>
      )}

      {hasSuggestionAttempt && !suggestion && (
        <div className="rounded-xl bg-bg-2/40 p-3">
          <p className="text-[12px] text-ink-3 mb-2">No AI suggestion. Write your own reply.</p>
          <textarea
            value={currentText}
            onChange={(e) => onEditChange(e.target.value)}
            rows={2}
            placeholder="Write your reply here…"
            className="w-full bg-white border border-ink-6 rounded-lg px-3 py-2 text-[13px] text-ink leading-relaxed focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:border-emerald-400 transition-all resize-none"
            disabled={sending || sent}
          />
        </div>
      )}

      {/* Actions */}
      <div className="flex flex-wrap items-center gap-2 mt-3">
        {sent ? (
          <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-emerald-700">
            <Check className="w-3.5 h-3.5" />
            Reply sent
          </span>
        ) : (
          <>
            <button
              onClick={() => onSend(currentText)}
              disabled={sending || !currentText.trim()}
              className="inline-flex items-center gap-1.5 text-[12px] font-semibold bg-ink hover:bg-ink/90 disabled:bg-ink-6 disabled:cursor-not-allowed text-white rounded-full px-3.5 py-1.5 transition-colors"
            >
              {sending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
              Send reply
            </button>
            <button
              onClick={onIgnore}
              className="inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-3 hover:text-ink rounded-full px-3 py-1.5 transition-colors"
            >
              <X className="w-3 h-3" />
              Skip
            </button>
          </>
        )}
      </div>
    </div>
  )
}

/* ─────────────────────────────── Helpers ─────────────────────────────── */

function TabButton({
  active, onClick, label, count, dim,
}: { active: boolean; onClick: () => void; label: string; count: number | null; dim?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`text-[13px] font-medium px-3 py-2 -mb-px transition-colors whitespace-nowrap ${
        active
          ? 'text-ink border-b-2 border-ink'
          : 'text-ink-3 hover:text-ink-2 border-b-2 border-transparent'
      } ${dim ? 'opacity-60' : ''}`}
    >
      {label}
      {count !== null && (
        <span className="ml-1.5 text-ink-4 text-[11px] font-normal tabular-nums">
          {count}
        </span>
      )}
    </button>
  )
}

function ConnectAccountsCard() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-8 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center mb-3 ring-1 ring-emerald-100">
        <InboxIcon className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">Connect your accounts to see comments and DMs</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        Once you connect Instagram or Facebook, every comment and message lands here with an
        AI-drafted reply ready for you to send or tweak.
      </p>
      <Link
        href="/dashboard/connected-accounts"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-full px-4 py-2 mt-5 transition-colors"
      >
        Connect accounts
      </Link>
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy: Record<Tab, { title: string; body: string }> = {
    comments: { title: 'No new comments', body: 'When customers comment on your posts, they show up here.' },
    dms:      { title: 'No new DMs', body: 'When someone messages you on Instagram or Facebook, the thread appears here.' },
    mentions: { title: 'No mentions yet', body: 'When customers tag your restaurant, the moments to repost show up here.' },
  }
  return (
    <div
      className="rounded-2xl border bg-white p-8 text-center"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <p className="text-[14px] font-semibold text-ink">{copy[tab].title}</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
        {copy[tab].body}
      </p>
    </div>
  )
}

function MentionsStub() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed bg-bg-2/30 p-6"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-bg-2 text-ink-3 flex-shrink-0">
          <ImageIcon className="w-4.5 h-4.5" />
        </div>
        <div className="flex-1">
          <p className="text-[13px] font-semibold text-ink leading-tight">
            Mentions coming soon
          </p>
          <p className="text-[12px] text-ink-3 mt-1 leading-snug">
            When a customer tags your restaurant in their story or post, we&rsquo;ll surface it
            here as a repost candidate with an AI-drafted thank-you reply.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────── Normalize ─────────────────────────────── */

function normalizeComments(raw: RawComment[]): NormalizedItem[] {
  return (raw ?? []).map(r => ({
    id: r.id,
    kind: 'comment' as const,
    platform: r.platform ?? 'instagram',
    who: r.username || r.from?.name || 'Anonymous',
    text: r.text || r.message || '',
    postCaption: r.media?.caption || r.post?.caption,
    postUrl: r.media?.permalink,
    ageIso: r.timestamp || r.created_time || null,
  }))
}

function normalizeConversations(raw: RawConversation[]): NormalizedItem[] {
  return (raw ?? []).map(r => ({
    id: r.id,
    kind: 'dm' as const,
    platform: r.platform ?? 'instagram',
    who: r.username || r.participants?.[0]?.name || 'Customer',
    text: r.snippet || '(no message preview)',
    ageIso: r.updated_time || null,
  }))
}

function rel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.round(ms / 60000)
  if (m < 60) return `${m}m ago`
  const h = Math.round(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.round(h / 24)
  if (d < 30) return `${d}d ago`
  return new Date(iso).toLocaleDateString()
}
