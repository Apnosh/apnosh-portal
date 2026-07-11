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
import { CREATE_CATALOG_IDS } from '@/lib/campaigns/data/create-catalog'

export interface ItemPrice { oneTime: number; perMonth: number }

// Priced ids come from the single-source catalog — a hardcoded copy here once
// drifted the moment items were merged/renamed (the 2026-07-09 recompose).
const IDS = CREATE_CATALOG_IDS

/** One id's estimate through the REAL builder rail (draftFromBuilder → summarize) —
 *  the same engine that prices the saved campaign. {0,0} when composing fails. */
export function computeItemPrice(id: string): ItemPrice {
  try {
    const draft = draftFromBuilder({ itemId: id, status: 'estimate', vals: {} })
    const bill = summarize(draft.items)
    return { oneTime: Math.round(bill.oneTimeOnDelivery), perMonth: Math.round(bill.perMonth) }
  } catch {
    return { oneTime: 0, perMonth: 0 }
  }
}

function compute(): Record<string, ItemPrice> {
  const out: Record<string, ItemPrice> = {}
  for (const id of IDS) out[id] = computeItemPrice(id)
  return out
}

export const ITEM_PRICES: Record<string, ItemPrice> = compute()

/** Price a runtime-registered DB campaign (Phase C2) through the SAME rail the built-ins
 *  use, and publish it into ITEM_PRICES so every existing read path (planTags, pdpPrice,
 *  the madlib footer) prices it with no per-caller changes. Built-in ids are never
 *  recomputed — their module-load estimate stays canonical. */
export function registerItemPrice(id: string): void {
  if (IDS.includes(id)) return
  ITEM_PRICES[id] = computeItemPrice(id)
}

/** A short owner-facing estimate label from a computed pair, e.g. "$120", "$545/mo". */
export function formatItemPrice(p: ItemPrice | undefined | null): string | null {
  if (!p) return null
  if (p.perMonth > 0 && p.oneTime > 0) return `$${p.oneTime} + $${p.perMonth}/mo`
  if (p.perMonth > 0) return `$${p.perMonth}/mo`
  if (p.oneTime > 0) return `$${p.oneTime}`
  return null
}

/** A short owner-facing estimate label for a catalog id, e.g. "$120", "$545/mo", or null. */
export function priceLabel(id: string): string | null {
  return formatItemPrice(ITEM_PRICES[id])
}
