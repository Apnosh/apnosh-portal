/**
 * stop-settlement — the words an owner reads about a campaign they stopped, and the money.
 *
 * Two things went wrong with these sentences, and both are about TIME.
 *
 *   · The settlement is written once and then sits on the page forever, so a line in the present
 *     tense ("We refund $56.00. It lands on your card in 5 to 10 days.") is still saying it three
 *     weeks later, when the money has long since landed. Past tense with the day it happened is
 *     true on the day and true a year later.
 *   · Every campaign stopped BEFORE the summary was persisted has no summary at all, so its page
 *     says nothing about the refund that really was sent. The payment row still knows
 *     (refunded_cents / refunded_at), so the line can be derived from it.
 *
 * Pure and client-safe on purpose: the stop route writes these words, the campaign page reads
 * them back, and scripts/sim/refund-math.ts proves them with nothing running.
 */

/**
 * One clock for the day words. The stop route writes this line on the server (Vercel runs in
 * UTC) and the campaign page can derive the same line in the owner's browser; without a fixed
 * zone a refund sent at 7:30 pm Pacific prints "Sep 9" from one path and "Sep 8" from the other.
 * Every Apnosh client is on the US West Coast today, so the day is the Pacific day.
 */
export const SETTLEMENT_TZ = 'America/Los_Angeles'

/** The day words on a settlement, e.g. "Sep 8". Empty for a stamp we cannot read. */
export function stopDayWords(iso: string | null | undefined): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: SETTLEMENT_TZ })
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`

/**
 * "$56.00 went back to your card on Sep 8. It takes 5 to 10 days to show up."
 *
 * Past tense, because the refund was really sent at the moment this is written. The 5 to 10 days
 * is the bank's part and it is still ahead of them, so that half stays in the present.
 */
export function refundSentLine(refundedCents: number, whenISO: string | null | undefined): string {
  const day = stopDayWords(whenISO)
  return day
    ? `${dollars(refundedCents)} went back to your card on ${day}. It takes 5 to 10 days to show up.`
    : `${dollars(refundedCents)} went back to your card. It takes 5 to 10 days to show up.`
}

/** What the payment row knows about a refund, read straight off campaign_payments. */
export interface StoppedPaymentRow {
  totalCents: number
  refundedCents: number
  refundedAt: string | null
}

/**
 * The settlement line for a campaign stopped BEFORE the stop route began persisting one.
 *
 * Derived from the payment row and nothing else, so it can only ever say what the money actually
 * did. It deliberately says less than the real settlement: it knows about the refund, not about
 * what was swept or what still bills, and a short true line beats a silent page. Null when the
 * row has nothing to say, so the page prints nothing rather than a hollow sentence.
 */
export function settlementFromPayment(p: StoppedPaymentRow | null | undefined): string | null {
  if (!p) return null
  if (p.refundedCents > 0) return refundSentLine(p.refundedCents, p.refundedAt)
  if (p.totalCents > 0) return 'Everything you ordered was delivered, so there was nothing to send back.'
  return null
}
