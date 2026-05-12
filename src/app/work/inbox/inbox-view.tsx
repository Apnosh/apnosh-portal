/**
 * Inbox view — three rails (Requests, Internal, Recent) with one-click
 * actions per row. Accept creates a content_draft seeded with the
 * request body and routes the user to /work/drafts to keep working.
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import {
  Inbox, Sparkles, Loader2, CheckCircle2, X, Clock, AlertCircle,
  ArrowRight, Wrench, MessageSquareWarning, FileText,
} from 'lucide-react'
import type { InboxBuckets, InboxRow } from '@/lib/work/get-inbox'

interface Props { initialInbox: InboxBuckets }

type Tab = 'requests' | 'internal' | 'recent'

export default function InboxView({ initialInbox }: Props) {
  const router = useRouter()
  const params = useSearchParams()
  const focusId = params.get('focus') ?? params.get('task')
  const [inbox, setInbox] = useState<InboxBuckets>(initialInbox)
  // If we arrived with ?focus=<id>, open the tab that contains it.
  const initial: Tab = (() => {
    if (focusId) {
      if (initialInbox.clientRequests.some(r => r.id === focusId)) return 'requests'
      if (initialInbox.internal.some(r => r.id === focusId)) return 'internal'
      if (initialInbox.recent.some(r => r.id === focusId)) return 'recent'
    }
    return initialInbox.clientRequests.length > 0 ? 'requests'
      : initialInbox.internal.length > 0 ? 'internal' : 'recent'
  })()
  const [tab, setTab] = useState<Tab>(initial)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const focusRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!focusId) return
    // Wait one frame so the row is mounted, then bring it on-screen.
    const t = setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [focusId, tab])

  const removeRow = (id: string) => {
    setInbox(prev => ({
      ...prev,
      clientRequests: prev.clientRequests.filter(r => r.id !== id),
      internal: prev.internal.filter(r => r.id !== id),
    }))
  }

  const accept = useCallback(async (row: InboxRow) => {
    setBusy(row.id); setError(null)
    try {
      const res = await fetch(`/api/work/inbox/${row.id}/accept`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      removeRow(row.id)
      // Send the user to /work/drafts so they can continue working on
      // the newly-created draft.
      router.push(`/work/drafts?focus=${j.draftId ?? ''}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [router])

  const dismiss = useCallback(async (row: InboxRow) => {
    setBusy(row.id); setError(null)
    try {
      const res = await fetch(`/api/work/inbox/${row.id}/dismiss`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      removeRow(row.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [])

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'requests', label: 'Client requests', count: inbox.clientRequests.length },
    { key: 'internal', label: 'Internal',        count: inbox.internal.length },
    { key: 'recent',   label: 'Recent',          count: inbox.recent.length },
  ]

  const activeList = tab === 'requests' ? inbox.clientRequests
    : tab === 'internal' ? inbox.internal
    : inbox.recent

  return (
    <div className="max-w-3xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-brand/10 text-brand-dark ring-1 ring-brand/20 flex-shrink-0">
            <Inbox className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            Inbox
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          What just came in. Client content requests, internal action items, and recently closed.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-brand text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            }`}>
            {t.label}
            <span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
          </button>
        ))}
      </div>

      {error && (
        <div className="mb-3 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {activeList.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {activeList.map(row => (
            <div
              key={row.id}
              ref={row.id === focusId ? focusRef : null}
              className={row.id === focusId ? 'ring-2 ring-brand rounded-2xl transition-shadow' : ''}
            >
              <InboxCard
                row={row}
                busy={busy === row.id}
                readOnly={tab === 'recent'}
                onAccept={() => accept(row)}
                onDismiss={() => dismiss(row)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// Card
// ─────────────────────────────────────────────────────────────

function InboxCard({
  row, busy, readOnly, onAccept, onDismiss,
}: {
  row: InboxRow
  busy: boolean
  readOnly: boolean
  onAccept: () => void
  onDismiss: () => void
}) {
  const isRequest = row.source === 'client_request'
  const SourceIcon = isRequest ? Sparkles
    : row.source === 'invoice_chase' ? Wrench
    : row.source === 'engage_followup' ? MessageSquareWarning
    : FileText

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${
              isRequest
                ? 'bg-brand/10 text-brand-dark ring-brand/20'
                : 'bg-ink-7 text-ink-3 ring-ink-6'
            }`}>
              <SourceIcon className="w-3 h-3" />
              {isRequest ? 'client request' : (row.source ?? 'task')}
            </span>
            <span className="text-[11px] text-ink-3 font-medium truncate">{row.clientName ?? row.clientId.slice(0, 6)}</span>
            <span className="text-[10px] text-ink-4 inline-flex items-center gap-0.5">
              <Clock className="w-3 h-3" /> {relativeTime(row.createdAt)}
            </span>
            <StatusBadge status={row.status} />
          </div>
          <h3 className="text-[14px] font-semibold text-ink leading-snug">{row.title}</h3>
        </div>
      </div>

      {row.body && (
        <div className="rounded-lg bg-ink-7/50 p-3 mt-2 mb-3">
          <p className="text-[12px] text-ink-2 leading-relaxed whitespace-pre-wrap line-clamp-5">{row.body}</p>
        </div>
      )}

      {row.aiAnalysis && (
        <AIAnalysisRow analysis={row.aiAnalysis} />
      )}

      {!readOnly && (
        <div className="mt-3 flex items-center gap-2">
          <button onClick={onAccept} disabled={busy}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-brand text-white hover:bg-brand-dark disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Accept &amp; draft
            <ArrowRight className="w-3 h-3" />
          </button>
          <button onClick={onDismiss} disabled={busy}
            className="text-[12px] font-medium text-ink-3 hover:text-ink px-2 py-1.5 inline-flex items-center gap-1 disabled:opacity-50">
            <X className="w-3 h-3" /> Dismiss
          </button>
        </div>
      )}
    </article>
  )
}

function AIAnalysisRow({ analysis }: { analysis: Record<string, unknown> }) {
  const summary = (analysis.summary as string) ?? (analysis.headline as string) ?? null
  const suggested = (analysis.suggested_quote as Record<string, unknown> | undefined)
  if (!summary && !suggested) return null
  return (
    <div className="mt-2 rounded-lg ring-1 ring-brand/20 bg-brand/[0.04] p-2.5">
      <p className="text-[10px] font-bold uppercase tracking-wider text-brand-dark mb-1 inline-flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> AI pre-read
      </p>
      {summary && <p className="text-[12px] text-ink-2 leading-relaxed">{summary}</p>}
      {suggested && (
        <p className="text-[11px] text-ink-3 mt-1">
          Suggested quote: {String(suggested.amount ?? '')} · {String(suggested.notes ?? '')}
        </p>
      )}
    </div>
  )
}

function StatusBadge({ status }: { status: InboxRow['status'] }) {
  if (status === 'todo') return null
  const map: Record<string, string> = {
    doing: 'text-amber-700 bg-amber-50 ring-amber-100',
    done: 'text-emerald-700 bg-emerald-50 ring-emerald-100',
    canceled: 'text-ink-4 bg-ink-7 ring-ink-6',
  }
  return (
    <span className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ring-1 ${map[status] ?? ''}`}>
      {status.replace('_', ' ')}
    </span>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg = tab === 'requests' ? 'No open client requests.'
    : tab === 'internal' ? 'No internal tasks.'
    : 'Nothing closed recently.'
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-12 text-center">
      <Inbox className="w-8 h-8 text-ink-4 mx-auto mb-3" />
      <p className="text-[14px] text-ink-2 font-medium">{msg}</p>
    </div>
  )
}

function relativeTime(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime())
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
