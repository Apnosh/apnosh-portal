/**
 * The two rules that decide whether a desk order may be paid, and whether it may start.
 *
 * They live here, apart from the routes that enforce them, because both are pure decisions over a
 * row and both are money: one says WHICH payment may finish an order, the other says an order that
 * was never paid for may not be turned into work. A rule spread across two routes drifts; a rule
 * with no test drifts silently. Everything here is pure + client-safe (no Stripe, no DB, no clock)
 * so `npx tsx scripts/sim/desk-till.ts` proves every case with nothing running.
 */

/** What the payment row and the Stripe intent say about who a charge belongs to. */
export interface DeskPaymentClaim {
  /** campaign_payments.request_id — written by /api/checkout/prepare when the intent was made. */
  rowRequestId?: string | null
  /** campaign_payments.campaign_id — a campaign checkout is never a desk order's payment. */
  rowCampaignId?: string | null
  /** The intent's own metadata.kind: 'desk_checkout' | 'desk_checkout_setup'. */
  intentKind?: string | null
  /** The intent's own metadata.requestId. */
  intentRequestId?: string | null
}

/**
 * May this payment finish THIS desk order?
 *
 * The order id arrives in the request body, so without this the answer used to be "any settled
 * payment on the account will do" — and the row's request_id was then overwritten to match, so one
 * card charge could deliver two orders and the first order's receipt named the second.
 *
 * Both sides must already say the same thing. Nothing is repaired, defaulted or written to make
 * them agree.
 */
export function deskPaymentMatchesOrder(claim: DeskPaymentClaim, requestId: string): boolean {
  if (!requestId) return false
  if ((claim.rowRequestId ?? null) !== requestId) return false
  if (claim.rowCampaignId != null) return false
  const kind = claim.intentKind ?? ''
  if (kind !== 'desk_checkout' && kind !== 'desk_checkout_setup') return false
  return (claim.intentRequestId ?? null) === requestId
}

/** The status an owner-placed desk order lands in: priced, saved, and waiting for the card. */
export const AWAITING_PAYMENT = 'awaiting_payment'

/** What the accept route needs to know about a request before it mints work from it. */
export interface DeskAcceptRow {
  status?: string | null
  /** creative_requests.paid_at — set by finalizePaidDeskOrder on the far side of the charge. */
  paidAt?: string | null
  /** True when a campaign_payments row exists for this request but none of them collected. */
  unpaidTillRow?: boolean
}

/**
 * Is money still owed before this order may become work?
 *
 * Two shapes of desk order, told apart by WHO priced it:
 *   • the owner placed it and the till priced it → it lands 'awaiting_payment' and pays first
 *   • a person quoted it → it lands 'quoted' and the owner's yes is what starts it
 *
 * The second one is the accept path and stays exactly as it was. The first must never reach it: an
 * unpaid order that mints work is free work, which is how the desk ran for months. The till-row
 * check is the belt on top of the braces — a 'quoted' row with a payment started and never
 * collected is the same unpaid order under a different status.
 */
export function deskPaymentDue(row: DeskAcceptRow): boolean {
  if (row.paidAt) return false
  if ((row.status ?? '') === AWAITING_PAYMENT) return true
  return row.unpaidTillRow === true
}

/** The one code the screen keys on to show "Pay to start" instead of an error. */
export const DESK_NEEDS_PAYMENT = 'DESK_NEEDS_PAYMENT'

/**
 * May the owner still cancel this order themselves?
 *
 * ONLY BEFORE IT LANDS. Once the work is delivered the thing exists — somebody made it — and
 * cancelling is a conversation with a person, not a button. Both halves are asked because either
 * can be ahead of the other: the request row's own status, and the work order that makes the thing.
 *
 * Pure so the screen and the route cannot drift into showing a button the server refuses.
 */
export function deskCancelable(status: string | null | undefined, workOrderStatus?: string | null): boolean {
  const s = String(status ?? '')
  if (['delivered', 'closed', 'declined'].includes(s)) return false
  if (['delivered', 'approved', 'done'].includes(String(workOrderStatus ?? ''))) return false
  return ['requested', 'in_review', 'quoted', AWAITING_PAYMENT, 'in_progress'].includes(s)
}
