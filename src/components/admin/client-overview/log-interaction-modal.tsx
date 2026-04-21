'use client'

/**
 * Log interaction modal -- used from the client overview header's
 * "Log meeting" quick action. Writes into client_interactions so every
 * admin-logged touchpoint feeds the activity timeline + (later) ML.
 *
 * Fields captured:
 *   - kind (meeting / call / email / text / note / other)
 *   - occurred_at (defaults to now; admin can backfill)
 *   - summary (one-liner shown on the timeline)
 *   - body (longer notes -- rendered as markdown later)
 *   - duration_minutes (optional, for calls/meetings)
 *   - sentiment (positive / neutral / negative, optional)
 *   - outcome (short free-form)
 *
 * Kept minimal on purpose -- every field should feel lightweight to
 * fill out or skip. The admin shouldn't avoid logging because the form
 * is too long.
 */

import { useEffect, useMemo, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Calendar, MessageSquare, Phone, Mail, StickyNote, Smile, Meh, Frown,
  Clock, CheckCircle2, Loader2, AlertTriangle, ListTodo, Sparkles,
} from 'lucide-react'
import { detectFollowup } from '@/lib/task-nlp'

type InteractionKind = 'meeting' | 'call' | 'email' | 'text' | 'note' | 'other'
type Sentiment = 'positive' | 'neutral' | 'negative' | null

const KIND_OPTIONS: Array<{ key: InteractionKind; label: string; icon: typeof Calendar }> = [
  { key: 'meeting', label: 'Meeting', icon: Calendar },
  { key: 'call',    label: 'Call',    icon: Phone },
  { key: 'email',   label: 'Email',   icon: Mail },
  { key: 'text',    label: 'Text',    icon: MessageSquare },
  { key: 'note',    label: 'Note',    icon: StickyNote },
]

interface Props {
  clientId: string
  onClose: () => void
  onSaved: () => void
}

export default function LogInteractionModal({ clientId, onClose, onSaved }: Props) {
  const [kind, setKind] = useState<InteractionKind>('meeting')
  const [summary, setSummary] = useState('')
  const [body, setBody] = useState('')
  const [occurredAt, setOccurredAt] = useState(() => toLocalInputValue(new Date()))
  const [duration, setDuration] = useState('')
  const [sentiment, setSentiment] = useState<Sentiment>(null)
  const [outcome, setOutcome] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [createTaskChecked, setCreateTaskChecked] = useState(true)
  const summaryRef = useRef<HTMLInputElement>(null)

  // Watch outcome + body for follow-up phrasing. If we spot one, we'll
  // offer to auto-create a task on submit.
  const followup = useMemo(
    () => detectFollowup(`${outcome} ${body}`.trim()),
    [outcome, body]
  )

  useEffect(() => {
    // Auto-focus the summary field when the modal opens
    setTimeout(() => summaryRef.current?.focus(), 50)
  }, [])

  function onBackdrop(e: React.MouseEvent) {
    if (e.target === e.currentTarget) onClose()
  }

  async function handleSubmit(e?: React.FormEvent) {
    e?.preventDefault()
    if (!summary.trim()) {
      setError('Summary is required')
      return
    }
    setSubmitting(true); setError(null)

    const supabase = createClient()
    const { data: inserted, error: insertErr } = await supabase
      .from('client_interactions')
      .insert({
        client_id: clientId,
        kind,
        summary: summary.trim(),
        body: body.trim() || null,
        occurred_at: new Date(occurredAt).toISOString(),
        duration_minutes: duration ? parseInt(duration) || null : null,
        sentiment,
        outcome: outcome.trim() || null,
      })
      .select('id')
      .maybeSingle()

    if (insertErr) {
      setSubmitting(false)
      setError(insertErr.message)
      return
    }

    // If we detected a follow-up intent and the admin didn't uncheck the
    // "create task" option, spawn the task linked back to this interaction.
    if (followup && createTaskChecked) {
      await supabase.from('client_tasks').insert({
        client_id: clientId,
        title: followup.title,
        due_at: followup.due_at.toISOString(),
        assignee_type: 'admin',
        source: 'auto_nlp',
        interaction_id: (inserted as { id: string } | null)?.id ?? null,
      })
    }

    setSubmitting(false)
    onSaved()
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onBackdrop}
    >
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8 overflow-hidden"
      >
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <div>
            <h2 className="text-base font-semibold text-ink">Log an interaction</h2>
            <p className="text-[11px] text-ink-4 mt-0.5">Adds to the client&apos;s activity timeline.</p>
          </div>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* Kind */}
          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">Type</label>
            <div className="grid grid-cols-5 gap-1.5">
              {KIND_OPTIONS.map(opt => {
                const Icon = opt.icon
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
                    <Icon className="w-3.5 h-3.5 mb-0.5" />
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Summary */}
          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">
              Summary <span className="text-red-600 normal-case">*</span>
            </label>
            <input
              ref={summaryRef}
              type="text"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              placeholder="e.g. Strategy review + Q2 content plan"
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
              required
            />
          </div>

          {/* When + duration */}
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
                placeholder="30"
                className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
              />
            </div>
          </div>

          {/* Body */}
          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">Notes</label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              placeholder="What was discussed, decisions made, follow-ups..."
              rows={4}
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>

          {/* Sentiment + outcome -- both optional */}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <div>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1.5">
                Outcome <span className="text-ink-4 normal-case">· optional</span>
              </label>
              <input
                type="text"
                value={outcome}
                onChange={e => setOutcome(e.target.value)}
                placeholder="e.g. Follow up in 2 weeks"
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
                  const Icon = opt.icon
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
                      title={opt.value}
                    >
                      <Icon className="w-4 h-4" />
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Follow-up detector: if we spotted something like "follow up
              in 2 weeks" or "next Tuesday" in outcome/body, offer to
              auto-create a task. */}
          {followup && (
            <label className="flex items-start gap-2 p-2.5 rounded-lg bg-brand-tint/30 border border-brand/20 cursor-pointer hover:bg-brand-tint/40 transition-colors">
              <input
                type="checkbox"
                checked={createTaskChecked}
                onChange={e => setCreateTaskChecked(e.target.checked)}
                className="mt-0.5"
              />
              <div className="flex-1 text-[12px] leading-snug">
                <div className="inline-flex items-center gap-1 font-medium text-brand-dark">
                  <Sparkles className="w-3 h-3" />
                  Create follow-up task
                </div>
                <div className="text-ink-3 mt-0.5">
                  <span className="font-medium text-ink-2">{followup.title}</span>
                  <span className="text-ink-4"> · due {followup.due_at.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                </div>
                <div className="text-[10px] text-ink-4 mt-0.5 italic">matched &ldquo;{followup.matched}&rdquo;</div>
              </div>
              <ListTodo className="w-3.5 h-3.5 text-brand-dark mt-0.5 flex-shrink-0" />
            </label>
          )}

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
            onClick={onClose}
            className="text-sm text-ink-3 hover:text-ink px-3"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
            Log interaction
          </button>
        </div>
      </form>
    </div>
  )
}

// datetime-local inputs want 'YYYY-MM-DDTHH:mm' in local time
function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}
