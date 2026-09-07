/**
 * chip-shelf — the map from what the owner SAID in setup to what the store SHOWS them.
 *
 * The hole this fills: onboarding asks fourteen goal chips in the owner's words, and the shelf
 * keyed its ten goals in different words entirely (shelf.ts GOAL_CARDS). So the two never met.
 * Onboarding's finish screen had its own third list (step-done FIRST_PLAN) that sent a slow-days
 * owner to a hidden email card, a social owner to a coming-soon reel and a photo owner to a
 * coming-soon dish card. Every shelf drawn in the Create mockups was a decision the code could
 * not reproduce.
 *
 * One list per chip, best first, LIVE FIRST. The list is complete on purpose: it carries the
 * unbuyable cards too, because the store's "Coming later for this goal" row has to name every
 * one of them with its real reason. What is live and what is not comes from catalog-availability
 * at render time, never from the order here.
 *
 * Stranded live cards, re-keyed (2026-09-07): the desk's social-post batch, its website build and
 * the social-profiles setup were live and on nobody's goal shelf. They are now on the chips their
 * owners actually pick.
 *
 * CLIENT-SAFE: pure data and pure functions. No server imports, no database.
 */

import { CREATE_CATALOG, CREATE_CATALOG_IDS } from './create-catalog'
import { REQUEST_TYPES } from '@/lib/requests/catalog'
import { availabilityFor, sellable, type VisibilityOverrideMap } from './catalog-availability'
import type { ClientShape } from '@/lib/clients/shape'

/** The fourteen onboarding chips, verbatim (GOAL_CHIPS in onboarding/full/data.ts). These are
 *  STORED VALUES on the goal rows, so the strings must never change. */
export const CHIP_ORDER: readonly string[] = [
  'More customers on slow days',
  'More foot traffic overall',
  'Build local awareness',
  'Promote a specific offering',
  'Grow social following',
  'Improve online reputation',
  'Launch something new',
  'Stay top of mind',
  'Compete with nearby businesses',
  'More bookings or orders',
  'Turn first-timers into regulars',
  'Grow catering orders',
  'Better photos of my food',
  'Reach a younger crowd',
]

/**
 * The shelf for each chip, best first. Live cards lead; the rest follow in the order they
 * would matter if they were finished, so the "coming later" row reads as a roadmap rather
 * than a junk drawer.
 */
export const CHIP_SHELF: Record<string, readonly string[]> = {
  'More customers on slow days': [
    // Live: an event fills a named night, and the desk can make the posts and the flyer today.
    'promoevent', 'creative-social', 'creative-graphic', 'gbp', 'measure',
    // Not yet: the program is being rebuilt, the weekly Google post is held, and every
    // offer-to-your-list card needs a send rail that does not exist.
    'nights', 'barnights', 'gpost', 'story', 'slowoffer', 'winback', 'ticket',
  ],
  'More foot traffic overall': [
    // measure first when nothing is connected: it is what makes every other count real.
    'gbp', 'measure', 'listings', 'reviewsreply', 'reach', 'promoevent',
    'firstvisit', 'localseo', 'gpost', 'creator',
  ],
  'Build local awareness': [
    'gbp', 'listings', 'socialprofiles', 'measure', 'launch', 'reach',
    'firstvisit', 'localseo', 'gpost', 'gbpmgmt', 'creator',
  ],
  'Promote a specific offering': [
    'launch', 'creative-social', 'creative-graphic', 'creative-print', 'promoevent',
    'seasonplan', 'gpost', 'dish', 'story', 'earlyaccess', 'creator',
  ],
  'Grow social following': [
    // creative-social is the desk's post batch: live, and until now on no shelf at all.
    'creative-social', 'creative-video', 'creative-photos', 'socialprofiles',
    'socialmgmt', 'reel', 'shoot', 'creator',
  ],
  'Improve online reputation': [
    'reviewsreply', 'gbp', 'creative-print', 'listings',
    'reviewsplan',
  ],
  'Launch something new': [
    'launch', 'creative-graphic', 'creative-photos', 'gbp', 'promoevent',
    'gpost', 'dish', 'story', 'creator', 'earlyaccess',
  ],
  'Stay top of mind': [
    // trucklocation is NOT here: a storefront has no truck. The truck shape leads with it.
    'gbp', 'socialprofiles', 'creative-social', 'listings',
    'gbpmgmt', 'gpost', 'news', 'earlyaccess', 'loyalty',
  ],
  'Compete with nearby businesses': [
    'gbp', 'listings', 'reviewsreply', 'measure', 'reach',
    'localseo', 'firstvisit', 'gpost', 'creator',
  ],
  'More bookings or orders': [
    // creative-website is the desk's site build: live, and until now on no shelf at all.
    'friction', 'deliverymenu', 'creative-website', 'gbp', 'measure',
    'direct', 'website', 'pos', 'localseo',
  ],
  'Turn first-timers into regulars': [
    'reviewsreply', 'gbp', 'creative-print', 'creative-social',
    'regulars', 'winback', 'birthday', 'welcome', 'news', 'loyalty', 'earlyaccess',
  ],
  'Grow catering orders': [
    'catering', 'creative-photos', 'creative-menu', 'creative-graphic',
    'cateringengine', 'ticket', 'creative-email',
  ],
  'Better photos of my food': [
    'creative-photos', 'gbp', 'listings', 'creative-video', 'creative-logo', 'socialprofiles',
    'shoot', 'dish', 'reel', 'gbpmgmt', 'socialmgmt',
  ],
  'Reach a younger crowd': [
    'creative-video', 'socialprofiles', 'creative-social', 'creative-photos',
    'reel', 'creator', 'socialmgmt', 'gbpmgmt', 'shoot',
  ],
}

/**
 * What each shape changes about a chip's shelf.
 *
 * `lead` moves ids to the front (a truck's whole marketing job is telling people where it is
 * today). `drop` removes ids that would be a lie for that shape: a delivery kitchen has no door
 * to put a sign on, no room to fill on a Tuesday, and no reason to be found for directions.
 *
 * A shape with nothing to change is absent, and its shelf is the plain one above.
 */
export const SHAPE_OVERRIDES: Partial<Record<ClientShape, { lead?: Record<string, readonly string[]>; drop?: readonly string[] }>> = {
  truck: {
    lead: {
      'Stay top of mind': ['trucklocation'],
      'Build local awareness': ['trucklocation'],
    },
    // No fixed pin, so "get listed everywhere" and a local-search program are the wrong first
    // thing to sell; they stay on the list but never lead.
  },
  delivery_only: {
    // No dining room. Directions, a night to fill and a sign for the door are all wrong here,
    // and the Order button card says "order only, no Reserve" in its own words.
    drop: ['listings', 'localseo', 'firstvisit', 'promoevent', 'ticket', 'creative-print'],
  },
  catering: {
    lead: { 'Grow catering orders': ['cateringengine'] },
  },
  seasonal: {
    lead: { 'Promote a specific offering': ['seasonplan'] },
  },
  two_locations: {
    // Each shop has its own listing and its own numbers, so the listing work leads.
    lead: { 'Build local awareness': ['gbp', 'listings'] },
  },
}

/** Every id this file is allowed to name: the built-in catalog plus the desk's creative cards. */
export const KNOWN_SHELF_IDS: ReadonlySet<string> = new Set([
  ...CREATE_CATALOG_IDS,
  ...REQUEST_TYPES.map((t) => `creative-${t.id}`),
])

/** The chip's shelf for a shape, ordered: the shape's leads first, then the plain list,
 *  minus anything that shape drops. Unknown chip → empty (the caller shows nothing, honestly). */
export function shelfForChip(chip: string, shape: ClientShape = 'storefront'): string[] {
  const base = CHIP_SHELF[chip.trim()]
  if (!base) return []
  const ov = SHAPE_OVERRIDES[shape]
  const lead = ov?.lead?.[chip.trim()] ?? []
  const drop = new Set(ov?.drop ?? [])
  const out: string[] = []
  for (const id of [...lead, ...base]) {
    if (drop.has(id) || out.includes(id)) continue
    out.push(id)
  }
  return out
}

/** The cards on this chip's shelf that can actually be bought today, in order. */
export function liveForChip(chip: string, shape: ClientShape = 'storefront', overrides?: VisibilityOverrideMap): string[] {
  return shelfForChip(chip, shape).filter((id) => sellable(id, overrides).ok)
}

/** The cards on this chip's shelf that cannot be bought today, in order. Includes the ones
 *  hidden from browse (the email cards), because the store lists those by name rather than
 *  pretending they do not exist. */
export function laterForChip(chip: string, shape: ClientShape = 'storefront', overrides?: VisibilityOverrideMap): string[] {
  return shelfForChip(chip, shape).filter((id) => !sellable(id, overrides).ok)
}

/** True when the card is hidden from browse because email and text sending is not built. The
 *  store says so in those words rather than dropping the row. */
export function isEmailOff(id: string, overrides?: VisibilityOverrideMap): boolean {
  return availabilityFor(id, overrides) === 'hidden'
}

/** The owner-facing title for any id on a shelf, including the ones hidden from browse (the
 *  email cards). The store lists those by name and says why, so it needs a title for them. */
const TITLES: Record<string, string> = (() => {
  const out: Record<string, string> = {}
  for (const c of CREATE_CATALOG) out[c.id] = c.title
  for (const t of REQUEST_TYPES) out[`creative-${t.id}`] = t.label
  return out
})()
export function shelfTitle(id: string): string {
  return TITLES[id] ?? id
}
