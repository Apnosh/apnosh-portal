/**
 * Which cart ITEM each pre-order question belongs to.
 *
 * The cart works like a food-ordering app: an item with required options is flagged,
 * you open that item to answer, and the order cannot be placed until every flagged
 * item is done. To badge the right row, the cart has to know which card produced each
 * question.
 *
 * resolveGatesForDraft (config.ts) already knows: every asset gate is pushed inside an
 * `ids.has('<card>')` branch. This map mirrors that pairing so the cart can group by
 * item without re-running the resolver's conditions, which is what would let the two
 * drift apart.
 *
 * KEEP IN SYNC with config.ts. A gate missing from this map is not silently dropped:
 * it falls through to the order-level list, so it still blocks checkout and still gets
 * answered. It just shows above the items instead of on one. Degrading to "shown in
 * the wrong place" beats degrading to "not shown".
 */

/** gate id -> the create-catalog card ids that cause it. */
const GATE_TO_ITEMS: Record<string, readonly string[]> = {
  // "Do you have a website?" — only asked when the website fix is in the cart.
  'asset-website': ['website'],
  // "Do you take online orders today?" — the Google order-button card.
  'asset-ordering': ['friction'],
  // "Where is your Google listing today?" — the profile card, when GBP is not connected.
  'asset-gbp': ['gbp'],
}

/** The cart items a gate belongs to. Empty means order-level (not one item's fault). */
export function gateItemIds(gateId: string): readonly string[] {
  return GATE_TO_ITEMS[gateId] ?? []
}

/** Every gate id we can attribute to an item. Exported for the sync check. */
export const MAPPED_GATE_IDS = Object.keys(GATE_TO_ITEMS)
