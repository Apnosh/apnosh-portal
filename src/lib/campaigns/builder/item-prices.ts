/**
 * Per-catalog-item price estimates for the create page, so owners see a number
 * BEFORE they build (the #1 UX-study finding: price was hidden until the end).
 * Reuses the real builder adapter (draftFromBuilder -> composeCampaign ->
 * summarize), the same engine that prices the saved campaign, so the estimate
 * matches what they will actually be billed. Pure + client-safe (no server, no
 * AI), computed once at module load.
 */
import { draftFromBuilder } from './adapter'
import { summarize, type LineItem } from '@/lib/campaigns/types'
import { CREATE_CATALOG_IDS } from '@/lib/campaigns/data/create-catalog'
import { PRICED_CATALOG } from '@/lib/campaigns/data/priced-catalog'
import { SERVICE_FEE_RATE } from '@/lib/campaigns/checkout-bill'

export interface ItemPrice { oneTime: number; perMonth: number }

/** The one-time amount WITH the 10% checkout service fee folded in, so every displayed price is
 *  the price the card is actually charged (pre-tax). Monthly amounts carry no service fee. */
export function withServiceFee(oneTime: number): number {
  return Math.round(oneTime * (1 + SERVICE_FEE_RATE))
}

/* ── Pass-through cost notes (billed at cost) ──────────────────────────────
 * Some services carry a real extra cost on top of the listed price — e.g. paid-ads'
 * "ad spend billed at cost, $500/mo minimum". That must be visible BEFORE purchase,
 * so the store card, the product page, and the checkout bill all surface the service's
 * OWN catalog note (never a hardcoded per-card string — a catalog edit stays honest). */

/** serviceId → its billed-at-cost price notes, verbatim from the catalog metadata. */
const COST_NOTES_BY_SERVICE: Map<string, string[]> = (() => {
  const m = new Map<string, string[]>()
  for (const s of PRICED_CATALOG) {
    const notes = s.prices
      .map((p) => (p as { note?: string }).note)
      .filter((n): n is string => !!n && /billed at cost/i.test(n))
    if (notes.length) m.set(s.id, [...new Set(notes)])
  }
  return m
})()

/** The verbatim billed-at-cost notes for a set of catalog serviceIds (deduped, catalog order). */
export function passthroughNotesForServices(serviceIds: readonly string[]): string[] {
  const out: string[] = []
  for (const id of serviceIds) for (const n of COST_NOTES_BY_SERVICE.get(id) ?? []) if (!out.includes(n)) out.push(n)
  return out
}

/** The billed-at-cost notes carried by a composed draft's ACTIVE lines — the checkout bill's
 *  source. Opted-out and owner-run (diy) lines never bill, so their notes never show. */
export function passthroughNotesForLines(items: readonly Pick<LineItem, 'serviceId' | 'included' | 'optOut' | 'producer'>[]): string[] {
  const ids = items.filter((it) => it.included && !it.optOut && it.producer !== 'diy').map((it) => it.serviceId)
  return passthroughNotesForServices(ids)
}

/** Plain-words display version of a catalog cost note. "billed at cost" is accounting-speak, so
 *  owner surfaces say "paid at cost (no markup)". A note that names no dollar amount adds
 *  "You set the amount." so it never reads as a blank check. The catalog note itself stays the
 *  source of truth (this only rewords for display, it never invents numbers). */
export function plainCostNote(note: string): string {
  let n = note.replace(/billed at cost/i, 'paid at cost (no markup)')
  if (!/\$\d/.test(n)) n = `${n}. You set the amount`
  return n
}

/** Summed monthly minimums the notes name outright (e.g. "$500/mo minimum"), in cents — so the
 *  bill can show ONE real total ("With ad spend, about $1,045+/mo"). Notes with no stated
 *  minimum contribute 0 (we never invent a number). */
export function passthroughMonthlyMinimumCents(notes: readonly string[]): number {
  let total = 0
  for (const n of notes) {
    const m = /\$(\d[\d,]*(?:\.\d+)?)\s*\/\s*mo(?:nth)?\s+minimum/i.exec(n)
    if (m) total += Math.round(parseFloat(m[1].replace(/,/g, '')) * 100)
  }
  return total
}

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

/** One id's pass-through notes through the SAME rail as its price (draftFromBuilder →
 *  active lines → catalog notes), so a card's warning can never drift from what it bills. */
export function computeItemNotes(id: string): string[] {
  try {
    return passthroughNotesForLines(draftFromBuilder({ itemId: id, status: 'estimate', vals: {} }).items)
  } catch {
    return []
  }
}

function compute(): Record<string, ItemPrice> {
  const out: Record<string, ItemPrice> = {}
  for (const id of IDS) out[id] = computeItemPrice(id)
  return out
}

export const ITEM_PRICES: Record<string, ItemPrice> = compute()

const ITEM_PRICE_NOTES: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {}
  for (const id of IDS) out[id] = computeItemNotes(id)
  return out
})()

/** The verbatim billed-at-cost notes for a catalog card id (empty when none). */
export function priceNotes(id: string): string[] {
  return ITEM_PRICE_NOTES[id] ?? []
}

/** Price a runtime-registered DB campaign (Phase C2) through the SAME rail the built-ins
 *  use, and publish it into ITEM_PRICES so every existing read path (planTags, pdpPrice,
 *  the madlib footer) prices it with no per-caller changes. Built-in ids are never
 *  recomputed — their module-load estimate stays canonical. */
export function registerItemPrice(id: string): void {
  if (IDS.includes(id)) return
  ITEM_PRICES[id] = computeItemPrice(id)
  ITEM_PRICE_NOTES[id] = computeItemNotes(id)
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
