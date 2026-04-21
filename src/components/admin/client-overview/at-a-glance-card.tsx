'use client'

/**
 * At-a-glance details for the client overview sidebar.
 *
 * Focused on status details that aren't already in the KPI strip:
 *   - Next invoice date (when it'll land)
 *   - Unpaid invoice summary
 *   - Content pipeline (pending requests)
 *   - Active services (the tags)
 *
 * Keeps tone calm — warn colors only for genuine attention signals.
 */

import {
  Calendar, Clock, FileText, Sparkles, Package,
} from 'lucide-react'

interface AtAGlanceProps {
  retainerAmountCents: number | null
  retainerStatus: string | null
  nextInvoiceDate: string | null
  lifetimeRevenueCents: number | null
  openInvoiceCount: number
  openInvoiceAmountCents: number
  daysSinceLastContact: number | null
  servicesActive: string[] | null
  openContentRequests: number
}

function formatMoney(cents: number | null): string {
  if (cents === null || cents === undefined) return '—'
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', minimumFractionDigits: 0,
  }).format(cents / 100)
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  const now = new Date()
  const diff = (d.getTime() - now.getTime()) / 86400000
  if (Math.abs(diff) < 1) return 'today'
  if (diff > 0 && diff < 8) return `in ${Math.round(diff)} days`
  if (diff < 0 && diff > -8) return `${Math.abs(Math.round(diff))}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AtAGlanceCard({
  retainerStatus, nextInvoiceDate,
  openInvoiceCount, openInvoiceAmountCents,
  servicesActive, openContentRequests,
}: AtAGlanceProps) {
  return (
    <div className="bg-white rounded-xl border border-ink-6 shadow-sm p-5 h-full flex flex-col">
      <div className="mb-4">
        <h3 className="text-[13px] font-semibold text-ink">Account details</h3>
        <p className="text-[11px] text-ink-4 mt-0.5">Subscription, content, services</p>
      </div>

      <div className="space-y-3 flex-1">
        {nextInvoiceDate && (
          <Row
            icon={Calendar}
            label="Next invoice"
            value={formatRelativeDate(nextInvoiceDate)}
            hint={new Date(nextInvoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
          />
        )}

        <Row
          icon={FileText}
          label="Unpaid"
          value={openInvoiceCount === 0 ? 'None' : `${openInvoiceCount} open`}
          hint={openInvoiceCount > 0 ? formatMoney(openInvoiceAmountCents) + ' outstanding' : null}
          tone={openInvoiceCount > 0 ? 'warn' : 'good'}
        />

        {retainerStatus && retainerStatus !== 'active' && (
          <Row
            icon={Clock}
            label="Subscription"
            value={retainerStatus.replace('_', ' ')}
            tone="warn"
          />
        )}

        <Row
          icon={Sparkles}
          label="Content"
          value={openContentRequests === 0 ? 'Nothing pending' : `${openContentRequests} request${openContentRequests === 1 ? '' : 's'}`}
          tone={openContentRequests > 0 ? 'active' : 'neutral'}
        />
      </div>

      {/* Services */}
      {servicesActive && servicesActive.length > 0 && (
        <div className="mt-4 pt-3 border-t border-ink-6">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-ink-4 uppercase tracking-wide mb-1.5">
            <Package className="w-3 h-3" />
            Services
          </div>
          <div className="flex flex-wrap gap-1">
            {servicesActive.map(s => (
              <span key={s} className="text-[10.5px] bg-bg-2 text-ink-2 rounded-md px-1.5 py-0.5 font-medium">
                {s}
              </span>
            ))}
          </div>
        </div>
      )}

      {(!servicesActive || servicesActive.length === 0) && openContentRequests === 0 && !nextInvoiceDate && openInvoiceCount === 0 && (
        <div className="mt-4 pt-3 border-t border-ink-6 text-[11.5px] text-ink-4 italic">
          No details yet. Add services + retainer from Plan &amp; access below.
        </div>
      )}
    </div>
  )
}

function Row({
  icon: Icon, label, value, tone = 'neutral', hint,
}: {
  icon: typeof Calendar
  label: string
  value: string
  tone?: 'good' | 'warn' | 'neutral' | 'active'
  hint?: string | null
}) {
  const valueTone = tone === 'warn' ? 'text-amber-700'
    : tone === 'active' ? 'text-brand-dark'
    : 'text-ink'
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex items-center gap-1.5 text-[11.5px] text-ink-4 flex-shrink-0">
        <Icon className="w-3 h-3" />
        {label}
      </div>
      <div className="text-right min-w-0">
        <div className={`text-[12.5px] font-semibold tabular-nums capitalize ${valueTone}`}>{value}</div>
        {hint && <div className="text-[10.5px] text-ink-4 mt-0.5">{hint}</div>}
      </div>
    </div>
  )
}
