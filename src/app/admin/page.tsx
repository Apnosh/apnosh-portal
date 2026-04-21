'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ScheduledPostsPanel } from '@/components/admin/scheduled-posts-panel'
import CrossClientFeed from '@/components/admin/cross-client-feed'
import HealthBadge from '@/components/admin/health-badge'
import { rollupHealth, type ClientHealth as ClientHealthRow, type OverallHealth } from '@/types/database'
import {
  Users,
  DollarSign,
  Clock,
  FileSignature,
  MessageSquare,
  AlertTriangle,
  ArrowUpRight,
  FileWarning,
  Send,
  CalendarClock,
} from 'lucide-react'

interface SummaryData {
  activeClients: number
  mrr: number
  pendingApprovals: number
  overdueInvoices: number
  unsignedAgreements: number
  unreadMessages: number
}

interface ActionItem {
  icon: typeof AlertTriangle
  label: string
  count: number
  color: string
  href: string
}

function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse bg-ink-6 rounded ${className}`} />
}

function SummaryCardSkeleton() {
  return (
    <div className="bg-white rounded-xl border border-ink-6 p-5">
      <Skeleton className="w-9 h-9 rounded-lg mb-3" />
      <Skeleton className="w-16 h-7 mb-1.5" />
      <Skeleton className="w-24 h-3" />
    </div>
  )
}

function formatCurrency(cents: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(cents)
}

export default function AdminDashboard() {
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [actions, setActions] = useState<ActionItem[]>([])
  const [healthRows, setHealthRows] = useState<ClientHealthRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchData() {
      const supabase = createClient()

      const [
        { count: activeClients },
        { data: activeSubs },
        { count: pendingApprovals },
        { count: overdueInvoices },
        { count: unsignedAgreements },
        { count: unreadMessages },
        { data: overdueDeliverables },
        { data: draftInvoices },
        { data: expiringAgreements },
        { data: healthData },
      ] = await Promise.all([
        // Active clients (from the CRM clients table — businesses is
        // the legacy table from before migration 043)
        supabase
          .from('clients')
          .select('*', { count: 'exact', head: true })
          .eq('billing_status', 'active'),

        // Active subscriptions for MRR (migration 055: amount_cents in cents)
        supabase
          .from('subscriptions')
          .select('amount_cents')
          .in('status', ['active', 'trialing']),

        // Pending approvals (deliverables in client_review)
        supabase
          .from('deliverables')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'client_review'),

        // Overdue invoices (open/failed + past due date) -- v2 columns
        supabase
          .from('invoices')
          .select('*', { count: 'exact', head: true })
          .in('status', ['open', 'failed'])
          .lt('due_at', new Date().toISOString()),

        // Unsigned agreements (status = sent)
        supabase
          .from('agreements')
          .select('*', { count: 'exact', head: true })
          .eq('status', 'sent'),

        // Unread messages (admin-facing: messages from clients without read_at)
        supabase
          .from('messages')
          .select('*', { count: 'exact', head: true })
          .eq('sender_role', 'client')
          .is('read_at', null),

        // Action items: overdue deliverables (in_progress past deadline)
        supabase
          .from('deliverables')
          .select('id', { count: 'exact', head: true })
          .in('status', ['draft', 'internal_review', 'in_progress'])
          .not('updated_at', 'is', null)
          .lt('updated_at', new Date(Date.now() - 7 * 86400000).toISOString()),

        // Action items: draft invoices to send
        supabase
          .from('invoices')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'draft'),

        // Action items: agreements expiring within 7 days
        supabase
          .from('agreements')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'sent')
          .lt('expires_at', new Date(Date.now() + 7 * 86400000).toISOString())
          .gt('expires_at', new Date().toISOString()),

        // Recent activity
        // New signal-level client health view (replaces the old
        // "compute health from businesses + agreements + invoices" logic
        // that used the legacy tables).
        supabase
          .from('client_health')
          .select('*'),
      ])

      // Calculate MRR
      // New schema: subscriptions.amount_cents is integer cents
      const mrr = (activeSubs ?? []).reduce(
        (sum, s) => sum + (Number((s as { amount_cents?: number }).amount_cents) || 0),
        0,
      ) / 100

      setSummary({
        activeClients: activeClients ?? 0,
        mrr,
        pendingApprovals: pendingApprovals ?? 0,
        overdueInvoices: overdueInvoices ?? 0,
        unsignedAgreements: unsignedAgreements ?? 0,
        unreadMessages: unreadMessages ?? 0,
      })

      // Build action items
      const actionItems: ActionItem[] = []
      const staleCount = overdueDeliverables?.length ?? 0
      const draftCount = draftInvoices?.length ?? 0
      const expiringCount = expiringAgreements?.length ?? 0

      if (staleCount > 0) {
        actionItems.push({
          icon: FileWarning,
          label: 'Stale deliverables (no update in 7+ days)',
          count: staleCount,
          color: 'text-red-600',
          href: '/admin/deliverables',
        })
      }
      if (draftCount > 0) {
        actionItems.push({
          icon: Send,
          label: 'Draft invoices to send',
          count: draftCount,
          color: 'text-amber-600',
          href: '/admin/invoices',
        })
      }
      if (expiringCount > 0) {
        actionItems.push({
          icon: CalendarClock,
          label: 'Agreements expiring within 7 days',
          count: expiringCount,
          color: 'text-amber-600',
          href: '/admin/agreements',
        })
      }
      setActions(actionItems)

      // Sort client health by worst-first (at_risk → healthy → unknown)
      if (healthData) {
        const worstFirst: Record<OverallHealth, number> = {
          at_risk: 0, needs_attention: 1, stable: 2, healthy: 3, unknown: 4,
        }
        const sorted = (healthData as ClientHealthRow[]).slice().sort((a, b) =>
          worstFirst[rollupHealth(a)] - worstFirst[rollupHealth(b)]
        )
        setHealthRows(sorted)
      }

      setLoading(false)
    }

    fetchData()
  }, [])

  const summaryCards = summary
    ? [
        { label: 'Active Clients', value: summary.activeClients.toString(), icon: Users, color: 'bg-brand-tint text-brand-dark' },
        { label: 'Monthly Recurring', value: formatCurrency(summary.mrr), icon: DollarSign, color: 'bg-emerald-50 text-emerald-700' },
        { label: 'Pending Approvals', value: summary.pendingApprovals.toString(), icon: Clock, color: 'bg-amber-50 text-amber-700' },
        { label: 'Overdue Invoices', value: summary.overdueInvoices.toString(), icon: AlertTriangle, color: 'bg-red-50 text-red-700' },
        { label: 'Unsigned Agreements', value: summary.unsignedAgreements.toString(), icon: FileSignature, color: 'bg-purple-50 text-purple-700' },
        { label: 'Unread Messages', value: summary.unreadMessages.toString(), icon: MessageSquare, color: 'bg-blue-50 text-blue-700' },
      ]
    : []

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Dashboard</h1>
        <p className="text-ink-3 text-sm mt-1">Your business at a glance.</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {loading
          ? Array.from({ length: 6 }).map((_, i) => <SummaryCardSkeleton key={i} />)
          : summaryCards.map((card) => (
              <div key={card.label} className="bg-white rounded-xl border border-ink-6 p-5">
                <div className={`w-9 h-9 rounded-lg ${card.color} flex items-center justify-center mb-3`}>
                  <card.icon className="w-4 h-4" />
                </div>
                <div className="font-[family-name:var(--font-display)] text-2xl text-ink">{card.value}</div>
                <div className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mt-1">{card.label}</div>
              </div>
            ))}
      </div>

      {/* Scheduled posts panel — what needs to ship and when */}
      <ScheduledPostsPanel />

      {/* Action Items */}
      {!loading && actions.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Needs Attention</h2>
          <div className="space-y-3">
            {actions.map((item, i) => (
              <a
                key={i}
                href={item.href}
                className="flex items-center justify-between py-2 px-3 rounded-lg hover:bg-bg-2 transition-colors group"
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`w-4 h-4 ${item.color}`} />
                  <span className="text-sm text-ink">{item.label}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-sm font-medium ${item.color}`}>{item.count}</span>
                  <ArrowUpRight className="w-3.5 h-3.5 text-ink-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Activity across clients — merged event-sourced feed */}
      <CrossClientFeed />

      <div className="grid lg:grid-cols-2 gap-3">
        {/* Client Health */}
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="flex items-center justify-between p-5 border-b border-ink-6">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Client Health</h2>
            <a href="/admin/clients" className="text-xs text-brand-dark font-medium hover:underline flex items-center gap-1">
              View all <ArrowUpRight className="w-3 h-3" />
            </a>
          </div>
          <div className="divide-y divide-ink-6">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="px-5 py-3.5 flex items-center justify-between">
                    <Skeleton className="w-32 h-4" />
                    <Skeleton className="w-20 h-5 rounded-full" />
                  </div>
                ))
              : healthRows.length === 0
                ? (
                    <div className="px-5 py-8 text-center text-ink-4 text-sm">No clients yet</div>
                  )
                : healthRows.slice(0, 10).map((row) => (
                    <a
                      key={row.client_id}
                      href={`/admin/clients/${row.slug}`}
                      className="px-5 py-3.5 flex items-center justify-between hover:bg-bg-2 transition-colors"
                    >
                      <span className="text-sm text-ink font-medium truncate">{row.name}</span>
                      <HealthBadge health={row} />
                    </a>
                  ))}
          </div>
        </div>
      </div>
    </div>
  )
}
