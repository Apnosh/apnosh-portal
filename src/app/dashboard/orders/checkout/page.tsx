'use client'

import { useState } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Trash2, Minus, Plus, CalendarDays,
  ShieldCheck, RefreshCw, Lock, AlertCircle
} from 'lucide-react'
import { useCart } from '@/lib/cart-context'
import { createStripeCheckout, type CheckoutItem } from '@/lib/actions'

export default function CheckoutPage() {
  const { items, updateQuantity, removeItem, cartTotal } = useCart()
  const [instructions, setInstructions] = useState<Record<string, string>>({})
  const [deadlines, setDeadlines] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const recurringItems = items.filter((i) => i.priceUnit === 'per_month')
  const oneTimeItems = items.filter((i) => i.priceUnit !== 'per_month')
  const recurringTotal = recurringItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const oneTimeTotal = oneTimeItems.reduce((sum, i) => sum + i.price * i.quantity, 0)

  const handleCheckout = async () => {
    setLoading(true)
    setError('')

    const checkoutItems: CheckoutItem[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      priceUnit: item.priceUnit,
      isSubscription: item.priceUnit === 'per_month',
      instructions: instructions[item.id],
      deadline: deadlines[item.id],
    }))

    const result = await createStripeCheckout(checkoutItems)

    if (result.success && result.url) {
      // Redirect to Stripe Checkout
      window.location.href = result.url
    } else {
      setError(result.error || 'Something went wrong. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <Link
          href="/dashboard/orders"
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" /> Back to services
        </Link>
        <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink">Checkout</h1>
        <p className="text-ink-3 text-sm mt-1">Review your order and proceed to payment.</p>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left — Order Summary */}
        <div className="flex-1 lg:w-[60%] space-y-4">
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-6">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">
                Order Summary ({items.length} {items.length === 1 ? 'item' : 'items'})
              </h2>
            </div>

            {items.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-ink-4 text-sm">Your cart is empty.</p>
                <Link
                  href="/dashboard/orders"
                  className="inline-block mt-3 text-sm text-brand-dark font-medium hover:underline"
                >
                  Browse services
                </Link>
              </div>
            ) : (
              <div className="divide-y divide-ink-6">
                {items.map((item) => (
                  <div key={item.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-ink">{item.name}</h3>
                          {item.priceUnit === 'per_month' && (
                            <span className="text-[10px] font-medium bg-brand-tint text-brand-dark px-1.5 py-0.5 rounded-full">
                              Monthly
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-2 mt-1 font-medium">
                          ${item.price.toLocaleString()}
                          {item.priceUnit === 'per_month' ? '/mo' : ''}
                          {item.priceUnit === 'per_item' ? '/each' : ''}
                          {item.priceUnit === 'per_hour' ? '/hr' : ''}
                        </p>
                      </div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateQuantity(item.id, Math.max(1, item.quantity - 1))}
                          className="w-7 h-7 rounded-lg border border-ink-6 flex items-center justify-center text-ink-4 hover:text-ink hover:border-ink-5 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm text-ink font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateQuantity(item.id, item.quantity + 1)}
                          className="w-7 h-7 rounded-lg border border-ink-6 flex items-center justify-center text-ink-4 hover:text-ink hover:border-ink-5 transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      {/* Remove */}
                      <button
                        onClick={() => removeItem(item.id)}
                        className="text-ink-4 hover:text-red-500 transition-colors p-1"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {/* Options */}
                    <div className="mt-4 grid sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
                          Special Instructions (optional)
                        </label>
                        <textarea
                          value={instructions[item.id] || ''}
                          onChange={(e) => setInstructions((prev) => ({ ...prev, [item.id]: e.target.value }))}
                          placeholder="Any specific notes or preferences..."
                          rows={2}
                          className="w-full rounded-lg border border-ink-6 bg-bg-2 px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1 block">
                          Preferred Deadline (optional)
                        </label>
                        <div className="relative">
                          <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-4 pointer-events-none" />
                          <input
                            type="date"
                            value={deadlines[item.id] || ''}
                            onChange={(e) => setDeadlines((prev) => ({ ...prev, [item.id]: e.target.value }))}
                            className="w-full rounded-lg border border-ink-6 bg-bg-2 pl-9 pr-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right — Payment Summary */}
        <div className="lg:w-[40%]">
          <div className="bg-white rounded-xl border border-ink-6 p-5 sticky top-20">
            <h2 className="font-[family-name:var(--font-display)] text-lg text-ink mb-4">Payment Summary</h2>

            {/* Subscriptions */}
            {recurringItems.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">Monthly Subscriptions</p>
                <div className="space-y-1.5">
                  {recurringItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-ink-2">{item.name} {item.quantity > 1 ? `x${item.quantity}` : ''}</span>
                      <span className="text-ink font-medium">${(item.price * item.quantity).toLocaleString()}/mo</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-medium mt-2 pt-2 border-t border-ink-6">
                  <span className="text-ink-3">Recurring monthly</span>
                  <span className="text-ink">${recurringTotal.toLocaleString()}/mo</span>
                </div>
              </div>
            )}

            {/* One-time */}
            {oneTimeItems.length > 0 && (
              <div className="mb-3">
                <p className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2">One-Time Services</p>
                <div className="space-y-1.5">
                  {oneTimeItems.map((item) => (
                    <div key={item.id} className="flex justify-between text-sm">
                      <span className="text-ink-2">{item.name} {item.quantity > 1 ? `x${item.quantity}` : ''}</span>
                      <span className="text-ink font-medium">${(item.price * item.quantity).toLocaleString()}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between text-sm font-medium mt-2 pt-2 border-t border-ink-6">
                  <span className="text-ink-3">One-time total</span>
                  <span className="text-ink">${oneTimeTotal.toLocaleString()}</span>
                </div>
              </div>
            )}

            {/* Total */}
            <div className="border-t-2 border-ink-6 pt-3 mt-3">
              <div className="flex justify-between items-baseline">
                <span className="font-[family-name:var(--font-display)] text-lg text-ink">Total due today</span>
                <span className="font-[family-name:var(--font-display)] text-2xl text-ink">
                  ${cartTotal.toLocaleString()}
                </span>
              </div>
              {recurringItems.length > 0 && (
                <p className="text-[11px] text-ink-4 mt-1">
                  Then ${recurringTotal.toLocaleString()}/mo for subscriptions
                </p>
              )}
            </div>

            {/* CTA */}
            <button
              onClick={handleCheckout}
              disabled={items.length === 0 || loading}
              className="w-full mt-5 bg-brand hover:bg-brand-dark text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Redirecting to payment...
                </>
              ) : (
                'Proceed to Payment'
              )}
            </button>

            <p className="text-[11px] text-ink-4 text-center mt-2">
              You&apos;ll be redirected to our secure payment page powered by Stripe.
            </p>

            <Link
              href="/dashboard/orders"
              className="block text-center text-sm text-ink-3 hover:text-ink mt-3 transition-colors"
            >
              Back to services
            </Link>

            {/* Trust badges */}
            <div className="flex items-center justify-center gap-4 mt-5 pt-4 border-t border-ink-6">
              <div className="flex items-center gap-1 text-[11px] text-ink-4">
                <RefreshCw className="w-3.5 h-3.5" /> Month-to-month
              </div>
              <div className="flex items-center gap-1 text-[11px] text-ink-4">
                <ShieldCheck className="w-3.5 h-3.5" /> Secure checkout
              </div>
              <div className="flex items-center gap-1 text-[11px] text-ink-4">
                <Lock className="w-3.5 h-3.5" /> 256-bit encrypted
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
