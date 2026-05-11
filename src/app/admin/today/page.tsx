'use client'

/**
 * Admin "Today" page — every active task across every client in one view.
 *
 * The goal: an AM closes Things/Todoist/Notion todos because this page
 * is where they manage their actual workday. Grouped by urgency bucket
 * (overdue → today → this week → later → no date), sorted by due date.
 * Each row is click-to-edit, checkbox-to-complete, and click-client-name
 * to jump to that client's detail page.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  CheckSquare, Circle, Loader2, Plus, AlertTriangle, Clock,
  User, Briefcase, ArrowRight, CheckCircle2, FileText, Zap,
} from 'lucide-react'
import type { ClientTask } from '@/types/database'
import TaskFormModal from '@/components/admin/tasks/task-form-modal'

interface AiAnalysis {
  recommendedAction: 'in_plan' | 'quote' | 'escalate'
  confidence: number
  reasoning: string
  suggestedQuote?: {
    title: string
    lineItems: Array<{ label: string; qty: number; unitPrice: number; total: number; notes?: string }>
    strategistMessage: string
    estimatedTurnaroundDays: number
  }
}

interface TaskWithClient extends ClientTask {
  client: {
    id: string
    name: string
    slug: string
  } | null
  ai_analysis?: AiAnalysis | null
}

type Bucket = 'overdue' | 'today' | 'week' | 'later' | 'nodate'

const BUCKET_LABEL: Record<Bucket, string> = {
  overdue: 'Overdue',
  today:   'Today',
  week:    'This week',
  later:   'Later',
  nodate:  'No date',
}

const BUCKET_TONE: Record<Bucket, string> = {
  overdue: 'text-red-700',
  today:   'text-amber-700',
  week:    'text-ink-2',
  later:   'text-ink-3',
  nodate:  'text-ink-4',
}

function bucketFor(task: ClientTask, now = new Date()): Bucket {
  if (!task.due_at) return 'nodate'
  const d = new Date(task.due_at)
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfTomorrow = new Date(startOfToday); startOfTomorrow.setDate(startOfTomorrow.getDate() + 1)
  const startOfNextWeek = new Date(startOfToday); startOfNextWeek.setDate(startOfNextWeek.getDate() + 7)

  if (d < startOfToday) return 'overdue'
  if (d < startOfTomorrow) return 'today'
  if (d < startOfNextWeek) return 'week'
  return 'later'
}

function formatDueShort(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    + (d.getHours() || d.getMinutes()
      ? ` · ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}`
      : '')
}

export default function TodayPage() {
  const [tasks, setTasks] = useState<TaskWithClient[]>([])
  const [loading, setLoading] = useState(true)
  const [completing, setCompleting] = useState<string | null>(null)
  const [createFor, setCreateFor] = useState<string | null>(null)   // clientId picker → TaskFormModal
  const [editTask, setEditTask] = useState<TaskWithClient | null>(null)
  const [clients, setClients] = useState<Array<{ id: string; name: string; slug: string }>>([])
  const [clientPickerOpen, setClientPickerOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const { data } = await supabase
      .from('client_tasks')
      .select('*, client:clients(id, name, slug)')
      .in('status', ['todo', 'doing'])
      .order('due_at', { ascending: true, nullsFirst: false })
      .limit(500)

    const now = Date.now()
    const filtered = (data ?? []).filter((t: TaskWithClient) =>
      !t.snoozed_until || new Date(t.snoozed_until).getTime() <= now
    )
    setTasks(filtered as TaskWithClient[])
    setLoading(false)
  }, [])

  const loadClients = useCallback(async () => {
    const supabase = createClient()
    const { data } = await supabase
      .from('clients')
      .select('id, name, slug')
      .order('name')
    setClients((data ?? []) as Array<{ id: string; name: string; slug: string }>)
  }, [])

  useEffect(() => { void load(); void loadClients() }, [load, loadClients])

  async function completeTask(id: string) {
    setCompleting(id)
    const supabase = createClient()
    await supabase.from('client_tasks').update({ status: 'done' }).eq('id', id)
    setCompleting(null)
    void load()
  }

  const grouped = useMemo(() => {
    const buckets: Record<Bucket, TaskWithClient[]> = {
      overdue: [], today: [], week: [], later: [], nodate: [],
    }
    for (const t of tasks) buckets[bucketFor(t)].push(t)
    return buckets
  }, [tasks])

  const totalCount = tasks.length
  const overdueCount = grouped.overdue.length

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Today</h1>
          <p className="text-ink-3 text-sm mt-1">
            {totalCount === 0 ? 'Nothing on the board.' : (
              <>
                <span className="text-ink">{totalCount}</span> open task{totalCount === 1 ? '' : 's'}
                {overdueCount > 0 && (
                  <> · <span className="text-red-700 font-medium">{overdueCount} overdue</span></>
                )}
              </>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setClientPickerOpen(true)}
          className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 inline-flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          New task
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="w-5 h-5 animate-spin text-ink-4" />
        </div>
      ) : totalCount === 0 ? (
        <div className="bg-white rounded-2xl border border-ink-6 p-12 text-center">
          <CheckSquare className="w-8 h-8 text-ink-5 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">Inbox zero.</p>
          <p className="text-[12px] text-ink-4 mt-1">Nothing due, nothing overdue. Enjoy it.</p>
        </div>
      ) : (
        <div className="space-y-5">
          {(Object.keys(BUCKET_LABEL) as Bucket[]).map(bucket => {
            const items = grouped[bucket]
            if (items.length === 0) return null
            return (
              <section key={bucket}>
                <h2 className={`text-[12px] font-semibold uppercase tracking-wide mb-2 ${BUCKET_TONE[bucket]}`}>
                  {BUCKET_LABEL[bucket]} <span className="text-ink-4 font-normal">· {items.length}</span>
                </h2>
                <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                  {items.map((t, idx) => {
                    const OwnerIcon = t.assignee_type === 'client' ? User : Briefcase
                    return (
                      <div
                        key={t.id}
                        className={`group flex items-start gap-3 px-4 py-3 hover:bg-bg-2 transition-colors ${
                          idx > 0 ? 'border-t border-ink-6' : ''
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => completeTask(t.id)}
                          disabled={completing === t.id}
                          className="mt-1 text-ink-4 hover:text-emerald-600 flex-shrink-0"
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
                          <div className="text-sm text-ink font-medium leading-snug">{t.title}</div>
                          {t.body && (
                            <div className="text-[12px] text-ink-4 mt-0.5 line-clamp-1">{t.body}</div>
                          )}
                          <div className="flex items-center gap-3 mt-1 text-[11px] text-ink-4">
                            {t.client && (
                              <Link
                                href={`/admin/clients/${t.client.slug}`}
                                onClick={e => e.stopPropagation()}
                                className="text-ink-3 hover:text-brand-dark font-medium"
                              >
                                {t.client.name}
                              </Link>
                            )}
                            {t.assignee_type && (
                              <span className="inline-flex items-center gap-0.5">
                                <OwnerIcon className="w-2.5 h-2.5" />
                                {t.assignee_type === 'client' ? 'Client' : 'Us'}
                              </span>
                            )}
                            {t.due_at && (
                              <span className={`inline-flex items-center gap-0.5 ${
                                bucket === 'overdue' ? 'text-red-700' : bucket === 'today' ? 'text-amber-700' : ''
                              }`}>
                                {bucket === 'overdue' ? <AlertTriangle className="w-2.5 h-2.5" /> : <Clock className="w-2.5 h-2.5" />}
                                {formatDueShort(t.due_at)}
                              </span>
                            )}
                            {t.visible_to_client && (
                              <span className="text-blue-600">shown to client</span>
                            )}
                          </div>
                        </button>

                        {/* AI-suggested routing badge for content requests */}
                        {t.client && t.title?.startsWith('Request:') && (
                          <AiRoutingBadge
                            slug={t.client.slug}
                            taskId={t.id}
                            analysis={t.ai_analysis ?? null}
                          />
                        )}
                        {t.client && t.title?.startsWith('Boost request:') && (
                          <Link
                            href={`/admin/clients/${t.client.slug}`}
                            onClick={e => e.stopPropagation()}
                            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex-shrink-0 self-center"
                            title="Boost request — launch in Meta Ads Manager"
                          >
                            <Zap className="w-2.5 h-2.5" />
                            Boost
                          </Link>
                        )}
                        {t.client && (
                          <Link
                            href={`/admin/clients/${t.client.slug}`}
                            className="text-ink-4 hover:text-ink-2 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center"
                            title="Open client"
                          >
                            <ArrowRight className="w-4 h-4" />
                          </Link>
                        )}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {/* Client picker for "New task" (we need to know which client) */}
      {clientPickerOpen && (
        <div
          className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center p-4 overflow-y-auto"
          onClick={e => { if (e.target === e.currentTarget) setClientPickerOpen(false) }}
        >
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full my-12 overflow-hidden">
            <div className="p-4 border-b border-ink-6">
              <h2 className="text-base font-semibold text-ink">Which client?</h2>
              <p className="text-[11px] text-ink-4 mt-0.5">New tasks are scoped to one client.</p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {clients.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => { setClientPickerOpen(false); setCreateFor(c.id) }}
                  className="w-full text-left px-4 py-3 hover:bg-bg-2 border-b border-ink-6 last:border-0 text-sm text-ink flex items-center justify-between"
                >
                  {c.name}
                  <ArrowRight className="w-3.5 h-3.5 text-ink-4" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {createFor && (
        <TaskFormModal
          clientId={createFor}
          onClose={() => setCreateFor(null)}
          onSaved={() => { setCreateFor(null); void load() }}
        />
      )}

      {editTask && (
        <TaskFormModal
          clientId={editTask.client_id}
          task={editTask}
          onClose={() => setEditTask(null)}
          onSaved={() => { setEditTask(null); void load() }}
        />
      )}
    </div>
  )
}

/**
 * Confidence-aware routing badge for a content request. Renders one
 * of four states:
 *   - In plan (emerald)        - high confidence the request fits the plan
 *   - Quote $X (amber)         - has an AI-suggested quote ready
 *   - Needs review (rose)      - AI says escalate
 *   - Quote (gray)             - no AI analysis yet (fallback to manual)
 * All states link to the quote builder so the strategist can take
 * the recommended action in one click.
 */
function AiRoutingBadge({
  slug, taskId, analysis,
}: {
  slug: string
  taskId: string
  analysis: AiAnalysis | null
}) {
  const href = `/admin/clients/${slug}/quotes/new?requestId=${taskId}`

  if (!analysis) {
    return (
      <Link
        href={href}
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex-shrink-0 self-center"
        title="Build a quote for this request"
      >
        <FileText className="w-2.5 h-2.5" />
        Quote
      </Link>
    )
  }

  const confidencePct = Math.round(analysis.confidence * 100)

  if (analysis.recommendedAction === 'in_plan') {
    return (
      <Link
        href={href}
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex-shrink-0 self-center"
        title={`AI: ${analysis.reasoning}`}
      >
        <CheckCircle2 className="w-2.5 h-2.5" />
        In plan · {confidencePct}%
      </Link>
    )
  }

  if (analysis.recommendedAction === 'quote' && analysis.suggestedQuote) {
    const total = analysis.suggestedQuote.lineItems.reduce((s, i) => s + (i.total || 0), 0)
    return (
      <Link
        href={href}
        onClick={e => e.stopPropagation()}
        className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 hover:bg-amber-100 transition-colors flex-shrink-0 self-center"
        title={`AI suggests $${total}: ${analysis.reasoning}`}
      >
        <FileText className="w-2.5 h-2.5" />
        Quote ${total} · {confidencePct}%
      </Link>
    )
  }

  // escalate
  return (
    <Link
      href={href}
      onClick={e => e.stopPropagation()}
      className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors flex-shrink-0 self-center"
      title={`AI escalated: ${analysis.reasoning}`}
    >
      <AlertTriangle className="w-2.5 h-2.5" />
      Review · {confidencePct}%
    </Link>
  )
}
