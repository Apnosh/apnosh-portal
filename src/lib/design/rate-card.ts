/**
 * THE RATE CARD — every dollar the design configurator can charge, in one config file
 * (docs/DESIGN-ORDERING spec, Phase A).
 *
 * Amounts are CONFIG, not code: they will be set from the designer's job-history review
 * (tier tagging + hours + revision counts on the last 15-20 jobs) and are expected to change.
 *
 * THE APPROVAL GATE, encoded: `approved: false` means every amount below is a PLACEHOLDER.
 * The owner rule is that placeholder prices never go in front of clients — Phase B's UI must
 * refuse to render the price panel for clients while this is false, and the sim pins that the
 * flag exists and starts false. Flip it only in the commit that lands the reviewed numbers.
 */

export interface RateCard {
  /** false until the designer job-history review sets real numbers. Clients never see placeholders. */
  approved: boolean
  /** Tier bases. The tier is never asked — it derives from design history (Phase C). */
  tierBase: { 1: number; 2: number; 3: number }
  /** Each destination beyond the first is an adaptation of the approved design. */
  perDestination: number
  /** We find or license usable photos when nothing in the client's library clears the gate. */
  photoSourcing: number
  /** We run the print job end to end. Printing cost itself passes through at cost. */
  printManagement: number
  /** Multiplier applied to the design subtotal when the client confirms a rush date. */
  rushMultiplier: number
  /** Hours before the due date inside which a job is a rush. Configurable 48-72 per spec. */
  rushWindowHours: number
  /** Included revision rounds; round 3+ bills. Stated at the copy-confirm moment and at review. */
  includedRevisions: number
}

/**
 * PLACEHOLDERS. Deliberately round, deliberately wrong-ish, so nobody mistakes them for
 * reviewed prices. Replace from the job-history review, then flip `approved`.
 */
export const RATE_CARD: RateCard = {
  approved: false,
  tierBase: { 1: 75, 2: 175, 3: 400 },
  perDestination: 35,
  photoSourcing: 60,
  printManagement: 50,
  rushMultiplier: 1.5,
  rushWindowHours: 72,
  includedRevisions: 2,
}
