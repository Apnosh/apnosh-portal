/**
 * Local SEO review queue view. Three rails:
 *
 *   - Urgent: 1-2 star reviews not yet responded to (rot fastest)
 *   - Open: 3-5 star reviews still needing a thank-you
 *   - Replied: recent history (read-only)
 *
 * AI reply helper drafts a response grounded in client voice, past
 * judgments, and cross-client patterns. Manager reviews, edits,
 * sends. Full audit trail via ai_generation_ids.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Star, Sparkles, Loader2, Send, AlertCircle, CheckCircle2, X, Clock, ExternalLink, Award,
} from 'lucide-react'
import type { ReviewBuckets, ReviewRow } from '@/lib/work/get-reviews-queue'

interface Props { initialQueue: ReviewBuckets }

type Tab = 'urgent' | 'open' | 'replied'

export default function ReviewsView({ initialQueue }: Props) {
  const [queue, setQueue] = useState<ReviewBuckets>(initialQueue)
  const initial: Tab = initialQueue.urgent.length > 0 ? 'urgent' : 'open'
  const [tab, setTab] = useState<Tab>(initial)

  const tabs: Array<{ key: Tab; label: string; count: number; tone: 'red' | 'amber' | 'ink' }> = [
    { key: 'urgent', label: 'Urgent', count: queue.urgent.length, tone: 'red' },
    { key: 'open', label: 'Open', count: queue.open.length, tone: 'amber' },
    { key: 'replied', label: 'Replied', count: queue.replied.length, tone: 'ink' },
  ]

  const onReplied = useCallback((id: string, replyText: string, aiAssisted: boolean) => {
    setQueue(prev => {
      const findRemove = (rows: ReviewRow[]) => {
        const row = rows.find(r => r.id === id)
        return { row, rest: rows.filter(r => r.id !== id) }
      }
      const u = findRemove(prev.urgent)
      const o = findRemove(prev.open)
      const row = u.row ?? o.row
      if (!row) return prev
      const updated: ReviewRow = { ...row, status: 'replied', replyText, replyAt: new Date().toISOString(), aiAssisted }
      return { urgent: u.rest, open: o.rest, replied: [updated, ...prev.replied] }
    })
  }, [])

  const onDismissed = useCallback((id: string) => {
    setQueue(prev => ({
      ...prev,
      urgent: prev.urgent.filter(r => r.id !== id),
      open: prev.open.filter(r => r.id !== id),
    }))
  }, [])

  const activeList = tab === 'urgent' ? queue.urgent : tab === 'open' ? queue.open : queue.replied

  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-yellow-50 text-yellow-700 ring-1 ring-yellow-100">
            <Star className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Local SEO
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          Review queue
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          Google reviews across your assigned clients. AI drafts a gracious, on-voice response for every one — 1-2 stars surface first.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => {
          const isActive = tab === t.key
          const activeBorder =
            t.tone === 'red' ? 'border-red-600'
            : t.tone === 'amber' ? 'border-amber-600'
            : 'border-ink'
          return (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
                isActive ? `${activeBorder} text-ink` : 'border-transparent text-ink-3 hover:text-ink'
              }`}>
              {t.label}<span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
            </button>
          )
        })}
      </div>

      {activeList.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {activeList.map(row => (
            <ReviewCard
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
// Card
// ─────────────────────────────────────────────────────────────

function ReviewCard({
  row, readOnly, onReplied, onDismissed,
}: {
  row: ReviewRow
  readOnly: boolean
  onReplied: (id: string, replyText: string, aiAssisted: boolean) => void
  onDismissed: (id: string) => void
}) {
  const [reply, setReply] = useState(row.replyText ?? '')
  const [aiAssisted, setAiAssisted] = useState(false)
  const [generationId, setGenerationId] = useState<string | null>(null)
  const [suggestionWhy, setSuggestionWhy] = useState<string | null>(null)
  const [busy, setBusy] = useState<null | 'suggest' | 'send' | 'dismiss'>(null)
  const [error, setError] = useState<string | null>(null)

  const suggest = useCallback(async () => {
    setBusy('suggest')
    setError(null)
    try {
      const res = await fetch(`/api/work/reviews/${row.id}/suggest`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setReply(j.suggestion as string)
      setSuggestionWhy(j.why ?? null)
      setAiAssisted(true)
      setGenerationId(j.generationId ?? null)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id])

  const send = useCallback(async () => {
    if (!reply.trim()) return
    setBusy('send')
    setError(null)
    try {
      const res = await fetch(`/api/work/reviews/${row.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ replyText: reply.trim(), aiAssisted, generationId }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onReplied(row.id, reply.trim(), aiAssisted)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [reply, aiAssisted, generationId, row.id, onReplied])

  const dismiss = useCallback(async () => {
    setBusy('dismiss')
    setError(null)
    try {
      const res = await fetch(`/api/work/reviews/${row.id}/reply`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ dismiss: true }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onDismissed(row.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.id, onDismissed])

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <Stars rating={row.rating} />
            <span className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
            <span className="text-[10px] uppercase tracking-wider text-ink-4">{row.source}</span>
            <span className="text-[11px] text-ink-4 inline-flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {relativeTime(row.createdAtPlatform)}
            </span>
            {row.externalUrl && (
              <a href={row.externalUrl} target="_blank" rel="noopener noreferrer" className="text-ink-4 hover:text-ink-2">
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
          <p className="text-[12px] text-ink-3 inline-flex items-center gap-1.5">
            <span className="font-medium">{row.reviewerName ?? 'Anonymous'}</span>
            {row.reviewerIsLocalGuide && (
              <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold text-blue-700">
                <Award className="w-3 h-3" /> Local Guide
              </span>
            )}
          </p>
        </div>
      </div>

      {row.text && (
        <div className="rounded-lg bg-ink-7/50 p-3 mb-3">
          <p className="text-[13px] text-ink leading-relaxed whitespace-pre-wrap">{row.text}</p>
        </div>
      )}
      {!row.text && (
        <p className="text-[12px] text-ink-3 italic mb-3">Star-only review (no text)</p>
      )}

      {readOnly ? (
        <ReadOnlyReply row={row} />
      ) : (
        <>
          <textarea
            value={reply}
            onChange={e => { setReply(e.target.value); setAiAssisted(false) }}
            placeholder={row.rating <= 2
              ? 'Write a gracious, specific response. AI can draft one grounded in this client’s voice.'
              : 'Write a thank-you that mentions what they liked. AI can help.'}
            rows={3}
            className="w-full text-[13px] p-3 rounded-lg ring-1 ring-ink-6 focus:ring-yellow-500 focus:outline-none leading-relaxed resize-y"
          />

          {suggestionWhy && (
            <p className="text-[11px] text-ink-3 mt-1.5 italic inline-flex items-start gap-1">
              <Sparkles className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <span>{suggestionWhy}</span>
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
              className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-yellow-200 text-yellow-800 hover:bg-yellow-50 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'suggest' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
              {reply ? 'Re-draft' : 'Draft reply'}
            </button>
            <button onClick={send} disabled={busy !== null || !reply.trim()}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-yellow-600 text-white hover:bg-yellow-700 disabled:opacity-50 inline-flex items-center gap-1.5">
              {busy === 'send' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
              Send reply
            </button>
            <div className="flex-1" />
            <button onClick={dismiss} disabled={busy !== null}
              className="text-[11px] text-ink-3 hover:text-ink px-2 py-1.5 disabled:opacity-50 inline-flex items-center gap-1">
              <X className="w-3 h-3" /> Dismiss
            </button>
          </div>
        </>
      )}
    </article>
  )
}

function ReadOnlyReply({ row }: { row: ReviewRow }) {
  return (
    <div className="rounded-lg bg-yellow-50 ring-1 ring-yellow-100 p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <CheckCircle2 className="w-3.5 h-3.5 text-yellow-700" />
        <p className="text-[11px] font-semibold text-yellow-900 uppercase tracking-wider">
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

function Stars({ rating }: { rating: number }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map(i => (
        <Star
          key={i}
          className={`w-3.5 h-3.5 ${i <= rating ? 'fill-yellow-500 text-yellow-500' : 'text-ink-5'}`}
        />
      ))}
    </span>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg = tab === 'urgent'
    ? 'No urgent reviews. Every 1-2 star review on the book has a response.'
    : tab === 'open'
    ? 'Inbox zero on positive reviews.'
    : 'No replies yet.'
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-12 text-center">
      <Star className="w-8 h-8 text-ink-4 mx-auto mb-3" />
      <p className="text-[14px] text-ink-2 font-medium">{msg}</p>
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60_000)
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
