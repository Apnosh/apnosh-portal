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

import type { DestinationId } from './destinations'

export interface RateCard {
  /** false until the designer job-history review sets real numbers. Clients never see placeholders. */
  approved: boolean
  /** Tier bases. The tier is never asked — it derives from design history (Phase C). */
  tierBase: { 1: number; 2: number; 3: number }
  /** Per-destination adder: each extra place is an adaptation priced by its own production
   *  reality (a banner is not a Facebook post). The most expensive picked destination is
   *  included with the design; every other one bills at its own adder, so the total never
   *  depends on tap order. */
  destinationAdder: Record<DestinationId, number>
  /** Carousel posts: the first slide rides the tier base; each extra slide is its own
   *  layout on the same brand and bills this adder. */
  carouselPerSlide: number
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
 * LIVE by owner call (2026-08-09): pricing is included at order time, no quote round
 * trip. These are the first-pass numbers; each is one line to change on the owner's word.
 */
export const RATE_CARD: RateCard = {
  approved: true,
  tierBase: { 1: 75, 2: 175, 3: 400 },
  destinationAdder: {
    'instagram-post': 35,
    'instagram-story': 35,
    'facebook-post': 35,
    'google-listing': 35,
    'email-header': 35,
    'printed-flyer': 45,
    'table-tent': 45,
    'menu-board': 55,
    poster: 55,
    'gift-card': 65,
    banner: 85,
  },
  carouselPerSlide: 30,
  photoSourcing: 60,
  printManagement: 50,
  rushMultiplier: 1.5,
  rushWindowHours: 72,
  includedRevisions: 2,
}
