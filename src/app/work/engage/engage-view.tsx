/**
 * Community manager's unified inbox view. Three rails:
 *   - Attention: flagged or negative-sentiment items
 *   - Open: everything unreplied, recency-sorted
 *   - Replied: recent history for context + audit
 *
 * Each card has an AI-suggested reply (retrieval-aware: brand voice,
 * recent posts, judgment patterns). Manager edits or accepts, sends.
 * Sending stamps reply_text + reply_at, flips status to 'replied',
 * stores ai_generation_ids so we can attribute who drafted what.
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  MessagesSquare, Heart, MessageCircle, AtSign, Mail, Sparkles, Loader2,
  Send, AlertCircle, CheckCircle2, AlertTriangle, X, Clock,
} from 'lucide-react'
import type { InboxBuckets, InteractionRow } from '@/lib/work/get-engage-inbox'

interface Props { initialInbox: InboxBuckets }

type Tab = 'attention' | 'open' | 'replied'

export default function EngageView({ initialInbox }: Props) {
  const [inbox, setInbox] = useState<InboxBuckets>(initialInbox)
  const initialTab: Tab = initialInbox.attention.length > 0 ? 'attention' : 'open'
  const [tab, setTab] = useState<Tab>(initialTab)

  const tabs: Array<{ key: Tab; label: string; count: number; tone: string }> = [
    { key: 'attention', label: 'Attention', count: inbox.attention.length, tone: 'amber' },
    { key: 'open', label: 'Open', count: inbox.open.length, tone: 'teal' },
    { key: 'replied', label: 'Replied', count: inbox.replied.length, tone: 'ink' },
  ]

  const onReplied = useCallback((id: string, replyText: string, aiAssisted: boolean) => {
    setInbox(prev => {
      const findAndRemove = (rows: InteractionRow[]) => {
        const row = rows.find(r => r.id === id)
        return { row, rest: rows.filter(r => r.id !== id) }
      }
      const fromOpen = findAndRemove(prev.open)
      const fromAttn = findAndRemove(prev.attention)
      const row = fromOpen.row ?? fromAttn.row
      if (!row) return prev
      const updated: InteractionRow = {
        ...row,
        status: 'replied',
        replyText,
        replyAt: new Date().toISOString(),
        aiAssisted,
      }
      return {
        open: fromOpen.rest,
        attention: fromAttn.rest,
        replied: [updated, ...prev.replied],
      }
    })
  }, [])

  const onDismissed = useCallback((id: string) => {
    setInbox(prev => ({
      ...prev,
      open: prev.open.filter(r => r.id !== id),
      attention: prev.attention.filter(r => r.id !== id),
    }))
  }, [])

  const activeList = useMemo(() => {
    if (tab === 'attention') return inbox.attention
    if (tab === 'open') return inbox.open
    return inbox.replied
  }, [tab, inbox])

  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-teal-50 text-teal-700 ring-1 ring-teal-100 flex-shrink-0">
            <MessagesSquare className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            Reply queue
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          Comments and DMs across your assigned clients. AI drafts a reply grounded in each client&rsquo;s voice.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => {
          const isActive = tab === t.key
          const activeBorder = t.tone === 'amber' ? 'border-amber-600' : t.tone === 'teal' ? 'border-teal-600' : 'border-ink'
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                isActive ? `${activeBorder} text-ink` : 'border-transparent text-ink-3 hover:text-ink'
              }`}
            >
              {t.label}
              <span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
            </button>
          )
        })}
      </div>

      {activeList.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {activeList.map(row => (
            <InteractionCard
              key={row.id}
              row={row}
              readOnly={tab === 'replied'}
              onReplied={onReplied}
              onDismissed={onDismissed}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Interaction card
// ─────────────────────────────────────────────────────────────

function InteractionCard({
  row, readOnly, onReplied, onDismissed,
}: {
  row: InteractionRow
  readOnly: boolean
  onReplied: (id: string, replyText: string, aiAssisted: boolean) => void
  onDismissed: (id: string) => void
}) {
  const [reply, setReply] = useState(row.replyText ?? '')
  const [suggestion, setSuggestion] = useState<string | null>(null)
  const [aiAssisted, setAiAssisted] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'suggest' | 'send' | 'dismiss'>(null)
  const [error, setError] = useState<string | null>(null)

  const suggest = useCallback(async () => {
    setBusy('suggest')
    setError(null)
    try {
      const res = await fetch(`/api/work/engage/${row.id}/suggest`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setSuggestion(j.suggestion as string)
      setReply(j.suggestion as string)
      setAiAssisted(true)
      setGenerationId(j.generationId ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Suggest failed')
    } finally {
      setBusy(null)
    }
  }, [row.id])

  const send = useCallback(async () => {
    if (!reply.trim()) return
    setBusy('send')
    setError(null)
    try {
      const res = await fetch(`/api/work/engage/${row.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          replyText: reply.trim(),
          aiAssisted,
          generationId,
        }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onReplied(row.id, reply.trim(), aiAssisted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed')
    } finally {
      setBusy(null)
    }
  }, [reply, aiAssisted, generationId, row.id, onReplied])

  const dismiss = useCallback(async (markSpam: boolean) => {
    setBusy('dismiss')
    setError(null)
    try {
      const res = await fetch(`/api/work/engage/${row.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dismiss: true, spam: markSpam }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onDismissed(row.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Dismiss failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, onDismissed])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      {/* Header: client + kind + time + sentiment */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <KindBadge kind={row.kind} />
            <span className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-4">{row.platform}</span>
            <span className="text-[11px] text-ink-4 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(row.createdAtPlatform)}
            </span>
          </div>
          <p className="text-[12px] text-ink-3 truncate">
            <span className="font-medium">{row.authorName ?? 'Someone'}</span>
            {row.authorHandle && <span className="text-ink-4"> @{row.authorHandle}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {row.requiresAttention && <AlertTriangle className="w-4 h-4 text-amber-600" />}
          {row.sentiment && <SentimentDot sentiment={row.sentiment} />}
        </div>
      </div>

      {/* Text */}
      <div className="rounded-lg bg-ink-7/50 p-3 mb-3">
        <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{row.text}</p>
        {row.postCaptionSnippet && (
          <p className="text-[11px] text-ink-4 mt-2 italic line-clamp-2 border-l-2 border-ink-6 pl-2">
            On: &ldquo;{row.postCaptionSnippet}&rdquo;
          </p>
        )}
      </div>

      {readOnly ? (
        <ReadOnlyReply row={row} />
      ) : (
        <>
          {/* Reply composer */}
          <textarea
            value={reply}
            onChange={e => { setReply(e.target.value); setAiAssisted(false) }}
            placeholder="Write a reply, or click Suggest to let AI draft one grounded in this client's voice."
            rows={3}
            className="w-full text-[13px] p-3 rounded-lg ring-1 ring-ink-6 focus:ring-teal-500 focus:outline-none leading-relaxed resize-y"
          />

          {suggestion && reply !== suggestion && (
            <p className="text-[11px] text-amber-700 mt-1.5 inline-flex items-center gap-1">
              <Sparkles className="w-3 h-3" /> You edited the AI suggestion. The original draft stays in the audit.
            </p>
          )}

          {error && (
            <div className="mt-2 flex items-start gap-1.5 text-[12px] text-red-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button onClick={suggest} disabled={busy !== null}
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-teal-200 text-teal-700 hover:bg-teal-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'suggest' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {suggestion ? 'Re-suggest' : 'Suggest reply'}
            </button>
            <button onClick={send} disabled={busy !== null || !reply.trim()}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send reply
            </button>
            <div className="flex-1" />
            <button onClick={() => dismiss(false)} disabled={busy !== null}
              className="text-[11px] text-ink-3 hover:text-ink px-2 py-1.5 disabled:opacity-50 inline-flex items-center gap-1">
              <X className="w-3 h-3" /> Dismiss
            </button>
            <button onClick={() => dismiss(true)} disabled={busy !== null}
              className="text-[11px] text-ink-4 hover:text-red-700 px-2 py-1.5 disabled:opacity-50">
              Spam
            </button>
          </div>
        </>
      )}
    </article>
  )
}

function ReadOnlyReply({ row }: { row: InteractionRow }) {
  return (
    <div className="rounded-lg bg-teal-50 ring-1 ring-teal-100 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-teal-700" />
        <p className="text-[11px] font-semibold text-teal-900 uppercase tracking-wider">
          Replied{row.aiAssisted ? ' · AI-assisted' : ''}{row.replyAt ? ` · ${relativeTime(row.replyAt)}` : ''}
        </p>
      </div>
      <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{row.replyText ?? ''}</p>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Bits
// ─────────────────────────────────────────────────────────────

function KindBadge({ kind }: { kind: 'comment' | 'dm' | 'mention' }) {
  const map = {
    comment: { Icon: MessageCircle, label: 'comment', bg: 'bg-blue-50 text-blue-800 ring-blue-100' },
    dm:      { Icon: Mail,          label: 'DM',      bg: 'bg-purple-50 text-purple-800 ring-purple-100' },
    mention: { Icon: AtSign,        label: 'mention', bg: 'bg-rose-50 text-rose-800 ring-rose-100' },
  } as const
  const { Icon, label, bg } = map[kind]
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${bg}`}>
      <Icon className="w-3 h-3" /> {label}
    </span>
  )
}

function SentimentDot({ sentiment }: { sentiment: 'positive' | 'negative' | 'neutral' | 'question' }) {
  const color = sentiment === 'positive' ? 'bg-emerald-500'
    : sentiment === 'negative' ? 'bg-red-500'
    : sentiment === 'question' ? 'bg-amber-500'
    : 'bg-ink-5'
  return (
    <span title={sentiment} className={`w-2 h-2 rounded-full ${color} flex-shrink-0`} />
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg = tab === 'attention'
    ? 'No urgent items right now.'
    : tab === 'open'
    ? 'Inbox zero.'
    : 'No replies yet.'
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-12 text-center">
      <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center">
        <Heart className="w-5 h-5" />
      </div>
      <p className="text-[14px] text-ink-2 font-medium">{msg}</p>
    </div>
  )
}

function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  return `${d}d`
}
