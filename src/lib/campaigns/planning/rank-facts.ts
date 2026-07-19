/**
 * rank-facts — pure, client-safe facts + filters for the create-page recommender.
 *
 * The 20-owner sim found the ranker blind on every axis that matters: it recommended
 * coming-soon cards (silently thinned later), never saw the owner's budget (cold-start's
 * top pick was a ~$1,245/mo real-cost ads plan for $300/mo owners), and filled by catalog
 * order so the delivery card could mathematically never surface, even for a ghost kitchen.
 *
 * This module holds the pure logic (unit-tested in the sim harness); the server ranker
 * and its route assemble the facts and apply these filters.
 */
import { ITEM_PRICES } from '@/lib/campaigns/builder/item-prices'

export interface RankerFacts {
  /** Ids the store can actually SELL right now. Null/undefined = unknown (no filtering). */
  buyable?: ReadonlySet<string> | null
  /** The owner's monthly budget in dollars. Null/0 = unknown (no filtering). */
  budgetMonthly?: number | null
  /** Delivery-led shape (ghost kitchen / delivery-only): the delivery card must be reachable. */
  deliveryLed?: boolean
}

/** True when this catalog id fits the owner's monthly budget. One-time items always fit
 *  (the fear is stacked recurring commitments); a monthly price over the cap does not. */
export function fitsBudget(id: string, budgetMonthly: number | null | undefined): boolean {
  if (!budgetMonthly || budgetMonthly <= 0) return true
  const p = ITEM_PRICES[id]
  if (!p) return true
  return p.perMonth <= budgetMonthly
}

/** True when the id is sellable per the facts (unknown availability = allowed). */
export function isSellable(id: string, facts: RankerFacts): boolean {
  return !facts.buyable || facts.buyable.has(id)
}

/** Filter ranked recs down to what the owner can actually buy AND afford, order preserved. */
export function filterRecsByFacts<T extends { id: string }>(recs: readonly T[], facts: RankerFacts): T[] {
  return recs.filter((r) => isSellable(r.id, facts) && fitsBudget(r.id, facts.budgetMonthly))
}

/** Delivery-led shape detection from the stored client shape columns. */
export function deliveryLedShape(concept: string | null | undefined, footprint: string | null | undefined): boolean {
  return concept === 'delivery_only' || footprint === 'ghost'
}
