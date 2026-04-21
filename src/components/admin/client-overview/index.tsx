'use client'

/**
 * Client overview — the record-style detail layout.
 *
 * Visual hierarchy (top to bottom):
 *   1. Hero — identity + quick actions + status
 *   2. Risk band (only if something needs attention)
 *   3. KPI strip — 5 numbers that summarize state
 *   4. Primary row — activity timeline (2fr) + tasks (1fr)
 *   5. Secondary row — at a glance · contacts · socials (3 equal cols)
 *   6. Notes (full-width compact card)
 *   7. Billing (full-width Stripe card)
 *   8. Plan & access (collapsed by default)
 *
 * Every card above uses the same card treatment (white, rounded-xl,
 * ink-6 border, subtle shadow) so the hierarchy comes from size +
 * position, not visual noise.
 */

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Client, ClientBrand } from '@/types/database'

import HeroHeader from './hero-header'
import KPIStrip from './kpi-strip'
import ActivityTimeline from './activity-timeline'
import ContactsCard from './contacts-card'
import AtAGlanceCard from './at-a-glance-card'
import NotesCard from './notes-card'
import SocialsCard from './socials-card'
import TasksCard from './tasks-card'
import LogInteractionModal from './log-interaction-modal'
import { StripeBillingCard } from '@/components/admin/stripe-billing-card'

interface Props {
  client: Client
  brand?: ClientBrand | null
  editContent: React.ReactNode
  onClientUpdate: (changes: Partial<Client>) => Promise<void>
}

interface OverviewStats {
  daysSinceLastContact: number | null
  openInvoiceCount: number
  openInvoiceAmountCents: number
  retainerAmountCents: number | null
  retainerStatus: string | null
  nextInvoiceDate: string | null
  lifetimeRevenueCents: number | null
  openContentRequests: number
  openTaskCount: number
  overdueTaskCount: number
}

const EMPTY_STATS: OverviewStats = {
  daysSinceLastContact: null,
  openInvoiceCount: 0,
  openInvoiceAmountCents: 0,
  retainerAmountCents: null,
  retainerStatus: null,
  nextInvoiceDate: null,
  lifetimeRevenueCents: null,
  openContentRequests: 0,
  openTaskCount: 0,
  overdueTaskCount: 0,
}

export default function ClientOverview({ client, brand, editContent, onClientUpdate }: Props) {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS)
  const [editOpen, setEditOpen] = useState(false)
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [timelineRefresh, setTimelineRefresh] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const endOfToday = new Date()
    endOfToday.setHours(23, 59, 59, 999)

    const [lastContact, invoices, sub, content, tasks] = await Promise.all([
      supabase
        .from('client_interactions')
        .select('occurred_at')
        .eq('client_id', client.id)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('invoices')
        .select('status, total_cents, amount_paid_cents')
        .eq('client_id', client.id),
      supabase
        .from('subscriptions')
        .select('amount_cents, status, current_period_end')
        .eq('client_id', client.id)
        .in('status', ['active', 'trialing', 'past_due', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from('content_queue')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .in('status', ['new', 'confirmed', 'drafting', 'in_review']),
      supabase
        .from('client_tasks')
        .select('id, due_at, status')
        .eq('client_id', client.id)
        .in('status', ['todo', 'doing']),
    ])

    const lastContactRow = lastContact.data as { occurred_at: string } | null
    const days = lastContactRow
      ? Math.round((Date.now() - new Date(lastContactRow.occurred_at).getTime()) / 86400000)
      : null

    const invRows = (invoices.data ?? []) as Array<{ status: string; total_cents: number; amount_paid_cents: number }>
    const openInvoices = invRows.filter(i => ['open', 'failed', 'draft'].includes(i.status))
    const lifetime = invRows
      .filter(i => i.status === 'paid')
      .reduce((s, i) => s + (i.amount_paid_cents ?? 0), 0)

    const subRow = sub.data as { amount_cents: number; status: string; current_period_end: string | null } | null

    const taskRows = (tasks.data ?? []) as Array<{ id: string; due_at: string | null; status: string }>
    const nowMs = Date.now()
    const overdueTaskCount = taskRows.filter(t => t.due_at && new Date(t.due_at).getTime() < nowMs).length

    setStats({
      daysSinceLastContact: days,
      openInvoiceCount: openInvoices.length,
      openInvoiceAmountCents: openInvoices.reduce((s, i) => s + (i.total_cents - i.amount_paid_cents), 0),
      retainerAmountCents: subRow?.amount_cents ?? null,
      retainerStatus: subRow?.status ?? null,
      nextInvoiceDate: subRow?.current_period_end ?? null,
      lifetimeRevenueCents: lifetime > 0 ? lifetime : null,
      openContentRequests: content.count ?? 0,
      openTaskCount: taskRows.length,
      overdueTaskCount,
    })
  }, [client.id])

  useEffect(() => { load() }, [load])

  // Days as a client (for KPI strip)
  const daysSinceOnboarding = client.onboarding_date
    ? Math.max(0, Math.round((Date.now() - new Date(client.onboarding_date).getTime()) / 86400000))
    : null

  return (
    <div className="space-y-4">
      {/* 1-2: Hero + risk band */}
      <HeroHeader
        client={client}
        brand={brand}
        daysSinceLastContact={stats.daysSinceLastContact}
        outstandingInvoiceCount={stats.openInvoiceCount}
        outstandingAmountCents={stats.openInvoiceAmountCents}
        activeRetainerAmountCents={stats.retainerAmountCents}
        subscriptionStatus={stats.retainerStatus}
        onCreateInvoice={() => {
          const card = document.getElementById('stripe-billing-card')
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
        onLogMeeting={() => setInteractionModalOpen(true)}
        onClientUpdate={onClientUpdate}
      />

      {/* 3: KPI strip */}
      <KPIStrip
        retainerAmountCents={stats.retainerAmountCents}
        lifetimeRevenueCents={stats.lifetimeRevenueCents}
        daysSinceOnboarding={daysSinceOnboarding}
        openTaskCount={stats.openTaskCount}
        overdueTaskCount={stats.overdueTaskCount}
        daysSinceLastContact={stats.daysSinceLastContact}
      />

      {/* 4: Primary row — activity + tasks, true 2:1 split */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
        <ActivityTimeline clientId={client.id} key={timelineRefresh} />
        <TasksCard clientId={client.id} />
      </div>

      {/* 5: Secondary row — at a glance · contacts · socials */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <AtAGlanceCard
          retainerAmountCents={stats.retainerAmountCents}
          retainerStatus={stats.retainerStatus}
          nextInvoiceDate={stats.nextInvoiceDate}
          lifetimeRevenueCents={stats.lifetimeRevenueCents}
          openInvoiceCount={stats.openInvoiceCount}
          openInvoiceAmountCents={stats.openInvoiceAmountCents}
          daysSinceLastContact={stats.daysSinceLastContact}
          servicesActive={client.services_active}
          openContentRequests={stats.openContentRequests}
        />
        <ContactsCard clientId={client.id} />
        <SocialsCard
          socials={client.socials as Record<string, string | undefined> | null}
          onSave={socials => onClientUpdate({ socials: socials as Client['socials'] })}
        />
      </div>

      {/* 6: Notes — full-width compact */}
      <NotesCard
        value={client.notes}
        onSave={notes => onClientUpdate({ notes })}
      />

      {/* 7: Billing — full-width Stripe */}
      <div id="stripe-billing-card">
        <StripeBillingCard clientId={client.id} />
      </div>

      {/* 8: Plan & access — collapsed. Contains services toggle, users
          table, tier/rate/status plan, allotments. Low-frequency edits. */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden shadow-sm">
        <button
          type="button"
          onClick={() => setEditOpen(v => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-bg-2 transition-colors"
        >
          <div className="flex items-center gap-2.5 text-left">
            {editOpen
              ? <ChevronDown className="w-4 h-4 text-ink-4" />
              : <ChevronRight className="w-4 h-4 text-ink-4" />}
            <div>
              <div className="text-sm font-semibold text-ink">Plan &amp; access</div>
              <div className="text-[11px] text-ink-4">Services, tier, monthly rate, client users, allotments</div>
            </div>
          </div>
        </button>
        {editOpen && (
          <div className="border-t border-ink-6 p-5">
            {editContent}
          </div>
        )}
      </div>

      {interactionModalOpen && (
        <LogInteractionModal
          clientId={client.id}
          onClose={() => setInteractionModalOpen(false)}
          onSaved={() => {
            setTimelineRefresh(n => n + 1)
            load()
          }}
        />
      )}
    </div>
  )
}
