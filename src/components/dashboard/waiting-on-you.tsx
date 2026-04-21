'use client'

/**
 * Client-facing "Waiting on you" card.
 *
 * Surfaces tasks where visible_to_client=true (regardless of owner) so
 * the client sees what's in flight and what we're waiting on them for.
 * Click to mark done — RLS lets them update the status on their own
 * visible tasks, nothing else.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import {
  Circle, CheckCircle2, Loader2, Clock, AlertTriangle, User, Briefcase,
} from 'lucide-react'
import type { ClientTask } from '@/types/database'

function formatDue(iso: string): { label: string; tone: string } {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = d.getTime() - now.getTime()
  const diffDays = Math.round(diffMs / 86400000)
  const overdue = diffMs < 0
  let label: string
  if (overdue) {
    if (diffDays === 0) label = 'today'
    else if (diffDays === -1) label = 'yesterday'
    else label = `${Math.abs(diffDays)}d overdue`
  } else {
    if (diffDays === 0) label = 'today'
    else if (diffDays === 1) label = 'tomorrow'
    else if (diffDays < 7) label = `in ${diffDays}d`
    else label = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  }
  const tone = overdue ? 'text-red-600' : diffDays <= 2 ? 'text-amber-600' : 'text-ink-4'
  return { label, tone }
}

export default function WaitingOnYou({ clientId }: { clientId: string }) {
  const [tasks, setTasks] = useState<ClientTask[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('client_tasks')
      .select('*')
      .eq('client_id', clientId)
      .eq('visible_to_client', true)
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(20)

    const now = Date.now()
    const filtered = (data ?? []).filter((t: ClientTask) =>
      !t.snoozed_until || new Date(t.snoozed_until).getTime() <= now
    )
    setTasks(filtered as ClientTask[])
    setLoading(false)
  }, [clientId])

  useEffect(() => { void load() }, [load])

  async function complete(id: string) {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('client_tasks').update({ status: 'done' }).eq('id', id)
    setCompleting(null)
    void load()
  }

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-ink-6 p-5 animate-pulse">
        <div className="h-4 w-32 bg-ink-6 rounded mb-3" />
        <div className="h-3 w-full bg-ink-6 rounded mb-2" />
        <div className="h-3 w-3/4 bg-ink-6 rounded" />
      </div>
    )
  }

  if (tasks.length === 0) return null  // nothing to show, nothing to render

  const clientTasks = tasks.filter(t => t.assignee_type === 'client')
  const adminTasks  = tasks.filter(t => t.assignee_type !== 'client')

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[15px] font-bold text-ink">
          {clientTasks.length > 0 ? 'Waiting on you' : "What's in flight"}
        </h2>
        <span className="text-[11px] text-ink-4">{tasks.length}</span>
      </div>

      {clientTasks.length > 0 && (
        <div className="space-y-2 mb-4">
          {clientTasks.map(t => {
            const due = t.due_at ? formatDue(t.due_at) : null
            return (
              <div
                key={t.id}
                className="flex items-start gap-2.5 p-2.5 rounded-lg border border-brand/20 bg-brand-tint/20"
              >
                <button
                  type="button"
                  onClick={() => complete(t.id)}
                  disabled={completing === t.id}
                  className="mt-0.5 text-brand-dark hover:text-emerald-600 flex-shrink-0"
                  aria-label="Mark done"
                >
                  {completing === t.id
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Circle className="w-4 h-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] text-ink leading-snug">{t.title}</div>
                  {t.body && (
                    <div className="text-[12px] text-ink-3 mt-0.5 leading-snug">{t.body}</div>
                  )}
                  {due && (
                    <div className={`inline-flex items-center gap-1 mt-1 text-[11px] ${due.tone}`}>
                      {due.tone.includes('red') ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                      Due {due.label}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Admin-owned tasks that the client can see — read-only for them.
          Rendered as a lighter "in flight" list so they know we're
          working on it without risk of them marking it done. */}
      {adminTasks.length > 0 && (
        <div>
          {clientTasks.length > 0 && (
            <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-2">
              We&apos;re on it
            </h3>
          )}
          <div className="space-y-1.5">
            {adminTasks.map(t => {
              const due = t.due_at ? formatDue(t.due_at) : null
              return (
                <div key={t.id} className="flex items-start gap-2 text-[12.5px]">
                  <Briefcase className="w-3 h-3 text-ink-4 mt-0.5 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-ink-2 leading-snug">{t.title}</div>
                    {due && (
                      <div className={`inline-flex items-center gap-1 mt-0.5 text-[11px] ${due.tone}`}>
                        <Clock className="w-2.5 h-2.5" />
                        {due.label}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
