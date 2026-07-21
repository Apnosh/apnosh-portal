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
import { serviceById, plainNameOf, cadenceOf } from '../catalog'

/** The plan flow routes reviewsplan onto the 'reviews' system goal (builder-entry's
 *  SYSTEM_GOAL_ALIAS) — mirror it so this page describes the plan that actually ships. */
const SYSTEM_ALIAS: Record<string, string> = { reviewsplan: 'reviews' }

const MAX_ROWS = 4
/** An option group shows the real bullets, but a very long list is capped so the page
 *  stays scannable — the full list still lives in the zone-4 "see what's included" expander. */
const MAX_OPTION_ROWS = 5

/** Beat labels use an em dash as a clause break; owner copy avoids em dashes, so soften it. */
const plainLabel = (l: string) => l.replace(/\s+—\s+/g, ', ')

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

/** Get-listed-everywhere, framed by lane. The honesty problem here is different from the other
 *  cards: we cannot WRITE to Yelp, Apple Maps or any of them, so no owner-run lane may promise
 *  that we fix them. What the free and AI lanes actually deliver is the right answer and the
 *  right link, which is the hard part, and the team lane is the only one where someone goes
 *  and does it. Say that plainly or the $195 looks like a tax on convenience. */
function listingsBaseRows(version: WhatYouGetSelection['version']): string[] {
  if (version === 'diy') return [
    'Your name, address and phone in one place, exactly as they should read',
    'A link straight to the page that edits each directory',
    'You claim and correct each one, and mark it done',
  ]
  if (version === 'ai') return [
    'We check Yelp against your Google listing and tell you what does not match',
    'The right text ready to copy, so every directory ends up saying the same thing',
    'One directory at a time, worst first, with the link to fix it',
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

/** The shared composition → rows derivation: one service with no seed shows that
 *  service's REAL deliverable bullets; otherwise included services by plain name, then
 *  the seed beats' owner-facing labels, capped so the page stays scannable. */
function rowsFromComposition(serviceIds: string[], seedLabels: string[]): string[] {
  const services = serviceIds.map(serviceById).filter((s) => !!s)

  // One real service and no content seed (gbp, welcome, qr, …): that service's own
  // deliverable bullets ARE the composition — show them instead of one opaque row.
  if (services.length === 1 && seedLabels.length === 0) {
    const bullets = services[0].deliverables?.included ?? []
    if (bullets.length) return bullets.slice(0, MAX_ROWS)
  }

  const rows: string[] = []
  for (const s of services) {
    const name = plainNameOf(s)
    if (!rows.includes(name)) rows.push(name)
  }
  for (const label of seedLabels) {
    const l = plainLabel(label)
    if (!rows.includes(l)) rows.push(l)
    if (rows.length >= MAX_ROWS) break
  }
  return rows.slice(0, MAX_ROWS)
}

/** What-you-get rows for a bare service list — the admin CMS preview path (Phase C2),
 *  where the campaign may not be registered (or even saved) yet. Identical derivation
 *  to a registered services-only DB campaign, so the preview shows the real page facts. */
export function whatYouGetForServices(serviceIds: string[]): string[] {
  return rowsFromComposition(serviceIds, [])
}

/**
 * The live "what you get" groups for the current selection. Returns at least the base
 * section; each selected option adds a titled group of that service's REAL deliverables.
 */
export function whatYouGet(itemId: string, sel: WhatYouGetSelection = {}): WhatYouGetSection[] {
  const sections: WhatYouGetSection[] = []

  // BASE — framed by version for gbp (the only versioned card today), else the plain list.
  const base = itemId === 'gbp' ? gbpBaseRows(sel.version)
    : itemId === 'friction' ? orderBaseRows(sel.version)
    : itemId === 'reviewsreply' ? reviewsBaseRows(sel.version)
    : itemId === 'listings' ? listingsBaseRows(sel.version)
    : baseRows(itemId)
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
