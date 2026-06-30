/**
 * VOLUME_RATES — owner-reviewable pricing for adjusting HOW MANY of something a service makes
 * (reels, texts, photos, posts) in the campaign builder Step 2. The owner picked "match the new
 * amount": when they change the count, the price tracks the real rate. This is the rate card.
 *
 * HONEST BY CONSTRUCTION:
 *  - At the catalog's base quantity, priceForQty() returns the EXACT catalog price. The owner-reviewed
 *    number never drifts. Only the delta from base moves, at the marginal rate below.
 *  - video-engine carries its REAL volume tiers (stated in the catalog desc: ~$275/video at 4/mo,
 *    $175 at 8, $145 at 12). Price interpolates across those breakpoints, so more reels costs more and
 *    each one costs a little less at higher counts — exactly how the catalog prices that volume.
 *  - Every other service has only ONE flat catalog price, so its marginal rate is the per-unit rate
 *    IMPLIED by that price (amount ÷ base count). That is a starting proposal the owner can correct
 *    here; `basis` says where each number came from.
 *
 * NOT HERE ON PURPOSE: setup/managed/multi-piece services (gbp-setup, social retainers, welcome-seq's
 * email+text set, event-pkg's 5-piece set). They have no single clean unit to scale, so they stay
 * remove-only in the builder. Add a service here only when it has ONE countable deliverable.
 */

export interface VolumeRate {
  /** the countable thing, singular + plural, for owner-facing copy. */
  unit: string
  unitPlural: string
  /** how the line bills — drives the price suffix ("/mo", "once", "each"). */
  cadence: 'monthly' | 'one-time' | 'per-occurrence'
  /** catalog default. priceForQty(base.qty) ALWAYS returns base.price exactly. */
  base: { qty: number; price: number }
  /** stepper bounds + increment. */
  min: number
  max: number
  step: number
  /** $ per unit added/removed from base, when there are no tiers (linear). */
  marginal?: number
  /** real volume breakpoints (only where the catalog states them). price interpolates between. */
  tiers?: { qty: number; price: number }[]
  /** plain-English note on where the rate came from, shown on the review card. */
  basis: string
}

export const VOLUME_RATES: Record<string, VolumeRate> = {
  'video-engine': {
    unit: 'reel', unitPlural: 'reels', cadence: 'monthly',
    base: { qty: 8, price: 1395 }, min: 4, max: 16, step: 1,
    tiers: [{ qty: 4, price: 1100 }, { qty: 8, price: 1395 }, { qty: 12, price: 1740 }],
    basis: 'Your real volume tiers: ~$275/reel at 4, $175 at 8, $145 at 12. More reels costs more, each a bit less at higher counts.',
  },
  'video-single': {
    unit: 'video', unitPlural: 'videos', cadence: 'per-occurrence',
    base: { qty: 1, price: 1195 }, min: 1, max: 6, step: 1,
    marginal: 1195,
    basis: 'Each un-batched video is its own shoot, so $1,195 each. For more than one or two, the reel engine is the better buy.',
  },
  'photo-library': {
    unit: 'photo', unitPlural: 'photos', cadence: 'one-time',
    base: { qty: 30, price: 1050 }, min: 10, max: 60, step: 5,
    marginal: 35,
    basis: 'Implied from your price: $1,050 ÷ 30 = $35 each. The shoot is the same cost, so extra edits may run cheaper. Adjust if so.',
  },
  'social-mgmt': {
    unit: 'post', unitPlural: 'posts', cadence: 'monthly',
    base: { qty: 12, price: 475 }, min: 4, max: 24, step: 2,
    marginal: 40,
    basis: 'Implied from your price: $475 ÷ 12 = ~$40 per post.',
  },
  'gbp-posts': {
    unit: 'Google post', unitPlural: 'Google posts', cadence: 'monthly',
    base: { qty: 4, price: 85 }, min: 2, max: 12, step: 1,
    marginal: 21,
    basis: 'Implied from your price: $85 ÷ 4 = ~$21 per Google post.',
  },
  'newsletter': {
    unit: 'email', unitPlural: 'emails', cadence: 'monthly',
    base: { qty: 1, price: 190 }, min: 1, max: 4, step: 1,
    marginal: 190,
    basis: 'Your price is $190 for one good email a month. Each extra email is another $190.',
  },
  'sms-program': {
    unit: 'text', unitPlural: 'texts', cadence: 'monthly',
    base: { qty: 2, price: 190 }, min: 1, max: 8, step: 1,
    marginal: 95,
    basis: 'Implied from your price: $190 ÷ 2 = $95 per segmented send.',
  },
  'bar-events': {
    unit: 'event push', unitPlural: 'event pushes', cadence: 'monthly',
    base: { qty: 4, price: 525 }, min: 1, max: 8, step: 1,
    marginal: 131,
    basis: 'Implied from your price: $525 ÷ 4 = ~$131 per event push (graphic, social, SMS, listings).',
  },
}

/** Is this service quantity-adjustable in the builder? */
export function isQtyAdjustable(serviceId: string): boolean {
  return serviceId in VOLUME_RATES
}

/** Clamp a requested quantity to the service's bounds, snapped to its step grid off the base. */
export function clampQty(serviceId: string, qty: number): number {
  const r = VOLUME_RATES[serviceId]
  if (!r) return qty
  const snapped = r.base.qty + Math.round((qty - r.base.qty) / r.step) * r.step
  return Math.max(r.min, Math.min(r.max, snapped))
}

/**
 * The TOTAL price for a chosen quantity. Returns the exact catalog price at base.qty (no drift),
 * interpolates across real tiers where present, else moves linearly at the marginal rate.
 * null when the service is not adjustable.
 */
export function priceForQty(serviceId: string, qty: number): number | null {
  const r = VOLUME_RATES[serviceId]
  if (!r) return null
  const q = clampQty(serviceId, qty)
  if (r.tiers && r.tiers.length >= 2) {
    const ts = [...r.tiers].sort((a, b) => a.qty - b.qty)
    // below the first breakpoint: extrapolate down the first segment's slope
    if (q <= ts[0].qty) {
      const s = (ts[1].price - ts[0].price) / (ts[1].qty - ts[0].qty)
      return Math.round(ts[0].price + s * (q - ts[0].qty))
    }
    // at or above the last: extrapolate up the last segment's slope
    const last = ts[ts.length - 1]
    if (q >= last.qty) {
      const prev = ts[ts.length - 2]
      const s = (last.price - prev.price) / (last.qty - prev.qty)
      return Math.round(last.price + s * (q - last.qty))
    }
    // interpolate within the bracketing segment
    for (let i = 0; i < ts.length - 1; i++) {
      if (q >= ts[i].qty && q <= ts[i + 1].qty) {
        const s = (ts[i + 1].price - ts[i].price) / (ts[i + 1].qty - ts[i].qty)
        return Math.round(ts[i].price + s * (q - ts[i].qty))
      }
    }
  }
  const marginal = r.marginal ?? (r.base.qty > 0 ? r.base.price / r.base.qty : 0)
  return Math.round(r.base.price + marginal * (q - r.base.qty))
}

/** The effective per-unit price at a given quantity (for "~$X each" copy). null if not adjustable. */
export function eachAtQty(serviceId: string, qty: number): number | null {
  const total = priceForQty(serviceId, qty)
  const q = clampQty(serviceId, qty)
  if (total == null || q <= 0) return null
  return Math.round(total / q)
}
