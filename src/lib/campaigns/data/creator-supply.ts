/**
 * CREATOR SUPPLY — how many real, bookable creators exist per craft, flattened for the router.
 *
 * Fetched ONCE server-side (vendor-supply.ts creatorSupplySummary) and passed down like
 * MonthlySignals: a plain serializable object, undefined on any failure. Supply NEVER gates
 * lane availability — the internal pool fallback is shipped truth (a creator lane always has a
 * maker behind it) — it only biases defaults and enriches copy ("2 local creators near you").
 * Making the offer surface depend on a fetch would mean a slow query changes what we sell,
 * which is the dishonesty the safe-route pattern exists to prevent.
 *
 * Pure shape, client-safe, imports only the client-safe skill vocabulary.
 */
import type { Dispatch } from '@/lib/marketplace/creator-skills'

export interface CreatorSupply {
  /** Live bookable, dispatchable vendors per craft. Absent craft = none known. */
  countByCraft: Partial<Record<Dispatch, number>>
  assembledAt: string
}
