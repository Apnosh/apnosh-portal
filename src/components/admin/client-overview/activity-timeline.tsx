'use client'

/**
 * Unified activity timeline for a client.
 *
 * Pulls from four tables and merges into a single chronological feed:
 *   - client_interactions (meetings, calls, notes)
 *   - invoices (created, paid, failed)
 *   - subscriptions (status changes)
 *   - content_queue (new items, published items)
 *
 * Read-only for now. Quick 'Log meeting' / 'Add note' actions can come
 * later -- they'd write into client_interactions directly.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import {
  Clock, Phone, MessageSquare, Mail, Calendar, FileText, DollarSign,
  CheckCircle2, XCircle, AlertTriangle, Sparkles, Loader2, ArrowRight, StickyNote,
} from 'lucide-react'
import { InvoiceDetailModal } from '@/components/admin/invoice-detail-modal'
import InteractionDetailModal from './interaction-detail-modal'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TimelineEvent {
  id: string
  occurred_at: string
  kind: 'meeting' | 'call' | 'email' | 'note' | 'invoice_issued' | 'invoice_paid' | 'invoice_failed' | 'content_published' | 'content_created' | 'subscription_started' | 'subscription_canceled' | 'status_change' | 'other'
  title: string
  subtitle?: string
  meta?: string
  href?: string
  invoiceId?: string
  interactionId?: string
}

// ---------------------------------------------------------------------------
// Icon / color per kind
// ---------------------------------------------------------------------------

const KIND_META: Record<TimelineEvent['kind'], { icon: typeof Clock; tone: string }> = {
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
  status_change:         { icon: ArrowRight,     tone: 'bg-ink-6 text-ink-3' },
  other:                 { icon: Clock,          tone: 'bg-ink-6 text-ink-3' },
}

function formatCents(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(cents / 100)
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
  if (days < 30) return `${Math.round(days / 7)}w ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function groupByDay(events: TimelineEvent[]): Array<{ day: string; events: TimelineEvent[] }> {
  const map = new Map<string, TimelineEvent[]>()
  for (const e of events) {
    const day = new Date(e.occurred_at).toLocaleDateString('en-US', {
      month: 'long', day: 'numeric', year: 'numeric',
    })
    const list = map.get(day) ?? []
    list.push(e)
    map.set(day, list)
  }
  return Array.from(map.entries()).map(([day, events]) => ({ day, events }))
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ActivityTimeline({ clientId }: { clientId: string }) {
  const [events, setEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'client' | 'billing' | 'content'>('all')
  const [openInvoiceId, setOpenInvoiceId] = useState<string | null>(null)
  const [openInteractionId, setOpenInteractionId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()

    // Pull from four sources in parallel. Bounds: last 90 days or last 50
    // events, whichever is shorter per source.
    const since = new Date(Date.now() - 90 * 86400000).toISOString()

    const [interactionsRes, invoicesRes, subsRes, queueRes] = await Promise.all([
      supabase
        .from('client_interactions')
        .select('id, kind, summary, body, outcome, performed_by_name, occurred_at, metadata')
        .eq('client_id', clientId)
        .gte('occurred_at', since)
        .order('occurred_at', { ascending: false })
        .limit(50),
      supabase
        .from('invoices')
        .select('id, invoice_number, status, total_cents, issued_at, paid_at, voided_at, type')
        .eq('client_id', clientId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('subscriptions')
        .select('id, plan_name, amount_cents, status, created_at, canceled_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('content_queue')
        .select('id, input_text, status, content_format, scheduled_for, posted_at, created_at')
        .eq('client_id', clientId)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(50),
    ])

    const merged: TimelineEvent[] = []

    // --- Interactions (meetings, calls, notes) ---
    for (const row of (interactionsRes.data ?? []) as Array<{
      id: string; kind: string; summary?: string; body?: string;
      outcome?: string; performed_by_name?: string;
      occurred_at: string; metadata?: Record<string, unknown>
    }>) {
      const kindMap: Record<string, TimelineEvent['kind']> = {
        meeting: 'meeting', call: 'call', email: 'email', note: 'note',
      }
      const kind = kindMap[row.kind] ?? 'other'
      merged.push({
        id: `int-${row.id}`,
        occurred_at: row.occurred_at,
        kind,
        title: row.summary || row.kind,
        subtitle: row.body?.split('\n')[0]?.slice(0, 140),
        meta: row.performed_by_name ? `by ${row.performed_by_name}` : undefined,
        interactionId: row.id,
      })
    }

    // --- Invoices ---
    for (const row of (invoicesRes.data ?? []) as Array<{
      id: string; invoice_number: string; status: string; total_cents: number;
      issued_at: string | null; paid_at: string | null; voided_at: string | null;
      type: string
    }>) {
      // Issued event
      if (row.issued_at) {
        merged.push({
          id: `inv-issued-${row.id}`,
          occurred_at: row.issued_at,
          kind: 'invoice_issued',
          title: `Invoice ${row.invoice_number} sent`,
          subtitle: `${formatCents(row.total_cents)} · ${row.type === 'subscription' ? 'retainer' : 'one-time'}`,
          invoiceId: row.id,
        })
      }
      // Paid event
      if (row.status === 'paid' && row.paid_at) {
        merged.push({
          id: `inv-paid-${row.id}`,
          occurred_at: row.paid_at,
          kind: 'invoice_paid',
          title: `Payment received: ${formatCents(row.total_cents)}`,
          subtitle: `Invoice ${row.invoice_number}`,
          invoiceId: row.id,
        })
      }
      // Failed event
      if (row.status === 'failed') {
        merged.push({
          id: `inv-failed-${row.id}`,
          occurred_at: row.issued_at ?? row.voided_at ?? new Date().toISOString(),
          kind: 'invoice_failed',
          title: `Payment failed: ${formatCents(row.total_cents)}`,
          subtitle: `Invoice ${row.invoice_number}`,
          invoiceId: row.id,
        })
      }
    }

    // --- Subscription lifecycle ---
    for (const row of (subsRes.data ?? []) as Array<{
      id: string; plan_name: string; amount_cents: number; status: string;
      created_at: string; canceled_at: string | null
    }>) {
      merged.push({
        id: `sub-start-${row.id}`,
        occurred_at: row.created_at,
        kind: 'subscription_started',
        title: `${row.plan_name} retainer started`,
        subtitle: `${formatCents(row.amount_cents)}/mo`,
      })
      if (row.canceled_at) {
        merged.push({
          id: `sub-cancel-${row.id}`,
          occurred_at: row.canceled_at,
          kind: 'subscription_canceled',
          title: 'Retainer canceled',
          subtitle: row.plan_name,
        })
      }
    }

    // --- Content (published + created) ---
    for (const row of (queueRes.data ?? []) as Array<{
      id: string; input_text: string | null; status: string;
      content_format: string | null; scheduled_for: string | null;
      posted_at: string | null; created_at: string
    }>) {
      if (row.posted_at) {
        merged.push({
          id: `content-posted-${row.id}`,
          occurred_at: row.posted_at,
          kind: 'content_published',
          title: 'Content published',
          subtitle: row.input_text?.slice(0, 120) ?? row.content_format ?? undefined,
        })
      } else if (row.status === 'new' || row.status === 'confirmed') {
        // Only show creation events that haven't posted yet -- otherwise
        // the published event supersedes.
        merged.push({
          id: `content-new-${row.id}`,
          occurred_at: row.created_at,
          kind: 'content_created',
          title: 'New content request',
          subtitle: row.input_text?.slice(0, 120) ?? row.content_format ?? undefined,
        })
      }
    }

    // Sort everything by occurred_at descending
    merged.sort((a, b) => new Date(b.occurred_at).getTime() - new Date(a.occurred_at).getTime())
    setEvents(merged)
    setLoading(false)
  }, [clientId])

  useEffect(() => { load() }, [load])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    if (filter === 'client') return events.filter(e => ['meeting', 'call', 'email', 'note'].includes(e.kind))
    if (filter === 'billing') return events.filter(e => e.kind.startsWith('invoice') || e.kind.startsWith('subscription'))
    if (filter === 'content') return events.filter(e => e.kind.startsWith('content'))
    return events
  }, [events, filter])

  const groups = useMemo(() => groupByDay(filtered), [filtered])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-ink-4">
        <Loader2 className="w-4 h-4 animate-spin" />
      </div>
    )
  }

  return (
    <div className="bg-white rounded-2xl border border-ink-6">
      {/* Header + filter tabs */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-ink-6">
        <h2 className="text-sm font-semibold text-ink">Activity</h2>
        <div className="inline-flex bg-bg-2 rounded-lg p-0.5 text-[11px]">
          {(['all', 'client', 'billing', 'content'] as const).map(f => (
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

      {/* Timeline */}
      {filtered.length === 0 ? (
        <div className="py-12 text-center text-ink-4 text-sm">
          No activity in the last 90 days.
        </div>
      ) : (
        <div className="p-5 space-y-6">
          {groups.slice(0, 20).map(group => (
            <div key={group.day}>
              <div className="text-[11px] font-semibold text-ink-4 uppercase tracking-wide mb-3">
                {group.day}
              </div>
              <div className="space-y-3">
                {group.events.map(event => {
                  const meta = KIND_META[event.kind]
                  const Icon = meta.icon
                  const clickable = !!event.invoiceId || !!event.interactionId
                  const inner = (
                    <>
                      <div className={`w-7 h-7 rounded-full ${meta.tone} flex items-center justify-center flex-shrink-0 mt-0.5`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-2">
                          <p className="text-[13px] font-medium text-ink">{event.title}</p>
                          <span className="text-[10px] text-ink-4 flex-shrink-0" title={new Date(event.occurred_at).toLocaleString()}>
                            {formatRelative(event.occurred_at)}
                          </span>
                        </div>
                        {event.subtitle && (
                          <p className="text-[12px] text-ink-3 mt-0.5 line-clamp-2">{event.subtitle}</p>
                        )}
                        {event.meta && (
                          <p className="text-[11px] text-ink-4 mt-0.5">{event.meta}</p>
                        )}
                      </div>
                    </>
                  )
                  if (clickable) {
                    return (
                      <button
                        key={event.id}
                        type="button"
                        onClick={() => {
                          if (event.invoiceId) setOpenInvoiceId(event.invoiceId)
                          else if (event.interactionId) setOpenInteractionId(event.interactionId)
                        }}
                        className="w-full flex items-start gap-3 text-left -mx-2 px-2 py-1 rounded-lg hover:bg-bg-2 transition-colors"
                      >
                        {inner}
                      </button>
                    )
                  }
                  return (
                    <div key={event.id} className="flex items-start gap-3">
                      {inner}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}

      {openInvoiceId && (
        <InvoiceDetailModal
          invoiceId={openInvoiceId}
          onClose={() => setOpenInvoiceId(null)}
          onChange={() => { void load() }}
        />
      )}

      {openInteractionId && (
        <InteractionDetailModal
          interactionId={openInteractionId}
          onClose={() => setOpenInteractionId(null)}
          onChange={() => { void load() }}
        />
      )}
    </div>
  )
}
