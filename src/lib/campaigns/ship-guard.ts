/**
 * Ship billing gate (G7, hardened for the ONE pay-first model — owner decision B).
 *
 * Every billable campaign now ships through the upfront CampaignCheckout, which threads the paid
 * PaymentIntent into the ship PATCH. So a BARE billable ship (preTaxCents > 0, no PaymentIntent) is
 * no longer a legitimate "delivery-gated" path — it's refused, EXCEPT for genuinely legacy campaigns
 * created before checkout existed (the dated carve-out below), which still ship on the old
 * delivery-gated model.
 *
 * Pure + client-safe (no DB, no Stripe) so the decision is unit-testable; the route acts on it.
 */

/**
 * The cutoff: campaigns created on/after this instant MUST pay upfront to ship a billable order.
 * Campaigns created BEFORE it are legacy (built under the old delivery-gated model) and are allowed
 * to ship without an upfront charge — their pieces bill on delivery via accrual, exactly as before.
 *
 * Set to when the unified pay-first checkout lands. Owner-adjustable to the real merge/deploy date;
 * a later value widens the legacy window, an earlier value narrows it. Kept as a dated constant (not
 * a per-row flag) because "created before checkout existed" is precisely a timestamp comparison.
 */
export const CHECKOUT_REQUIRED_SINCE = process.env.CHECKOUT_REQUIRED_SINCE || '2026-07-15T00:00:00Z'

export type ShipGate = 'allow' | 'verify' | 'refuse'

/**
 * Decide how the ship route must treat a billable ship:
 *  - 'allow'   — no upfront charge required (a truly $0 order, or a legacy pre-checkout campaign)
 *  - 'verify'  — a PaymentIntent/SetupIntent was presented; the route must confirm it succeeded + covers the bill
 *  - 'refuse'  — a billable, non-legacy ship with no payment → block (must go through checkout)
 *
 * "Billable" counts BOTH the one-time bill and the monthly bill: a monthly-only cart ($0 today,
 * $X/mo) must still go through checkout so a card is on file and the subscription really starts —
 * previously it rode the free path and never billed at all.
 */
export function shipBillingGate(opts: {
  preTaxCents: number
  /** Recurring monthly total in cents (0 when the plan has no monthly services). */
  perMonthCents?: number
  hasPaymentIntent: boolean
  createdAtISO?: string | null
}): ShipGate {
  const billable = opts.preTaxCents > 0 || (opts.perMonthCents ?? 0) > 0
  if (!billable) return 'allow'                      // nothing billable — free/DIY lanes ship freely
  if (opts.hasPaymentIntent) return 'verify'         // upfront-checkout order — verify the charge
  // Billable, no payment presented: allow ONLY genuinely legacy (pre-checkout) campaigns.
  const created = opts.createdAtISO ? Date.parse(opts.createdAtISO) : NaN
  const cutoff = Date.parse(CHECKOUT_REQUIRED_SINCE)
  if (Number.isFinite(created) && created < cutoff) return 'allow'   // legacy delivery-gated campaign
  return 'refuse'
}

/** The owner-facing refusal message for a blocked bare billable ship. */
export const SHIP_NEEDS_PAYMENT = 'This order needs payment. Place it through checkout to start your campaign.'
