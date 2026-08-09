/**
 * live-alternatives — honest detours for coming-soon cards and dark shelves.
 *
 * The 20-owner sim's break #5: whole goals had nothing to buy and the store dead-ended
 * (a coming-soon PDP with no date, no notify, no "do this instead"; two shelves that were
 * 100% dark; ~$6,300/mo of intent walked). This module is the ONE source for "what you can
 * do today": live cards for the same goal or funnel stage, plus hand-authored unbundles
 * for bundles blocked by a single unbuilt step.
 *
 * CLIENT-SAFE + pure (imported by the store JSX and unit-tested in the sim harness).
 * Every id returned is buyable under the SAME availability resolver the server guard uses,
 * so a detour can never point at another dead end.
 */
import { CREATE_CATALOG } from './create-catalog'
import { isBuyable, type VisibilityOverrideMap } from './catalog-availability'

/** Coming-soon bundles whose pieces are sellable on their own — WHEN they are. The catering push is
 *  blocked by one unbuilt email step; its photo feature + post are the pieces it unbundles into.
 *
 *  Read this through `unbundleFor`, never directly: the note promises "you can buy them today", and
 *  whether that is true depends on the allowlist, which moves. It was briefly false — both pieces
 *  were gated as coming-soon while this note still told owners to go buy them. */
export const UNBUNDLED_TODAY: Record<string, { ids: string[]; note: string }> = {
  // catering went live 2026-08-09 (sold without its email leg), so its unbundle detour retired.
}

/**
 * The unbundle note for a coming-soon card, or null when it would not be true right now. Honest by
 * construction: the note only appears while EVERY piece it names can actually be bought, so the
 * allowlist tightening can silence it but can never make it lie. It comes back on its own when
 * those pieces go live.
 */
export function unbundleFor(id: string, overrides?: VisibilityOverrideMap): { ids: string[]; note: string } | null {
  const u = UNBUNDLED_TODAY[id]
  if (!u || !u.ids.length) return null
  return u.ids.every((x) => isBuyable(x, overrides)) ? u : null
}

const STAPLES = ['dish', 'reel', 'gbp', 'gpost']

/** Live cards to offer INSTEAD of a coming-soon card: its unbundled ready pieces first,
 *  then live cards for the same goal, then the same funnel stage, then broadly-useful
 *  staples. Never includes the card itself or anything unbuyable. */
export function liveAlternativesFor(id: string, overrides?: VisibilityOverrideMap, n = 3): string[] {
  const src = CREATE_CATALOG.find((c) => c.id === id)
  const out: string[] = []
  const push = (x: string) => {
    if (x !== id && isBuyable(x, overrides) && !out.includes(x)) out.push(x)
  }
  for (const u of UNBUNDLED_TODAY[id]?.ids ?? []) push(u)
  if (src) for (const c of CREATE_CATALOG) if (c.goal === src.goal) push(c.id)
  if (src) for (const c of CREATE_CATALOG) if ((c.stages ?? []).some((s) => (src.stages ?? []).includes(s))) push(c.id)
  for (const st of STAPLES) push(st)
  return out.slice(0, n)
}

/** Live cards for a funnel-stage shelf that has zero live plays (the dark-shelf reroute). */
export function liveAlternativesForStage(stage: string, overrides?: VisibilityOverrideMap, n = 4): string[] {
  const out: string[] = []
  const push = (x: string) => { if (isBuyable(x, overrides) && !out.includes(x)) out.push(x) }
  for (const c of CREATE_CATALOG) if ((c.stages ?? []).includes(stage as never)) push(c.id)
  for (const st of STAPLES) push(st)
  return out.slice(0, n)
}

export interface ShelfRow { id: string; ids: string[] }

/**
 * Split the shelves into what can be BOUGHT and what is merely on the way.
 *
 * Every goal shelf keeps only its buyable cards; every unbuyable card, from any shelf, gathers into
 * ONE "Coming soon" section at the bottom. So a category never mixes things you can buy with things
 * you cannot: browsing "Get found" shows four real options, not four real ones followed by six greyed
 * ones. What is not for sale yet is still visible and still opens, just in one honest place.
 *
 * (This used to fold only 100%-dark shelves and leave coming-soon cards sitting at the end of mixed
 * ones, which is what made the aisles read half-real.)
 *
 * Returns the rewritten rows plus the deduped id list for the soon shelf. A row left with nothing
 * live simply drops, so an all-unbuyable shelf still disappears exactly as before.
 */
export function collapseDarkShelves(
  rows: readonly ShelfRow[],
  fns: { buyable: (id: string) => boolean; hidden: (id: string) => boolean },
): { liveRows: ShelfRow[]; soonIds: string[] } {
  const liveRows: ShelfRow[] = []
  const soonIds: string[] = []
  for (const r of rows) {
    const vis = (r.ids ?? []).filter((id) => !fns.hidden(id))
    if (!vis.length) continue
    const live = vis.filter((id) => fns.buyable(id))
    // A coming-soon card is pulled out of its category wherever it appears, INCLUDING 'suggested' —
    // a card that cannot be bought must never headline the store as a top pick.
    for (const id of vis) if (!fns.buyable(id) && !soonIds.includes(id)) soonIds.push(id)
    if (live.length) liveRows.push({ ...r, ids: live })
  }
  return { liveRows, soonIds }
}
