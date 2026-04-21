'use client'

/**
 * Cross-client activity feed — the admin home page's "today across all
 * clients" view. Pulls from the same event-sourced tables that
 * ActivityTimeline uses per-client and merges them into a single
 * chronological stream: interactions, invoices, content, subscriptions,
 * task completions.
 *
 * Each row links to the source client. Grouped by day; relative
 * timestamps for recency.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Clock, Phone, MessageSquare, Mail, Calendar, FileText, DollarSign,
  CheckCircle2, XCircle, AlertTriangle, Sparkles, Loader2, ArrowRight,
  StickyNote, CheckSquare, Plus,
} from 'lucide-react'

type EventKind =
  | 'meeting' | 'call' | 'email' | 'note'
  | 'invoice_issued' | 'invoice_paid' | 'invoice_failed'
  | 'subscription_started' | 'subscription_canceled'
  | 'content_published' | 'content_created'
  | 'task_completed' | 'task_created'
  | 'other'

interface FeedEvent {
  id: string
  occurred_at: string
  kind: EventKind
  title: string
  subtitle?: string
  client: { name: string; slug: string } | null
}

const KIND_META: Record<EventKind, { icon: typeof Clock; tone: string }> = {
  meeting:               { icon: Calendar,       tone: 'bg-blue-50 text-blue-700' },
  call:                  { icon: Phone,          tone: 'bg-blue-50 text-blue-700' },
  email:                 { icon: Mail,           tone: 'bg-blue-50 text-blue-700' },
  note:                  { icon: StickyNote,     tone: 'bg-ink-6 text-ink-3' },
  invoice_issued:        { icon: FileText,       tone: 'bg-amber-50 text-amber-700' },
  invoice_paid:          { icon: DollarSign,     tone: 'bg-emerald-50 text-emerald-700' },
  invoice_failed:        { icon: AlertTriangle,  tone: 'bg-red-50 text-red-700' },
  content_published:     { icon: Sparkles,       tone: 'bg-purple-50 text-purple-700' },
  content_created:       { icon: FileText,       tone: 'bg-ink-6 text-ink-3' },
  subscription_started:  { icon: CheckCircle2,   tone: 'bg-emerald-50 text-emerald-700' },
  subscription_canceled: { icon: XCircle,        tone: 'bg-red-50 text-red-700' },
  task_completed:        { icon: CheckSquare,    tone: 'bg-emerald-50 text-emerald-700' },
  task_created:          { icon: Plus,           tone: 'bg-ink-6 text-ink-3' },
  other:                 { icon: Clock,          tone: 'bg-ink-6 text-ink-3' },
}

type Embed<T> = T | T[] | null | undefined
const pickEmbed = <T,>(v: Embed<T>): T | null => Array.isArray(v) ? (v[0] ?? null) : (v ?? null)

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(cents / 100)
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const seconds = diff / 1000
  if (seconds < 60) return 'just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.round(minutes)}m ago`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)}h ago`
  const days = hours / 24
  if (days < 7) return `${Math.round(days)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function dayLabel(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const startOfEvt = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const diffDays = Math.round((startOfToday.getTime() - startOfEvt.getTime()) / 86400000)
  if (diffDays === 0) return 'Today'
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return d.toLocaleDateString('en-US', { weekday: 'long' })
  return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

function groupByDay(events: FeedEvent[]): Array<{ day: string; events: FeedEvent[] }> {
  const map = new Map<string, FeedEvent[]>()
  for (const e of events) {
    const key = dayLabel(e.occurred_at)
    const list = map.get(key) ?? []
    list.push(e)
    map.set(key, list)
  }
  return Array.from(map.entries()).map(([day, events]) => ({ day, events }))
}

export default function CrossClientFeed({ days = 7, limit = 60 }: { days?: number; limit?: number }) {
  const [events, setEvents] = useState<FeedEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'client' | 'billing' | 'content' | 'tasks'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const since = new Date(Date.now() - days * 86400000).toISOString()

    const [interactionsRes, invoicesRes, subsRes, queueRes, tasksRes] = await Promise.all([
      supabase.from('client_interactions')
        .select('id, kind, summary, occurred_at, client:clients(name, slug)')
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(limit),
      supabase.from('invoices')
        .select('id, invoice_number, status, total_cents, issued_at, paid_at, type, client:clients(name, slug)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit),
      supabase.from('subscriptions')
        .select('id, plan_name, amount_cents, status, created_at, canceled_at, client:clients(name, slug)')
        .or(`created_at.gte.${since},canceled_at.gte.${since}`)
        .order('created_at', { ascending: false })
        .limit(40),
      supabase.from('content_queue')
        .select('id, input_text, status, content_format, posted_at, created_at, client:clients(name, slug)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit),
      // Tasks: show completions + recently-created high-priority-looking tasks
      supabase.from('client_tasks')
        .select('id, title, status, created_at, completed_at, client:clients(name, slug)')
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(limit),
    ])

    const merged: FeedEvent[] = []

    for (const row of (interactionsRes.data ?? []) as Array<{ id: string; kind: string; summary: string | null; occurred_at: string; client: Embed<{ name: string; slug: string }> }>) {
      const kindMap: Record<string, EventKind> = { meeting: 'meeting', call: 'call', email: 'email', note: 'note' }
      merged.push({
        id: `int-${row.id}`,
        occurred_at: row.occurred_at,
        kind: kindMap[row.kind] ?? 'other',
        title: row.summary || row.kind,
        client: pickEmbed(row.client),
      })
    }

    for (const row of (invoicesRes.data ?? []) as Array<{ id: string; invoice_number: string; status: string; total_cents: number; issued_at: string | null; paid_at: string | null; type: string; client: Embed<{ name: string; slug: string }> }>) {
      const c = pickEmbed(row.client)
      if (row.issued_at) {
        merged.push({
          id: `inv-issued-${row.id}`,
          occurred_at: row.issued_at,
          kind: 'invoice_issued',
          title: `Invoice ${row.invoice_number} sent`,
          subtitle: `${formatCents(row.total_cents)} · ${row.type === 'subscription' ? 'retainer' : 'one-time'}`,
          client: c,
        })
      }
      if (row.status === 'paid' && row.paid_at) {
        merged.push({
          id: `inv-paid-${row.id}`,
          occurred_at: row.paid_at,
          kind: 'invoice_paid',
          title: `Payment received: ${formatCents(row.total_cents)}`,
          subtitle: `Invoice ${row.invoice_number}`,
          client: c,
        })
      }
      if (row.status === 'failed') {
        merged.push({
          id: `inv-failed-${row.id}`,
          occurred_at: row.issued_at ?? new Date().toISOString(),
          kind: 'invoice_failed',
          title: `Payment failed: ${formatCents(row.total_cents)}`,
          subtitle: `Invoice ${row.invoice_number}`,
          client: c,
        })
      }
    }

    for (const row of (subsRes.data ?? []) as Array<{ id: string; plan_name: string; amount_cents: number; created_at: string; canceled_at: string | null; client: Embed<{ name: string; slug: string }> }>) {
      const c = pickEmbed(row.client)
      if (new Date(row.created_at).getTime() >= Date.parse(since)) {
        merged.push({
          id: `sub-start-${row.id}`,
          occurred_at: row.created_at,
          kind: 'subscription_started',
          title: `${row.plan_name} retainer started`,
          subtitle: `${formatCents(row.amount_cents)}/mo`,
          client: c,
        })
      }
      if (row.canceled_at && new Date(row.canceled_at).getTime() >= Date.parse(since)) {
        merged.push({
          id: `sub-cancel-${row.id}`,
          occurred_at: row.canceled_at,
          kind: 'subscription_canceled',
          title: `${row.plan_name} canceled`,
          client: c,
        })
      }
    }

    for (const row of (queueRes.data ?? []) as Array<{ id: string; input_text: string | null; status: string; content_format: string | null; posted_at: string | null; created_at: string; client: Embed<{ name: string; slug: string }> }>) {
      const c = pickEmbed(row.client)
      if (row.posted_at) {
        merged.push({
          id: `content-posted-${row.id}`,
          occurred_at: row.posted_at,
          kind: 'content_published',
          title: 'Content published',
          subtitle: row.input_text?.slice(0, 100) ?? row.content_format ?? undefined,
          client: c,
        })
      } else if (row.status === 'new' || row.status === 'confirmed') {
        merged.push({
          id: `content-new-${row.id}`,
          occurred_at: row.created_at,
          kind: 'content_created',
          title: 'New content request',
          subtitle: row.input_text?.slice(0, 100) ?? row.content_format ?? undefined,
          client: c,
        })
      }
    }

    for (const row of (tasksRes.data ?? []) as Array<{ id: string; title: string; status: string; created_at: string; completed_at: string | null; client: Embed<{ name: string; slug: string }> }>) {
      const c = pickEmbed(row.client)
      if (row.status === 'done' && row.completed_at) {
        merged.push({
          id: `task-done-${row.id}`,
          occurred_at: row.completed_at,
          kind: 'task_completed',
          title: `Task done: ${row.title}`,
          client: c,
        })
      } else if (row.status === 'todo' || row.status === 'doing') {
        merged.push({
          id: `task-new-${row.id}`,
          occurred_at: row.created_at,
          kind: 'task_created',
          title: `New task: ${row.title}`,
          client: c,
        })
      }
    }

    merged.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    setEvents(merged)
    setLoading(false)
  }, [days, limit])

  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'client')  return events.filter(e => ['meeting', 'call', 'email', 'note'].includes(e.kind))
    if (filter === 'billing') return events.filter(e => e.kind.startsWith('invoice') || e.kind.startsWith('subscription'))
    if (filter === 'content') return events.filter(e => e.kind.startsWith('content'))
    if (filter === 'tasks')   return events.filter(e => e.kind.startsWith('task'))
    return events
  }, [events, filter])

  const groups = useMemo(() => groupByDay(filtered), [filtered])

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Activity across clients</h2>
        <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[11px]">
          {(['all', 'client', 'billing', 'content', 'tasks'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2.5 py-1 font-medium rounded-md capitalize transition-colors ${
                filter === f ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'
              }`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="w-4 h-4 animate-spin text-ink-4" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-ink-4 text-sm">
          Nothing in the last {days} days.
        </div>
      ) : (
        <div className="p-5 space-y-6 max-h-[640px] overflow-y-auto">
          {groups.map(group => (
            <div key={group.day}>
              <div className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-3">
                {group.day}
              </div>
              <div className="space-y-2">
                {group.events.map(e => {
                  const meta = KIND_META[e.kind]
                  const Icon = meta.icon
                  return (
                    <Link
                      key={e.id}
                      href={e.client ? `/admin/clients/${e.client.slug}` : '/admin'}
                      className="group flex items-start gap-3 -mx-2 px-2 py-1.5 rounded-lg hover:bg-bg-2 transition-colors"
                    >
                      <div className={`w-7 h-7 rounded-full ${meta.tone} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[13px] text-ink leading-snug">
                            {e.client && (
                              <span className="font-medium">{e.client.name}</span>
                            )}
                            {e.client && <span className="text-ink-4"> · </span>}
                            <span className="text-ink-2">{e.title}</span>
                          </p>
                          <span className="text-[10px] text-ink-4 flex-shrink-0" title={new Date(e.occurred_at).toLocaleString()}>
                            {formatRelative(e.occurred_at)}
                          </span>
                        </div>
                        {e.subtitle && (
                          <p className="text-[11.5px] text-ink-4 mt-0.5 line-clamp-1">{e.subtitle}</p>
                        )}
                      </div>
                      <ArrowRight className="w-3 h-3 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 self-center" />
                    </Link>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
