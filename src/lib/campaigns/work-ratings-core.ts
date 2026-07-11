/**
 * Pure core of delivered-work ratings: validation + aggregate math, no DB.
 * Split from work-ratings.ts (server) so the tsx harness can exercise the real
 * rules with injected fake rows — same pattern as work-orders-core.ts.
 *
 * Honesty rules enforced here:
 *   - only the paying client rates, and only their own order (client mismatch fails)
 *   - only delivered work can be rated (delivered or approved — never in flight,
 *     never declined)
 *   - only creator-produced work is ratable: the order's creator_id must be a
 *     real vendor UUID. Internal-team orders (pool ids like 'v_maya') are the
 *     Apnosh team — there is no creator profile to rate, so the door stays shut
 *     rather than minting a rating that displays nowhere.
 *   - one rating per order, ever (duplicate -> 409)
 *   - stars are an integer 1..5
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** Statuses that mean the work was actually delivered to the owner. */
export const RATABLE_STATUSES = new Set(['delivered', 'approved'])

/** True when this creator id is a real vendor identity (a vendors row UUID),
 *  not an internal-pool id. Only real creators collect ratings. */
export function isRealCreatorId(creatorId: string | null | undefined): boolean {
  return !!creatorId && UUID.test(creatorId)
}

export interface RatableOrder {
  clientId: string
  creatorId: string
  status: string
}

export type RatingVerdict = { ok: true } | { ok: false; status: number; error: string }

/**
 * The single validation gate for a new rating. `order` null = unknown order id.
 * `alreadyRated` = a work_ratings row already exists for this order.
 */
export function validateRating(
  order: RatableOrder | null,
  callerClientId: string,
  alreadyRated: boolean,
  stars: unknown,
): RatingVerdict {
  if (!order) return { ok: false, status: 404, error: 'work order not found' }
  if (order.clientId !== callerClientId) return { ok: false, status: 403, error: 'this order belongs to a different account' }
  if (!isRealCreatorId(order.creatorId)) return { ok: false, status: 400, error: 'this piece was made by the Apnosh team, not a creator — there is nothing to rate here' }
  if (!RATABLE_STATUSES.has(order.status)) return { ok: false, status: 409, error: 'you can rate this once the work is delivered' }
  if (alreadyRated) return { ok: false, status: 409, error: 'you already rated this work' }
  if (typeof stars !== 'number' || !Number.isInteger(stars) || stars < 1 || stars > 5) {
    return { ok: false, status: 400, error: 'stars must be a whole number from 1 to 5' }
  }
  return { ok: true }
}

export interface RatingAggregate {
  avg: number     // rounded to 1 decimal
  count: number
}

/** Aggregate real rating rows. Null when there are none — the honest empty
 *  state is "No ratings yet", never a fabricated zero or placeholder. */
export function computeAggregate(stars: number[]): RatingAggregate | null {
  const valid = stars.filter((s) => Number.isFinite(s) && s >= 1 && s <= 5)
  if (!valid.length) return null
  const avg = Math.round((valid.reduce((a, b) => a + b, 0) / valid.length) * 10) / 10
  return { avg, count: valid.length }
}

/** "4.8 (12 ratings)" / "5 (1 rating)" / "No ratings yet". */
export function ratingLabel(agg: RatingAggregate | null): string {
  if (!agg) return 'No ratings yet'
  return `${agg.avg} (${agg.count} ${agg.count === 1 ? 'rating' : 'ratings'})`
}
