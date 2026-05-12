/**
 * Copywriter's caption queue. Different lens on the same
 * content_drafts data — focused on getting captions written and
 * polished. Strategists see this surface too (additive model);
 * they'd use it for the same job a copywriter does.
 *
 * Per-card UX:
 *   1. Idea + theme (read-only context)
 *   2. Editable caption textarea
 *   3. "Generate with AI" — calls generate-caption with full retrieval
 *   4. Save — writes via lifecycle 'edit', creates a content_revisions row
 */

'use client'

import { useState, useCallback } from 'react'
import {
  PenLine, Sparkles, Loader2, Save, ExternalLink, AlertCircle, CheckCircle2,
} from 'lucide-react'
import type { DraftRow } from '@/lib/work/get-drafts'

interface Props {
  initialDrafts: DraftRow[]
}

export default function BriefsView({ initialDrafts }: Props) {
  const [drafts, setDrafts] = useState<DraftRow[]>(initialDrafts)

  const onSaved = useCallback((id: string, newCaption: string, newStatus: string) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, caption: newCaption, status: newStatus as DraftRow['status'] } : d))
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-sky-50 text-sky-700 ring-1 ring-sky-100">
            <PenLine className="w-4.5 h-4.5" />
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
            Caption queue
          </p>
        </div>
        <h1 className="text-[26px] sm:text-[28px] leading-tight font-bold text-ink tracking-tight">
          Drafts that need captions
        </h1>
        <p className="text-[13px] text-ink-2 mt-1.5 leading-relaxed max-w-2xl">
          One card per draft. Use the AI assist to draft a caption grounded in client voice + facts + similar restaurants. Edit, then save.
        </p>
      </header>

      {drafts.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-sky-50 text-sky-700 flex items-center justify-center mb-3 ring-1 ring-sky-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-semibold text-ink leading-tight">Inbox zero</p>
          <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            No drafts need caption work right now. Either you&rsquo;re caught up or a strategist hasn&rsquo;t generated ideas yet.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {drafts.map(d => <BriefCard key={d.id} draft={d} onSaved={onSaved} />)}
        </ul>
      )}
    </div>
  )
}

function BriefCard({
  draft, onSaved,
}: {
  draft: DraftRow
  onSaved: (id: string, caption: string, status: string) => void
}) {
  const [caption, setCaption] = useState(draft.caption ?? '')
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null)
  const [rationale, setRationale] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function generate() {
    setBusy('ai'); setError(null); setRationale(null)
    const res = await fetch(`/api/work/drafts/${draft.id}/generate-caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    const j = await res.json()
    setCaption(j.caption ?? caption)
    setRationale(j.rationale ?? null)
  }

  async function save() {
    setBusy('save'); setError(null)
    const res = await fetch(`/api/work/drafts/${draft.id}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'edit', caption, note: rationale ? `AI assist: ${rationale}` : undefined }),
    })
    setBusy(null)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    const { draft: updated } = await res.json()
    onSaved(draft.id, updated.caption ?? caption, updated.status)
  }

  return (
    <li
      className="rounded-2xl border bg-white p-4"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
          {draft.clientName ?? 'Client'}
        </span>
        {draft.themeName && (
          <span className="text-[10px] text-ink-4 uppercase tracking-wider">· {draft.themeName}</span>
        )}
        <StatusChip status={draft.status} />
        {draft.revisionCount > 0 && (
          <span className="text-[10px] text-amber-700 uppercase tracking-wider">· rev {draft.revisionCount}</span>
        )}
      </div>
      <p className="text-[14px] font-semibold text-ink leading-snug mb-3">
        {draft.idea}
      </p>

      <textarea
        value={caption}
        onChange={e => setCaption(e.target.value)}
        rows={4}
        placeholder="Write the caption here, or hit the AI button below to draft one…"
        className="w-full text-[13px] p-3 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-y"
      />

      {rationale && (
        <p className="text-[11px] text-sky-700 mt-2 inline-flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span><span className="font-semibold">AI rationale:</span> {rationale}</span>
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-600 mt-2 inline-flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-ink-7">
        <button
          onClick={generate}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 bg-sky-600 hover:bg-sky-700 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy === 'ai' ? 'Drafting…' : caption ? 'Polish with AI' : 'Generate caption'}
        </button>
        <button
          onClick={save}
          disabled={busy !== null || !caption.trim() || caption === (draft.caption ?? '')}
          className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {busy === 'save' ? 'Saving…' : 'Save'}
        </button>
        <a
          href={`/work/drafts`}
          className="text-[11px] text-ink-3 hover:text-ink inline-flex items-center gap-1 ml-auto"
        >
          See in drafts <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </li>
  )
}

function StatusChip({ status }: { status: string }) {
  const tone =
    status === 'idea' ? 'bg-sky-50 text-sky-700'
    : status === 'draft' ? 'bg-amber-50 text-amber-700'
    : status === 'revising' ? 'bg-rose-50 text-rose-700'
    : 'bg-ink-7 text-ink-3'
  return (
    <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${tone}`}>
      {status}
    </span>
  )
}
