/** The Content Menu cart: a client-side list of pieces the owner is assembling, and the
 *  bridge to real LineItems so pricing, shoot-grouping, and the saved draft all run
 *  through the same pure functions (campaignBill / shootDaysFromLines / buildContentLine). */
import { buildContentLine } from '@/lib/campaigns/catalog'
import type { LineItem, PieceBrief, PieceProducer } from '@/lib/campaigns/types'

export interface CartLine {
  id: string
  type: string
  qty: number
  producer: PieceProducer
  brief: PieceBrief
}

/** Map the cart to the LineItems the bill + the saved draft use. */
export function cartToLineItems(cart: CartLine[]): LineItem[] {
  return cart
    .map((l) => buildContentLine(l.type, l.id, { qty: l.qty, producer: l.producer, brief: l.brief }))
    .filter((x): x is LineItem => x !== null)
}

/** Reverse: load a saved menu campaign's line items back into the cart for editing. Only
 *  content pieces with a per-piece producer (i.e. menu lines) come back. */
export function lineItemsToCart(items: LineItem[]): CartLine[] {
  return items
    .filter((it) => it.included && /^content-/.test(it.serviceId ?? '') && !!it.producer && it.producer !== 'ai')
    .map((it) => ({
      id: it.id,
      type: (it.serviceId ?? '').replace(/^content-/, ''),
      qty: Math.max(1, it.qty ?? 1),
      producer: it.producer as CartLine['producer'],
      brief: it.brief ?? {},
    }))
}
