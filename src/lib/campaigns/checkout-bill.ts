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
  const serviceFeeCents = Math.round(subtotalCents * SERVICE_FEE_RATE)
  const perMonthCents = Math.round(bill.perMonth * 100)
  return { subtotalCents, serviceFeeCents, perMonthCents, preTaxCents: subtotalCents + serviceFeeCents }
}
