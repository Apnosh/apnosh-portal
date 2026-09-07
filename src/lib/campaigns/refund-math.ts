/**
 * Refund math — the ONE place we decide how much of a prepaid campaign goes back to the owner.
 *
 * Pure (no Stripe, no DB, no clock) so the number can be proved by a script before any money
 * moves: `npx tsx scripts/sim/refund-math.ts`.
 *
 * All amounts in integer CENTS.
 */

/** The bill as the card was actually charged, plus anything already sent back. */
export interface PaidBill {
  /** What the card was charged: one-time subtotal + service fee + tax. */
  totalCents: number
  /** The one-time items subtotal (the part the delivered work is measured against). */
  subtotalCents: number
  /** Already refunded on this charge. */
  refundedCents: number
}

/**
 * What we owe back when a prepaid campaign stops with work still undelivered.
 *
 * `deliveredCents` is the sum of the campaign's delivered charge rows — the raw item prices of the
 * pieces and services that actually landed. The owner did not only pay item prices, though: they
 * paid the service fee and the tax on top. So the delivered work's share of the PAID TOTAL is its
 * item price grossed up by the same fee + tax rate the owner paid, and the refund is everything
 * else. That keeps the fee and the tax on work we really did, and sends back all of it on work we
 * did not.
 *
 * Fails CLOSED at every edge: no total, no subtotal, or more delivered than was ever bought all
 * return 0. A refund is never larger than what is still refundable on the charge.
 */
export function refundOwedCents(bill: PaidBill, deliveredCents: number): number {
  const total = Math.max(0, Math.round(bill.totalCents || 0))
  const subtotal = Math.max(0, Math.round(bill.subtotalCents || 0))
  const already = Math.max(0, Math.round(bill.refundedCents || 0))
  const delivered = Math.max(0, Math.round(deliveredCents || 0))
  if (total <= 0) return 0
  // No one-time subtotal on the row (a monthly-only order) → nothing one-time was prepaid to
  // prorate. Treat the whole charge as accounted for rather than guessing a refund.
  if (subtotal <= 0) return 0
  const deliveredShare = Math.min(total, Math.round(delivered * (total / subtotal)))
  return Math.max(0, total - already - deliveredShare)
}

/** How much of a charge is still refundable at all (never more than was paid). */
export function refundableCents(bill: PaidBill): number {
  const total = Math.max(0, Math.round(bill.totalCents || 0))
  const already = Math.max(0, Math.round(bill.refundedCents || 0))
  return Math.max(0, total - already)
}

/** The payment row's status after a refund of `refundedCents` against `totalCents`. */
export function refundStatus(totalCents: number, refundedCents: number): 'paid' | 'partially_refunded' | 'refunded' {
  if (refundedCents <= 0) return 'paid'
  return refundedCents >= Math.max(0, Math.round(totalCents || 0)) ? 'refunded' : 'partially_refunded'
}

/**
 * The statuses that mean MONEY WAS COLLECTED and the campaign is still running.
 *
 * 'paid'               — nothing has gone back.
 * 'partially_refunded' — some went back (one piece credited); the rest of the order stands and the
 *                        work continues, so the checkout still covers it. Reading only 'paid' meant
 *                        a $1 credit hid the whole receipt and made every piece delivered afterwards
 *                        accrue as invoiceable — a second bill for work already paid for.
 * 'disputed'           — the bank is holding the money while it decides. The charge is real until
 *                        the dispute closes; a chargeback must not silently re-bill the owner.
 *
 * 'refunded' (in full) is deliberately NOT here: a full refund only ever happens with the campaign
 * stopped, so there is nothing left to cover.
 */
export const COLLECTED_STATUSES = ['paid', 'partially_refunded', 'disputed'] as const

/**
 * Collected money that is also UNCONTESTED: the charge is ours to give back. Used where the
 * question is "can we still refund against this?" — a disputed charge is excluded because the bank
 * has already pulled the money and refunding it again would send it twice.
 */
export const SETTLED_STATUSES = ['paid', 'partially_refunded'] as const

/**
 * The status a payment row goes back to when a chargeback is WON.
 *
 * Not blindly 'paid': the row may have been partly refunded before the dispute was opened, and
 * winning the dispute does not un-refund that. It is refundStatus's own answer for what has
 * actually gone back.
 */
export function statusAfterDisputeWon(totalCents: number, refundedCents: number): 'paid' | 'partially_refunded' | 'refunded' {
  return refundStatus(totalCents, refundedCents)
}
