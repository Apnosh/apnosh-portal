'use client'

/**
 * Client detail page hero — the identity moment.
 *
 * Big avatar, display-font name, a one-line summary of who they are
 * and how long they've been with us, then the three status pills
 * (health / billing / tier) on their own row. Quick actions on the
 * right show their keyboard shortcuts so power users can skip the
 * mouse entirely.
 *
 * A risk band renders full-width below the hero only when something
 * needs attention.
 */

import { useEffect, useState } from 'react'
import {
  MessageSquare, FileText, MapPin, Globe, Building2, Calendar,
  ExternalLink, AlertTriangle, Clock, ArrowRight,
} from 'lucide-react'
import type { Client, ClientBrand, ClientHealth } from '@/types/database'
import { rollupHealth } from '@/types/database'
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
  /** Viewer role. Strategist does not see admin-only actions
      (e.g. "New invoice"). Defaults to true for backwards-compat
      with any callers that haven't been updated. */
  isAdmin?: boolean
}

const BILLING_STATUS_LABEL: Record<string, string> = {
  active: 'Active',
  paused: 'Paused',
  cancelled: 'Canceled',
  past_due: 'Past due',
}

const BILLING_STATUS_TONE: Record<string, { dot: string; text: string; bg: string }> = {
  active:    { dot: '#16a34a', text: 'text-emerald-700', bg: 'bg-emerald-50' },
  paused:    { dot: '#eab308', text: 'text-amber-700',   bg: 'bg-amber-50' },
  cancelled: { dot: '#6b7280', text: 'text-ink-4',       bg: 'bg-ink-6' },
  past_due:  { dot: '#dc2626', text: 'text-red-700',     bg: 'bg-red-50' },
}

// Ring color for the avatar picks up the overall health, so the
// avatar itself is a status signal.
const HEALTH_RING: Record<string, string> = {
  healthy:         'ring-emerald-200',
  stable:          'ring-ink-6',
  needs_attention: 'ring-amber-200',
  at_risk:         'ring-red-200',
  unknown:         'ring-ink-6',
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
  isAdmin = true,
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

  // Keyboard shortcuts: ⌘L log meeting, ⌘I new invoice
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!(e.metaKey || e.ctrlKey)) return
      if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return
      if (e.key.toLowerCase() === 'l') { e.preventDefault(); onLogMeeting() }
      if (isAdmin && e.key.toLowerCase() === 'i') { e.preventDefault(); onCreateInvoice() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onLogMeeting, onCreateInvoice, isAdmin])

  const overall = health ? rollupHealth(health) : 'unknown'
  const healthRing = HEALTH_RING[overall] ?? HEALTH_RING.unknown

  const hasContactRisk = daysSinceLastContact !== null && daysSinceLastContact > 30
  const hasInvoiceRisk = outstandingInvoiceCount > 0
  const hasRisk = hasContactRisk || hasInvoiceRisk

  return (
    <>
      <div className="bg-white rounded-2xl border border-ink-6 shadow-sm relative">
        {/* Top gradient accent — rounded corners to match parent */}
        <div className="h-1 bg-gradient-to-r from-brand/50 via-brand to-brand-dark rounded-t-2xl" />

        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-5">
            {/* Avatar — 80px with a health-colored ring. The ring is the
                primary at-a-glance signal: healthy green, at-risk red,
                stable gray. Works without reading anything. */}
            <div className="flex-shrink-0 relative">
              {brand?.logo_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logo_url}
                  alt={client.name}
                  className={`w-20 h-20 rounded-2xl object-cover ring-2 ${healthRing} ring-offset-2 ring-offset-white`}
                />
              ) : (
                <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-tint via-brand-tint to-brand-tint/40 text-brand-dark flex items-center justify-center font-semibold text-[24px] ring-2 ${healthRing} ring-offset-2 ring-offset-white`}>
                  {formatInitials(client.name)}
                </div>
              )}
              {/* Live presence dot — white background, tone-colored
                  fill. Only renders if health has data. */}
              {health && overall !== 'unknown' && (
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full bg-white flex items-center justify-center"
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: overall === 'healthy' ? '#16a34a'
                        : overall === 'at_risk' ? '#dc2626'
                        : overall === 'needs_attention' ? '#d97706'
                        : '#6b7280',
                    }}
                  />
                </span>
              )}
            </div>

            {/* Identity column */}
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  {/* Name + an overflow caption line */}
                  <h1 className="font-[family-name:var(--font-display)] text-[28px] leading-tight text-ink tracking-tight">
                    <InlineEditText
                      value={client.name}
                      placeholder="Untitled client"
                      allowEmpty={false}
                      onSave={name => onClientUpdate({ name })}
                      inputClassName="text-[28px] font-semibold"
                    />
                  </h1>

                  {/* Status row */}
                  <div className="flex items-center gap-2 flex-wrap mt-2.5">
                    <HealthBadge health={health} />
                    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full font-medium ${tone.bg} ${tone.text} text-[12px]`}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tone.dot }} />
                      {BILLING_STATUS_LABEL[status] ?? status}
                    </span>
                    {client.tier && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-blue-50 text-blue-700 text-[12px]">
                        {client.tier}
                      </span>
                    )}
                    {activeRetainerAmountCents !== null && (
                      <span className="text-[12px] text-ink-3 inline-flex items-baseline gap-0.5">
                        <span className="font-semibold text-ink tabular-nums">{formatMoney(activeRetainerAmountCents)}</span>
                        <span className="text-ink-4">/mo</span>
                      </span>
                    )}
                    {subscriptionStatus && subscriptionStatus !== 'active' && (
                      <span className="text-[11px] text-amber-700 bg-amber-50 rounded-full px-2 py-0.5">
                        Stripe: {subscriptionStatus.replace('_', ' ')}
                      </span>
                    )}
                  </div>

                  {/* Meta row */}
                  <div className="flex items-center gap-x-5 gap-y-2 flex-wrap mt-3 text-[12.5px] text-ink-4">
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

                {/* Quick actions — primary is "Log meeting" (daily-use
                    verb), secondary is "New invoice". ⌘L / ⌘I keyboard
                    shortcut hints visible so the power-path is obvious. */}
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button
                    onClick={onLogMeeting}
                    className="group inline-flex items-center gap-2 pl-3 pr-2 py-2 bg-brand hover:bg-brand-dark text-white rounded-lg text-[13px] font-medium transition-colors shadow-sm"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    Log meeting
                    <kbd className="hidden md:inline-flex items-center text-[10px] font-medium bg-white/20 rounded px-1.5 py-0.5 ml-0.5">
                      ⌘L
                    </kbd>
                  </button>
                  {/* "New invoice" is admin-only — billing is not the
                      strategist's lane. Strategist gets just "Log meeting"
                      as their secondary action here. */}
                  {isAdmin && (
                    <button
                      onClick={onCreateInvoice}
                      className="group inline-flex items-center gap-2 pl-3 pr-2 py-2 border border-ink-6 hover:border-ink-4 bg-white hover:bg-bg-2 rounded-lg text-[13px] text-ink-2 font-medium transition-colors shadow-sm"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      <span className="hidden sm:inline">New invoice</span>
                      <kbd className="hidden md:inline-flex items-center text-[10px] font-medium bg-bg-2 rounded px-1.5 py-0.5 ml-0.5 text-ink-4">
                        ⌘I
                      </kbd>
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Risk band */}
      {hasRisk && (
        <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden shadow-sm">
          <div className="flex items-stretch">
            <div className="flex items-center justify-center px-4 bg-amber-100/60">
              <AlertTriangle className="w-4 h-4 text-amber-700" />
            </div>
            <div className="flex items-center gap-5 px-4 py-3 flex-wrap flex-1">
              {hasInvoiceRisk && (
                <div className="flex items-center gap-2 text-[13px]">
                  <span className="text-red-700 font-semibold tabular-nums">
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
