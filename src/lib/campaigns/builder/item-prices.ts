/**
 * Per-catalog-item price estimates for the create page, so owners see a number
 * BEFORE they build (the #1 UX-study finding: price was hidden until the end).
 * Reuses the real builder adapter (draftFromBuilder -> composeCampaign ->
 * summarize), the same engine that prices the saved campaign, so the estimate
 * matches what they will actually be billed. Pure + client-safe (no server, no
 * AI), computed once at module load.
 */
import { draftFromBuilder } from './adapter'
import { summarize } from '@/lib/campaigns/types'

export interface ItemPrice { oneTime: number; perMonth: number }

const IDS = [
  'reach', 'nights', 'firstvisit', 'regulars', 'catering', 'reviewsplan', 'reel', 'story',
  'carousel', 'graphic', 'dish', 'gpost', 'promoevent', 'launch', 'creator', 'welcome',
  'second', 'news', 'slowoffer', 'birthday', 'earlyaccess', 'shoot', 'gbp', 'reviewsreply',
  'qr', 'friction', 'giftcard', 'ticket', 'winback',
]

function compute(): Record<string, ItemPrice> {
  const out: Record<string, ItemPrice> = {}
  for (const id of IDS) {
    try {
      const draft = draftFromBuilder({ itemId: id, status: 'estimate', vals: {} })
      const bill = summarize(draft.items)
      out[id] = { oneTime: Math.round(bill.oneTimeOnDelivery), perMonth: Math.round(bill.perMonth) }
    } catch {
      out[id] = { oneTime: 0, perMonth: 0 }
    }
  }
  return out
}

export const ITEM_PRICES: Record<string, ItemPrice> = compute()

/** A short owner-facing estimate label, e.g. "$120", "$545/mo", or null. */
export function priceLabel(id: string): string | null {
  const p = ITEM_PRICES[id]
  if (!p) return null
  if (p.perMonth > 0 && p.oneTime > 0) return `$${p.oneTime} + $${p.perMonth}/mo`
  if (p.perMonth > 0) return `$${p.perMonth}/mo`
  if (p.oneTime > 0) return `$${p.oneTime}`
  return null
}
