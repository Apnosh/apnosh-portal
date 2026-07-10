/**
 * whatYouGet — the product page's "what you get" rows, DERIVED from the item's real
 * composition instead of hand-written lists that drift from what actually ships:
 *
 *  - system goals (firstvisit / nights / regulars, and reviewsplan via its system alias)
 *    read the same buildSystem() moves the plan flow composes, rendered by plain name;
 *  - a single-service card (gbp, welcome, qr, …) reads that service's real deliverable
 *    bullets from the priced catalog;
 *  - everything else lists its ITEM_SHAPE composition: included services by plain name,
 *    then the seed beats' owner-facing labels.
 *
 * Pure + client-safe (same guarantees as compose-plan: no server, no AI, total on any id).
 * Rows are clamped to 4 so the page stays scannable.
 */

import { ITEM_SHAPE, buildSystem, isSystemGoal } from './compose-plan'
import { serviceById, plainNameOf } from '../catalog'

/** The plan flow routes reviewsplan onto the 'reviews' system goal (builder-entry's
 *  SYSTEM_GOAL_ALIAS) — mirror it so this page describes the plan that actually ships. */
const SYSTEM_ALIAS: Record<string, string> = { reviewsplan: 'reviews' }

const MAX_ROWS = 4

/** Beat labels use an em dash as a clause break; owner copy avoids em dashes, so soften it. */
const plainLabel = (l: string) => l.replace(/\s+—\s+/g, ', ')

export function whatYouGet(itemId: string): string[] {
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

  const shape = ITEM_SHAPE[itemId]
  if (!shape) return []

  const services = (shape.services ?? []).map(serviceById).filter((s) => !!s)

  // One real service and no content seed (gbp, welcome, qr, …): that service's own
  // deliverable bullets ARE the composition — show them instead of one opaque row.
  if (services.length === 1 && shape.seed.length === 0) {
    const bullets = services[0].deliverables?.included ?? []
    if (bullets.length) return bullets.slice(0, MAX_ROWS)
  }

  const rows: string[] = []
  for (const s of services) {
    const name = plainNameOf(s)
    if (!rows.includes(name)) rows.push(name)
  }
  for (const [, , label] of shape.seed) {
    const l = plainLabel(label)
    if (!rows.includes(l)) rows.push(l)
    if (rows.length >= MAX_ROWS) break
  }
  return rows.slice(0, MAX_ROWS)
}
