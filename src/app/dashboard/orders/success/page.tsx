'use client'

import { useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { CheckCircle, ClipboardList, FileCheck, Rocket, Send, Package } from 'lucide-react'
import { Suspense } from 'react'
import { createClient } from '@/lib/supabase/client'

const steps = [
  {
    icon: ClipboardList,
    title: 'Our team reviews your order',
    description: 'We review the details and scope within 1-2 hours during business hours.',
  },
  {
    icon: FileCheck,
    title: "You'll receive a work brief for approval",
    description: 'A detailed brief outlining deliverables, timeline, and approach.',
  },
  {
    icon: Rocket,
    title: 'Production begins immediately after approval',
    description: 'Our team gets to work as soon as you approve the brief.',
  },
  {
    icon: Send,
    title: 'Deliverables sent for your review',
    description: "You'll receive completed work for feedback and final approval.",
  },
]

interface OrderSummary {
  id: string
  service_name: string
  quantity: number
  total_price: number
  type: string
}

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')
  const fallbackOrder = searchParams.get('order')
  const [orders, setOrders] = useState<OrderSummary[]>([])
  const [loading, setLoading] = useState(!!sessionId)

  useEffect(() => {
    if (!sessionId) return

    const supabase = createClient()
    async function fetchOrders() {
      const { data } = await supabase
        .from('orders')
        .select('id, service_name, quantity, total_price, type')
        .eq('stripe_checkout_session_id', sessionId)
        .order('created_at', { ascending: false })

      if (data && data.length > 0) {
        setOrders(data as OrderSummary[])
      }
      setLoading(false)
    }
    fetchOrders()
  }, [sessionId])

  const orderRef = sessionId
    ? `APN-${sessionId.slice(-8).toUpperCase()}`
    : fallbackOrder || `APN-${Date.now().toString(36).toUpperCase()}`

  const totalAmount = orders.reduce((sum, o) => sum + (o.total_price || 0), 0)
  const hasSubscriptions = orders.some(o => o.type === 'subscription')

  return (
    <div className="max-w-2xl mx-auto py-8 text-center">
      {/* Checkmark */}
      <div className="w-20 h-20 rounded-full bg-brand-tint border-2 border-brand/20 flex items-center justify-center mx-auto mb-6">
        <CheckCircle className="w-10 h-10 text-brand-dark" />
      </div>

      <h1 className="font-[family-name:var(--font-display)] text-3xl text-ink mb-2">Order Confirmed!</h1>
      <p className="text-ink-3 text-sm">
        Your order <span className="font-mono font-medium text-ink-2 bg-bg-2 px-2 py-0.5 rounded">{orderRef}</span> has been placed successfully.
      </p>

      {/* Order summary */}
      {!loading && orders.length > 0 && (
        <div className="mt-6 bg-white rounded-xl border border-ink-6 p-5 text-left">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <Package className="w-4 h-4 text-ink-3" /> Order Summary
          </h2>
          <div className="space-y-2">
            {orders.map(order => (
              <div key={order.id} className="flex items-center justify-between text-sm py-1.5 border-b border-ink-6 last:border-0">
                <div>
                  <span className="text-ink-2">{order.service_name}</span>
                  {order.quantity > 1 && <span className="text-ink-4 text-xs ml-1">x{order.quantity}</span>}
                  {order.type === 'subscription' && <span className="text-[10px] text-brand-dark bg-brand-tint px-1.5 py-0.5 rounded-full ml-2">Monthly</span>}
                </div>
                <span className="font-medium text-ink tabular-nums">
                  ${order.total_price?.toLocaleString() || '0'}
                  {order.type === 'subscription' ? '/mo' : ''}
                </span>
              </div>
            ))}
          </div>
          {totalAmount > 0 && (
            <div className="flex items-center justify-between text-sm font-semibold text-ink pt-3 mt-2 border-t border-ink-5">
              <span>Total{hasSubscriptions ? ' (monthly)' : ''}</span>
              <span>${totalAmount.toLocaleString()}</span>
            </div>
          )}
        </div>
      )}

      {loading && (
        <div className="mt-6 bg-white rounded-xl border border-ink-6 p-5">
          <div className="h-4 w-32 bg-ink-6 rounded animate-pulse mb-3" />
          <div className="space-y-2">
            {[1, 2].map(i => <div key={i} className="h-8 bg-ink-6 rounded animate-pulse" />)}
          </div>
        </div>
      )}

      {/* What happens next */}
      <div className="mt-8 bg-white rounded-xl border border-ink-6 p-6 text-left">
        <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-5 text-center">What happens next</h2>
        <div className="space-y-0">
          {steps.map((step, index) => (
            <div key={index} className="flex gap-4 relative">
              {index < steps.length - 1 && (
                <div className="absolute left-[19px] top-10 w-px h-[calc(100%-16px)] bg-ink-6" />
              )}
              <div className="relative z-10 w-10 h-10 rounded-full bg-brand-tint border border-brand/15 flex items-center justify-center flex-shrink-0">
                <step.icon className="w-4 h-4 text-brand-dark" />
              </div>
              <div className="pb-6">
                <h3 className="text-sm font-medium text-ink">{step.title}</h3>
                <p className="text-[13px] text-ink-3 mt-0.5">{step.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-8">
        <Link
          href="/dashboard/orders"
          className="w-full sm:w-auto px-6 py-3 rounded-xl bg-brand hover:bg-brand-dark text-white font-medium text-sm transition-colors text-center"
        >
          View My Orders
        </Link>
        <Link
          href="/dashboard"
          className="w-full sm:w-auto px-6 py-3 rounded-xl border border-ink-6 text-ink-2 font-medium text-sm hover:bg-bg-2 transition-colors text-center"
        >
          Back to Dashboard
        </Link>
      </div>
    </div>
  )
}

export default function OrderSuccessPage() {
  return (
    <Suspense fallback={
      <div className="max-w-2xl mx-auto py-8 text-center">
        <div className="w-20 h-20 rounded-full bg-bg-2 animate-pulse mx-auto mb-6" />
        <div className="h-8 w-64 bg-bg-2 rounded animate-pulse mx-auto mb-2" />
        <div className="h-4 w-48 bg-bg-2 rounded animate-pulse mx-auto" />
      </div>
    }>
      <SuccessContent />
    </Suspense>
  )
}
