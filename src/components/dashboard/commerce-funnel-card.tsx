'use client'

/**
 * Commerce funnel card: visualizes online orders OR reservations
 * stage-by-stage. Shows conversion rate between each stage so
 * owners see where the funnel leaks.
 *
 * Empty state explains how to wire the platform webhook.
 */

import { useEffect, useState } from 'react'
import { ShoppingCart, Calendar, DollarSign } from 'lucide-react'
import { getCommerceFunnel, type CommerceFunnel, type CommerceKind } from '@/lib/commerce-events'

const STAGE_LABEL: Record<string, string> = {
  started: 'Started',
  added: 'Item added',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

const STAGE_LABEL_RESERVATION: Record<string, string> = {
  started: 'Opened widget',
  added: 'Time selected',
  submitted: 'Submitted',
  confirmed: 'Confirmed',
  cancelled: 'Cancelled',
}

interface Props {
  kind: CommerceKind
  startDate: string
  endDate: string
  clientSlug?: string
}

export default function CommerceFunnelCard({ kind, startDate, endDate, clientSlug }: Props) {
  const [funnel, setFunnel] = useState<CommerceFunnel | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getCommerceFunnel(kind, startDate, endDate)
      .then(d => { if (!cancelled) setFunnel(d) })
      .catch(() => { if (!cancelled) setFunnel(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [kind, startDate, endDate])

  const Icon = kind === 'order' ? ShoppingCart : Calendar
  const heading = kind === 'order' ? 'Online orders' : 'Reservations'
  const labels = kind === 'order' ? STAGE_LABEL : STAGE_LABEL_RESERVATION

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-32" />
      </div>
    )
  }

  if (!funnel || funnel.stages.every(s => s.count === 0)) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Icon className="w-3.5 h-3.5 text-brand" />
          <h2 className="text-sm font-semibold text-ink">{heading}</h2>
        </div>
        <p className="text-[12.5px] text-ink-3 mb-3">
          {kind === 'order'
            ? 'No order events received yet. When your ordering platform (Toast, Square, DoorDash) is wired to the commerce webhook, the funnel will appear here.'
            : 'No reservation events received yet. When OpenTable / Resy / Tock are wired to the commerce webhook, the funnel will appear here.'}
        </p>
        {clientSlug && (
          <p className="text-[11px] text-ink-4 font-mono">
            Webhook: <code className="bg-bg-2 px-1 py-0.5 rounded break-all">
              https://portal.apnosh.com/api/commerce/event/{clientSlug}?kind={kind}&stage=confirmed&source=YOUR_PLATFORM
            </code>
          </p>
        )}
      </div>
    )
  }

  const maxCount = Math.max(...funnel.stages.map(s => s.count), 1)
  const confirmed = funnel.stages.find(s => s.stage === 'confirmed')?.count ?? 0

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5 lg:p-6">
      <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Icon className="w-3.5 h-3.5 text-brand" />
          <h2 className="text-sm font-semibold text-ink">{heading} funnel</h2>
        </div>
        <div className="flex items-center gap-4 text-[11px] text-ink-3">
          {kind === 'order' && funnel.totalRevenueCents > 0 && (
            <span className="inline-flex items-center gap-1">
              <DollarSign className="w-3 h-3 text-emerald-600" />
              <strong className="text-ink-2 tabular-nums">${(funnel.totalRevenueCents / 100).toLocaleString()}</strong>
              <span className="text-ink-4">in confirmed orders</span>
            </span>
          )}
          {kind === 'reservation' && funnel.partySizeAverage != null && (
            <span className="inline-flex items-center gap-1">
              <strong className="text-ink-2 tabular-nums">{funnel.partySizeAverage}</strong>
              <span className="text-ink-4">avg party size</span>
            </span>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {funnel.stages.filter(s => s.stage !== 'cancelled').map((s, i) => {
          const width = Math.max(8, Math.round((s.count / maxCount) * 100))
          return (
            <div key={s.stage}>
              <div className="flex items-baseline justify-between gap-3 mb-1">
                <span className="text-[12.5px] text-ink-2">{labels[s.stage]}</span>
                <span className="text-[12px] text-ink-3 tabular-nums">
                  {s.count.toLocaleString()}
                  {s.conversionFromPrev != null && i > 0 && (
                    <span className="text-ink-4 ml-2">
                      ({s.conversionFromPrev.toFixed(0)}% of {labels[funnel.stages[i - 1].stage].toLowerCase()})
                    </span>
                  )}
                </span>
              </div>
              <div className="h-2 rounded-full bg-bg-2 overflow-hidden">
                <div
                  className="h-full bg-brand transition-all"
                  style={{ width: `${width}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>

      {/* Cancellations as a side-stat */}
      {(funnel.stages.find(s => s.stage === 'cancelled')?.count ?? 0) > 0 && (
        <p className="text-[11px] text-ink-4 mt-3">
          {funnel.stages.find(s => s.stage === 'cancelled')?.count} cancelled{' '}
          {kind === 'order' ? 'before checkout' : 'after submitting'}.
        </p>
      )}

      {/* Bottom-line conversion */}
      {funnel.stages[0].count > 0 && confirmed > 0 && (
        <p className="text-[12.5px] text-ink-2 mt-3 pt-3 border-t border-ink-7">
          <strong className="text-ink">{Math.round((confirmed / funnel.stages[0].count) * 1000) / 10}%</strong>
          {' '}of {kind === 'order' ? 'cart-opens' : 'widget-opens'} convert to a confirmed {kind}.
        </p>
      )}
    </div>
  )
}
