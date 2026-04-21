'use client'

/**
 * At-a-glance summary card for the client detail sidebar.
 *
 * Surfaces the numbers and dates an admin wants to see within 2 seconds
 * of opening a client:
 *   - Retainer status + next invoice date
 *   - Total revenue lifetime
 *   - Open invoices count + amount
 *   - Days since last contact
 *   - Services active
 *
 * All computed client-side from already-loaded counts passed via props.
 * The idea is the parent (OverviewTab) already queries these in one
 * batch, so this component is just presentation.
 */

import {
  DollarSign, Calendar, AlertTriangle, CheckCircle2, Clock,
  TrendingUp, FileText, Zap,
} from 'lucide-react'

interface AtAGlanceProps {
  // Billing
  retainerAmountCents: number | null
  retainerStatus: string | null
  nextInvoiceDate: string | null
  lifetimeRevenueCents: number | null
  openInvoiceCount: number
  openInvoiceAmountCents: number
  // CRM
  daysSinceLastContact: number | null
  servicesActive: string[] | null
  // Content
  openContentRequests: number
}

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(cents / 100)
}

function formatDate(iso: string | null): string | null {
  if (!iso) return null
  const d = new Date(iso)
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / 86400000
  if (Math.abs(diff) < 1) return 'today'
  if (diff > 0 && diff < 8) return `in ${Math.round(diff)}d`
  if (diff < 0 && diff > -8) return `${Math.abs(Math.round(diff))}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AtAGlanceCard(props: AtAGlanceProps) {
  const {
    retainerAmountCents, retainerStatus, nextInvoiceDate, lifetimeRevenueCents,
    openInvoiceCount, openInvoiceAmountCents,
    daysSinceLastContact, servicesActive, openContentRequests,
  } = props

  const lastContactLabel = daysSinceLastContact === null
    ? 'No contact logged yet'
    : daysSinceLastContact < 1
    ? 'Today'
    : daysSinceLastContact === 1
    ? 'Yesterday'
    : `${daysSinceLastContact} days ago`

  const lastContactTone = daysSinceLastContact === null
    ? 'text-ink-4'
    : daysSinceLastContact > 30
    ? 'text-amber-700'
    : daysSinceLastContact > 60
    ? 'text-red-700'
    : 'text-ink-2'

  return (
    <div className="bg-white rounded-xl border border-ink-6 p-4">
      <h3 className="text-[11px] font-semibold text-ink-3 uppercase tracking-wide mb-3">At a glance</h3>

      <div className="space-y-3">
        {/* Retainer status */}
        <Row
          icon={DollarSign}
          label="Retainer"
          value={
            retainerAmountCents !== null
              ? `${formatMoney(retainerAmountCents)}/mo`
              : 'Not set up'
          }
          tone={retainerStatus === 'active' ? 'good' : retainerStatus === 'past_due' ? 'warn' : retainerStatus === null ? 'neutral' : 'neutral'}
          hint={retainerStatus && retainerStatus !== 'active' ? retainerStatus : null}
        />

        {/* Next invoice */}
        {nextInvoiceDate && (
          <Row
            icon={Calendar}
            label="Next invoice"
            value={formatDate(nextInvoiceDate) ?? '—'}
            tone="neutral"
          />
        )}

        {/* Open invoices */}
        <Row
          icon={FileText}
          label="Unpaid"
          value={
            openInvoiceCount === 0
              ? 'None'
              : `${openInvoiceCount} · ${formatMoney(openInvoiceAmountCents)}`
          }
          tone={openInvoiceCount > 0 ? 'warn' : 'good'}
        />

        {/* Lifetime revenue */}
        {lifetimeRevenueCents !== null && lifetimeRevenueCents > 0 && (
          <Row
            icon={TrendingUp}
            label="Revenue lifetime"
            value={formatMoney(lifetimeRevenueCents)}
            tone="neutral"
          />
        )}

        {/* Last contact */}
        <Row
          icon={Clock}
          label="Last contact"
          value={lastContactLabel}
          customValueClass={lastContactTone}
        />

        {/* Open content requests */}
        {openContentRequests > 0 && (
          <Row
            icon={Zap}
            label="Open content"
            value={`${openContentRequests} pending`}
            tone="warn"
          />
        )}
      </div>

      {/* Services */}
      {servicesActive && servicesActive.length > 0 && (
        <div className="mt-4 pt-3 border-t border-ink-6">
          <div className="text-[10px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5">Services</div>
          <div className="flex flex-wrap gap-1">
            {servicesActive.map(s => (
              <span key={s} className="text-[10px] bg-bg-2 text-ink-3 rounded px-1.5 py-0.5">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function Row({
  icon: Icon, label, value, tone = 'neutral', hint, customValueClass,
}: {
  icon: typeof DollarSign
  label: string
  value: string
  tone?: 'good' | 'warn' | 'neutral'
  hint?: string | null
  customValueClass?: string
}) {
  const toneClass = customValueClass ?? (
    tone === 'good' ? 'text-emerald-700'
    : tone === 'warn' ? 'text-amber-700'
    : 'text-ink-2'
  )
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="flex items-center gap-1.5 text-[11px] text-ink-4">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-right min-w-0">
        <div className={`text-[12px] font-medium tabular-nums ${toneClass}`}>{value}</div>
        {hint && <div className="text-[10px] text-ink-4 capitalize">{hint}</div>}
      </div>
    </div>
  )
}
