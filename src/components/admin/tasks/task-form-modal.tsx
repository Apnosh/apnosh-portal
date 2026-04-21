'use client'

/**
 * Shared create / edit modal for client_tasks. Used from:
 *   - TasksCard (+ Add Task)
 *   - TasksCard (click a row to edit)
 *   - Today page (Edit button on a row)
 *   - LogInteractionModal (auto-create from detected follow-up)
 *
 * Always operates on a single client. When `task` is provided we edit;
 * otherwise we create. Delete is available in edit mode with confirm.
 */

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  X, Loader2, CheckCircle2, Trash2, AlertTriangle, Calendar,
} from 'lucide-react'
import type { ClientTask, ClientTaskSource } from '@/types/database'

interface Props {
  clientId: string
  task?: ClientTask
  // Optional defaults when creating from another flow (e.g. NLP detect).
  defaults?: Partial<Pick<ClientTask, 'title' | 'body' | 'due_at' | 'source' | 'interaction_id' | 'invoice_id' | 'content_id'>>
  onClose: () => void
  onSaved: () => void
}

function toLocalInputValue(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default function TaskFormModal({ clientId, task, defaults, onClose, onSaved }: Props) {
  const isEdit = !!task
  const [title, setTitle] = useState(task?.title ?? defaults?.title ?? '')
  const [body, setBody] = useState(task?.body ?? defaults?.body ?? '')
  const [dueAt, setDueAt] = useState(() => {
    const v = task?.due_at ?? defaults?.due_at ?? null
    return v ? toLocalInputValue(new Date(v)) : ''
  })
  const [assigneeType, setAssigneeType] = useState<'admin' | 'client' | ''>(task?.assignee_type ?? 'admin')
  const [visibleToClient, setVisibleToClient] = useState(task?.visible_to_client ?? false)
  const [submitting, setSubmitting] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim()) { setError('Title is required'); return }
    setSubmitting(true); setError(null)
    const supabase = createClient()

    const payload = {
      client_id: clientId,
      title: title.trim(),
      body: body.trim() || null,
      due_at: dueAt ? new Date(dueAt).toISOString() : null,
      assignee_type: assigneeType || null,
      visible_to_client: visibleToClient || assigneeType === 'client',
      source: (defaults?.source ?? 'manual') as ClientTaskSource,
      interaction_id: defaults?.interaction_id ?? null,
      invoice_id: defaults?.invoice_id ?? null,
      content_id: defaults?.content_id ?? null,
    }

    const { error: saveErr } = isEdit
      ? await supabase.from('client_tasks').update(payload).eq('id', task!.id)
      : await supabase.from('client_tasks').insert(payload)

    setSubmitting(false)
    if (saveErr) { setError(saveErr.message); return }
    onSaved()
  }

  async function handleDelete() {
    if (!task) return
    setDeleting(true); setError(null)
    const supabase = createClient()
    const { error: delErr } = await supabase.from('client_tasks').delete().eq('id', task.id)
    setDeleting(false)
    if (delErr) { setError(delErr.message); return }
    onSaved()
  }

  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <form onSubmit={handleSave} className="bg-white rounded-2xl shadow-xl max-w-lg w-full my-8 overflow-hidden">
        <div className="flex items-start justify-between p-4 border-b border-ink-6">
          <h2 className="text-base font-semibold text-ink">{isEdit ? 'Edit task' : 'New task'}</h2>
          <button type="button" onClick={onClose} className="text-ink-4 hover:text-ink p-1">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">
              Title <span className="text-red-600 normal-case">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              autoFocus
              placeholder="e.g. Follow up on Q2 proposal"
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>

          <div>
            <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">
              Details <span className="text-ink-4 normal-case">· optional</span>
            </label>
            <textarea
              value={body}
              onChange={e => setBody(e.target.value)}
              rows={3}
              placeholder="Any context the assignee needs..."
              className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm resize-y focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand"
            />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Due</label>
              <input
                type="datetime-local"
                value={dueAt}
                onChange={e => setDueAt(e.target.value)}
                className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm"
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide block mb-1">Owner</label>
              <select
                value={assigneeType}
                onChange={e => setAssigneeType(e.target.value as 'admin' | 'client' | '')}
                className="w-full px-3 py-2 border border-ink-6 rounded-lg text-sm bg-white"
              >
                <option value="admin">Admin (us)</option>
                <option value="client">Client (waiting on them)</option>
                <option value="">Unassigned</option>
              </select>
            </div>
          </div>

          {/* Visible to client toggle — auto-on if the owner is client, but
              an admin task can optionally be surfaced if we want them to see it. */}
          {assigneeType !== 'client' && (
            <label className="inline-flex items-center gap-2 text-[12px] text-ink-2 pt-1">
              <input
                type="checkbox"
                checked={visibleToClient}
                onChange={e => setVisibleToClient(e.target.checked)}
              />
              Also show this on the client&apos;s dashboard
            </label>
          )}

          {error && (
            <div className="flex items-start gap-2 text-[12px] text-red-700 bg-red-50 border border-red-200 rounded-lg p-2">
              <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 px-5 py-3 border-t border-ink-6 bg-bg-2">
          {isEdit ? (
            confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-ink-2">Delete this task?</span>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="text-sm text-ink-3 hover:text-ink px-2"
                >
                  No
                </button>
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={deleting}
                  className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg px-3 py-1.5 inline-flex items-center gap-1.5 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                  Delete
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="text-[13px] text-red-600 hover:text-red-700 inline-flex items-center gap-1.5 px-2"
              >
                <Trash2 className="w-3.5 h-3.5" /> Delete
              </button>
            )
          ) : <span />}

          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="text-sm text-ink-3 hover:text-ink px-3">Cancel</button>
            <button
              type="submit"
              disabled={submitting}
              className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              {isEdit ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </form>
    </div>
  )
}
