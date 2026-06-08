/**
 * Pure helpers for the goal layer. Not 'use server' -- callable from
 * client + server alike.
 */

import type {
  Concept, CustomerMix, DigitalMaturity, Footprint, GoalSlug,
} from './types'

/**
 * Best-guess restaurant shape from raw onboarding answers. Owner-overridable
 * on /dashboard/restaurant; this just gives the playbook engine something to
 * match against right after onboarding instead of leaving shape blank.
 *
 * Inputs are the loose onboarding fields (service_styles, price_range,
 * location_count, locations[], customer_types, platforms connected). Every
 * dimension falls back to a sensible default so the result is always complete.
 */
export function inferShapeFromOnboarding(data: {
  service_styles?: string[] | null
  price_range?: string | null
  location_count?: string | null
  locations?: unknown[] | null
  customer_types?: string[] | null
  connected?: Record<string, boolean> | null
}): {
  footprint: Footprint
  concept: Concept
  customerMix: CustomerMix
  digitalMaturity: DigitalMaturity
} {
  const styleStr = (data.service_styles ?? []).join(' | ').toLowerCase()
  const ct = (data.customer_types ?? []).join(' | ').toLowerCase()

  // Concept — from service style, price as a fallback when style is blank.
  let concept: Concept = 'casual'
  if (styleStr.includes('food truck') || styleStr.includes('pop-up')) concept = 'mobile'
  else if (styleStr.includes('fine dining')) concept = 'fine_dining'
  else if (styleStr.includes('bar') || styleStr.includes('lounge')) concept = 'bar'
  else if (
    styleStr.includes('coffee') || styleStr.includes('café') ||
    styleStr.includes('cafe') || styleStr.includes('bakery') ||
    styleStr.includes('patisserie')
  ) concept = 'cafe'
  else if (styleStr.includes('catering')) concept = 'catering_heavy'
  else if (styleStr.includes('fast food')) concept = 'qsr'
  else if (styleStr.includes('quick service') || styleStr.includes('fast casual')) concept = 'fast_casual'
  else if (
    styleStr.includes('casual') || styleStr.includes('family') ||
    styleStr.includes('buffet') || styleStr.includes('ayce')
  ) concept = 'casual'
  else if (data.price_range === '$$$$') concept = 'fine_dining'
  else if (data.price_range === '$') concept = 'qsr'

  // Customer mix — from the customer-type chips.
  let customerMix: CustomerMix = 'local_repeat'
  if (ct.includes('tourist')) customerMix = 'tourist_heavy'
  else if (concept === 'catering_heavy' || ct.includes('business professional')) customerMix = 'b2b_catering'
  else if (ct.includes('luxury') || ct.includes('special occasion')) customerMix = 'local_destination'

  // Footprint — food-truck concept wins; otherwise count locations.
  const extra = Array.isArray(data.locations)
    ? data.locations.filter(
        (l) => l && typeof (l as { full_address?: unknown }).full_address === 'string' &&
          ((l as { full_address: string }).full_address).trim() !== '',
      ).length
    : 0
  const lc = (data.location_count ?? '').toLowerCase()
  const multi =
    extra > 0 || lc.includes('multiple') ||
    /[2-9]/.test(lc) || lc.includes('+')
  let footprint: Footprint
  if (concept === 'mobile') footprint = 'mobile'
  else if (multi) footprint = 1 + extra >= 5 ? 'multi_regional' : 'multi_local'
  else {
    footprint =
      customerMix === 'tourist_heavy' || customerMix === 'local_destination'
        ? 'single_destination'
        : 'single_neighborhood'
  }

  // Digital maturity — how many channels they connected during onboarding.
  const connectedCount = data.connected
    ? Object.values(data.connected).filter(Boolean).length
    : 0
  const digitalMaturity: DigitalMaturity =
    connectedCount >= 5 ? 'sophisticated' :
    connectedCount >= 3 ? 'active' :
    connectedCount >= 1 ? 'basic' : 'nascent'

  return { footprint, concept, customerMix, digitalMaturity }
}

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
