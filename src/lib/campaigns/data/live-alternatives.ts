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

/** Coming-soon bundles whose READY pieces are sellable on their own today. The catering push
 *  is blocked by ONE unbuilt email step; its photo feature + post are real, live products. */
export const UNBUNDLED_TODAY: Record<string, { ids: string[]; note: string }> = {
  catering: {
    ids: ['dish', 'graphic'],
    note: 'The full catering push has an email step we are still building. Its two ready pieces, the dish feature and the post, are real and you can buy them today.',
  },
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
 * Collapse ALL-dark goal shelves into ONE honest "Coming soon" section: a shelf whose
 * every visible card is unbuyable stops pretending to be a shopping aisle. Returns the
 * rows that still have something live plus the deduped id list for the one soon shelf.
 * Rows with no ids (or all hidden) simply drop. The 'suggested' row is never collapsed
 * (its ids are recommendation output, already availability-filtered upstream).
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
    const dark = r.id !== 'suggested' && vis.every((id) => !fns.buyable(id))
    if (dark) {
      for (const id of vis) if (!soonIds.includes(id)) soonIds.push(id)
    } else {
      liveRows.push(r)
    }
  }
  return { liveRows, soonIds }
}
