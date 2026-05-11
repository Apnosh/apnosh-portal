/**
 * Pure helpers for the goal layer. Not 'use server' -- callable from
 * client + server alike.
 */

import type { Concept, Footprint, GoalSlug } from './types'

/**
 * Returns 3 default goals for a given shape, per docs/PRODUCT-SPEC.md
 * default-goals matrix. Owner can override during onboarding.
 */
export function defaultGoalsForShape(shape: {
  footprint: Footprint | null
  concept: Concept | null
}): GoalSlug[] {
  const { footprint, concept } = shape

  if (footprint === 'ghost' || concept === 'delivery_only') {
    return ['more_online_orders', 'better_reputation', 'fill_slow_times']
  }
  if (footprint === 'mobile' || concept === 'mobile') {
    return ['be_known_for', 'more_foot_traffic', 'more_online_orders']
  }
  if (concept === 'fine_dining') {
    return ['better_reputation', 'more_reservations', 'be_known_for']
  }
  if (footprint === 'multi_local' || footprint === 'multi_regional') {
    return ['more_foot_traffic', 'better_reputation', 'be_known_for']
  }
  if (concept === 'qsr' || concept === 'fast_casual') {
    return ['more_foot_traffic', 'regulars_more_often', 'better_reputation']
  }
  if (concept === 'catering_heavy') {
    return ['grow_catering', 'better_reputation', 'be_known_for']
  }
  // Default: single-neighborhood casual / cafe / bar
  return ['more_foot_traffic', 'regulars_more_often', 'better_reputation']
}
