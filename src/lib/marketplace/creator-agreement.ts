/**
 * The current Creator Agreement version. Recorded (with a timestamp) on the vendor when a creator
 * accepts it at signup, so there's a durable record of who agreed to what and when. Bump this string
 * whenever the agreement text at /creator-terms changes materially, so acceptances stay attributable
 * to a specific version. Plain module (no server-only) so the page and the onboarding core can share it.
 */
export const CREATOR_AGREEMENT_VERSION = '2026-07-23'
export const CREATOR_AGREEMENT_EFFECTIVE = 'July 23, 2026'
