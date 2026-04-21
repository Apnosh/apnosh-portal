'use client'

/**
 * Tasks card for the client overview sidebar.
 *
 * Shows open tasks for this client with a quick checkbox to complete,
 * a due-date indicator, and click-to-edit. Snoozed tasks are hidden.
 * Completed tasks roll up into an expandable "Recently done" section.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Plus, Loader2, Circle, CheckCircle2, Clock, AlertTriangle, User, Briefcase,
  Sparkles, ChevronDown,
} from 'lucide-react'
import type { ClientTask } from '@/types/database'
import TaskFormModal from '@/components/admin/tasks/task-form-modal'
import ApplyTemplateModal from '@/components/admin/tasks/apply-template-modal'

type Priority = 'overdue' | 'today' | 'soon' | 'later' | 'none'

function formatDue(iso: string): { label: string; priority: Priority } {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const diffDays = Math.round((d.getTime() - now.getTime()) / 86400000)

  let priority: Priority
  let label: string
  if (d < startOfToday) {
    priority = 'overdue'
    if (diffDays === -1) label = 'Yesterday'
    else label = `${Math.abs(diffDays)}d overdue`
  } else if (d < startOfTomorrow) {
    priority = 'today'
    label = 'Today'
  } else if (diffDays <= 2) {
    priority = 'soon'
    label = diffDays === 1 ? 'Tomorrow' : `In ${diffDays}d`
  } else if (diffDays < 7) {
    priority = 'later'
    label = `In ${diffDays}d`
  } else {
    priority = 'later'
    label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  return { label, priority }
}

const PRIORITY_BORDER: Record<Priority, string> = {
  overdue: 'border-l-red-500',
  today:   'border-l-amber-400',
  soon:    'border-l-blue-300',
  later:   'border-l-transparent',
  none:    'border-l-transparent',
}

const PRIORITY_PILL: Record<Priority, string> = {
  overdue: 'bg-red-50 text-red-700',
  today:   'bg-amber-50 text-amber-700',
  soon:    'bg-blue-50 text-blue-700',
  later:   'bg-ink-6 text-ink-3',
  none:    'bg-ink-6 text-ink-3',
}

export default function TasksCard({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<ClientTask[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [templateOpen, setTemplateOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [editTask, setEditTask] = useState<ClientTask | null>(null)
  const [showDone, setShowDone] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('client_tasks')
      .select('*')
      .eq('client_id', clientId)
      .order('status', { ascending: true })    // todo/doing/done alphabetical — todo first
      .order('due_at', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .limit(50)

    setTasks((data ?? []) as ClientTask[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function completeTask(id: string) {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('client_tasks').update({ status: 'done' }).eq('id', id)
    setCompleting(null)
    void load()
  }

  async function uncompleteTask(id: string) {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('client_tasks').update({ status: 'todo' }).eq('id', id)
    setCompleting(null)
    void load()
  }

  const now = Date.now()
  const active = tasks.filter(t =>
    (t.status === 'todo' || t.status === 'doing')
    && (!t.snoozed_until || new Date(t.snoozed_until).getTime() <= now)
  )
  const done = tasks.filter(t => t.status === 'done').slice(0, 5)

  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-[13px] font-semibold text-ink">Tasks</h3>
            {active.length > 0 && (
              <span className="text-[10px] font-semibold text-ink-4 bg-bg-2 rounded-full px-1.5 py-0.5 tabular-nums">
                {active.length}
              </span>
            )}
          </div>
          <p className="text-[11px] text-ink-4 mt-0.5">What needs to happen next</p>
        </div>
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen(v => !v)}
            className="text-ink-4 hover:text-brand-dark text-[11px] font-medium inline-flex items-center gap-1"
          >
            <Plus className="w-3 h-3" /> Add
            <ChevronDown className="w-2.5 h-2.5" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-lg border border-ink-6 shadow-lg z-20 py-1">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setCreateOpen(true) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-ink-2 hover:bg-bg-2 inline-flex items-center gap-2"
                >
                  <Plus className="w-3 h-3" /> New task
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); setTemplateOpen(true) }}
                  className="w-full text-left px-3 py-1.5 text-[12px] text-ink-2 hover:bg-bg-2 inline-flex items-center gap-2"
                >
                  <Sparkles className="w-3 h-3" /> Apply template
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-4 h-4 animate-spin text-ink-4" />
        </div>
      ) : active.length === 0 && done.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-8 text-center">
          <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mb-3">
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-[13px] text-ink-2 font-medium">All caught up</p>
          <p className="text-[11.5px] text-ink-4 mt-1 max-w-[220px] leading-snug">
            Add a task or apply the onboarding template to get started
          </p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-4 inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium border border-ink-6 hover:border-ink-4 rounded-lg text-ink-2 transition-colors"
          >
            <Plus className="w-3 h-3" /> New task
          </button>
        </div>
      ) : (
        <div className="space-y-1.5">
          {active.map(t => {
            const due = t.due_at ? formatDue(t.due_at) : null
            const priority = due?.priority ?? 'none'
            const OwnerIcon = t.assignee_type === 'client' ? User : Briefcase
            return (
              <div
                key={t.id}
                className={`group flex items-start gap-2 pl-2.5 pr-1 py-2 rounded-lg border-l-2 ${PRIORITY_BORDER[priority]} bg-bg-2/40 hover:bg-bg-2 transition-colors`}
              >
                <button
                  type="button"
                  onClick={() => completeTask(t.id)}
                  disabled={completing === t.id}
                  className="mt-0.5 text-ink-4 hover:text-emerald-600 flex-shrink-0 transition-colors"
                  title="Mark done"
                >
                  {completing === t.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Circle className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={() => setEditTask(t)}
                  className="flex-1 min-w-0 text-left"
                >
                  <div className="text-[13px] text-ink leading-snug font-medium truncate">{t.title}</div>
                  <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                    {due && (
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium ${PRIORITY_PILL[priority]}`}>
                        {priority === 'overdue' ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                        {due.label}
                      </span>
                    )}
                    {t.assignee_type && (
                      <span className="inline-flex items-center gap-0.5 text-[10.5px] text-ink-4">
                        <OwnerIcon className="w-2.5 h-2.5" />
                        {t.assignee_type === 'client' ? 'Client' : 'Us'}
                      </span>
                    )}
                    {t.visible_to_client && t.assignee_type !== 'client' && (
                      <span className="text-[10px] text-blue-600">· shown to client</span>
                    )}
                  </div>
                </button>
              </div>
            )
          })}

          {done.length > 0 && (
            <>
              <button
                type="button"
                onClick={() => setShowDone(v => !v)}
                className="text-[11px] text-ink-4 hover:text-ink-2 mt-2 pt-2 border-t border-ink-6 w-full text-left"
              >
                {showDone ? '▾' : '▸'} Recently done ({done.length})
              </button>
              {showDone && (
                <div className="space-y-1 pt-1">
                  {done.map(t => (
                    <div key={t.id} className="flex items-start gap-2 px-1 py-0.5">
                      <button
                        type="button"
                        onClick={() => uncompleteTask(t.id)}
                        className="mt-0.5 text-emerald-600 hover:text-ink-4 flex-shrink-0"
                        title="Reopen"
                      >
                        {completing === t.id
                          ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          : <CheckCircle2 className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditTask(t)}
                        className="text-[12px] text-ink-4 line-through truncate flex-1 min-w-0 text-left hover:text-ink-2"
                      >
                        {t.title}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {createOpen && (
        <TaskFormModal
          clientId={clientId}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); void load() }}
        />
      )}
      {editTask && (
        <TaskFormModal
          clientId={clientId}
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => { setEditTask(null); void load() }}
        />
      )}
      {templateOpen && (
        <ApplyTemplateModal
          clientId={clientId}
          onClose={() => setTemplateOpen(false)}
          onApplied={() => { setTemplateOpen(false); void load() }}
        />
      )}
    </div>
  )
}
