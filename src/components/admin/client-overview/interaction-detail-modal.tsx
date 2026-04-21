'use client'

/**
 * View / edit / delete a logged client_interaction.
 *
 * Opened by clicking a meeting/call/email/note row in the activity
 * timeline. Read-only by default; flips to edit mode via the Edit button.
 * Delete asks for confirmation.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Calendar, MessageSquare, Phone, Mail, StickyNote, Smile, Meh, Frown,
  CheckCircle2, Loader2, AlertTriangle, Pencil, Trash2,
} from 'lucide-react'

type InteractionKind = 'meeting' | 'call' | 'email' | 'text' | 'note' | 'other'
type Sentiment = 'positive' | 'neutral' | 'negative' | null

interface InteractionRow {
  id: string
  kind: InteractionKind
  summary: string
  body: string | null
  occurred_at: string
  duration_minutes: number | null
  sentiment: Sentiment
  outcome: string | null
  performed_by_name: string | null
}

const KIND_OPTIONS: Array<{ key: InteractionKind; label: string; icon: typeof Calendar }> = [
  { key: 'meeting', label: 'Meeting', icon: Calendar },
  { key: 'call',    label: 'Call',    icon: Phone },
  { key: 'email',   label: 'Email',   icon: Mail },
  { key: 'text',    label: 'Text',    icon: MessageSquare },
  { key: 'note',    label: 'Note',    icon: StickyNote },
]

const KIND_ICON: Record<InteractionKind, typeof Calendar> = {
  meeting: Calendar, call: Phone, email: Mail, text: MessageSquare, note: StickyNote, other: StickyNote,
}

interface Props {
  interactionId: string
  onClose: () => void
  onChange: () => void
}

export default function InteractionDetailModal({ interactionId, onClose, onChange }: Props) {
  const [row, setRow] = useState<InteractionRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Edit-mode draft state
  const [kind, setKind] = useState<InteractionKind>('meeting')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [occurredAt, setOccurredAt] = useState('')
  const [duration, setDuration] = useState('')
  const [sentiment, setSentiment] = useState<Sentiment>(null)
  const [outcome, setOutcome] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data, error: e } = await supabase
      .from('client_interactions')
      .select('id, kind, summary, body, occurred_at, duration_minutes, sentiment, outcome, performed_by_name')
      .eq('id', interactionId)
      .maybeSingle()

    if (e || !data) {
      setError(e?.message ?? 'Interaction not found')
      setLoading(false)
      return
    }
    const r = data as InteractionRow
    setRow(r)
    // Seed edit fields so the user can flip to edit mode instantly
    setKind(r.kind)
    setSummary(r.summary)
    setBody(r.body ?? '')
    setOccurredAt(toLocalInputValue(new Date(r.occurred_at)))
    setDuration(r.duration_minutes ? String(r.duration_minutes) : '')
    setSentiment(r.sentiment)
    setOutcome(r.outcome ?? '')
    setLoading(false)
  }, [interactionId])

  useEffect(() => { void load() }, [load])

  function onBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSave(e?: React.FormEvent) {
    e?.preventDefault()
    if (!summary.trim()) {
      setError('Summary is required')
      return
    }
    setSaving(true); setError(null)
    const supabase = createClient()
    const { error: updErr } = await supabase
      .from('client_interactions')
      .update({
        kind,
        summary: summary.trim(),
        body: body.trim() || null,
        occurred_at: new Date(occurredAt).toISOString(),
        duration_minutes: duration ? parseInt(duration) || null : null,
        sentiment,
        outcome: outcome.trim() || null,
      })
      .eq('id', interactionId)

    setSaving(false)
    if (updErr) { setError(updErr.message); return }
    setEditing(false)
    await load()
    onChange()
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase
      .from('client_interactions')
      .delete()
      .eq('id', interactionId)

    setDeleting(false)
    if (delErr) { setError(delErr.message); return }
    onChange()
    onClose()
  }

  const Icon = row ? (KIND_ICON[row.kind] ?? StickyNote) : StickyNote

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onBackdrop}
    >
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-700 flex items-center justify-center">
              <Icon className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-ink capitalize">
                {editing ? 'Edit interaction' : (row?.kind ?? 'Interaction')}
              </h2>
              {row && !editing && (
                <p className="text-[11px] text-ink-4 mt-0.5">
                  {new Date(row.occurred_at).toLocaleString('en-US', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: 'numeric', minute: '2-digit',
                  })}
                  {row.performed_by_name && <> · by {row.performed_by_name}</>}
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-ink-4" />
          </div>
        ) : !row ? (
          <div className="p-5 text-sm text-red-700">{error ?? 'Not found'}</div>
        ) : editing ? (
          /* ----------------- Edit mode ----------------- */
          <form onSubmit={handleSave}>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">Type</label>
                <div className="grid grid-cols-5 gap-1.5">
                  {KIND_OPTIONS.map(opt => {
                    const OptIcon = opt.icon
                    return (
                      <button
                        key={opt.key}
                        type="button"
                        onClick={() => setKind(opt.key)}
                        className={`flex flex-col items-center justify-center py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                          kind === opt.key
                            ? 'border-brand bg-brand-tint/40 text-brand-dark'
                            : 'border-ink-6 text-ink-3 hover:border-ink-4'
                        }`}
                      >
                        <OptIcon className="w-3.5 h-3.5 mb-0.5" />
                        {opt.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">
                  Summary <span className="text-red-600 normal-case">*</span>
                </label>
                <input
                  type="text"
                  value={summary}
                  onChange={e => setSummary(e.target.value)}
                  className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                  required
                />
              </div>

              <div className="grid grid-cols-[1fr_100px] gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">When</label>
                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={e => setOccurredAt(e.target.value)}
                    className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">Min</label>
                  <input
                    type="number"
                    min="0"
                    value={duration}
                    onChange={e => setDuration(e.target.value)}
                    className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">Notes</label>
                <textarea
                  value={body}
                  onChange={e => setBody(e.target.value)}
                  rows={5}
                  className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
                />
              </div>

              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <div>
                  <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">
                    Outcome <span className="text-ink-4 normal-case">· optional</span>
                  </label>
                  <input
                    type="text"
                    value={outcome}
                    onChange={e => setOutcome(e.target.value)}
                    className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">How&apos;d it go?</label>
                  <div className="flex gap-1">
                    {([
                      { value: 'positive', icon: Smile, tone: 'emerald' },
                      { value: 'neutral',  icon: Meh,   tone: 'ink' },
                      { value: 'negative', icon: Frown, tone: 'red' },
                    ] as const).map(opt => {
                      const OptIcon = opt.icon
                      const active = sentiment === opt.value
                      const bg = active
                        ? opt.tone === 'emerald' ? 'bg-emerald-100 text-emerald-700'
                          : opt.tone === 'red' ? 'bg-red-100 text-red-700'
                          : 'bg-bg-2 text-ink-2'
                        : 'text-ink-4 hover:text-ink-2'
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          onClick={() => setSentiment(active ? null : opt.value)}
                          className={`p-2 rounded-lg transition-colors ${bg}`}
                        >
                          <OptIcon className="w-4 h-4" />
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>

              {error && (
                <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
              <button
                type="button"
                onClick={() => { setEditing(false); setError(null); void load() }}
                className="text-sm text-ink-3 hover:text-ink px-3"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                Save changes
              </button>
            </div>
          </form>
        ) : (
          /* ----------------- View mode ----------------- */
          <>
            <div className="p-5 space-y-4">
              <div>
                <h3 className="text-base font-medium text-ink">{row.summary}</h3>
                {(row.duration_minutes || row.sentiment) && (
                  <div className="flex items-center gap-3 mt-1.5 text-[12px] text-ink-4">
                    {row.duration_minutes !== null && (
                      <span>{row.duration_minutes} min</span>
                    )}
                    {row.sentiment && (
                      <span className={`inline-flex items-center gap-1 ${
                        row.sentiment === 'positive' ? 'text-emerald-700'
                        : row.sentiment === 'negative' ? 'text-red-700'
                        : 'text-ink-3'
                      }`}>
                        {row.sentiment === 'positive' && <Smile className="w-3 h-3" />}
                        {row.sentiment === 'neutral' && <Meh className="w-3 h-3" />}
                        {row.sentiment === 'negative' && <Frown className="w-3 h-3" />}
                        {row.sentiment}
                      </span>
                    )}
                  </div>
                )}
              </div>

              {row.body && (
                <div>
                  <div className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Notes</div>
                  <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">{row.body}</p>
                </div>
              )}

              {row.outcome && (
                <div>
                  <div className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-1.5">Outcome</div>
                  <p className="text-sm text-ink-2">{row.outcome}</p>
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
                  <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                  {error}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
              {confirmDelete ? (
                <>
                  <span className="text-[12px] text-ink-2">Delete this interaction?</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="text-sm text-ink-3 hover:text-ink px-3"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      disabled={deleting}
                      className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                      Delete
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="text-[13px] text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 px-2"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="text-sm text-ink-3 hover:text-ink px-3"
                    >
                      Close
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(true)}
                      className="border border-ink-6 hover:border-brand/40 hover:bg-brand-tint/30 text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Edit
                    </button>
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
