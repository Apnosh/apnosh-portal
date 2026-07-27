/**
 * Deliverable rows for a list of services, extracted so it can be shared without a cycle.
 *
 * WHY IT IS ITS OWN FILE, and it is not tidiness. what-you-get.ts reads the setup card configs, and
 * the card configs call this to build their done-for-you rows. When both lived in what-you-get.ts
 * that was a circular import with a real, load-order-dependent crash in it: importing
 * what-you-get.ts first evaluated cards.ts partway through, which called back in and read a `const`
 * that had not been initialised yet.
 *
 *     ReferenceError: Cannot access 'MAX_ROWS' before initialization
 *
 * TypeScript cannot see this and the build did not fail; the sim did not catch it either, because
 * the sim happens to import cards.ts first, which is the order where the cycle resolves cleanly. It
 * only showed up when something imported what-you-get.ts first, which is exactly what a page does.
 *
 * With this file in between, the graph is a line and not a loop: cards.ts and what-you-get.ts both
 * depend on this, and this depends on neither.
 */

import { serviceById, plainNameOf } from '../catalog'

/** Base rows are clamped so the product page stays scannable. */
export const MAX_ROWS = 4

/** Beat labels use an em dash as a clause break; owner copy avoids em dashes, so soften it. */
export const plainLabel = (l: string) => l.replace(/\s+—\s+/g, ', ')

/**
 * The shared composition → rows derivation: one service with no seed shows that service's REAL
 * deliverable bullets; otherwise included services by plain name, then the seed beats' owner-facing
 * labels, capped so the page stays scannable.
 */
export function rowsFromComposition(serviceIds: string[], seedLabels: string[]): string[] {
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

/** What-you-get rows for a bare service list — the admin CMS preview path, where the campaign may
 *  not be registered (or even saved) yet. Identical derivation to a registered services-only DB
 *  campaign, so the preview shows the real page facts. */
export function whatYouGetForServices(serviceIds: string[]): string[] {
  return rowsFromComposition(serviceIds, [])
}
