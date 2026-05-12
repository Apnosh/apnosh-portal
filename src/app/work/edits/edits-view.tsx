/**
 * Editor's edit queue. Two rails:
 *   - Ready: shoots delivered as raw; needs a cut.
 *   - Completed: recent history.
 *
 * Each job card surfaces the brief, raw clip count, location, and
 * an AI hook helper that drafts 3 opening-second variations grounded
 * in the client's voice + the visual brief.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Film, Loader2, Sparkles, AlertCircle, CheckCircle2, MapPin, Camera, ImageIcon, Clock,
} from 'lucide-react'
import type { EditQueue, EditJobRow } from '@/lib/work/get-edit-queue'

interface Props { initialQueue: EditQueue }

type Tab = 'ready' | 'completed'

export default function EditsView({ initialQueue }: Props) {
  const [queue, setQueue] = useState<EditQueue>(initialQueue)
  const [tab, setTab] = useState<Tab>(initialQueue.ready.length > 0 ? 'ready' : 'completed')

  const onCompleted = useCallback((shootId: string) => {
    setQueue(prev => {
      const row = prev.ready.find(r => r.shootId === shootId)
      if (!row) return prev
      return {
        ready: prev.ready.filter(r => r.shootId !== shootId),
        completed: [{ ...row, status: 'completed' }, ...prev.completed],
      }
    })
  }, [])

  const tabs: Array<{ key: Tab; label: string; count: number }> = [
    { key: 'ready', label: 'Ready to cut', count: queue.ready.length },
    { key: 'completed', label: 'Completed', count: queue.completed.length },
  ]

  const activeList = tab === 'ready' ? queue.ready : queue.completed

  return (
    <div className="max-w-4xl mx-auto py-7 px-4 lg:px-6">
      <header className="mb-6">
        <div className="flex items-center gap-3 mb-1.5">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100 flex-shrink-0">
            <Film className="w-4 h-4" />
          </div>
          <h1 className="text-[22px] sm:text-[24px] leading-tight font-bold text-ink tracking-tight">
            Edit queue
          </h1>
        </div>
        <p className="text-[13px] text-ink-2 leading-relaxed max-w-2xl ml-10">
          Raw footage waiting for the cut. AI drafts hook variations from the brief so you can lock the first three seconds fast.
        </p>
      </header>

      <div className="flex items-center gap-1 mb-5 border-b border-ink-6">
        {tabs.map(t => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-2 text-[13px] font-medium border-b-2 -mb-px transition-colors ${
              tab === t.key ? 'border-indigo-600 text-ink' : 'border-transparent text-ink-3 hover:text-ink'
            }`}
          >
            {t.label}
            <span className="ml-1.5 text-[11px] text-ink-4">{t.count}</span>
          </button>
        ))}
      </div>

      {activeList.length === 0 ? (
        <EmptyState tab={tab} />
      ) : (
        <div className="space-y-3">
          {activeList.map(row => (
            <EditCard
              key={row.shootId}
              row={row}
              readOnly={tab === 'completed'}
              onCompleted={() => onCompleted(row.shootId)}
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

interface HookSet { hooks: string[]; why: string }

function EditCard({ row, readOnly, onCompleted }: { row: EditJobRow; readOnly: boolean; onCompleted: () => void }) {
  const [hooks, setHooks] = useState<HookSet | null>(null)
  const [busy, setBusy] = useState<null | 'hook' | 'complete'>(null)
  const [error, setError] = useState<string | null>(null)

  const draftHooks = useCallback(async () => {
    setBusy('hook')
    setError(null)
    try {
      const res = await fetch(`/api/work/edits/${row.shootId}/hooks`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setHooks({ hooks: j.hooks as string[], why: j.why as string })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.shootId])

  const complete = useCallback(async () => {
    setBusy('complete')
    setError(null)
    try {
      const res = await fetch(`/api/work/edits/${row.shootId}/complete`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      onCompleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [row.shootId, onCompleted])

  const composition = (row.brief.composition as string | undefined) ?? ''
  const lighting = (row.brief.lighting as string | undefined) ?? ''
  const mood = (row.brief.mood as string | undefined) ?? ''
  const props = Array.isArray(row.brief.props) ? (row.brief.props as string[]) : []
  const shotList = (row.shotList as string[]).slice(0, 6)

  return (
    <article className="bg-white rounded-2xl ring-1 ring-ink-6/60 p-5">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px] font-semibold text-ink truncate">{row.clientName ?? row.clientSlug ?? row.clientId}</span>
            {row.locationName && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                <MapPin className="w-3 h-3" /> {row.locationName}
              </span>
            )}
            {row.uploadedAt && (
              <span className="inline-flex items-center gap-1 text-[11px] text-ink-3">
                <Clock className="w-3 h-3" /> raw {relativeTime(row.uploadedAt)} ago
              </span>
            )}
          </div>
          <h3 className="text-[15px] font-bold text-ink leading-tight">{row.title}</h3>
        </div>
        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${
          row.status === 'completed'
            ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
            : 'bg-indigo-50 text-indigo-800 ring-indigo-100'
        }`}>
          {row.status}
        </span>
      </div>

      <div className="flex items-center gap-4 mb-3 text-[12px] text-ink-2">
        <span className="inline-flex items-center gap-1"><Camera className="w-3.5 h-3.5" /> {row.rawCount} raw</span>
        {row.finalCount > 0 && (
          <span className="inline-flex items-center gap-1"><ImageIcon className="w-3.5 h-3.5" /> {row.finalCount} final</span>
        )}
      </div>

      {/* Brief block */}
      {(composition || lighting || mood || props.length > 0 || shotList.length > 0) && (
        <div className="rounded-lg bg-ink-7/50 p-3 mb-3 space-y-1.5">
          {composition && <BriefRow label="Composition" value={composition} />}
          {lighting   && <BriefRow label="Lighting"    value={lighting} />}
          {mood       && <BriefRow label="Mood"        value={mood} />}
          {props.length > 0 && <BriefRow label="Props" value={props.join(', ')} />}
          {shotList.length > 0 && (
            <div className="pt-1.5">
              <p className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1">Shot list</p>
              <ol className="text-[12px] text-ink-2 leading-relaxed list-decimal list-inside space-y-0.5">
                {shotList.map((s, i) => <li key={i}>{String(s)}</li>)}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* AI hook suggestions */}
      {hooks && (
        <div className="rounded-lg bg-indigo-50 ring-1 ring-indigo-100 p-3 mb-3">
          <p className="text-[11px] font-semibold text-indigo-900 uppercase tracking-wider mb-2 inline-flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> Hook variations
          </p>
          <ol className="text-[13px] text-ink leading-relaxed list-decimal list-inside space-y-1.5">
            {hooks.hooks.map((h, i) => <li key={i}>{h}</li>)}
          </ol>
          <p className="text-[11px] text-ink-3 mt-2 italic">{hooks.why}</p>
        </div>
      )}

      {error && (
        <div className="mb-2 flex items-start gap-1.5 text-[12px] text-red-700">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <button onClick={draftHooks} disabled={busy !== null}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-indigo-200 text-indigo-700 hover:bg-indigo-50 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === 'hook' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {hooks ? 'Re-draft hooks' : 'Draft hooks'}
          </button>
          <div className="flex-1" />
          <button onClick={complete} disabled={busy !== null}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 inline-flex items-center gap-1.5">
            {busy === 'complete' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Mark completed
          </button>
        </div>
      )}
    </article>
  )
}

function BriefRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start gap-2 text-[12px]">
      <span className="font-semibold text-ink-3 uppercase tracking-wider text-[10px] w-20 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-ink-2 leading-relaxed flex-1">{value}</span>
    </div>
  )
}

function EmptyState({ tab }: { tab: Tab }) {
  const msg = tab === 'ready'
    ? 'No shoots ready to cut. Crew uploads land here once raw is delivered.'
    : 'No completed jobs yet.'
  return (
    <div className="bg-white rounded-2xl ring-1 ring-ink-6/60 px-6 py-12 text-center">
      <Film className="w-8 h-8 text-ink-4 mx-auto mb-3" />
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
