/**
 * The checkout bill math — the ONE place the one-time subtotal + service fee are computed,
 * shared by the checkout UI (display) and the server routes (the authoritative charge) so the
 * number the owner sees is exactly the number their card is charged (plus Stripe-computed tax).
 *
 * Pure + client-safe (only imports the pure `summarize`); no Stripe, no DB, no `new Date`.
 * All amounts returned in integer CENTS.
 */
import { summarize, type CampaignDraft } from './types'

/** Flat service fee on the one-time subtotal. Mirrors the 10% shown in the cart order summary. */
export const SERVICE_FEE_RATE = 0.1

/**
 * THE ONE FEE FUNCTION. Everywhere a total is shown or charged — the cart, the Request Desk price
 * sheet, the create-page estimates — the fee comes from here, so no two screens can drift.
 *
 * The rule, decided once: 10% on the ONE-TIME subtotal, never on a monthly price. The cart is the
 * till and the cart has always worked this way; the desk sheet used to run its own copy of the
 * arithmetic and put the fee on monthly post packages too, which meant two different prices for
 * the same 10%.
 */
export function feeCentsOn(subtotalCents: number): number {
  return Math.round(Math.max(0, subtotalCents || 0) * SERVICE_FEE_RATE)
}

export interface CheckoutBill {
  /** One-time items subtotal (what the plan's non-recurring lines cost), in cents. */
  subtotalCents: number
  /** 10% service fee on the subtotal, in cents. */
  serviceFeeCents: number
  /** Recurring monthly total, in cents — shown on the bill, NOT charged at checkout. */
  perMonthCents: number
  /** subtotal + service fee, in cents. Tax is added on top by the server (Stripe Tax). */
  preTaxCents: number
  /** A friend credit taken off this bill, in cents. Absent on every bill that has none. */
  friendCreditCents?: number
}

/** Compute the checkout bill (pre-tax) from a composed campaign draft. */
export function checkoutBill(draft: Pick<CampaignDraft, 'items'>): CheckoutBill {
  const bill = summarize(draft.items)
  const subtotalCents = Math.round(bill.oneTimeOnDelivery * 100)
  const serviceFeeCents = feeCentsOn(subtotalCents)
  const perMonthCents = Math.round(bill.perMonth * 100)
  return { subtotalCents, serviceFeeCents, perMonthCents, preTaxCents: subtotalCents + serviceFeeCents }
}

/**
 * THE FRIEND CREDIT, ON THE BILL (Move 8). A referred owner starts with money off their first
 * paid order, and this is the only place that decides what that does to the numbers.
 *
 * WHERE THE LINE SITS: above the service fee and above the tax. "Friend credit −$50" comes off
 * the items subtotal, and the 10% fee and Stripe's tax are then worked out on what is left. So a
 * $500 plan with a $50 credit is $450 of work, $45 of fee, and tax on $495 — the owner is not
 * charged a fee on money we gave them, and the tax is on what they actually paid. The alternative
 * (fee and tax on the full $500, credit taken off at the end) was rejected for exactly that: it
 * bills a fee on a discount, and it quietly makes the credit worth less than the $50 we said.
 *
 * Never below zero, never bigger than the subtotal: a credit larger than the order takes the
 * bill to $0 and the REST STAYS on the credit row for next time (client_credits.consumed_cents),
 * because the alternative is handing back change in cash.
 *
 * subtotalCents IS LEFT ALONE ON PURPOSE. It is what the delivered work is measured against when
 * an order is stopped (refundOwedCents in refund-math.ts prorates delivered item prices against
 * it). Shrinking it by the credit would make a fully delivered order look over-delivered and
 * quietly zero out refunds. The credit rides in its own field, and preTaxCents — the number the
 * card is actually charged, before tax — is the one that comes down.
 *
 * Pure. The PaymentIntent is created from the preTaxCents this returns, so the number the owner
 * reads and the number the card is charged are the same number.
 */
export function applyFriendCredit(bill: CheckoutBill, creditCents: number): CheckoutBill {
  const credit = Math.min(Math.max(0, Math.round(creditCents || 0)), Math.max(0, bill.subtotalCents))
  if (credit <= 0) return bill
  const billableCents = bill.subtotalCents - credit
  const serviceFeeCents = feeCentsOn(billableCents)
  return {
    ...bill,
    serviceFeeCents,
    preTaxCents: billableCents + serviceFeeCents,
    friendCreditCents: credit,
  }
}

/** "$1,180.00" — the one money format the checkout screens print. */
export function fmtMoney(cents: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format((cents || 0) / 100)
}

/**
 * The monthly line, said the way the card is really billed.
 *
 * The subscription runs Stripe Tax (startCampaignSubscription), so "$99/mo" on its own is short by
 * the tax every single month — and that short number was on the bill card, in the sentence under it
 * AND in the consent tick the owner has to agree to. One function writes all three so they cannot
 * drift apart again.
 *
 * `monthlyTaxCents` is an ESTIMATE from Stripe Tax:
 *   null → no answer (no tax location on the customer, Tax off, Stripe unreachable). Say "plus
 *          tax": true, and never a number we did not get.
 *   0    → Stripe really said "no tax here". Say nothing extra.
 */
export function monthlyPhrase(monthlyCents: number, monthlyTaxCents: number | null | undefined): string {
  if (monthlyTaxCents == null) return `${fmtMoney(monthlyCents)}/mo plus tax`
  if (monthlyTaxCents <= 0) return `${fmtMoney(monthlyCents)}/mo`
  return `${fmtMoney(monthlyCents)}/mo plus ${fmtMoney(monthlyTaxCents)} tax`
}
