'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Trash2, Minus, Plus, CalendarDays,
  ShieldCheck, RefreshCw, Lock
} from 'lucide-react'

interface CartItem {
  id: string
  name: string
  price: number
  quantity: number
  recurring: boolean
  instructions: string
  deadline: string
}

const initialCart: CartItem[] = [
  { id: '1', name: 'Social Media Growth Package', price: 449, quantity: 1, recurring: true, instructions: '', deadline: '' },
  { id: '2', name: 'Brand Identity Refresh', price: 1200, quantity: 1, recurring: false, instructions: '', deadline: '' },
  { id: '3', name: 'Local SEO Optimization', price: 149, quantity: 1, recurring: true, instructions: '', deadline: '' },
]

export default function CheckoutPage() {
  const router = useRouter()
  const [cart, setCart] = useState<CartItem[]>(initialCart)
  const [loading, setLoading] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [orderNumber, setOrderNumber] = useState('')

  const updateItem = (id: string, updates: Partial<CartItem>) => {
    setCart((prev) => prev.map((item) => (item.id === id ? { ...item, ...updates } : item)))
  }

  const removeItem = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id))
  }

  const recurringItems = cart.filter((i) => i.recurring)
  const oneTimeItems = cart.filter((i) => !i.recurring)
  const recurringTotal = recurringItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const oneTimeTotal = oneTimeItems.reduce((sum, i) => sum + i.price * i.quantity, 0)
  const subtotal = recurringTotal + oneTimeTotal

  const handlePlaceOrder = async () => {
    setLoading(true)
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500))
    const num = `APN-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`
    setOrderNumber(num)
    setLoading(false)
    setShowSuccess(true)
    setTimeout(() => {
      router.push(`/dashboard/orders/success?order=${num}`)
    }, 2000)
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
        <p className="text-ink-3 text-sm mt-1">Review your order and confirm.</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Left — Order Summary */}
        <div className="flex-1 lg:w-[60%] space-y-4">
          <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
            <div className="px-5 py-4 border-b border-ink-6">
              <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">
                Order Summary ({cart.length} {cart.length === 1 ? 'item' : 'items'})
              </h2>
            </div>

            {cart.length === 0 ? (
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
                {cart.map((item) => (
                  <div key={item.id} className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-medium text-ink">{item.name}</h3>
                          {item.recurring && (
                            <span className="text-[10px] font-medium bg-brand-tint text-brand-dark px-1.5 py-0.5 rounded-full">
                              Monthly
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-ink-2 mt-1 font-medium">
                          ${item.price.toLocaleString()}
                          {item.recurring ? '/mo' : ''}
                        </p>
                      </div>

                      {/* Quantity */}
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => updateItem(item.id, { quantity: Math.max(1, item.quantity - 1) })}
                          className="w-7 h-7 rounded-lg border border-ink-6 flex items-center justify-center text-ink-4 hover:text-ink hover:border-ink-5 transition-colors"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-8 text-center text-sm text-ink font-medium">{item.quantity}</span>
                        <button
                          onClick={() => updateItem(item.id, { quantity: item.quantity + 1 })}
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
                          value={item.instructions}
                          onChange={(e) => updateItem(item.id, { instructions: e.target.value })}
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
                            value={item.deadline}
                            onChange={(e) => updateItem(item.id, { deadline: e.target.value })}
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
                  ${subtotal.toLocaleString()}
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
              onClick={handlePlaceOrder}
              disabled={cart.length === 0 || loading}
              className="w-full mt-5 bg-brand hover:bg-brand-dark text-white font-medium py-3 px-4 rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Processing...
                </>
              ) : (
                'Place Order'
              )}
            </button>

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
                <ShieldCheck className="w-3.5 h-3.5" /> Cancel anytime
              </div>
              <div className="flex items-center gap-1 text-[11px] text-ink-4">
                <Lock className="w-3.5 h-3.5" /> Secure checkout
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-white rounded-2xl p-8 max-w-sm w-full mx-4 text-center shadow-xl animate-in fade-in zoom-in duration-300">
            <div className="w-14 h-14 rounded-full bg-brand-tint flex items-center justify-center mx-auto mb-4">
              <ShieldCheck className="w-7 h-7 text-brand-dark" />
            </div>
            <h3 className="font-[family-name:var(--font-display)] text-xl text-ink mb-1">Order Placed!</h3>
            <p className="text-sm text-ink-3 mb-2">Confirmation: <span className="font-mono font-medium text-ink-2">{orderNumber}</span></p>
            <p className="text-xs text-ink-4">Redirecting to your order details...</p>
          </div>
        </div>
      )}
    </div>
  )
}
