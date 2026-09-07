/**
 * Ship billing gate (G7, hardened for the ONE pay-first model — owner decision B).
 *
 * Every billable campaign ships through the upfront CampaignCheckout, which threads the paid
 * PaymentIntent into the ship PATCH. A BARE billable ship (money owed, no PaymentIntent) is refused.
 *
 * THE LEGACY CARVE-OUT IS GONE (money move 1). It used to let a campaign whose DRAFT was created
 * before a dated cutoff ship billable work with no payment at all, "on the old delivery-gated
 * model". That model's invoice has never actually been raised: charges accrue and sit there, and
 * createInvoiceFromAccruedCharges is an admin button nobody presses. So the carve-out was not a
 * second way to get paid, it was a way to do the work for free — and it never expired, because it
 * keyed on a draft's created_at, which an old draft keeps forever.
 *
 * Campaigns that ALREADY SHIPPED are untouched by this: the gate only runs on the transition INTO
 * shipped (the route checks `campaign.status !== 'shipped'` before calling), and a shipped campaign
 * can never re-enter it. What changes is only that an old, never-shipped draft must now pay or use
 * the invoice lane, exactly like a new one.
 *
 * Pure + client-safe (no DB, no Stripe) so the decision is unit-testable; the route acts on it.
 */

export type ShipGate = 'allow' | 'verify' | 'refuse'

/**
 * Decide how the ship route must treat a billable ship:
 *  - 'allow'   — no upfront charge required (a truly $0 order, or the invoice lane)
 *  - 'verify'  — a PaymentIntent/SetupIntent was presented; the route must confirm it succeeded + covers the bill
 *  - 'refuse'  — a billable ship with no payment → block (must go through checkout)
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
  /** THE INVOICE LANE. True only when the SERVER has confirmed card checkout is shut AND the client
   *  declared the order is placed on invoice. While the checkout is closed, a billable order ships
   *  without a card; its delivered work accrues as invoiceable charges the admin billing queue
   *  bills, which is the established revenue path. The moment the checkout opens, this is false
   *  and a billable ship needs a verified charge again. */
  invoiceLane?: boolean
}): ShipGate {
  const billable = opts.preTaxCents > 0 || (opts.perMonthCents ?? 0) > 0
  if (!billable) return 'allow'                      // nothing billable — free/DIY lanes ship freely
  if (opts.hasPaymentIntent) return 'verify'         // upfront-checkout order — verify the charge
  if (opts.invoiceLane) return 'allow'               // card checkout shut: ship now, invoice on delivery
  return 'refuse'                                    // money owed, nothing presented → checkout
}

/** The owner-facing refusal message for a blocked bare billable ship. */
export const SHIP_NEEDS_PAYMENT = 'This order needs payment. Place it through checkout to start your campaign.'
