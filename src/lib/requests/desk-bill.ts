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

/**
 * WHO SET THIS PRICE. It decides whether there is a fee inside the number at all.
 *
 *  · 'price_sheet' — the server priced the order from the sheet (priceCreativeRequest, or the
 *    versioned graphic rate card). The 10% fee IS inside the total, by construction, so it can be
 *    taken back out exactly.
 *  · 'staff_quote' — a person typed a number into the admin board. There is no fee inside it; it
 *    is just the price they agreed. Back-solving a 10% split out of it writes a fee into the
 *    ledger that nobody ever charged, and prorates a refund against a subtotal that was never the
 *    price. So the whole quote is the work, and the fee is zero.
 */
export type DeskQuoteOrigin = 'price_sheet' | 'staff_quote'

/**
 * Read the origin off the order's own brief. The order lane stamps `_pricing` when the SERVER
 * priced it; a hand-typed quote never has one. An older row with no stamp reads as a staff quote,
 * which is the safe way round: it books no fee rather than inventing one.
 */
export function deskQuoteOrigin(brief: unknown): DeskQuoteOrigin {
  const p = (brief as { _pricing?: unknown } | null | undefined)?._pricing
  return p && typeof p === 'object' ? 'price_sheet' : 'staff_quote'
}

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
 * A STAFF QUOTE has no fee to invert. Nobody added 10% to it — a person typed the price they
 * agreed — so the whole number is the work and the fee line is zero. Splitting it anyway wrote a
 * fee into the ledger that was never charged and measured refunds against a subtotal that was
 * never the price.
 *
 * Fails to zero, never to a guess: a missing, negative or nonsense total bills nothing.
 *
 * `origin` defaults to 'price_sheet' because that is what this function has always assumed; every
 * real call site passes it, read off the row with deskQuoteOrigin.
 */
export function deskBill(
  totalCents: number | null | undefined,
  cadence: 'once' | 'monthly' | null | undefined,
  origin: DeskQuoteOrigin = 'price_sheet',
): DeskBill {
  const total = Math.max(0, Math.round(Number(totalCents) || 0))
  if (total <= 0) return { subtotalCents: 0, serviceFeeCents: 0, perMonthCents: 0, preTaxCents: 0 }
  if (cadence === 'monthly') {
    return { subtotalCents: 0, serviceFeeCents: 0, perMonthCents: total, preTaxCents: 0 }
  }
  if (origin === 'staff_quote') {
    return { subtotalCents: total, serviceFeeCents: 0, perMonthCents: 0, preTaxCents: total }
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
