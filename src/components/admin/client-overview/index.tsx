'use client'

/**
 * New client overview tab -- record-style, not form-style.
 *
 * Layout:
 *   [ Hero header: name + stats + quick actions + risk banner ]
 *   ┌───────────────────────┬──────────────────────┐
 *   │  Activity timeline    │  At a glance         │
 *   │  (unified feed)       │  Contacts            │
 *   │                       │  (sidebar cards)     │
 *   └───────────────────────┴──────────────────────┘
 *   [ Edit details (collapsible — the old form lives here) ]
 *
 * Replaces the old form-y layout. The admin gets instant context
 * (last contact, overdue invoices, contacts to reach) without digging
 * through tabs. Editing still works -- collapse the 'Edit details'
 * section open.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { ChevronDown, ChevronRight } from 'lucide-react'
import type { Client } from '@/types/database'

import HeroHeader from './hero-header'
import ActivityTimeline from './activity-timeline'
import ContactsCard from './contacts-card'
import AtAGlanceCard from './at-a-glance-card'
import LogInteractionModal from './log-interaction-modal'
import { StripeBillingCard } from '@/components/admin/stripe-billing-card'

interface Props {
  client: Client
  // Render prop so the old form/edit UI can be shown below without having
  // to import it here. OverviewTab in page.tsx passes in the existing
  // form + service allotments + brand quick view that admins edit.
  editContent: React.ReactNode
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
}

export default function ClientOverview({ client, editContent }: Props) {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS)
  const [editOpen, setEditOpen] = useState(false)
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  // Bump this to trigger the activity timeline to reload after a new
  // interaction lands. Cheap + reliable vs lifting state into the timeline.
  const [timelineRefresh, setTimelineRefresh] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()
    const [lastContact, invoices, sub, content] = await Promise.all([
      // Most recent interaction
      supabase
        .from('client_interactions')
        .select('occurred_at')
        .eq('client_id', client.id)
        .order('occurred_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Invoices: open + lifetime sum
      supabase
        .from('invoices')
        .select('status, total_cents, amount_paid_cents')
        .eq('client_id', client.id),
      // Active subscription
      supabase
        .from('subscriptions')
        .select('amount_cents, status, current_period_end')
        .eq('client_id', client.id)
        .in('status', ['active', 'trialing', 'past_due', 'paused'])
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      // Open content requests
      supabase
        .from('content_queue')
        .select('id', { count: 'exact', head: true })
        .eq('client_id', client.id)
        .in('status', ['new', 'confirmed', 'drafting', 'in_review']),
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

    setStats({
      daysSinceLastContact: days,
      openInvoiceCount: openInvoices.length,
      openInvoiceAmountCents: openInvoices.reduce((s, i) => s + (i.total_cents - i.amount_paid_cents), 0),
      retainerAmountCents: subRow?.amount_cents ?? null,
      retainerStatus: subRow?.status ?? null,
      nextInvoiceDate: subRow?.current_period_end ?? null,
      lifetimeRevenueCents: lifetime > 0 ? lifetime : null,
      openContentRequests: content.count ?? 0,
    })
  }, [client.id])

  useEffect(() => { load() }, [load])

  return (
    <div className="space-y-5">
      {/* Hero header */}
      <HeroHeader
        client={client}
        daysSinceLastContact={stats.daysSinceLastContact}
        outstandingInvoiceCount={stats.openInvoiceCount}
        outstandingAmountCents={stats.openInvoiceAmountCents}
        activeRetainerAmountCents={stats.retainerAmountCents}
        subscriptionStatus={stats.retainerStatus}
        onCreateInvoice={() => {
          // The Stripe Billing card owns the create-invoice modal; scroll
          // to it + let the admin use the existing flow.
          const card = document.getElementById('stripe-billing-card')
          card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        }}
        onLogMeeting={() => setInteractionModalOpen(true)}
      />

      {/* Main content: 2-column */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-5">
        {/* Left: activity timeline */}
        <div>
          <ActivityTimeline clientId={client.id} key={timelineRefresh} />
        </div>

        {/* Right: stacked cards */}
        <div className="space-y-4">
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

          <div id="stripe-billing-card">
            <StripeBillingCard clientId={client.id} />
          </div>
        </div>
      </div>

      {/* Edit details (collapsed by default). The existing form-based UI
          lives inside here so nothing is lost -- just demoted to below
          the fold for the record-style experience. */}
      <div className="bg-white rounded-2xl border border-ink-6 overflow-hidden">
        <button
          type="button"
          onClick={() => setEditOpen(v => !v)}
          className="w-full flex items-center justify-between p-4 hover:bg-bg-2 transition-colors"
        >
          <div className="flex items-center gap-2 text-left">
            {editOpen ? (
              <ChevronDown className="w-4 h-4 text-ink-4" />
            ) : (
              <ChevronRight className="w-4 h-4 text-ink-4" />
            )}
            <div>
              <div className="text-sm font-semibold text-ink">Edit details</div>
              <div className="text-[11px] text-ink-4">Profile, socials, tier, team members, brand quick view</div>
            </div>
          </div>
        </button>
        {editOpen && (
          <div className="border-t border-ink-6 p-5">
            {editContent}
          </div>
        )}
      </div>

      {/* Log-interaction modal */}
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
