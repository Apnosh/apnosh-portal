/**
 * Designer's visual brief queue. Per-card UX:
 *   1. Idea + caption (context for the visual)
 *   2. Editable brief fields (composition, lighting, props, mood, shot list)
 *   3. "Generate brief with AI" — calls generate-brief with full retrieval
 *   4. Save — lifecycle 'edit' with mediaBrief; writes content_revisions row
 *
 * The brief is structured JSON stored in content_drafts.media_brief.
 * The shoots system (/work/shoots) reads it when crew picks up a job.
 */

'use client'

import { useState, useCallback, useMemo } from 'react'
import {
  Image as ImageIcon, Sparkles, Loader2, Save, AlertCircle, Camera, CheckCircle2,
} from 'lucide-react'
import type { DraftRow } from '@/lib/work/get-drafts'

interface DraftWithBrief extends DraftRow {
  mediaBrief: Record<string, unknown>
}

interface BriefShape {
  composition?: string
  lighting?: string
  props?: string[]
  mood?: string
  references?: string[]
  shot_list?: string[]
  why?: string
}

function briefRichness(b: Record<string, unknown>): number {
  // 0 = empty, 4 = rich. Used to surface attention.
  let n = 0
  if (typeof b.composition === 'string' && b.composition.length > 0) n++
  if (typeof b.lighting === 'string' && b.lighting.length > 0) n++
  if (Array.isArray(b.props) && b.props.length > 0) n++
  if (Array.isArray(b.shot_list) && b.shot_list.length > 0) n++
  return n
}

interface Props { initialDrafts: DraftWithBrief[] }

export default function QueueView({ initialDrafts }: Props) {
  const [drafts, setDrafts] = useState<DraftWithBrief[]>(initialDrafts)
  const [filter, setFilter] = useState<'needs' | 'all'>('needs')

  const filtered = useMemo(() => {
    if (filter === 'all') return drafts
    return drafts.filter(d => briefRichness(d.mediaBrief) < 2)
  }, [drafts, filter])

  const onSaved = useCallback((id: string, newBrief: Record<string, unknown>, newStatus: string) => {
    setDrafts(prev => prev.map(d => d.id === id ? { ...d, mediaBrief: newBrief, status: newStatus as DraftRow['status'] } : d))
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-pink-50 text-pink-700 ring-1 ring-pink-100 flex-shrink-0">
            <ImageIcon className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            Drafts that need a visual brief
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          Write composition, lighting, props, and shot list. AI can draft from the client&rsquo;s voice + your past winners.
        </p>
      </header>

      <div className="flex items-center gap-2 mb-4">
        <button
          onClick={() => setFilter('needs')}
          className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 ${
            filter === 'needs' ? 'bg-ink text-white' : 'bg-bg-1 border border-ink-6 text-ink-2 hover:border-ink-4'
          }`}
        >
          Needs brief · {drafts.filter(d => briefRichness(d.mediaBrief) < 2).length}
        </button>
        <button
          onClick={() => setFilter('all')}
          className={`text-[11px] font-semibold rounded-lg px-2.5 py-1 ${
            filter === 'all' ? 'bg-ink text-white' : 'bg-bg-1 border border-ink-6 text-ink-2 hover:border-ink-4'
          }`}
        >
          All in-flight · {drafts.length}
        </button>
      </div>

      {filtered.length === 0 ? (
        <div
          className="rounded-2xl border-2 border-dashed p-10 text-center bg-white"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
        >
          <div className="w-12 h-12 mx-auto rounded-2xl bg-pink-50 text-pink-700 flex items-center justify-center mb-3 ring-1 ring-pink-100">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <p className="text-[14px] font-semibold text-ink leading-tight">All briefs in good shape</p>
          <p className="text-[12px] text-ink-3 max-w-md mx-auto mt-1.5 leading-relaxed">
            Every in-flight draft has at least two brief fields filled in. Switch to &ldquo;All in-flight&rdquo; to refine.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map(d => <QueueCard key={d.id} draft={d} onSaved={onSaved} />)}
        </ul>
      )}
    </div>
  )
}

function QueueCard({ draft, onSaved }: { draft: DraftWithBrief; onSaved: (id: string, brief: Record<string, unknown>, status: string) => void }) {
  const initial = draft.mediaBrief as BriefShape
  const [composition, setComposition] = useState(initial.composition ?? '')
  const [lighting, setLighting] = useState(initial.lighting ?? '')
  const [propsList, setPropsList] = useState((initial.props ?? []).join(', '))
  const [mood, setMood] = useState(initial.mood ?? '')
  const [shotList, setShotList] = useState((initial.shot_list ?? []).join('\n'))
  const [busy, setBusy] = useState<'ai' | 'save' | null>(null)
  const [why, setWhy] = useState<string | null>(typeof initial.why === 'string' ? initial.why : null)
  const [error, setError] = useState<string | null>(null)

  function currentBrief(): Record<string, unknown> {
    return {
      composition: composition.trim() || undefined,
      lighting: lighting.trim() || undefined,
      props: propsList.split(',').map(s => s.trim()).filter(Boolean),
      mood: mood.trim() || undefined,
      shot_list: shotList.split('\n').map(s => s.trim()).filter(Boolean),
      why: why ?? undefined,
    }
  }

  async function generate() {
    setBusy('ai'); setError(null)
    const res = await fetch(`/api/work/drafts/${draft.id}/generate-brief`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    setBusy(null)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    const { brief } = await res.json()
    setComposition(brief.composition ?? '')
    setLighting(brief.lighting ?? '')
    setPropsList(Array.isArray(brief.props) ? brief.props.join(', ') : '')
    setMood(brief.mood ?? '')
    setShotList(Array.isArray(brief.shot_list) ? brief.shot_list.join('\n') : '')
    setWhy(typeof brief.why === 'string' ? brief.why : null)
  }

  async function save() {
    setBusy('save'); setError(null)
    const mediaBrief = currentBrief()
    const res = await fetch(`/api/work/drafts/${draft.id}/lifecycle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'edit',
        mediaBrief,
        note: why ? `Visual brief: ${why}` : 'Visual brief saved',
      }),
    })
    setBusy(null)
    if (!res.ok) {
      setError((await res.json()).error ?? 'failed')
      return
    }
    const { draft: updated } = await res.json()
    onSaved(draft.id, mediaBrief, updated.status)
  }

  const richness = briefRichness(currentBrief())
  const isCarousel = (draft.idea ?? '').toLowerCase().includes('carousel')

  return (
    <li className="rounded-2xl border bg-white p-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <div className="flex items-center gap-2 flex-wrap mb-1">
        <span className="text-[11px] font-semibold text-ink-3 uppercase tracking-wider">
          {draft.clientName ?? 'Client'}
        </span>
        {draft.themeName && (
          <span className="text-[10px] text-ink-4 uppercase tracking-wider">· {draft.themeName}</span>
        )}
        <span className="text-[10px] uppercase tracking-wider text-ink-4">· {draft.status}</span>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${
          richness >= 3 ? 'bg-emerald-50 text-emerald-700'
          : richness >= 2 ? 'bg-amber-50 text-amber-700'
          : 'bg-rose-50 text-rose-700'
        }`}>
          {richness}/4 fields
        </span>
      </div>
      <p className="text-[14px] font-semibold text-ink leading-snug mb-1">
        {draft.idea}
      </p>
      {draft.caption && (
        <p className="text-[11px] text-ink-3 mt-0.5 leading-snug line-clamp-2 mb-3">
          {draft.caption}
        </p>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
        <Field label="Composition" value={composition} onChange={setComposition} placeholder="e.g. tight macro from above" />
        <Field label="Lighting" value={lighting} onChange={setLighting} placeholder="e.g. warm 5pm golden hour" />
        <Field label="Props" value={propsList} onChange={setPropsList} placeholder="comma-separated: bowl, chopsticks, steam" />
        <Field label="Mood" value={mood} onChange={setMood} placeholder="e.g. unhurried, hands-on, lived-in" />
      </div>
      <div className="mt-3">
        <span className="text-[11px] font-semibold text-ink-2 mb-1 inline-flex items-center gap-1.5">
          <Camera className="w-3 h-3" /> Shot list {isCarousel && <span className="text-[10px] text-amber-700 uppercase tracking-wider">· carousel — order matters</span>}
        </span>
        <textarea
          value={shotList}
          onChange={e => setShotList(e.target.value)}
          rows={3}
          placeholder="One shot per line — order matters for carousels and reels."
          className="w-full text-[12px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3 resize-y mt-1"
        />
      </div>

      {why && (
        <p className="text-[11px] text-pink-700 mt-2 inline-flex items-start gap-1.5">
          <Sparkles className="w-3 h-3 mt-0.5 flex-shrink-0" />
          <span><span className="font-semibold">AI rationale:</span> {why}</span>
        </p>
      )}
      {error && (
        <p className="text-[11px] text-red-600 mt-2 inline-flex items-center gap-1.5">
          <AlertCircle className="w-3 h-3" /> {error}
        </p>
      )}

      <div className="flex items-center gap-2 mt-4 pt-3 border-t border-ink-7">
        <button
          onClick={generate}
          disabled={busy !== null}
          className="inline-flex items-center gap-1.5 bg-pink-600 hover:bg-pink-700 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy === 'ai' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
          {busy === 'ai' ? 'Drafting…' : 'Generate with AI'}
        </button>
        <button
          onClick={save}
          disabled={busy !== null || richness === 0}
          className="inline-flex items-center gap-1.5 bg-ink hover:bg-ink-2 text-white text-[12px] font-semibold rounded-lg px-3 py-1.5 disabled:opacity-60"
        >
          {busy === 'save' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          {busy === 'save' ? 'Saving…' : 'Save brief'}
        </button>
      </div>
    </li>
  )
}

function Field({
  label, value, onChange, placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-semibold text-ink-2 mb-1 inline-block">{label}</span>
      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-[12px] p-2 rounded-lg border border-ink-6 focus:outline-none focus:ring-2 focus:ring-ink-3"
      />
    </label>
  )
}
