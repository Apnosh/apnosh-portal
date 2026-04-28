/**
 * Active promotion banner. Reads client_updates for any promotion
 * whose valid_from <= now < valid_until and surfaces it as a banner.
 *
 * The killer demo: admin creates a promotion in Apnosh, valid for 7
 * days, and this banner appears on the website automatically.
 * Promotion ends → banner disappears automatically.
 */

import type { PromotionPayload } from '@/lib/updates/types'

interface ActivePromoProps {
  promotion: PromotionPayload | null
}

export default function ActivePromo({ promotion }: ActivePromoProps) {
  if (!promotion) return null

  const discountText = (() => {
    if (promotion.discount_type === 'percent' && promotion.discount_value) {
      return `${promotion.discount_value}% off`
    }
    if (promotion.discount_type === 'amount' && promotion.discount_value) {
      return `$${(promotion.discount_value / 100).toFixed(2)} off`
    }
    if (promotion.discount_type === 'bogo') return 'Buy one, get one'
    if (promotion.discount_type === 'free_item') return 'Free with purchase'
    return null
  })()

  return (
    <section className="bg-amber-50 border-y border-amber-200 py-4 px-6">
      <div className="max-w-3xl mx-auto flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-block px-2 py-0.5 rounded-full bg-amber-200 text-amber-900 text-[10px] font-bold tracking-wider uppercase">
              Limited time
            </span>
            {discountText && (
              <span className="text-sm font-semibold text-amber-900">{discountText}</span>
            )}
          </div>
          <div className="font-semibold text-stone-900 text-lg">{promotion.name}</div>
          <p className="text-sm text-stone-700">{promotion.description}</p>
          {promotion.terms && (
            <p className="text-xs text-stone-500 mt-1">{promotion.terms}</p>
          )}
        </div>
        {promotion.code && (
          <div className="px-4 py-2 bg-white border-2 border-amber-300 border-dashed rounded-lg">
            <div className="text-[10px] text-stone-500 mb-0.5">Code</div>
            <div className="font-mono font-bold text-stone-900">{promotion.code}</div>
          </div>
        )}
      </div>
    </section>
  )
}
