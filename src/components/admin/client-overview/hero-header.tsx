'use client'

/**
 * Client detail page hero header.
 *
 * Replaces the form-y 'profile' layout at the top of the overview tab
 * with a real record-style header. Shows at a glance: name, tier,
 * billing status, monthly rate, days-since-last-contact, with quick
 * actions for the most common admin tasks (send invoice, log meeting,
 * message client).
 *
 * Informational only -- edits happen inline or via the detail form
 * below. This is the "at a glance" top of the page.
 */

import Link from 'next/link'
import {
  Building2, MessageSquare, Plus, FileText, Phone, Mail,
  ExternalLink, MapPin, Globe, Calendar, Clock, AlertTriangle,
} from 'lucide-react'
import type { Client } from '@/types/database'
import InlineEditText from './inline-edit-text'

interface HeroHeaderProps {
  client: Client
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

const BILLING_STATUS_TONE: Record<string, { dot: string; text: string; bg: string }> = {
  active:    { dot: '#4abd98', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  paused:    { dot: '#eab308', text: 'text-amber-700',   bg: 'bg-amber-50' },
  cancelled: { dot: '#6b7280', text: 'text-ink-4',       bg: 'bg-ink-6' },
  past_due:  { dot: '#dc2626', text: 'text-red-700',     bg: 'bg-red-50' },
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

  // Risk: no contact in 30+ days OR any overdue invoice
  const hasRisk = (daysSinceLastContact !== null && daysSinceLastContact > 30)
    || outstandingInvoiceCount > 0

  return (
    <div className="bg-white rounded-2xl border border-ink-6 p-5 mb-5">
      <div className="flex items-start gap-4">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-xl bg-brand-tint text-brand-dark flex items-center justify-center font-semibold text-lg flex-shrink-0">
          {formatInitials(client.name)}
        </div>

        {/* Identity + stats */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-ink">
                <InlineEditText
                  value={client.name}
                  placeholder="Untitled client"
                  allowEmpty={false}
                  onSave={name => onClientUpdate({ name })}
                  inputClassName="text-xl font-semibold"
                />
              </h1>
              <div className="flex items-center gap-2 flex-wrap mt-1 text-[12px]">
                <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${tone.bg} ${tone.text}`}>
                  <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />
                  {BILLING_STATUS_LABEL[status] ?? status}
                </span>
                {client.tier && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700">
                    {client.tier}
                  </span>
                )}
                {activeRetainerAmountCents !== null && (
                  <span className="text-ink-3">
                    <span className="font-semibold text-ink tabular-nums">{formatMoney(activeRetainerAmountCents)}</span>/mo retainer
                  </span>
                )}
                {client.monthly_rate != null && activeRetainerAmountCents === null && (
                  <span className="text-ink-3">
                    ${client.monthly_rate.toLocaleString()}/mo <span className="text-ink-4">(not yet in Stripe)</span>
                  </span>
                )}
                {subscriptionStatus && subscriptionStatus !== 'active' && (
                  <span className="text-[11px] text-amber-700">Stripe: {subscriptionStatus}</span>
                )}
              </div>

              {/* Meta row -- every field is click-to-edit */}
              <div className="flex items-center gap-3 flex-wrap mt-2 text-[12px] text-ink-4">
                <span className="inline-flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  <InlineEditText
                    value={client.location}
                    placeholder="Add location"
                    onSave={location => onClientUpdate({ location: location || null })}
                  />
                </span>
                <span className="inline-flex items-center gap-1">
                  <Globe className="w-3 h-3 flex-shrink-0" />
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
                      className="text-ink-4 hover:text-brand-dark"
                      title="Open website"
                    >
                      <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </span>
                <span className="inline-flex items-center gap-1">
                  <Building2 className="w-3 h-3 flex-shrink-0" />
                  <InlineEditText
                    value={client.industry}
                    placeholder="Add industry"
                    onSave={industry => onClientUpdate({ industry: industry || null })}
                  />
                </span>
                {client.onboarding_date && (
                  <span className="inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    Client since {new Date(client.onboarding_date).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
                  </span>
                )}
              </div>
            </div>

            {/* Quick actions */}
            <div className="flex items-center gap-1.5 flex-shrink-0">
              <button
                onClick={onCreateInvoice}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink-6 hover:border-brand/40 hover:bg-brand-tint/30 rounded-lg text-[13px] text-ink-2 font-medium"
              >
                <FileText className="w-3.5 h-3.5" />
                New invoice
              </button>
              <button
                onClick={onLogMeeting}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-ink-6 hover:border-brand/40 hover:bg-brand-tint/30 rounded-lg text-[13px] text-ink-2 font-medium"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                Log meeting
              </button>
            </div>
          </div>

          {/* Risk / alerts bar */}
          {hasRisk && (
            <div className="mt-3 pt-3 border-t border-ink-6 flex items-center gap-2 flex-wrap text-[12px]">
              {outstandingInvoiceCount > 0 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-red-50 text-red-700 font-medium">
                  <AlertTriangle className="w-3 h-3" />
                  {outstandingInvoiceCount} unpaid invoice{outstandingInvoiceCount === 1 ? '' : 's'} — {formatMoney(outstandingAmountCents)}
                </span>
              )}
              {daysSinceLastContact !== null && daysSinceLastContact > 30 && (
                <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-amber-50 text-amber-700 font-medium">
                  <Clock className="w-3 h-3" />
                  No contact in {daysSinceLastContact} days
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
