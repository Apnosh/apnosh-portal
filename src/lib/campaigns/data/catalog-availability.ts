/**
 * catalog-availability — the ONE source of truth for whether a store campaign can be BOUGHT today.
 *
 * "Honest by construction" (the Phase A sign-off): Apnosh only sells what it can genuinely fulfill
 * now. A campaign whose plan depends on a rail that does not exist yet (email/SMS/CRM sends, a real
 * creator network, POS-gated gift cards / ticketing, the mega-programs still being rebuilt) is NOT a
 * fake buy — it shows as visibly "coming soon" and its buy action is disabled everywhere. A pure
 * placeholder with no real deliverable would be 'hidden' (removed from the browse); today no built-in
 * is a placeholder, so every card is either 'live' or 'coming_soon'.
 *
 * Three states:
 *   - live         buyable now (the curated servicable set)
 *   - coming_soon  visible but not buyable — a "coming soon" badge + a disabled buy footer
 *   - hidden       removed from the catalog entirely (search, shelves, deep-links)
 *
 * The built-in decision below is authored in CODE (it is a product decision, like create-catalog's
 * funnel stages — no DB round-trip needed for the store to be honest). An admin can OVERRIDE a
 * built-in per campaign from the CMS via catalog_content_overrides.visibility (migration 222), which
 * rides in through the same ContentOverride map the store already fetches. A DB campaign (id not in
 * the built-in map) defaults to 'live' — it only registers when its services are real (registerDb-
 * Campaigns) — but the same override can flip it.
 *
 * CLIENT-SAFE: pure data + resolvers, no server imports. Imported by the store JSX, the builder
 * wrapper, and the create route's server-side guard, so all three agree on one buyable set.
 */

import { CREATE_CATALOG_IDS } from './create-catalog'

export type CardAvailability = 'live' | 'coming_soon' | 'hidden'

export const CARD_AVAILABILITY_VALUES: readonly CardAvailability[] = ['live', 'coming_soon', 'hidden']

/**
 * THE ALLOWLIST (owner call, 2026-07-21): only the cards we have FULLY BUILT and verified
 * end to end are buyable. Everything else in the built-in catalog shows as "coming soon" —
 * visible, honest, not buyable — until it is finished to the same bar.
 *
 * This is deliberately an allowlist, not a denylist. "Only what we fully built is live" means
 * a NEW or half-finished card must default to coming_soon, never quietly go on sale because
 * someone forgot to gate it. To make one buyable you add its id here, which is the same moment
 * you would be signing off that it is done.
 *
 * The four: the 3-lane setup walkthroughs (Google profile, order buttons, review replies,
 * get-listed) — each has a real diagnosis, a real owner walkthrough, and a verifier.
 */
export const FULLY_BUILT_LIVE: readonly string[] = ['gbp', 'friction', 'reviewsreply', 'listings']

/** Why a bookmarked card is not buyable yet, by group. Owner-facing, plain, honest — shown on the
 *  card and the product page so "coming soon" is never a mystery. No em dashes, 5th-grade words. */
export const COMING_SOON_REASON: Record<string, string> = {
  // Email + text sends have no delivery rail yet (no ESP/SMS integration in the codebase).
  send: 'Email and text sending is coming soon. We will not sell it until it really works.',
  // A campaign that is mostly buildable but includes an email or text step we cannot deliver.
  partialSend: 'This one includes email or text steps we are still building. Coming soon.',
  // No real creator network — the creator pool resolves to the Apnosh team, so we will not sell it
  // as a marketplace (never pass the team off as an outside creator).
  creator: 'We are building our local creator network. Coming soon.',
  // Gift cards / ticketing need a point-of-sale and send rail we have not built.
  commerce: 'This needs order and payment tools we are still building. Coming soon.',
  // The big multi-month programs are being rebuilt from the pieces we can serve now.
  program: 'We are rebuilding this full program from the pieces we can run today. Coming soon.',
  // Table-QR list capture depends on the guest-list rail that is not built yet.
  capture: 'The guest-list side of this is coming soon.',
  // The creative cards (reels, posts, shoots, edits) are the next thing we are building. They
  // work, but not yet to the bar the four live cards set, so they wait until they do.
  creative: 'We are making this one better right now. Coming soon.',
  // Local ads need the client's ad account connected, which is not wired yet.
  ads: 'This needs your ad account connected, which is coming soon.',
  // Website + local-search fixes: only part is self-serve today (the Google side), the rest is
  // a real site rebuild. Held back until the whole thing is one clean flow.
  site: 'We are still building this into one clean flow. Coming soon.',
}

/** Which reason group each bookmarked built-in belongs to (drives COMING_SOON_REASON). */
const COMING_SOON_GROUP: Record<string, keyof typeof COMING_SOON_REASON> = {
  // Pure email / SMS sends — no send rail exists.
  welcome: 'send', news: 'send', slowoffer: 'send', birthday: 'send', earlyaccess: 'send', winback: 'send',
  // Mostly buildable but carries an email/SMS leg (owner decision: bookmark whole, do not trim).
  catering: 'partialSend', promoevent: 'partialSend', launch: 'partialSend', reviewsplan: 'partialSend', direct: 'partialSend',
  // No real creator supply.
  creator: 'creator',
  // Gift cards + ticketing need POS + sends.
  giftcard: 'commerce', ticket: 'commerce',
  // Mega multi-month programs — rebuild from servicable atoms (Phase 6, deferred).
  nights: 'program', firstvisit: 'program', regulars: 'program',
  // 'reviews' is the system-goal id the 'reviewsplan' card remaps to at plan time (SYSTEM_GOAL_ALIAS
  // in compose-plan). It is never a card of its own, so listing it here only makes the server ship
  // guard catch a reviewsplan order that arrives under its aliased id. Same partial-send reason.
  reviews: 'partialSend',
  // Table QR promises "wired to your list" — the list-capture rail is not built.
  qr: 'capture',
  // The creative shelf — the next build. Held to coming-soon while we rework it.
  reel: 'creative', story: 'creative', graphic: 'creative', dish: 'creative', edit: 'creative',
  gpost: 'creative', shoot: 'creative',
  // Ads need an ad-account connection.
  reach: 'ads',
  // Website + local search: part-Google, part site rebuild, not one flow yet.
  website: 'site', localseo: 'site',
}

/**
 * The built-in decision, derived from the allowlist (owner call, 2026-07-21): EVERY built-in
 * catalog id is 'coming_soon' unless it is in FULLY_BUILT_LIVE. This inverts the old denylist,
 * where anything unlisted defaulted to live — that let a half-built card ship by omission.
 *
 * Only built-in ids are gated here. An id NOT in the built-in catalog (a DB campaign, which only
 * registers once its services are real) is absent from this map and the resolver defaults it to
 * 'live', unchanged. Admin CMS overrides still win over this in availabilityFor.
 */
export const BUILTIN_AVAILABILITY: Record<string, CardAvailability> = Object.fromEntries(
  CREATE_CATALOG_IDS.map((id) => [
    id,
    (FULLY_BUILT_LIVE.includes(id) ? 'live' : 'coming_soon') as CardAvailability,
  ]),
)

/** A per-card override the CMS can set (from catalog_content_overrides.visibility). */
export interface VisibilityOverride { visibility?: CardAvailability | string | null }
export type VisibilityOverrideMap = Record<string, VisibilityOverride | undefined> | null | undefined

function coerceAvailability(v: unknown): CardAvailability | null {
  return v === 'live' || v === 'coming_soon' || v === 'hidden' ? v : null
}

/**
 * The resolved availability for a card id: an admin override (if well-formed) wins, then the built-in
 * decision, then 'live'. So an admin can either un-bookmark a built-in (set 'live') or bookmark a
 * live/DB card (set 'coming_soon' / 'hidden'), and the store, the wrapper, and the server guard all
 * read the same answer.
 */
export function availabilityFor(id: string, overrides?: VisibilityOverrideMap): CardAvailability {
  const o = overrides?.[id]
  const ov = o ? coerceAvailability(o.visibility) : null
  if (ov) return ov
  return BUILTIN_AVAILABILITY[id] ?? 'live'
}

/** Can this card be added to a plan / bought / shipped right now? */
export function isBuyable(id: string, overrides?: VisibilityOverrideMap): boolean {
  return availabilityFor(id, overrides) === 'live'
}

/** Should this card be dropped from the browse entirely (search, shelves, deep-links)? */
export function isHidden(id: string, overrides?: VisibilityOverrideMap): boolean {
  return availabilityFor(id, overrides) === 'hidden'
}

/** EVERY catalog id a composed draft came from: the full merged-cart list when present, else the
 *  single legacy id. The one helper both server guards (checkout/prepare + POST /api/campaigns)
 *  use, so they can never drift on which ids get vetted. */
export function draftSourceCatalogIds(draft: { sourceCatalogId?: string; sourceCatalogIds?: unknown }): string[] {
  const arr = Array.isArray(draft.sourceCatalogIds)
    ? draft.sourceCatalogIds.filter((x): x is string => typeof x === 'string')
    : []
  const ids = arr.length ? arr : (draft.sourceCatalogId ? [draft.sourceCatalogId] : [])
  return [...new Set(ids.map((x) => x.trim()).filter(Boolean))]
}

/** The subset of ids that are NOT buyable right now (coming soon or hidden). */
export function unbuyableCatalogIds(ids: readonly string[], overrides?: VisibilityOverrideMap): string[] {
  return ids.filter((id) => availabilityFor(id, overrides) !== 'live')
}

/** The owner-facing "why it's coming soon" line for a bookmarked card, or null when it is live/hidden
 *  or has no authored reason. */
export function comingSoonReason(id: string, overrides?: VisibilityOverrideMap): string | null {
  if (availabilityFor(id, overrides) !== 'coming_soon') return null
  const group = COMING_SOON_GROUP[id]
  return (group && COMING_SOON_REASON[group]) || 'Coming soon.'
}
