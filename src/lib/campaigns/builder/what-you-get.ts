/**
 * whatYouGet — the product page's "what you get" list, DERIVED from the item's real
 * composition instead of hand-written lists that drift from what actually ships, and now
 * RECOMPOSED LIVE from the owner's current selection (the chosen version + the toggled
 * add-on options — the same state that drives the price):
 *
 *  - a BASE section = the item's own deliverables, framed HONESTLY by version where a
 *    version exists (gbp's diy/ai/team lanes each describe what that lane truly does);
 *  - one ADDED section PER selected option, titled by the option's plain name, whose rows
 *    are that service's REAL catalog deliverables.included (never hand-written).
 *
 * The base rows still come from:
 *  - system goals (firstvisit / nights / regulars, and reviewsplan via its system alias)
 *    reading the same buildSystem() moves the plan flow composes, rendered by plain name;
 *  - a single-service card (gbp, welcome, qr, …) reading that service's real deliverable
 *    bullets from the priced catalog;
 *  - everything else listing its ITEM_SHAPE composition: included services by plain name,
 *    then the seed beats' owner-facing labels.
 *
 * Pure + client-safe (same guarantees as compose-plan: no server, no AI, total on any id).
 * Base rows are clamped so the page stays scannable; each option group is capped too.
 */

import { shapeFor, buildSystem, isSystemGoal } from './compose-plan'
import { serviceById, cadenceOf, plainNameOf } from '../catalog'
import { MAX_ROWS, rowsFromComposition, whatYouGetForServices } from './service-rows'
export { whatYouGetForServices } from './service-rows'
import { setupCardById } from '../setup/cards'
import { whatYouGetFor, type SetupLaneKind } from '../setup/types'

/** The plan flow routes reviewsplan onto the 'reviews' system goal (builder-entry's
 *  SYSTEM_GOAL_ALIAS) — mirror it so this page describes the plan that actually ships. */
const SYSTEM_ALIAS: Record<string, string> = { reviewsplan: 'reviews' }

/** An option group shows the real bullets, but a very long list is capped so the page
 *  stays scannable — the full list still lives in the zone-4 "see what's included" expander. */
const MAX_OPTION_ROWS = 5


/** A version lane a versioned card can be sold in. Today only gbp carries lanes. */
export type WhatYouGetVersion = 'diy' | 'ai' | 'team'

/** One rendered group: the base has no title; each added option is titled by its plain name.
 *  `recurring` lets the page mark a monthly add-on ("/mo") without re-reading the catalog. */
export interface WhatYouGetSection {
  title?: string
  rows: string[]
  recurring?: boolean
}

export interface WhatYouGetSelection {
  /** The chosen version lane (gbp: 'diy' | 'ai' | 'team'); null/undefined for unversioned cards. */
  version?: WhatYouGetVersion | string | null
  /** The serviceIds of the add-on options the owner has toggled on (drives the added groups). */
  optionServiceIds?: string[]
}

/** The gbp profile's fixable parts, read from the real gbp-setup deliverables so the "all N
 *  parts" copy stays honest if the catalog changes (today it is 6). */
function gbpPartCount(): number {
  const n = serviceById('gbp-setup')?.deliverables?.included?.length
  return typeof n === 'number' && n > 0 ? n : 6
}

/** gbp base rows, framed by the chosen lane. Each line describes what that lane TRULY does —
 *  team fixes it for you, diy hands you the checklist, ai drafts each fix for your review.
 *  Every lane ends with the same honest recheck, since all three re-read the profile after. */
function gbpBaseRows(version: WhatYouGetSelection['version']): string[] {
  if (version === 'diy') return ['A clear checklist of what to fix', 'We recheck it for you when you are done']
  if (version === 'ai') return ['AI drafts each fix for you', 'You review and apply, then we recheck']
  // team (done-for-you) is the default lane.
  return [`We fix all ${gbpPartCount()} parts of your profile`, 'We recheck it and show you what changed']
}

/** The Google order-button card's base rows, framed by lane. The card's own deliverables
 *  describe the DONE-FOR-YOU job ("a test order run all the way through"), which is a promise
 *  nobody keeps on a lane where the owner does the work themselves. Same treatment gbp already
 *  had, and the same reason: a lane must describe what THAT lane does. */
function orderBaseRows(version: WhatYouGetSelection['version']): string[] {
  if (version === 'diy') return [
    'We show you exactly which buttons to change, and where',
    'You set them on Google yourself, at your own pace',
    'Mark it done when your links are live',
  ]
  if (version === 'ai') return [
    'We read your listing and tell you where the buttons go today',
    'We fill in your own ordering and booking links for you to confirm',
    'We set them on Google and read it back to prove it took',
  ]
  // team (done-for-you) is the default lane.
  return baseRows('friction')
}

/** Reply-to-reviews, framed by lane. Unlike gbp and friction this one never "finishes": new
 *  reviews keep arriving, so the free and AI lanes promise a pass over what is waiting today
 *  and the team lane is the only one that keeps going. Saying otherwise would sell a
 *  subscription as a one-off. */
function reviewsBaseRows(version: WhatYouGetSelection['version']): string[] {
  if (version === 'diy') return [
    'We show you every review still waiting on a reply, worst first',
    'You write and post each one on Google yourself',
    'Mark it done when you have caught up',
  ]
  if (version === 'ai') return [
    'We show you every review still waiting on a reply, worst first',
    'We draft each reply in your voice for you to edit',
    'You approve, and we post it to Google and prove it posted',
  ]
  // team (done-for-you) is the default lane, and the only one that keeps running.
  return baseRows('reviewsreply')
}

/** Get-listed-everywhere, framed by lane. The honesty problem here is sharper than on the
 *  other cards: we cannot read OR write any of these directories, so no owner-run lane may
 *  claim to inspect one or fix one. What the free and AI lanes deliver is the right answer and
 *  the right link. The team lane is the only one where somebody goes and does the claiming,
 *  and the copy has to earn the price on that difference alone. */
function listingsBaseRows(version: WhatYouGetSelection['version']): string[] {
  if (version === 'diy') return [
    'Your name, address and phone in one place, exactly as they should read',
    'A link straight to the page that edits each site',
    'You claim and correct each one, and mark it done',
  ]
  if (version === 'ai') return [
    'The same three lines to copy, so every site ends up saying exactly the same thing',
    'One site at a time, with what usually trips people up on that one',
    'It remembers where you got to, so you can do a couple and come back',
  ]
  // team (done-for-you): the only lane where somebody else does the claiming.
  return baseRows('listings')
}

/** The item's own deliverables, unversioned — the pre-selection base list (today's behavior). */
function baseRows(itemId: string): string[] {
  const goalId = SYSTEM_ALIAS[itemId] ?? itemId

  // System goals: the staged services the default plan really composes, by plain name.
  if (isSystemGoal(goalId)) {
    const { moves } = buildSystem(goalId, {})
    const names: string[] = []
    for (const m of moves) {
      const s = serviceById(m.serviceId)
      const name = s ? plainNameOf(s) : null
      if (name && !names.includes(name)) names.push(name)
      if (names.length >= MAX_ROWS) break
    }
    if (names.length) return names
  }

  const shape = shapeFor(itemId)
  if (!shape) return []
  return rowsFromComposition(shape.services ?? [], shape.seed.map(([, , label]) => label))
}

/**
 * The live "what you get" groups for the current selection. Returns at least the base
 * section; each selected option adds a titled group of that service's REAL deliverables.
 */
/** `version` is typed loosely (it arrives from a URL and from stored drafts), so an unknown value
 *  must land somewhere real rather than on an empty list. Done-for-you is the honest default: it is
 *  what every one of the old per-card functions fell through to, and it is the version that
 *  promises the most, so a mislabelled render over-describes rather than under-describes. */
function laneOfVersion(v: WhatYouGetSelection['version']): SetupLaneKind {
  return v === 'diy' || v === 'ai' || v === 'team' ? v : 'team'
}

export function whatYouGet(itemId: string, sel: WhatYouGetSelection = {}): WhatYouGetSection[] {
  const sections: WhatYouGetSection[] = []

  // BASE — framed by version for gbp (the only versioned card today), else the plain list.
  // Setup cards read their rows from the card config (setup/cards.ts). This branch used to name
  // four cards and call four hand-written functions, which is exactly the pile the setup engine
  // was built to replace: a fifth card meant a fifth function, and the store silently rendered
  // NOTHING for any card nobody remembered to add here.
  //
  // The four functions below are kept and still used as the golden source: scripts/sim/setup-cards
  // freezes their output and asserts the config still produces it word for word, so this swap
  // cannot have moved a syllable on a card that was already on sale.
  //
  // `?? 'team'` preserves the old default. Every one of those functions fell through to the
  // done-for-you rows when no version was passed, and callers rely on it.
  const setupCard = setupCardById(itemId)
  const base = setupCard ? whatYouGetFor(setupCard, laneOfVersion(sel.version)) : baseRows(itemId)
  sections.push({ rows: base })

  // ADDED — one group per selected option, from the option service's real deliverables.
  const ids = Array.isArray(sel.optionServiceIds) ? sel.optionServiceIds : []
  const seen = new Set<string>()
  for (const id of ids) {
    if (seen.has(id)) continue
    seen.add(id)
    const s = serviceById(id)
    if (!s) continue
    const rows = (s.deliverables?.included ?? []).slice(0, MAX_OPTION_ROWS)
    if (!rows.length) continue
    sections.push({ title: plainNameOf(s), rows, recurring: cadenceOf(s).cadence.kind === 'recurring' })
  }

  return sections
}

/** Total real rows across every group — used by the drift guard to assert a card never
 *  ships an empty "what you get". */
export function whatYouGetRowCount(itemId: string, sel: WhatYouGetSelection = {}): number {
  return whatYouGet(itemId, sel).reduce((n, s) => n + s.rows.length, 0)
}
