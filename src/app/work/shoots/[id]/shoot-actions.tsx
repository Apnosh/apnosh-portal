/**
 * Client-side actions for a shoot detail page:
 *   - "Prep with AI" — hits /prep, renders the structured guide
 *   - "Mark wrapped" / "Mark uploaded" — state transitions
 *
 * Lives next to the server detail page so the page stays a server
 * component for the data fetch.
 */

'use client'

import { useState, useCallback } from 'react'
import {
  Sparkles, Loader2, AlertCircle, CheckCircle2, Package, Clock, MessageCircle, Camera, Upload,
} from 'lucide-react'

interface PrepGuide {
  equipment: string[]
  arrival_timing: string
  rapport_questions: string[]
  backup_shots: string[]
  why?: string
}

interface Props {
  shootId: string
  initialStatus: string
}

export default function ShootActions({ shootId, initialStatus }: Props) {
  const [status, setStatus] = useState(initialStatus)
  const [prep, setPrep] = useState<PrepGuide | null>(null)
  const [busy, setBusy] = useState<null | 'prep' | 'wrap' | 'upload'>(null)
  const [error, setError] = useState<string | null>(null)

  const draftPrep = useCallback(async () => {
    setBusy('prep')
    setError(null)
    try {
      const res = await fetch(`/api/work/shoots/${shootId}/prep`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setPrep(j.prep as PrepGuide)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [shootId])

  const transition = useCallback(async (action: 'wrap' | 'upload') => {
    setBusy(action)
    setError(null)
    try {
      const res = await fetch(`/api/work/shoots/${shootId}/wrap`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setStatus(j.status as string)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [shootId])

  const canWrap = ['planned', 'briefed', 'in_progress'].includes(status)
  const canUpload = status === 'wrapped'

  return (
    <div className="space-y-3">
      {/* AI prep button + result */}
      <section className="rounded-2xl border bg-white p-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-0.5">Field prep</p>
            <p className="text-[12px] text-ink-3">Equipment, arrival timing, rapport questions, backups.</p>
          </div>
          <button onClick={draftPrep} disabled={busy !== null}
            className="text-[12px] font-semibold px-3 py-2 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5 flex-shrink-0">
            {busy === 'prep' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
            {prep ? 'Re-draft' : 'Prep with AI'}
          </button>
        </div>

        {prep && (
          <div className="space-y-3">
            <Block icon={Package} label="Equipment to pack">
              <ul className="text-[13px] text-ink leading-relaxed list-disc list-inside space-y-0.5">
                {prep.equipment.map((e, i) => <li key={i}>{e}</li>)}
              </ul>
            </Block>
            <Block icon={Clock} label="Arrival timing">
              <p className="text-[13px] text-ink leading-relaxed">{prep.arrival_timing}</p>
            </Block>
            <Block icon={MessageCircle} label="Ask the owner">
              <ul className="text-[13px] text-ink leading-relaxed list-disc list-inside space-y-0.5">
                {prep.rapport_questions.map((q, i) => <li key={i}>{q}</li>)}
              </ul>
            </Block>
            <Block icon={Camera} label="Backup shots">
              <ul className="text-[13px] text-ink leading-relaxed list-disc list-inside space-y-0.5">
                {prep.backup_shots.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </Block>
            {prep.why && (
              <p className="text-[11px] text-ink-4 italic pt-1 border-t border-ink-6/40">{prep.why}</p>
            )}
          </div>
        )}
      </section>

      {/* Wrap / upload actions */}
      <section className="rounded-2xl border bg-white p-4" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-3">Shoot status</p>
        <div className="flex items-center gap-2 mb-2">
          <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ring-1 ${
            status === 'wrapped' || status === 'uploaded' || status === 'completed'
              ? 'bg-emerald-50 text-emerald-800 ring-emerald-100'
              : 'bg-amber-50 text-amber-800 ring-amber-100'
          }`}>{status}</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => transition('wrap')} disabled={busy !== null || !canWrap}
            className="text-[12px] font-medium px-3 py-1.5 rounded-lg ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'wrap' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Mark wrapped
          </button>
          <button onClick={() => transition('upload')} disabled={busy !== null || !canUpload}
            className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 inline-flex items-center gap-1.5">
            {busy === 'upload' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
            Mark uploaded
          </button>
        </div>

        {!canWrap && !canUpload && status !== 'planned' && (
          <p className="text-[11px] text-ink-4 mt-2">No further status changes available.</p>
        )}
      </section>

      {error && (
        <div className="flex items-start gap-1.5 text-[12px] text-red-700 px-1">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}
    </div>
  )
}

function Block({ icon: Icon, label, children }: { icon: React.ComponentType<{ className?: string }>; label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg bg-amber-50/40 ring-1 ring-amber-100 p-3">
      <p className="text-[10px] font-semibold text-amber-900 uppercase tracking-wider mb-1.5 inline-flex items-center gap-1">
        <Icon className="w-3 h-3" /> {label}
      </p>
      {children}
    </div>
  )
}
