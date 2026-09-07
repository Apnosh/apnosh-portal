/**
 * The desk order's bill, in the shape the till understands.
 *
 * The cart computes its bill from line items (checkoutBill). A desk order does not have line
 * items — it has ONE number, `creative_requests.quote_cents`, which the server computed at order
 * time with priceCreativeRequest and which ALREADY INCLUDES the 10% service fee. The payment row
 * keeps subtotal and fee apart (the refund math divides by the subtotal), so the one number has to
 * be split back into the two it was made from.
 *
 * The authoritative amount is the stored quote, not a fresh price. A graphic order is priced from
 * a versioned rate card and its version is snapshotted on the brief; re-pricing at pay time could
 * charge a different number than the order the owner placed. The stored number is the order.
 *
 * Pure + client-safe (no Stripe, no DB, no clock), so `npx tsx scripts/sim/desk-till.ts` can prove
 * every case before any money moves. All amounts in integer CENTS.
 */
import { SERVICE_FEE_RATE, feeCentsOn } from '@/lib/campaigns/checkout-bill'

export interface DeskBill {
  /** The work itself, in cents — what a refund is measured against. */
  subtotalCents: number
  /** The 10% service fee that was inside the quoted total. */
  serviceFeeCents: number
  /** A monthly desk line (social posting), charged by subscription, never at checkout. */
  perMonthCents: number
  /** subtotal + fee — what the card is charged today, before Stripe Tax. */
  preTaxCents: number
}

/**
 * Split a desk order's stored, fee-inclusive total into the bill.
 *
 * MONTHLY orders carry NO fee. That is not a special case invented here — it is the one fee rule
 * (checkout-bill.ts): 10% on the one-time subtotal, never on a monthly price. priceCreativeRequest
 * already leaves monthly lines out of the fee base, so a monthly total is the monthly price and
 * nothing else, and nothing is charged today: the subscription bills it.
 *
 * ONE-TIME orders invert the fee exactly. The quote was built as `s + round(s * 0.1)`, so we look
 * for the s that reproduces the stored total and take the fee as the remainder — subtotal + fee
 * always equals what the card is charged, by construction, whatever rounding did.
 *
 * Fails to zero, never to a guess: a missing, negative or nonsense total bills nothing.
 */
export function deskBill(totalCents: number | null | undefined, cadence: 'once' | 'monthly' | null | undefined): DeskBill {
  const total = Math.max(0, Math.round(Number(totalCents) || 0))
  if (total <= 0) return { subtotalCents: 0, serviceFeeCents: 0, perMonthCents: 0, preTaxCents: 0 }
  if (cadence === 'monthly') {
    return { subtotalCents: 0, serviceFeeCents: 0, perMonthCents: total, preTaxCents: 0 }
  }
  // The s the quote was built from. round(total / 1.1) lands on it or within one cent of it; the
  // scan makes that exact rather than nearly right.
  const guess = Math.round(total / (1 + SERVICE_FEE_RATE))
  let subtotal = guess
  for (const s of [guess, guess + 1, guess - 1, guess + 2, guess - 2]) {
    if (s >= 0 && s + feeCentsOn(s) === total) { subtotal = s; break }
  }
  subtotal = Math.min(Math.max(0, subtotal), total)
  return {
    subtotalCents: subtotal,
    // The remainder, not a recomputed fee: the two halves must add to the charge.
    serviceFeeCents: total - subtotal,
    perMonthCents: 0,
    preTaxCents: total,
  }
}

/**
 * The sentence the desk prints for what is charged today, from the same bill.
 *
 * A monthly order takes NOTHING today — the card is saved and the subscription starts. Saying
 * "$320 today" there would be a charge that never happens.
 */
export function deskChargedTodayCents(bill: DeskBill): number {
  return bill.preTaxCents
}
