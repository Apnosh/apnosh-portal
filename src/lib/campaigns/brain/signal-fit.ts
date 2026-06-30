/**
 * signal-fit — the cold-start tailoring term.
 *
 * The gap it closes: before any campaign has run, a business has no working/dropped history, so the
 * objective function fell back to the seeded prior and every restaurant chasing the same goal got the
 * same expert default. But an onboarded business already tells us a lot — its Google rating, whether
 * its listing is complete, whether it has an email list, its price band, its complaint themes. This
 * module turns those PRESENT signals into a small, bounded nudge on each play, so a low-rated spot
 * leads its "give a reason" step with reviews, a listless spot builds capture before it sends, a
 * half-finished listing gets fixed first — all WITHOUT any campaign history.
 *
 * Honest by construction: every rule is gated on usable(), so a missing signal contributes exactly
 * 0 (a fresh, blank business still gets today's default — proven in scripts/verify-signal-fit.ts).
 * Bounded by construction: the total nudge is clamped to [-80, +130], two orders of magnitude below
 * the proven-loser pit (-10000) and below the crucial floor (+1000), so it reorders the optional
 * plays and the lead-of-stage but can never resurrect a flop or break the spine.
 *
 * Catalog-driven: a play's role is classified from metadata already on every AtomPlay (atom, track
 * channel, stage), with a few documented serviceId fallbacks where intent isn't expressible in
 * metadata (reviews, listings naming, the capture-build surfaces). A new review-* or gbp-* service
 * classifies itself; no per-rule id list to drift.
 *
 * Pure, no IO.
 */
import type { AtomPlay } from '../data/atom-plays'
import type { BrainSignals } from './signals'
import { usable } from './readiness'

/** What a play is for, from the owner's point of view — the axis the cold-start signals act on. */
export type FitClass =
  | 'reputation'    // reviews / rating repair (review-engine, review-responses)
  | 'discovery'     // Google / listings / local SEO (gbp-*, listings-sync, local-seo)
  | 'content'       // photos / video (photo-library, video-engine)
  | 'paid'          // paid reach / sampling / creator (paid-ads, street-sampling, creator-collab)
  | 'capture-build' // surfaces that START a list (capture-kit, landing-page, crm-list)
  | 'capture-send'  // automated sends that NEED a list (welcome-seq, second-visit, email/text blasts)
  | 'other'

/** Classify a play from metadata already on it. Atom + channel resolve most classes cleanly; the
 *  documented serviceId fallbacks cover intent the catalog metadata can't express on its own. */
export function classifyPlay(p: AtomPlay): FitClass {
  const ch = p.track.channel
  const atom = p.atom
  const id = p.serviceId
  // Paid reach / field sampling / creator partnerships.
  if (atom === 'paid-ads' || atom === 'field-event' || atom === 'source-partner' || ch === 'ads') return 'paid'
  // Photo / video production.
  if (atom === 'shoot' || atom === 'edit-media' || ch === 'content') return 'content'
  // Reviews (give-reason plays named review-*; fallback because "reputation" isn't a catalog field).
  // Exclude listing/claim tasks: review-claim is "claim your Yelp/TripAdvisor listing", which is a
  // discovery/listing fix, not a reputation play — even though its id contains "review".
  if (id.includes('review') && atom !== 'claim-listing' && atom !== 'listing-update') return 'reputation'
  // Google / listings / local SEO (gbp channel + the listing atoms; id fallback for naming).
  if (ch === 'gbp' || atom === 'listing-update' || atom === 'claim-listing' || id.includes('local-seo') || id.includes('listings')) return 'discovery'
  // Automated message sequences + blasts need a list to be worth anything.
  if (atom === 'build-automation' || atom === 'send-blast') return 'capture-send'
  // The surfaces that begin a list (no single atom expresses "starts a list", so name them).
  if (id === 'capture-kit' || id === 'landing-page' || id === 'crm-list') return 'capture-build'
  return 'other'
}

/** Complaint-theme repair lanes: free-text themes have no catalog field to derive from, so this is
 *  the one small, deliberate map (string-contains, high-confidence only — a miss simply doesn't fire). */
const THEME_REPAIR: { match: string[]; cls: FitClass }[] = [
  { match: ['photo', 'menu', 'pic', 'look'], cls: 'content' },
  { match: ['review', 'rude', 'service', 'staff', 'wait'], cls: 'reputation' },
]

const TOTAL_MIN = -80
const TOTAL_MAX = 130

/** The signed nudge for one play given the business's PRESENT signals, plus the owner-facing reason
 *  for the dominant rule that moved it. Empty/missing signals → { delta: 0 }. */
export function signalFit(play: AtomPlay, signals: BrainSignals): { delta: number; reason?: string } {
  const cls = classifyPlay(play)
  let delta = 0
  let topMag = 0
  let reason: string | undefined
  const fire = (d: number, why: string) => {
    delta += d
    if (Math.abs(d) > topMag) { topMag = Math.abs(d); reason = why }
  }

  // R1/R2 — rating drives reputation.
  if (usable(signals.rating) && cls === 'reputation') {
    const r = signals.rating.value
    if (r < 4.3) {
      const boost = r <= 3.8 ? 50 : r < 4.0 ? 40 : r < 4.2 ? 30 : 15
      fire(boost, `Led with reviews because your rating is ${r.toFixed(1)}, below the 4.3 norm.`)
    } else if (r >= 4.6 && usable(signals.ratingCount) && signals.ratingCount.value >= 40) {
      fire(-25, `Reviews are already strong at ${r.toFixed(1)}, so the effort goes to reach.`)
    }
  }

  // R3/R4 — listing completeness drives discovery.
  if (usable(signals.listingCompleteness) && cls === 'discovery') {
    const c = signals.listingCompleteness.value
    if (c <= 0.7) {
      const boost = c < 0.4 ? 45 : c < 0.6 ? 30 : 20
      fire(boost, `Fixed your Google listing first because it is ${Math.round(c * 100)}% complete.`)
    } else if (c >= 0.9) {
      fire(-20, 'Your listing is in good shape, so we lead elsewhere.')
    }
  }

  // R5/R6 — having a list decides build-vs-send of the capture step.
  if (usable(signals.hasList)) {
    if (signals.hasList.value === true && cls === 'capture-send') {
      fire(30, 'You have a list, so we put it to work sooner.')
    } else if (signals.hasList.value === false) {
      if (cls === 'capture-build') fire(35, 'No list yet, so we build the capture page before any sends.')
      if (cls === 'capture-send') fire(-40, 'No list yet, so sends wait until there is one to send to.')
    }
  }

  // R7 — a recurring complaint theme pulls its repair lane forward.
  if (usable(signals.complaintThemes)) {
    const themes = signals.complaintThemes.value.map((t) => t.toLowerCase())
    for (const lane of THEME_REPAIR) {
      if (cls === lane.cls && themes.some((t) => lane.match.some((m) => t.includes(m)))) {
        const hit = themes.find((t) => lane.match.some((m) => t.includes(m)))
        fire(40, `Your reviews mention ${hit}, so we handled that first.`)
        break
      }
    }
  }

  // R8/R9 — price band tilts craft (content) vs volume (paid).
  if (usable(signals.priceRange)) {
    const dollars = (signals.priceRange.value.match(/\$/g) ?? []).length
    if (dollars >= 3) {
      if (cls === 'paid') fire(-25, 'Fine dining wins on craft, so great photos lead over paid blasts.')
      if (cls === 'content') fire(20, 'Fine dining wins on craft, so great photos lead.')
    } else if (dollars === 1) {
      if (cls === 'paid') fire(25, 'A value spot wins on volume, so paid reach and sampling lead.')
    }
  }

  // R10 — a lean budget deprioritizes expensive paid reach.
  if (usable(signals.monthlyBudget) && signals.monthlyBudget.value < 250 && cls === 'paid') {
    fire(-30, 'On a lean budget we skip paid and lead with free, high-ROI moves.')
  }

  delta = Math.max(TOTAL_MIN, Math.min(TOTAL_MAX, delta))
  return reason ? { delta, reason } : { delta }
}

/** The STRONG headline: emitted only when the plan's actual LEAD move's class matches a present
 *  signal. So "Led with reviews" can only appear when a reputation play truly leads the plan — never
 *  on a plan whose first move is something else. Null otherwise. (compose-plan.planLeadHeadline
 *  passes the real lead's class; it knows the composed order.) */
export function leadHeadline(leadClass: FitClass, signals: BrainSignals): string | null {
  if (leadClass === 'reputation' && usable(signals.rating) && signals.rating.value < 4.3)
    return `Led with reviews because your rating is ${signals.rating.value.toFixed(1)}, below the 4.3 norm.`
  if (leadClass === 'discovery' && usable(signals.listingCompleteness) && signals.listingCompleteness.value <= 0.7)
    return `Started with your Google listing because it is ${Math.round(signals.listingCompleteness.value * 100)}% complete.`
  if (leadClass === 'capture-build' && usable(signals.hasList) && signals.hasList.value === false)
    return 'Built your capture page first because you do not have a list yet.'
  if (leadClass === 'content' && usable(signals.complaintThemes) && signals.complaintThemes.value.some((t) => /photo|menu|pic/i.test(t)))
    return 'Led with fresh photos because your reviews call them out.'
  return null
}

/** The SOFTER headline: when the signal-driven class isn't the overall lead but a play of that class
 *  IS present in this plan and got pulled forward. Honest "moved earlier", never "led", and never
 *  names a class the plan doesn't contain. The caller passes which classes are present. */
export function movedHeadline(signals: BrainSignals, present: { reputation: boolean; captureBuild: boolean }): string | null {
  if (present.reputation && usable(signals.rating) && signals.rating.value < 4.3)
    return `Moved reviews earlier because your rating is ${signals.rating.value.toFixed(1)}, below the 4.3 norm.`
  if (present.captureBuild && usable(signals.hasList) && signals.hasList.value === false)
    return 'Put building your list first because you do not have one yet.'
  return null
}
