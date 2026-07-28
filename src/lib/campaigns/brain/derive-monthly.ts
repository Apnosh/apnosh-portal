import 'server-only'

/**
 * deriveMonthlySignals — the one bridge between the brain and the monthly composer.
 *
 * The monthly plan recomposes client-side on every dial tick, so the brain is consulted exactly
 * once, server-side, and flattened into the plain MonthlySignals shape the composer's tilt rules
 * consume. Unwrapping happens HERE (usable() on each Reading) so the client never sees the
 * Reading envelope and can never mistake missing for false.
 *
 * SAFE ROUTE IS STRUCTURAL: on thin data (planRoute 'safe') this returns undefined, so the
 * client component literally receives no signals object and the composer runs exactly as it did
 * before signals existed. There is no flag to mis-gate.
 *
 * The 'server-only' import is a tripwire: any future client import becomes a build failure
 * instead of a bundle leak (sims run via the scripts/sim/_shims shim).
 */
import { planRoute, type BrainSignals } from './signals'
import { usable } from './readiness'
import type { MonthlySignals } from '../data/monthly-signals'

export function deriveMonthlySignals(b: BrainSignals, at: string): MonthlySignals | undefined {
  if (planRoute(b) === 'safe') return undefined
  return {
    droppedServiceIds: usable(b.droppedServiceIds) ? b.droppedServiceIds.value : [],
    workingServiceIds: usable(b.workingServiceIds) ? b.workingServiceIds.value : [],
    rating: usable(b.rating) ? b.rating.value : null,
    listingCompleteness: usable(b.listingCompleteness) ? b.listingCompleteness.value : null,
    hasList: usable(b.hasList) ? b.hasList.value : null,
    complaintThemes: usable(b.complaintThemes) ? b.complaintThemes.value : [],
    assembledAt: at,
  }
}
