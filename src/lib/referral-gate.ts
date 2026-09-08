/**
 * The kill switch for the referral loop.
 *
 * WHY THIS EXISTS. A referral is a promise made in an owner's own name to somebody who trusts
 * them. The plan's law is that we may not ask for it until we have kept a promise to the owner
 * first, and on the day this was built the count of kept-and-counted promises was not yet what it
 * needs to be. So the whole loop — the Home card, the page, the public owner page, the credit line
 * at checkout, the payout cron — is written, tested, and SHUT.
 *
 * FAIL CLOSED, exactly like campaignCheckoutEnabled next door in checkout-gate.ts: the flag must
 * be the string 'true'. Unset, empty, 'TRUE', a typo — all of them keep it shut. This one gives
 * money away, so it is never opened by a misspelling.
 *
 * With it off there is ZERO owner-facing change: no card on Home, no route that answers, no credit
 * line on any bill, no row written. scripts/sim/referral.ts proves that claim.
 *
 * Enforced on the SERVER in every referral route and in the cron, never only in the UI.
 */
export function referralsEnabled(): boolean {
  return process.env.REFERRALS_ENABLED === 'true'
}

/** The plain refusal every referral route shares, so they cannot drift apart. */
export const REFERRALS_CLOSED_MESSAGE =
  'Tell a friend is not open yet.'
