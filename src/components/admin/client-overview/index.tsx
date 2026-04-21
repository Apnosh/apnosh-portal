'use client'

/**
 * Client overview — the record-style detail layout.
 *
 * Visual hierarchy is established through chapter-style section
 * headings and intentional spacing: more breathing room around the
 * hero and the billing section, tighter within a row of related
 * cards. Every card uses the same treatment so structure comes from
 * typography + position, not visual noise.
 *
 * Sections (top → bottom):
 *   Hero + risk band   (the client)
 *   AT A GLANCE        (KPI strip)
 *   ACTIVITY & WORK    (timeline + tasks)
 *   DETAILS            (at-a-glance · contacts · socials)
 *   NOTES              (admin-only)
 *   BILLING            (Stripe)
 *   Plan & access      (collapsed)
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

/**
 * Small section label used between major rows of the overview to
 * establish a "chapter" rhythm. Deliberately quiet — it's not a
 * heading you read, it's a visual palette cleanser that separates
 * groups of cards.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1">
      <span className="text-[10px] font-semibold text-ink-4 uppercase tracking-[0.14em]">
        {children}
      </span>
      <span className="flex-1 h-px bg-ink-6" />
    </div>
  )
}

export default function ClientOverview({ client, brand, editContent, onClientUpdate }: Props) {
  const [stats, setStats] = useState<OverviewStats>(EMPTY_STATS)
  const [editOpen, setEditOpen] = useState(false)
  const [interactionModalOpen, setInteractionModalOpen] = useState(false)
  const [timelineRefresh, setTimelineRefresh] = useState(0)

  const load = useCallback(async () => {
    const supabase = createClient()

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

  const daysSinceOnboarding = client.onboarding_date
    ? Math.max(0, Math.round((Date.now() - new Date(client.onboarding_date).getTime()) / 86400000))
    : null

  return (
    <div className="space-y-6">
      {/* Hero + risk band */}
      <div className="space-y-3">
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
      </div>

      {/* KPI strip */}
      <div className="space-y-2.5">
        <SectionLabel>At a glance</SectionLabel>
        <KPIStrip
          retainerAmountCents={stats.retainerAmountCents}
          fallbackMonthlyRateDollars={client.monthly_rate}
          lifetimeRevenueCents={stats.lifetimeRevenueCents}
          daysSinceOnboarding={daysSinceOnboarding}
          openTaskCount={stats.openTaskCount}
          overdueTaskCount={stats.overdueTaskCount}
          daysSinceLastContact={stats.daysSinceLastContact}
        />
      </div>

      {/* Primary row: activity + tasks */}
      <div className="space-y-2.5">
        <SectionLabel>Activity &amp; work</SectionLabel>
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <ActivityTimeline clientId={client.id} key={timelineRefresh} />
          <TasksCard clientId={client.id} />
        </div>
      </div>

      {/* Secondary row: details */}
      <div className="space-y-2.5">
        <SectionLabel>Details</SectionLabel>
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
      </div>

      {/* Notes */}
      <div className="space-y-2.5">
        <SectionLabel>Notes</SectionLabel>
        <NotesCard
          value={client.notes}
          onSave={notes => onClientUpdate({ notes })}
        />
      </div>

      {/* Billing */}
      <div className="space-y-2.5">
        <SectionLabel>Billing</SectionLabel>
        <div id="stripe-billing-card">
          <StripeBillingCard clientId={client.id} />
        </div>
      </div>

      {/* Plan & access — collapsed by default, low-frequency edits */}
      <div className="bg-white rounded-xl border border-ink-6 shadow-sm overflow-hidden">
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
