/**
 * Home "orders in progress" selection — the pure view-model behind the Day-0 Home body.
 *
 * The 20-owner sim's most-hit defect: a paid order in production never showed on Home, so
 * the week after checkout read as silence. This picks which campaign cards Home surfaces:
 * shipped work only (drafts live on the Orders tab), the ones needing the owner first,
 * then work in production, then live ones; done campaigns stay off Home. Capped so Home
 * stays a glance, not a list. Pure + client-safe; unit-tested in the sim harness.
 */
import type { CampCard } from './view'

export const HOME_ORDERS_CAP = 3

/** Rank: needs-your-OK first, then in production, then live. */
function rank(c: CampCard): number {
  if (c.review) return 0
  if (c.pill === 'In production') return 1
  return 2
}

/** The shipped, still-running cards Home shows, most-urgent first, capped. */
export function selectHomeOrders(cards: readonly CampCard[], cap: number = HOME_ORDERS_CAP): CampCard[] {
  return cards
    .filter((c) => c.kind === 'live')
    .sort((a, b) => rank(a) - rank(b))
    .slice(0, cap)
}
