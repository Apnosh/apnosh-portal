/**
 * Client-side editorial workflow UI. Pure rendering + judgment posts.
 * The list is grouped by status; each card has one-click approve and
 * a tag-driven revise/reject flow that writes to human_judgments.
 */

'use client'

import { useState, useMemo, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import {
  FileText, Sparkles, CheckCircle2, XCircle, Loader2, Clock,
  Send, Eye, ArrowRight, ListTodo, MessageSquare, Pencil,
  CalendarClock, ExternalLink, RotateCcw, Plus, AlertCircle,
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

type LifecycleMode = 'edit' | 'schedule' | 'publish'

export default function DraftsView({ initialDrafts }: Props) {
  const params = useSearchParams()
  const focusId = params.get('focus') ?? params.get('draft')
  const [drafts, setDrafts] = useState<DraftRow[]>(initialDrafts)
  const [busy, setBusy] = useState<string | null>(null)
  const [judgePanel, setJudgePanel] = useState<{ id: string; mode: 'revise' | 'rejected' } | null>(null)
  const [lifePanel, setLifePanel] = useState<{ id: string; mode: LifecycleMode } | null>(null)
  const [outcomePanel, setOutcomePanel] = useState<{ id: string } | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const onSubmitOutcome = useCallback(async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/work/drafts/${id}/attach-outcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setDrafts(prev => prev.map(d => d.id === id ? {
        ...d,
        outcomeSummary: {
          platform: (body.platform as string) ?? 'instagram',
          external_id: body.externalId as string,
          reach: Number(body.reach ?? 0),
          interactions: Number(j.interactions ?? 0),
          engagement_rate: typeof j.engagementRate === 'number' ? j.engagementRate : null,
        },
      } : d))
      setOutcomePanel(null)
    } catch (e) {
      throw e
    } finally {
      setBusy(null)
    }
  }, [])

  const lifecycleCall = useCallback(async (
    id: string,
    body: Record<string, unknown>,
  ) => {
    setBusy(id)
    const res = await fetch(`/api/work/drafts/${id}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    setBusy(null)
    if (!res.ok) {
      const j = await res.json().catch(() => ({}))
      setToast(j.error ?? 'Could not save change.')
      return
    }
    const { draft } = await res.json()
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: draft.status, caption: draft.caption, targetPublishDate: draft.scheduled_for } : d))
    setLifePanel(null)
  }, [])

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
      setToast('Could not save judgment. Try again.')
      return
    }
    const { newStatus } = await res.json()
    // Update local state without a refetch
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, status: newStatus as DraftStatus } : d))
    setJudgePanel(null)
  }, [])

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(t)
  }, [toast])

  return (
    <div className="max-w-5xl mx-auto py-7 px-4 lg:px-6">
      {toast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-xl bg-ink text-white text-[13px] font-medium px-4 py-2.5 shadow-xl inline-flex items-center gap-2 max-w-md">
          <AlertCircle className="w-4 h-4 text-red-300 flex-shrink-0" />
          <span>{toast}</span>
          <button onClick={() => setToast(null)} className="text-white/60 hover:text-white ml-2">
            <span className="text-[16px] leading-none">×</span>
          </button>
        </div>
      )}
      <header className="mb-7 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-sky-50 text-sky-700 ring-1 ring-sky-100 flex-shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
              Drafts across your book
            </h1>
          </div>
          <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
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
                lifePanel={lifePanel}
                setLifePanel={setLifePanel}
                onLifecycle={lifecycleCall}
                outcomePanel={outcomePanel}
                setOutcomePanel={setOutcomePanel}
                onSubmitOutcome={onSubmitOutcome}
                focusId={focusId}
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
  lifePanel, setLifePanel, onLifecycle,
  outcomePanel, setOutcomePanel, onSubmitOutcome,
  focusId,
}: {
  def: BucketDef
  rows: DraftRow[]
  busyId: string | null
  onJudge: (id: string, j: 'approved'|'revise'|'rejected', tags?: string[], note?: string) => void
  openPanel: { id: string; mode: 'revise'|'rejected' } | null
  setOpenPanel: (p: { id: string; mode: 'revise'|'rejected' } | null) => void
  lifePanel: { id: string; mode: LifecycleMode } | null
  setLifePanel: (p: { id: string; mode: LifecycleMode } | null) => void
  onLifecycle: (id: string, body: Record<string, unknown>) => Promise<void> | void
  outcomePanel: { id: string } | null
  setOutcomePanel: (p: { id: string } | null) => void
  onSubmitOutcome: (id: string, body: Record<string, unknown>) => Promise<void>
  focusId: string | null
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
            focused={r.id === focusId}
            busy={busyId === r.id}
            judgePanel={openPanel?.id === r.id ? openPanel : null}
            lifePanel={lifePanel?.id === r.id ? lifePanel : null}
            outcomePanel={outcomePanel?.id === r.id ? outcomePanel : null}
            setOutcomePanel={setOutcomePanel}
            onApprove={() => onJudge(r.id, 'approved', ['perfect'])}
            onOpenRevise={() => setOpenPanel({ id: r.id, mode: 'revise' })}
            onOpenReject={() => setOpenPanel({ id: r.id, mode: 'rejected' })}
            onSubmitJudgment={(tags, note) =>
              onJudge(r.id, openPanel!.mode === 'revise' ? 'revise' : 'rejected', tags, note)
            }
            onCancelJudge={() => setOpenPanel(null)}
            onOpenEdit={() => setLifePanel({ id: r.id, mode: 'edit' })}
            onOpenSchedule={() => setLifePanel({ id: r.id, mode: 'schedule' })}
            onOpenPublish={() => setLifePanel({ id: r.id, mode: 'publish' })}
            onSubmitLifecycle={(body) => onLifecycle(r.id, body)}
            onCancelLifecycle={() => setLifePanel(null)}
            onUnschedule={() => onLifecycle(r.id, { action: 'unschedule' })}
            onSubmitOutcome={(body) => onSubmitOutcome(r.id, body)}
          />
        ))}
      </ul>
    </section>
  )
}

function DraftCard({
  r, busy, focused,
  judgePanel, onApprove, onOpenRevise, onOpenReject, onSubmitJudgment, onCancelJudge,
  lifePanel, onOpenEdit, onOpenSchedule, onOpenPublish, onSubmitLifecycle, onCancelLifecycle, onUnschedule,
  outcomePanel, setOutcomePanel, onSubmitOutcome,
}: {
  r: DraftRow
  busy: boolean
  focused: boolean
  judgePanel: { id: string; mode: 'revise'|'rejected' } | null
  onApprove: () => void
  onOpenRevise: () => void
  onOpenReject: () => void
  onSubmitJudgment: (tags: string[], note?: string) => void
  onCancelJudge: () => void
  lifePanel: { id: string; mode: LifecycleMode } | null
  onOpenEdit: () => void
  onOpenSchedule: () => void
  onOpenPublish: () => void
  onSubmitLifecycle: (body: Record<string, unknown>) => void
  onCancelLifecycle: () => void
  onUnschedule: () => void
  outcomePanel: { id: string } | null
  setOutcomePanel: (p: { id: string } | null) => void
  onSubmitOutcome: (body: Record<string, unknown>) => Promise<void>
}) {
  const judgeable = ['idea','draft','revising'].includes(r.status)
  const editable = ['idea','draft','revising','approved'].includes(r.status)
  const schedulable = r.status === 'approved'
  const publishable = r.status === 'approved' || r.status === 'scheduled'
  const showUnschedule = r.status === 'scheduled'
  const ref = useRef<HTMLLIElement>(null)
  useEffect(() => {
    if (!focused) return
    const t = setTimeout(() => {
      ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 50)
    return () => clearTimeout(t)
  }, [focused])
  return (
    <li ref={ref}>
      <article
        className={`rounded-2xl border bg-white p-4 ${focused ? 'ring-2 ring-brand' : ''}`}
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

          {!judgePanel && !lifePanel && (
            <div className="flex flex-col gap-1 flex-shrink-0 min-w-[110px]">
              {judgeable && (
                <button
                  onClick={onApprove}
                  disabled={busy}
                  className="inline-flex items-center gap-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                  title="One-click approve"
                >
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                  Approve
                </button>
              )}
              {schedulable && (
                <button
                  onClick={onOpenSchedule}
                  disabled={busy}
                  className="inline-flex items-center gap-1 bg-violet-50 hover:bg-violet-100 text-violet-700 text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                >
                  <CalendarClock className="w-3 h-3" />
                  Schedule
                </button>
              )}
              {publishable && (
                <button
                  onClick={onOpenPublish}
                  disabled={busy}
                  className="inline-flex items-center gap-1 bg-violet-600 hover:bg-violet-700 text-white text-[11px] font-semibold rounded-lg px-2.5 py-1.5 disabled:opacity-50"
                >
                  <Send className="w-3 h-3" />
                  Publish
                </button>
              )}
              {showUnschedule && (
                <button
                  onClick={onUnschedule}
                  disabled={busy}
                  className="inline-flex items-center gap-1 bg-bg-1 hover:bg-bg-2 text-ink-3 hover:text-ink text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border border-ink-6 disabled:opacity-50"
                  title="Move back to approved (not scheduled)"
                >
                  <RotateCcw className="w-3 h-3" />
                  Unschedule
                </button>
              )}
              {editable && (
                <button
                  onClick={onOpenEdit}
                  disabled={busy}
                  className="inline-flex items-center gap-1 bg-bg-1 hover:bg-bg-2 text-ink-3 hover:text-ink text-[11px] font-semibold rounded-lg px-2.5 py-1.5 border border-ink-6 disabled:opacity-50"
                >
                  <Pencil className="w-3 h-3" />
                  Edit
                </button>
              )}
              {judgeable && (
                <>
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
                </>
              )}
            </div>
          )}

          {r.status === 'published' && r.publishedUrl && (
            <a
              href={r.publishedUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[11px] text-ink-3 hover:text-ink inline-flex items-center gap-1 flex-shrink-0"
            >
              <ExternalLink className="w-3 h-3" /> Live
            </a>
          )}
          {r.status === 'published' && !r.outcomeSummary && (
            <button
              onClick={() => setOutcomePanel({ id: r.id })}
              className="text-[11px] font-medium text-violet-700 hover:text-violet-900 px-1.5 py-0.5 rounded ring-1 ring-violet-200 hover:bg-violet-50 inline-flex items-center gap-1 flex-shrink-0"
            >
              <Plus className="w-3 h-3" /> Attach outcome
            </button>
          )}
          {r.status === 'published' && r.outcomeSummary && (
            <span
              className="text-[10px] font-semibold text-emerald-700 inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-50 ring-1 ring-emerald-100 flex-shrink-0"
              title={`${r.outcomeSummary.reach} reach · ${r.outcomeSummary.interactions} interactions`}
            >
              {r.outcomeSummary.engagement_rate !== null
                ? `${(r.outcomeSummary.engagement_rate * 100).toFixed(1)}% eng`
                : `${r.outcomeSummary.interactions} int`}
            </span>
          )}
        </div>

        {judgePanel && (
          <JudgePanel
            mode={judgePanel.mode}
            busy={busy}
            onSubmit={onSubmitJudgment}
            onCancel={onCancelJudge}
          />
        )}

        {lifePanel && (
          <LifecyclePanel
            mode={lifePanel.mode}
            draft={r}
            busy={busy}
            onSubmit={onSubmitLifecycle}
            onCancel={onCancelLifecycle}
          />
        )}

        {outcomePanel && (
          <AttachOutcomePanel
            busy={busy}
            onSubmit={onSubmitOutcome}
            onCancel={() => setOutcomePanel(null)}
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

function LifecyclePanel({
  mode, draft, busy, onSubmit, onCancel,
}: {
  mode: LifecycleMode
  draft: DraftRow
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => void
  onCancel: () => void
}) {
  const [caption, setCaption] = useState(draft.caption ?? '')
  const [note, setNote] = useState('')
  // Scheduled defaults to tomorrow 10am local
  const [scheduledFor, setScheduledFor] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() + 1)
    d.setHours(10, 0, 0, 0)
    // datetime-local needs yyyy-MM-ddTHH:mm
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  })
  const [publishedUrl, setPublishedUrl] = useState('')

  function submit() {
    if (mode === 'edit') {
      onSubmit({ action: 'edit', caption, note: note || undefined })
    } else if (mode === 'schedule') {
      onSubmit({ action: 'schedule', scheduledFor: new Date(scheduledFor).toISOString() })
    } else {
      onSubmit({ action: 'publish', publishedUrl: publishedUrl || undefined })
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-7">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-ink-3 mb-2 inline-flex items-center gap-1.5">
        {mode === 'edit' && <><Pencil className="w-3 h-3" /> Edit caption</>}
        {mode === 'schedule' && <><CalendarClock className="w-3 h-3" /> Schedule</>}
        {mode === 'publish' && <><Send className="w-3 h-3" /> Mark as published</>}
      </p>

      {mode === 'edit' && (
        <>
          <textarea
            value={caption}
            onChange={e => setCaption(e.target.value)}
            rows={5}
            placeholder="Caption…"
            className="w-full text-[13px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-y"
          />
          <input
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder="Optional note about the revision (one line)…"
            className="w-full text-[12px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 mt-2"
          />
        </>
      )}

      {mode === 'schedule' && (
        <input
          type="datetime-local"
          value={scheduledFor}
          onChange={e => setScheduledFor(e.target.value)}
          className="w-full text-[13px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
        />
      )}

      {mode === 'publish' && (
        <input
          type="url"
          value={publishedUrl}
          onChange={e => setPublishedUrl(e.target.value)}
          placeholder="https://instagram.com/p/… (optional permalink)"
          className="w-full text-[13px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
        />
      )}

      <div className="flex items-center justify-end gap-2 mt-2">
        <button onClick={onCancel} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || (mode === 'edit' && !caption.trim())}
          className="inline-flex items-center gap-1 text-[12px] font-semibold rounded-lg px-3 py-1.5 bg-ink hover:bg-ink-2 text-white disabled:opacity-50"
        >
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
          {mode === 'edit' ? 'Save' : mode === 'schedule' ? 'Schedule' : 'Publish'}
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

function AttachOutcomePanel({
  busy, onSubmit, onCancel,
}: {
  busy: boolean
  onSubmit: (body: Record<string, unknown>) => Promise<void>
  onCancel: () => void
}) {
  const [externalId, setExternalId] = useState('')
  const [permalink, setPermalink] = useState('')
  const [reach, setReach] = useState('')
  const [likes, setLikes] = useState('')
  const [comments, setComments] = useState('')
  const [saves, setSaves] = useState('')
  const [shares, setShares] = useState('')
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    if (!externalId.trim() || !reach) {
      setError('Post ID + reach required')
      return
    }
    setError(null)
    try {
      await onSubmit({
        platform: 'instagram',
        externalId: externalId.trim(),
        permalink: permalink.trim() || undefined,
        reach: Number(reach) || 0,
        likes: Number(likes) || 0,
        comments: Number(comments) || 0,
        saves: Number(saves) || 0,
        shares: Number(shares) || 0,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    }
  }

  return (
    <div className="mt-3 pt-3 border-t border-ink-6/40">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-violet-700 mb-2 inline-flex items-center gap-1">
        <Plus className="w-3 h-3" /> Attach outcome
      </p>
      <div className="grid grid-cols-2 gap-2 mb-2">
        <input value={externalId} onChange={e => setExternalId(e.target.value)}
          placeholder="IG post ID *"
          className="text-[12px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-violet-500 focus:outline-none" />
        <input value={permalink} onChange={e => setPermalink(e.target.value)}
          placeholder="https://instagram.com/p/..."
          className="text-[12px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-violet-500 focus:outline-none" />
      </div>
      <div className="grid grid-cols-5 gap-2 mb-2">
        <NumField label="Reach *" value={reach} onChange={setReach} />
        <NumField label="Likes" value={likes} onChange={setLikes} />
        <NumField label="Comments" value={comments} onChange={setComments} />
        <NumField label="Saves" value={saves} onChange={setSaves} />
        <NumField label="Shares" value={shares} onChange={setShares} />
      </div>
      {error && (
        <div className="mb-2 flex items-start gap-1 text-[11px] text-red-700">
          <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
      <div className="flex items-center gap-2">
        <button onClick={submit} disabled={busy}
          className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-violet-600 text-white hover:bg-violet-700 disabled:opacity-50 inline-flex items-center gap-1.5">
          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
          Attach
        </button>
        <button onClick={onCancel} className="text-[11px] text-ink-3 hover:text-ink px-2 py-1.5">Cancel</button>
      </div>
    </div>
  )
}

function NumField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[9px] font-semibold text-ink-3 uppercase tracking-wider mb-0.5">{label}</label>
      <input type="number" value={value} onChange={e => onChange(e.target.value)}
        className="w-full text-[12px] px-2 py-1.5 rounded-md ring-1 ring-ink-6 focus:ring-violet-500 focus:outline-none" />
    </div>
  )
}
