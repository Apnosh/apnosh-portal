/**
 * Client-side editorial workflow UI. Pure rendering + judgment posts.
 * The list is grouped by status; each card has one-click approve and
 * a tag-driven revise/reject flow that writes to human_judgments.
 */

'use client'

import { useState, useMemo, useCallback } from 'react'
import Link from 'next/link'
import {
  FileText, Sparkles, CheckCircle2, XCircle, Loader2, Clock,
  Send, Eye, ArrowRight, ListTodo, MessageSquare,
} from 'lucide-react'
import type { DraftRow, DraftStatus } from '@/lib/work/get-drafts'

interface Props {
  initialDrafts: DraftRow[]
}

interface BucketDef {
  key: string
  label: string
  statuses: DraftStatus[]
  tone: 'amber' | 'sky' | 'emerald' | 'ink' | 'violet' | 'rose'
  Icon: React.ComponentType<{ className?: string }>
}

const BUCKETS: BucketDef[] = [
  { key: 'idea',      label: 'Ideas',     statuses: ['idea'],      tone: 'sky',     Icon: Sparkles },
  { key: 'draft',     label: 'Drafts',    statuses: ['draft','revising'], tone: 'amber', Icon: FileText },
  { key: 'approved',  label: 'Approved',  statuses: ['approved','produced','scheduled'], tone: 'emerald', Icon: CheckCircle2 },
  { key: 'published', label: 'Published', statuses: ['published'], tone: 'violet',  Icon: Send },
  { key: 'rejected',  label: 'Rejected',  statuses: ['rejected'],  tone: 'rose',    Icon: XCircle },
]

const REVISE_TAGS = ['tone', 'angle', 'off_brand', 'too_long', 'too_short', 'wrong_audience', 'other']
const REJECT_TAGS = ['off_brand', 'low_value', 'duplicate', 'wrong_timing', 'other']

export default function DraftsView({ initialDrafts }: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>(initialDrafts)
  const [busy, setBusy] = useState<string | null>(null)
  const [judgePanel, setJudgePanel] = useState<{ id: string; mode: 'revise' | 'rejected' } | null>(null)

  const grouped = useMemo(() => {
    const map = new Map<string, DraftRow[]>()
    for (const b of BUCKETS) map.set(b.key, [])
    for (const d of drafts) {
      const b = BUCKETS.find(b => b.statuses.includes(d.status))
      if (b) map.get(b.key)!.push(d)
    }
    return map
  }, [drafts])

  const post = useCallback(async (
    id: string,
    judgment: 'approved' | 'revise' | 'rejected',
    reasonTags: string[] = [],
    reasonNote?: string,
  ) => {
    setBusy(id)
    const res = await fetch(`/api/work/drafts/${id}/judge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ judgment, reasonTags, reasonNote }),
    })
    setBusy(null)
    if (!res.ok) {
      alert('Could not save judgment. Try again.')
      return
    }
    const { newStatus } = await res.json()
    // Update local state without a refetch
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as DraftStatus } : d))
    setJudgePanel(null)
  }, [])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-7 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <FileText className="w-4.5 h-4.5" />
            </div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
              Editorial workflow
            </p>
          </div>
          <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
            Drafts across your book
          </h1>
          <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
            Every post idea from inception to publish. Approve what&rsquo;s good; tell us what&rsquo;s off so the next AI batch gets better.
          </p>
        </div>
        <Link
          href="/work/themes"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold bg-ink hover:bg-ink-2 text-white rounded-xl px-4 py-2.5"
        >
          <Sparkles className="w-4 h-4" />
          Generate from theme
        </Link>
      </header>

      {drafts.length === 0 ? <EmptyState /> : (
        <div className="space-y-7">
          {BUCKETS.map(b => {
            const rows = grouped.get(b.key) ?? []
            if (rows.length === 0) return null
            return (
              <Bucket key={b.key} def={b} rows={rows}
                busyId={busy} onJudge={post}
                openPanel={judgePanel}
                setOpenPanel={setJudgePanel}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

function Bucket({
  def, rows, busyId, onJudge, openPanel, setOpenPanel,
}: {
  def: BucketDef
  rows: DraftRow[]
  busyId: string | null
  onJudge: (id: string, j: 'approved'|'revise'|'rejected', tags?: string[], note?: string) => void
  openPanel: { id: string; mode: 'revise'|'rejected' } | null
  setOpenPanel: (p: { id: string; mode: 'revise'|'rejected' } | null) => void
}) {
  const toneText =
    def.tone === 'amber' ? 'text-amber-700'
    : def.tone === 'emerald' ? 'text-emerald-700'
    : def.tone === 'violet' ? 'text-violet-700'
    : def.tone === 'rose' ? 'text-rose-700'
    : def.tone === 'sky' ? 'text-sky-700'
    : 'text-ink-3'
  return (
    <section>
      <h2 className={`text-[11px] font-semibold uppercase tracking-[0.18em] ${toneText} mb-2 inline-flex items-center gap-1.5`}>
        <def.Icon className="w-3.5 h-3.5" />
        {def.label} · {rows.length}
      </h2>
      <ul className="space-y-2">
        {rows.map(r => (
          <DraftCard key={r.id} r={r}
            busy={busyId === r.id}
            judgePanel={openPanel?.id === r.id ? openPanel : null}
            onApprove={() => onJudge(r.id, 'approved', ['perfect'])}
            onOpenRevise={() => setOpenPanel({ id: r.id, mode: 'revise' })}
            onOpenReject={() => setOpenPanel({ id: r.id, mode: 'rejected' })}
            onSubmitJudgment={(tags, note) =>
              onJudge(r.id, openPanel!.mode === 'revise' ? 'revise' : 'rejected', tags, note)
            }
            onCancel={() => setOpenPanel(null)}
          />
        ))}
      </ul>
    </section>
  )
}

function DraftCard({
  r, busy, judgePanel, onApprove, onOpenRevise, onOpenReject, onSubmitJudgment, onCancel,
}: {
  r: DraftRow
  busy: boolean
  judgePanel: { id: string; mode: 'revise'|'rejected' } | null
  onApprove: () => void
  onOpenRevise: () => void
  onOpenReject: () => void
  onSubmitJudgment: (tags: string[], note?: string) => void
  onCancel: () => void
}) {
  const stillJudgeable = ['idea','draft','revising'].includes(r.status)
  return (
    <li>
      <article
        className="rounded-2xl border bg-white p-4"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
                {r.clientName ?? 'Client'}
              </span>
              {r.themeName && (
                <span className="text-[10px] text-ink-4 uppercase tracking-wider">
                  · {r.themeName}
                </span>
              )}
              <ProvenanceChip via={r.proposedVia} aiCount={r.aiGenerationCount} />
              {r.revisionCount > 0 && (
                <span className="text-[10px] text-amber-700 uppercase tracking-wider">
                  · rev {r.revisionCount}
                </span>
              )}
            </div>
            <p className="text-[14px] font-semibold text-ink leading-snug">
              {r.idea}
            </p>
            {r.caption && (
              <p className="text-[12px] text-ink-3 mt-1.5 leading-snug whitespace-pre-wrap line-clamp-3">
                {r.caption}
              </p>
            )}
            {r.targetPublishDate && (
              <p className="text-[10px] text-ink-4 mt-2 inline-flex items-center gap-1">
                <Clock className="w-3 h-3" /> Target {new Date(r.targetPublishDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
              </p>
            )}
          </div>

          {stillJudgeable && !judgePanel && (
            <div className="flex flex-col gap-1 flex-shrink-0">
              <button
                onClick={onApprove}
                disabled={busy}
                className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                title="One-click approve"
              >
                {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                Approve
              </button>
              <button
                onClick={onOpenRevise}
                disabled={busy}
                className="inline-flex items-center gap-1 bg-amber-50 hover:bg-amber-100 text-amber-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                <ListTodo className="w-3 h-3" />
                Revise
              </button>
              <button
                onClick={onOpenReject}
                disabled={busy}
                className="inline-flex items-center gap-1 bg-rose-50 hover:bg-rose-100 text-rose-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
              >
                <XCircle className="w-3 h-3" />
                Reject
              </button>
            </div>
          )}

          {!stillJudgeable && r.publishedPostId && (
            <Link
              href={`/dashboard/social/quotes/${r.publishedPostId}`}
              className="text-[11px] text-ink-3 hover:text-ink inline-flex items-center gap-1 flex-shrink-0"
            >
              <Eye className="w-3 h-3" /> Post
            </Link>
          )}
        </div>

        {judgePanel && (
          <JudgePanel
            mode={judgePanel.mode}
            busy={busy}
            onSubmit={onSubmitJudgment}
            onCancel={onCancel}
          />
        )}
      </article>
    </li>
  )
}

function ProvenanceChip({ via, aiCount }: { via: string; aiCount: number }) {
  const tone =
    via === 'ai' ? 'bg-sky-50 text-sky-700'
    : via === 'strategist' ? 'bg-emerald-50 text-emerald-700'
    : via === 'copywriter' ? 'bg-violet-50 text-violet-700'
    : via === 'designer' ? 'bg-pink-50 text-pink-700'
    : via === 'client_request' ? 'bg-amber-50 text-amber-700'
    : 'bg-ink-7 text-ink-3'
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {via === 'ai' ? 'AI' : via.replace('_', ' ')}
      {aiCount > 0 && via !== 'ai' && (
        <span className="opacity-70 lowercase">+ai×{aiCount}</span>
      )}
    </span>
  )
}

function JudgePanel({
  mode, busy, onSubmit, onCancel,
}: {
  mode: 'revise' | 'rejected'
  busy: boolean
  onSubmit: (tags: string[], note?: string) => void
  onCancel: () => void
}) {
  const tagsList = mode === 'revise' ? REVISE_TAGS : REJECT_TAGS
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [note, setNote] = useState('')

  function toggle(t: string) {
    const next = new Set(selected)
    if (next.has(t)) next.delete(t); else next.add(t)
    setSelected(next)
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-7">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2 inline-flex items-center gap-1.5">
        <MessageSquare className="w-3 h-3" />
        Why? {mode === 'revise' ? '(at least one)' : ''}
      </p>
      <div className="flex flex-wrap gap-1 mb-2">
        {tagsList.map(t => {
          const on = selected.has(t)
          return (
            <button
              key={t}
              type="button"
              onClick={() => toggle(t)}
              className={`text-[11px] font-medium rounded px-2 py-1 ${on
                ? 'bg-ink text-white'
                : 'bg-bg-1 border border-ink-6 text-ink-2 hover:border-ink-4'
              }`}
            >
              {t.replace('_', ' ')}
            </button>
          )
        })}
      </div>
      <textarea
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="Optional note for the AI (one sentence)…"
        rows={2}
        className="w-full text-[12px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-none"
      />
      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1">
          Cancel
        </button>
        <button
          onClick={() => onSubmit(Array.from(selected), note.trim() || undefined)}
          disabled={busy || (mode === 'revise' && selected.size === 0 && !note.trim())}
          className={`inline-flex items-center gap-1 text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-50 ${mode === 'revise'
            ? 'bg-amber-600 hover:bg-amber-700 text-white'
            : 'bg-rose-600 hover:bg-rose-700 text-white'
          }`}
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : mode === 'revise' ? <ListTodo className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
          Submit
        </button>
      </div>
    </div>
  )
}

function EmptyState() {
  return (
    <div
      className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center mb-3 ring-1 ring-sky-100">
        <FileText className="w-5 h-5" />
      </div>
      <p className="text-[14px] font-semibold text-ink leading-tight">No drafts yet</p>
      <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed mb-4">
        Drafts land here when you generate ideas from a theme, when a copywriter proposes one, or when a client requests something.
      </p>
      <Link href="/work/themes" className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[13px] font-semibold rounded-xl px-4 py-2.5">
        <Sparkles className="w-4 h-4" />
        Start with a theme
      </Link>
    </div>
  )
}
