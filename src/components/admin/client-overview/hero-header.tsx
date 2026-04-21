'use client'

/**
 * Client detail page hero — the identity moment.
 *
 * Shows the client with real presence: logo or initials at scale,
 * display-font name, a tight meta row, and prominent quick actions.
 * Health + billing status pills sit under the name as the first thing
 * you scan after the name itself.
 *
 * A risk band drops below the hero when something needs attention
 * (overdue invoices, stale contact). It's intentionally full-width and
 * loud — this is the one spot we want to interrupt the admin.
 */

import { useEffect, useState } from 'react'
import {
  MessageSquare, FileText, MapPin, Globe, Building2, Calendar,
  ExternalLink, AlertTriangle, Clock, ArrowRight,
} from 'lucide-react'
import type { Client, ClientBrand, ClientHealth } from '@/types/database'
import { createClient } from '@/lib/supabase/client'
import InlineEditText from './inline-edit-text'
import HealthBadge from '@/components/admin/health-badge'

interface HeroHeaderProps {
  client: Client
  brand?: ClientBrand | null
  daysSinceLastContact: number | null
  outstandingInvoiceCount: number
  outstandingAmountCents: number
  activeRetainerAmountCents: number | null
  subscriptionStatus: string | null
  onCreateInvoice: () => void
  onLogMeeting: () => void
  onClientUpdate: (changes: Partial<Client>) => Promise<void>
}

const BILLING_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Canceled',
  past_due: 'Past due',
}

const BILLING_STATUS_TONE: Record<string, { dot: string; text: string; bg: string; ring: string }> = {
  active:    { dot: '#16a34a', text: 'text-emerald-700', bg: 'bg-emerald-50', ring: 'ring-emerald-200' },
  paused:    { dot: '#eab308', text: 'text-amber-700',   bg: 'bg-amber-50',   ring: 'ring-amber-200' },
  cancelled: { dot: '#6b7280', text: 'text-ink-4',       bg: 'bg-ink-6',      ring: 'ring-ink-5' },
  past_due:  { dot: '#dc2626', text: 'text-red-700',     bg: 'bg-red-50',     ring: 'ring-red-200' },
}

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(cents / 100)
}

function formatInitials(name: string): string {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase()
}

export default function HeroHeader({
  client,
  brand,
  daysSinceLastContact,
  outstandingInvoiceCount,
  outstandingAmountCents,
  activeRetainerAmountCents,
  subscriptionStatus,
  onCreateInvoice,
  onLogMeeting,
  onClientUpdate,
}: HeroHeaderProps) {
  const status = client.billing_status
  const tone = BILLING_STATUS_TONE[status] ?? BILLING_STATUS_TONE.active

  const [health, setHealth] = useState<ClientHealth | null>(null)
  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('client_health')
        .select('*')
        .eq('client_id', client.id)
        .maybeSingle()
      if (!cancelled) setHealth(data as ClientHealth | null)
    }
    void load()
    return () => { cancelled = true }
  }, [client.id])

  const hasContactRisk = daysSinceLastContact !== null && daysSinceLastContact > 30
  const hasInvoiceRisk = outstandingInvoiceCount > 0
  const hasRisk = hasContactRisk || hasInvoiceRisk

  return (
    <>
      <div className="bg-white rounded-2xl border border-ink-6 overflow-hidden shadow-sm">
        {/* Top gradient accent — subtle sign of "this is a presence, not a card" */}
        <div className="h-1 bg-gradient-to-r from-brand/60 via-brand to-brand-dark" />

        <div className="p-6">
          <div className="flex items-start gap-5">
            {/* Avatar: logo if we have it, else initials. 64px — big enough
                to feel like identity, small enough to not dominate. */}
            <div className="flex-shrink-0">
              {brand?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logo_url}
                  alt={client.name}
                  className="w-16 h-16 rounded-2xl object-cover ring-1 ring-ink-6"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand-tint to-brand-tint/50 text-brand-dark flex items-center justify-center font-semibold text-xl ring-1 ring-brand/10">
                  {formatInitials(client.name)}
                </div>
              )}
            </div>

            {/* Identity column */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Name — display font, real presence */}
                  <h1 className="font-[family-name:var(--font-display)] text-[26px] leading-tight text-ink">
                    <InlineEditText
                      value={client.name}
                      placeholder="Untitled client"
                      allowEmpty={false}
                      onSave={name => onClientUpdate({ name })}
                      inputClassName="text-[26px] font-semibold"
                    />
                  </h1>

                  {/* Status row: health + billing + tier + retainer */}
                  <div className="flex items-center gap-2 flex-wrap mt-2">
                    <HealthBadge health={health} />
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${tone.bg} ${tone.text} text-[12px]`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />
                      {BILLING_STATUS_LABEL[status] ?? status}
                    </span>
                    {client.tier && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 text-[12px]">
                        {client.tier} tier
                      </span>
                    )}
                    {activeRetainerAmountCents !== null && (
                      <span className="text-[12px] text-ink-3">
                        <span className="font-semibold text-ink tabular-nums">{formatMoney(activeRetainerAmountCents)}</span>
                        <span className="text-ink-4">/mo retainer</span>
                      </span>
                    )}
                    {subscriptionStatus && subscriptionStatus !== 'active' && (
                      <span className="text-[11px] text-amber-700">
                        Stripe: {subscriptionStatus.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {/* Meta row — inline-edit fields, calm color */}
                  <div className="flex items-center gap-4 flex-wrap mt-3 text-[12.5px] text-ink-4">
                    <span className="inline-flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 flex-shrink-0" />
                      <InlineEditText
                        value={client.industry}
                        placeholder="Add industry"
                        onSave={industry => onClientUpdate({ industry: industry || null })}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 flex-shrink-0" />
                      <InlineEditText
                        value={client.location}
                        placeholder="Add location"
                        onSave={location => onClientUpdate({ location: location || null })}
                      />
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 flex-shrink-0" />
                      <InlineEditText
                        value={client.website}
                        placeholder="Add website"
                        onSave={website => onClientUpdate({ website: website || null })}
                        formatDisplay={w => w.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      />
                      {client.website && (
                        <a
                          href={client.website.startsWith('http') ? client.website : `https://${client.website}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink-4 hover:text-brand-dark transition-colors"
                          title="Open website"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </span>
                    {client.onboarding_date && (
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Since {new Date(client.onboarding_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                      </span>
                    )}
                  </div>
                </div>

                {/* Quick actions — primary CTAs, not ghost buttons */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={onLogMeeting}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 border border-ink-6 hover:border-ink-4 bg-white hover:bg-bg-2 rounded-lg text-[13px] text-ink-2 font-medium transition-colors shadow-sm"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Log meeting
                  </button>
                  <button
                    onClick={onCreateInvoice}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    New invoice
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk band — sits below the hero when something needs attention */}
      {hasRisk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden shadow-sm">
          <div className="flex items-stretch">
            <div className="flex items-center justify-center px-4 bg-amber-100/60">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
            <div className="flex items-center gap-5 px-4 py-3 flex-wrap flex-1">
              {hasInvoiceRisk && (
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-red-700 font-semibold">
                    {outstandingInvoiceCount} unpaid invoice{outstandingInvoiceCount === 1 ? '' : 's'}
                  </span>
                  <span className="text-ink-3 tabular-nums">· {formatMoney(outstandingAmountCents)} outstanding</span>
                  <button
                    onClick={onCreateInvoice}
                    className="inline-flex items-center gap-1 text-[12px] text-brand-dark hover:underline font-medium"
                  >
                    View billing <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
              {hasContactRisk && (
                <div className="flex items-center gap-2 text-[13px]">
                  <Clock className="w-3.5 h-3.5 text-amber-700" />
                  <span className="text-amber-800 font-medium">
                    No contact in {daysSinceLastContact} days
                  </span>
                  <button
                    onClick={onLogMeeting}
                    className="inline-flex items-center gap-1 text-[12px] text-brand-dark hover:underline font-medium"
                  >
                    Log check-in <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
