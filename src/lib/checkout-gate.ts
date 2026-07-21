/**
 * The kill switch for taking money through the campaign checkout.
 *
 * WHY THIS EXISTS. One Stripe key serves this whole app, so the app is either live
 * or in test mode, never both. That put two things in conflict: admin invoicing is an
 * established revenue path that needs LIVE keys to bill a real client, while the
 * campaign checkout is new and was deliberately kept on test keys so it could not
 * take a real payment before it had been trusted.
 *
 * Rather than pick one, this separates "which Stripe account" from "may this surface
 * charge anyone". Keys can go back to live so invoicing works, while the checkout
 * stays shut until it is deliberately opened.
 *
 * FAIL CLOSED. The flag must be exactly 'true' to open the checkout. Anything else,
 * including unset, a typo, or an empty string, keeps it shut. A money path should
 * never open because a variable was misspelled.
 *
 * Enforced on the SERVER in every checkout route, not in the UI, so hiding a button
 * is not what stands between a client and a charge.
 */
export function campaignCheckoutEnabled(): boolean {
  return process.env.CAMPAIGN_CHECKOUT_ENABLED === 'true'
}

/** The plain-language refusal, shared by every checkout route so they agree. */
export const CHECKOUT_CLOSED_MESSAGE =
  'Card checkout is not open yet. Your plan is saved, and your team will send an invoice for this.'
