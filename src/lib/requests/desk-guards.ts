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

/** The two sides of the till. A payment belongs to exactly one of them, forever. */
export type PaymentLane = 'campaign' | 'desk'

/** The payment row's own two pointers (campaign_payments). Either one, never both. */
export interface PaymentRowSides {
  /** campaign_payments.request_id — written by /api/checkout/prepare when the intent was made. */
  requestId?: string | null
  /** campaign_payments.campaign_id — bound at ship, or already bound by an earlier ship. */
  campaignId?: string | null
}

/** What the Stripe intent itself says it was made for (metadata written by /api/checkout/prepare). */
export interface IntentSides {
  /** metadata.kind — one of the four below. */
  kind?: string | null
  /** metadata.requestId — a desk intent names its order; a campaign intent never does. */
  requestId?: string | null
}

/** The kinds /api/checkout/prepare stamps on a DESK intent (one-time card, then card-on-file). */
export const DESK_INTENT_KINDS = ['desk_checkout', 'desk_checkout_setup']
/** The kinds it stamps on a CAMPAIGN cart intent. */
export const CAMPAIGN_INTENT_KINDS = ['campaign_checkout', 'campaign_checkout_setup']

/**
 * May THIS payment be spent on THIS order, on THIS side of the till?
 *
 * The order id always arrives from the browser, so without this the answer used to be "any settled
 * payment on the account will do". Two ways that was free work:
 *   • desk lane — one card charge could deliver two orders, and the row's request_id was rewritten
 *     to match, so the first order's receipt then named the second
 *   • campaign lane — a paid DESK payment (its campaign_id null forever) passed the campaign's own
 *     verify and shipped a whole campaign for nothing
 *
 * So the row and Stripe must ALREADY agree, on both pointers and on the kind. Nothing is repaired,
 * defaulted or written to make them agree. Pure: the row and the intent are read by the caller.
 */
export function paymentMatchesLane(row: PaymentRowSides, pi: IntentSides, lane: PaymentLane, id: string): boolean {
  if (!id) return false
  const rowRequestId = row.requestId ?? null
  const rowCampaignId = row.campaignId ?? null
  const intentRequestId = pi.requestId ?? null
  const kind = pi.kind ?? ''
  if (lane === 'desk') {
    if (rowRequestId !== id) return false
    if (rowCampaignId != null) return false                 // a campaign checkout is never a desk order's payment
    if (!DESK_INTENT_KINDS.includes(kind)) return false
    return intentRequestId === id
  }
  // Campaign lane, the exact mirror. A desk row's money can never buy a campaign, and a payment
  // already spent on one campaign can never ship a second — but the SAME campaign is fine, because
  // /checkout/complete and the ship PATCH both land here and both must be idempotent.
  if (rowRequestId != null) return false
  if (rowCampaignId != null && rowCampaignId !== id) return false
  if (!CAMPAIGN_INTENT_KINDS.includes(kind)) return false
  return intentRequestId == null                            // a campaign intent never names an order
}

/**
 * May this payment finish THIS desk order? The desk lane's name for `paymentMatchesLane`.
 *
 * Kept because the desk route and its sim read in these words; the rule itself is the shared one,
 * so the two lanes cannot drift apart again.
 */
export function deskPaymentMatchesOrder(claim: DeskPaymentClaim, requestId: string): boolean {
  return paymentMatchesLane(
    { requestId: claim.rowRequestId, campaignId: claim.rowCampaignId },
    { kind: claim.intentKind, requestId: claim.intentRequestId },
    'desk',
    requestId,
  )
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
 * The owner said yes to a PERSON'S quote. Does that yes go to the till, or straight to work?
 *
 * To the till, whenever the quote asks for money. This lane was the last free work left in the
 * desk: the yes minted a work order on the spot and the money was "on delivery", which is a
 * promise with nobody holding it and no row anywhere that says it is owed. One yes, one card,
 * the same desk checkout the owner's own orders use.
 *
 * A quote of ZERO still mints on the yes, because there is nothing to pay: a fix we owe, a piece
 * we are comping. That is the one place the desk gives work away, and it is a decision a person
 * made when they wrote the quote, not a hole in the till.
 */
export function acceptGoesToTill(quoteCents: number | null | undefined): boolean {
  return typeof quoteCents === 'number' && Number.isFinite(quoteCents) && quoteCents > 0
}

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
