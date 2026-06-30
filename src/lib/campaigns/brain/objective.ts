/**
 * The objective function — what makes a plan "best" instead of merely tidy.
 *
 * The audit's core finding: the owner's desired RESULT steered nothing; plans were ordered by a
 * hand-seeded weight, so two businesses chasing the same goal got identical plans. This module
 * fixes that. The owner picks a GOAL; we resolve the OUTCOME that goal drives (the result they
 * care about, e.g. a full room), then score each candidate play by its EXPECTED CONTRIBUTION to
 * that outcome FOR THIS BUSINESS. The engine orders by that score, so the plan bends to the real
 * situation.
 *
 * Honest split (per the design): we are confident about WHICH outcome a goal drives and which
 * channels drive it (textbook marketing). The MAGNITUDES start as a prior — the seeded weight —
 * sharpened by the one hard signal we trust, what has measurably worked or flopped for THIS
 * business. As real per-play outcome data accrues (Phase 3), the prior gives way to measured lift.
 *
 * Pure, no IO.
 */
import type { AtomPlay, PlanGoal } from '../data/atom-plays'
import type { BrainSignals } from './signals'
import { usable } from './readiness'
import { blendLift, type MeasuredLift } from './learning'
import { signalFit } from './signal-fit'

export interface Outcome {
  /** Stable id. */
  id: string
  /** The number this goal moves, owner-facing. */
  metric: string
  /** The plain result the owner cares about. No em dashes. */
  label: string
  /** What drives this outcome: the channels and the service/atom name hints that serve it. */
  drivers: { channels: string[]; serviceHints: string[] }
}

const OUTCOME_BY_GOAL: Record<PlanGoal, Outcome> = {
  firstvisit: {
    id: 'new-guests', metric: 'new guests', label: 'more first-time guests through the door',
    drivers: { channels: ['social', 'gbp', 'ads', 'content'], serviceHints: ['reach', 'gbp', 'creator', 'sampling', 'nextdoor', 'firstvisit', 'site', 'paid'] },
  },
  nights: {
    id: 'covers', metric: 'weeknight covers', label: 'fuller tables on your slow nights',
    drivers: { channels: ['email', 'sms', 'social'], serviceHints: ['nights', 'reminder', 'slow', 'loyalty', 'sms', 'newsletter', 'happy', 'bar'] },
  },
  regulars: {
    id: 'repeat-visits', metric: 'repeat visits', label: 'more repeat visits from the guests you have',
    drivers: { channels: ['email', 'sms'], serviceHints: ['loyalty', 'winback', 'referral', 'birthday', 'second', 'vip', 'crm', 'friend'] },
  },
  reviews: {
    id: 'fresh-reviews', metric: 'fresh reviews and a higher rating', label: 'more reviews and a higher rating',
    drivers: { channels: ['gbp', 'email'], serviceHints: ['review', 'feedback', 'gbp', 'listing', 'reputation'] },
  },
  'promote-event': {
    id: 'attendance', metric: 'attendance', label: 'a full room',
    drivers: { channels: ['social', 'email', 'sms', 'ads', 'gbp'], serviceHints: ['evt', 'event', 'fb', 'rsvp'] },
  },
  launch: {
    id: 'trial', metric: 'people trying the new item', label: 'more guests trying your new item',
    drivers: { channels: ['social', 'email', 'gbp', 'ads'], serviceHints: ['lnch', 'launch', 'feature'] },
  },
  'run-deal': {
    id: 'redemptions', metric: 'deal redemptions', label: 'more guests in for the deal',
    drivers: { channels: ['social', 'email', 'sms', 'gbp'], serviceHints: ['deal', 'offer'] },
  },
}

/**
 * Resolve the outcome a goal drives for this business. Today this is the default per goal; the
 * business-tailored variants (e.g. nights -> delivery orders for a delivery-heavy spot) arrive
 * once a delivery-focus signal is surfaced into BrainSignals. The signals param is already in the
 * contract so callers do not change when that lands.
 */
export function resolveOutcome(goal: PlanGoal, _signals?: BrainSignals): Outcome {
  return OUTCOME_BY_GOAL[goal] ?? OUTCOME_BY_GOAL.firstvisit
}

/** Crucial (spine) plays always rank above optional ones; this floor guarantees it. */
const CRUCIAL_FLOOR = 1000

/**
 * Expected relative contribution of a play toward the outcome, for THIS business. The seeded
 * weight is the prior; it is sharpened by structural fit (the play acts on a channel/service that
 * drives this outcome) and by the hard signal we trust most (it measurably worked here). A proven
 * loser is pushed to the bottom as a backstop (it is usually already excluded upstream). Higher
 * score = include sooner.
 */
export function expectedLift(play: AtomPlay, outcome: Outcome, signals: BrainSignals, measured?: Record<string, MeasuredLift>): number {
  // The base is the seeded prior blended toward this business's (or its cohort's) measured lift
  // when we have any; with no measured data it is exactly the seeded weight (cold start = today).
  let score = measured ? blendLift(play.weight ?? 0, measured[play.serviceId]) : (play.weight ?? 0)
  if (outcome.drivers.channels.includes(play.track.channel)) score += 40
  const hint = outcome.drivers.serviceHints.some((h) => play.serviceId.includes(h) || play.atom.includes(h))
  if (hint) score += 30
  if (usable(signals.workingServiceIds) && signals.workingServiceIds.value.includes(play.serviceId)) score += 60
  if (usable(signals.droppedServiceIds) && signals.droppedServiceIds.value.includes(play.serviceId)) score -= 10000
  // Cold-start tailoring: nudge by the business's OWN present signals (rating, listing, list, price,
  // themes, budget) so a fresh business with no history still gets a plan bent to its situation. Gated
  // on usable() per-rule, so empty signals add exactly 0 (the seeded default is preserved). Bounded to
  // [-80,+130], well inside the loser pit and crucial floor below, so it only reorders within a stage.
  score += signalFit(play, signals).delta
  if (play.crucial) score += CRUCIAL_FLOOR
  return score
}

/** A within-stage ordering score for the engine (higher first). Pass to BuildOpts.scoreOf. */
export function liftScorer(outcome: Outcome, signals: BrainSignals, measured?: Record<string, MeasuredLift>): (p: AtomPlay) => number {
  return (p) => expectedLift(p, outcome, signals, measured)
}
