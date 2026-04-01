'use client'

import { X, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react'
import { useCart } from '@/lib/cart-context'

function formatPrice(price: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price)
}

function priceUnitLabel(unit: string) {
  switch (unit) {
    case 'per_month':
      return '/mo'
    case 'per_item':
      return ' each'
    case 'per_hour':
      return '/hr'
    default:
      return ''
  }
}

export default function CartSidebar() {
  const { items, removeItem, updateQuantity, clearCart, cartTotal, isCartOpen, setIsCartOpen } =
    useCart()

  return (
    <>
      {/* Overlay */}
      {isCartOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-40 transition-opacity"
          onClick={() => setIsCartOpen(false)}
        />
      )}

      {/* Slide-out panel */}
      <div
        className={`fixed top-0 right-0 h-full w-full max-w-md bg-white border-l border-ink-6 z-50 flex flex-col transition-transform duration-300 ease-in-out ${
          isCartOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-5 border-b border-ink-6 flex-shrink-0">
          <h2 className="font-[family-name:var(--font-display)] text-lg text-ink">Your Cart</h2>
          <button
            onClick={() => setIsCartOpen(false)}
            className="text-ink-4 hover:text-ink transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Cart content */}
        {items.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-bg-2 flex items-center justify-center mb-4">
              <ShoppingBag className="w-7 h-7 text-ink-4" />
            </div>
            <p className="text-ink-2 font-medium">Your cart is empty</p>
            <p className="text-sm text-ink-4 mt-1">
              Browse services and add them to get started.
            </p>
            <button
              onClick={() => setIsCartOpen(false)}
              className="mt-5 px-5 py-2 text-sm font-medium text-brand-dark border border-brand/30 rounded-lg hover:bg-brand-tint transition-colors"
            >
              Browse Services
            </button>
          </div>
        ) : (
          <>
            {/* Items list */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="flex items-start gap-3 p-3 rounded-xl bg-bg-2 border border-ink-6"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{item.name}</p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      {formatPrice(item.price)}
                      {priceUnitLabel(item.priceUnit)}
                    </p>
                  </div>

                  {/* Quantity controls */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                      className="w-7 h-7 rounded-lg border border-ink-6 bg-white flex items-center justify-center text-ink-3 hover:text-ink hover:border-ink-5 transition-colors"
                    >
                      <Minus className="w-3 h-3" />
                    </button>
                    <span className="text-sm font-medium text-ink w-6 text-center">
                      {item.quantity}
                    </span>
                    <button
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                      className="w-7 h-7 rounded-lg border border-ink-6 bg-white flex items-center justify-center text-ink-3 hover:text-ink hover:border-ink-5 transition-colors"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeItem(item.id)}
                    className="text-ink-4 hover:text-red-500 transition-colors flex-shrink-0 mt-0.5"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="border-t border-ink-6 px-5 py-4 flex-shrink-0 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-ink-3">Subtotal</span>
                <span className="text-lg font-[family-name:var(--font-display)] text-ink">
                  {formatPrice(cartTotal)}
                </span>
              </div>
              <button className="w-full py-2.5 rounded-xl bg-brand-dark text-white text-sm font-semibold hover:bg-brand-dark/90 transition-colors">
                Proceed to Checkout
              </button>
              <button
                onClick={clearCart}
                className="w-full py-2 text-xs text-ink-4 hover:text-ink-3 transition-colors"
              >
                Clear cart
              </button>
            </div>
          </>
        )}
      </div>
    </>
  )
}
