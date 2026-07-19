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
/**
 * The onboarding "#1 priority" chip → a real GoalSlug, so the recommender runs on
 * what the owner actually SAID, not a shape guess. Every GOAL_CHIPS value maps;
 * an unknown/legacy chip returns null (shape defaults then stand).
 */
const CHIP_TO_SLUG: Record<string, GoalSlug> = {
  'More customers on slow days': 'fill_slow_times',
  'More foot traffic overall': 'more_foot_traffic',
  'Build local awareness': 'be_known_for',
  'Promote a specific offering': 'be_known_for',
  'Grow social following': 'be_known_for',
  'Improve online reputation': 'better_reputation',
  'Launch something new': 'be_known_for',
  'Stay top of mind': 'regulars_more_often',
  'Compete with nearby businesses': 'more_foot_traffic',
  'More bookings or orders': 'more_online_orders',
  'Turn first-timers into regulars': 'regulars_more_often',
  'Grow catering orders': 'grow_catering',
  'Better photos of my food': 'be_known_for',
  'Reach a younger crowd': 'be_known_for',
}
export function goalSlugForChip(chip: string | null | undefined): GoalSlug | null {
  if (!chip) return null
  return CHIP_TO_SLUG[chip.trim()] ?? null
}

/**
 * The onboarding budget chip → a monthly cap in dollars for businesses.monthly_budget
 * (the over-budget guard + recommender read it). 'Not sure yet' / unknown → null (no cap
 * is asserted). The cap is the TOP of the chosen range so we never under-sell their pick.
 */
const BUDGET_TO_CAP: Record<string, number> = {
  'Under $200/mo': 200,
  '$200 to $500/mo': 500,
  '$500 to $1,000/mo': 1000,
  '$1,000 to $2,500/mo': 2500,
  'Over $2,500/mo': 5000,
}
export function budgetCapForChip(chip: string | null | undefined): number | null {
  if (!chip) return null
  return BUDGET_TO_CAP[chip.trim()] ?? null
}

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
