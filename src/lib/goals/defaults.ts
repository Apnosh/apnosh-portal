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
 * The onboarding goal chip → a real GoalSlug, ONE TO ONE.
 *
 * It used to collapse: fourteen chips folded into seven slugs, six of them into
 * 'be_known_for'. So an owner who tapped "Better photos of my food" and one who tapped
 * "Reach a younger crowd" saved the same goal, and the store had no way to draw either of
 * them their own shelf. Migration 256 adds the eight missing slugs so nothing is lost
 * between the tap and the row.
 *
 * Every GOAL_CHIPS value maps; an unknown/legacy chip returns null (shape defaults then
 * stand). The reverse map exists so a saved goal row reads back as the owner's own words.
 */
const CHIP_TO_SLUG: Record<string, GoalSlug> = {
  'More customers on slow days': 'fill_slow_times',
  'More foot traffic overall': 'more_foot_traffic',
  'Build local awareness': 'local_awareness',
  'Promote a specific offering': 'promote_offering',
  'Grow social following': 'grow_social',
  'Improve online reputation': 'better_reputation',
  'Launch something new': 'launch_something',
  'Stay top of mind': 'stay_top_of_mind',
  'Compete with nearby businesses': 'beat_nearby',
  'More bookings or orders': 'more_online_orders',
  'Turn first-timers into regulars': 'regulars_more_often',
  'Grow catering orders': 'grow_catering',
  'Better photos of my food': 'better_photos',
  'Reach a younger crowd': 'younger_crowd',
}
export function goalSlugForChip(chip: string | null | undefined): GoalSlug | null {
  if (!chip) return null
  return CHIP_TO_SLUG[chip.trim()] ?? null
}

/**
 * The two slugs no chip maps to any more, and the closest chip for each.
 *
 * They are not dead history: 'be_known_for' is what SIX of the fourteen chips collapsed into
 * before migration 256, so it is on most existing clients' goal rows, and it is still what the
 * 23503 fallback writes when the migration has not run yet. 'more_reservations' comes from
 * defaultGoalsForShape for a fine-dining place. Without these two lines chipForGoalSlug returned
 * null for both, the shelf-context route dropped the goal, and every one of those owners opened
 * the store on a generic shelf instead of their own.
 *
 * The collapse cannot be undone (six chips, one row, the other five words are gone), so this is
 * the best SINGLE chip for each, and both have a real shelf.
 */
const LEGACY_SLUG_TO_CHIP: Record<string, string> = {
  be_known_for: 'Build local awareness',
  more_reservations: 'More bookings or orders',
}

/** slug → the chip the owner tapped, so a saved goal row can be read back in their words.
 *  New slugs first, then the two legacy ones, so a row written at any time still reads back. */
const SLUG_TO_CHIP: Record<string, string> = Object.fromEntries(
  Object.entries(CHIP_TO_SLUG).map(([chip, slug]) => [slug, chip]),
)
export function chipForGoalSlug(slug: string | null | undefined): string | null {
  if (!slug) return null
  const s = slug.trim()
  return SLUG_TO_CHIP[s] ?? LEGACY_SLUG_TO_CHIP[s] ?? null
}

/**
 * Every slug that can sit on a client_goals row today: the fourteen one-to-one ones, the two
 * legacy ones above, and nothing else. Typed as Record<GoalSlug, true> on purpose, so adding a
 * slug to the union without deciding which chip reads it back is a compile error rather than an
 * owner opening the store on a generic shelf. scripts/verify-chip-shelf.ts walks this list.
 */
const EVERY_GOAL_SLUG: Record<GoalSlug, true> = {
  more_foot_traffic: true, regulars_more_often: true, more_online_orders: true,
  more_reservations: true, better_reputation: true, be_known_for: true,
  fill_slow_times: true, grow_catering: true,
  local_awareness: true, promote_offering: true, grow_social: true, launch_something: true,
  stay_top_of_mind: true, beat_nearby: true, better_photos: true, younger_crowd: true,
}
export const ALL_GOAL_SLUGS: readonly GoalSlug[] = Object.keys(EVERY_GOAL_SLUG) as GoalSlug[]

/**
 * The slugs that existed BEFORE migration 256, for the fallback write. Until the migration
 * runs, goals_catalog has no row for the eight new slugs and the foreign key rejects them, so
 * the onboarding writer retries with these and the owner still gets goals.
 */
const LEGACY_CHIP_TO_SLUG: Record<string, GoalSlug> = {
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
export function legacyGoalSlugForChip(chip: string | null | undefined): GoalSlug | null {
  if (!chip) return null
  return LEGACY_CHIP_TO_SLUG[chip.trim()] ?? null
}

/**
 * The onboarding budget chip → a monthly cap in dollars for businesses.monthly_budget
 * (the over-budget guard + recommender read it). The cap is the TOP of the chosen range so we
 * never under-sell their pick.
 *
 * TWO CHIPS ASSERT NO CAP AT ALL, and neither is here: 'Not sure yet', and the top chip.
 * "Over $2,500/mo" used to map to 5000, which the store then read back to the owner as "Up to
 * $5,000 to start" — a number they never said, invented by doubling the last band. An open top
 * end is an open top end: no cap, nothing hidden.
 */
const BUDGET_TO_CAP: Record<string, number> = {
  'Under $200/mo': 200,
  '$200 to $500/mo': 500,
  '$500 to $1,000/mo': 1000,
  '$1,000 to $2,500/mo': 2500,
}

/** The chips that mean "do not cap me". Both leave monthly_budget alone and show every card. */
export const NO_CAP_BUDGET_CHIPS: readonly string[] = ['Over $2,500/mo', 'Not sure yet']
export function budgetCapForChip(chip: string | null | undefined): number | null {
  if (!chip) return null
  return BUDGET_TO_CAP[chip.trim()] ?? null
}

/** The saved cap read back as the chip the owner tapped, so resuming setup relights it. */
export function budgetChipForCap(cap: number | null | undefined): string {
  if (cap == null) return ''
  return Object.keys(BUDGET_TO_CAP).find((k) => BUDGET_TO_CAP[k] === Number(cap)) ?? ''
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
