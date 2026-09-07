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
}

/** Compute the checkout bill (pre-tax) from a composed campaign draft. */
export function checkoutBill(draft: Pick<CampaignDraft, 'items'>): CheckoutBill {
  const bill = summarize(draft.items)
  const subtotalCents = Math.round(bill.oneTimeOnDelivery * 100)
  const serviceFeeCents = feeCentsOn(subtotalCents)
  const perMonthCents = Math.round(bill.perMonth * 100)
  return { subtotalCents, serviceFeeCents, perMonthCents, preTaxCents: subtotalCents + serviceFeeCents }
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
