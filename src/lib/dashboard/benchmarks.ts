/**
 * Benchmarks per restaurant shape.
 *
 * Phase B6 of the client portal plan. Per PRODUCT-SPEC.md, owners need
 * context for metrics -- "reach 14k" alone is useless; "reach 14k --
 * typical for a 50-seat casual restaurant in a metro is 10k-18k" is
 * useful.
 *
 * The numbers below are first-pass strategist intuition based on agency
 * experience. They get sharper over time as we accumulate real client
 * outcome data per shape (the playbook IP moat).
 *
 * Unit: 30-day rolling totals unless noted. Tweak when we have signal.
 */

import type { Footprint, Concept, CustomerMix } from '@/lib/goals/types'

export type BenchmarkSignal =
  | 'gbp_actions'        // calls + directions + website clicks + bookings
  | 'social_reach'       // 30-day reach across IG + FB
  | 'review_velocity'    // new reviews / month
  | 'avg_rating'         // 1-5

export interface BenchmarkBand {
  low: number      // 25th percentile
  typical: [number, number]   // 25th-75th
  high: number    // 75th
  unit: string
}

interface ShapeKey {
  footprint?: Footprint | null
  concept?: Concept | null
  customerMix?: CustomerMix | null
}

/**
 * Best-effort match: returns the most specific band for this shape, or
 * a sensible default if we don't have one yet. Numbers cite a small
 * range so we can iterate as we get real data.
 */
export function benchmarkFor(
  signal: BenchmarkSignal,
  shape: ShapeKey
): BenchmarkBand | null {
  const fp = shape.footprint
  const concept = shape.concept

  if (signal === 'gbp_actions') {
    if (fp === 'enterprise' || fp === 'multi_regional') {
      return { low: 800, typical: [1500, 4000], high: 4000, unit: 'actions/wk' }
    }
    if (fp === 'multi_local') {
      return { low: 400, typical: [800, 2000], high: 2000, unit: 'actions/wk' }
    }
    if (fp === 'ghost' || concept === 'delivery_only') {
      return { low: 0, typical: [0, 100], high: 100, unit: 'actions/wk' }
    }
    if (concept === 'fine_dining') {
      return { low: 80, typical: [150, 400], high: 400, unit: 'actions/wk' }
    }
    // Single-neighborhood casual / cafe / bar -- the modal Tier 2 client
    return { low: 100, typical: [200, 600], high: 600, unit: 'actions/wk' }
  }

  if (signal === 'social_reach') {
    if (fp === 'enterprise' || fp === 'multi_regional') {
      return { low: 20000, typical: [50000, 150000], high: 150000, unit: 'reach/wk' }
    }
    if (fp === 'multi_local') {
      return { low: 5000, typical: [10000, 30000], high: 30000, unit: 'reach/wk' }
    }
    if (concept === 'fine_dining' || concept === 'mobile') {
      return { low: 1500, typical: [3000, 8000], high: 8000, unit: 'reach/wk' }
    }
    return { low: 1000, typical: [2000, 6000], high: 6000, unit: 'reach/wk' }
  }

  if (signal === 'review_velocity') {
    if (fp === 'enterprise' || fp === 'multi_regional') {
      return { low: 20, typical: [40, 100], high: 100, unit: 'reviews/mo' }
    }
    if (fp === 'multi_local') {
      return { low: 10, typical: [15, 40], high: 40, unit: 'reviews/mo' }
    }
    return { low: 2, typical: [4, 12], high: 12, unit: 'reviews/mo' }
  }

  if (signal === 'avg_rating') {
    // Universal across shapes -- restaurants compete in the same star
    // economy. 4.3-4.7 is the "healthy" band.
    return { low: 4.0, typical: [4.3, 4.7], high: 4.7, unit: 'stars' }
  }

  return null
}

/**
 * Returns the one-line context string to render under a metric.
 * Example: "Typical for your shape: 200-600 actions/wk"
 */
export function benchmarkLine(
  signal: BenchmarkSignal,
  shape: ShapeKey,
  observed: number | null
): string | null {
  const band = benchmarkFor(signal, shape)
  if (!band) return null

  const lo = formatNumber(band.typical[0])
  const hi = formatNumber(band.typical[1])
  const rangeText = `Typical for restaurants like yours: ${lo}-${hi} ${band.unit}`

  if (observed === null) return rangeText

  if (observed >= band.high) return `${rangeText} -- you're above the typical range.`
  if (observed >= band.typical[0]) return `${rangeText} -- you're in the typical range.`
  if (observed >= band.low) return `${rangeText} -- you're below typical; room to grow.`
  return `${rangeText} -- well below typical; this is where to focus.`
}

function formatNumber(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return n.toLocaleString()
}
