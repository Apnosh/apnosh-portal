/**
 * Plan-tier entitlements. Pure + client-safe (no server-only, no imports) so it
 * can gate UI (the campaign builder, the GBP fixer) and server routes (gbp-draft,
 * the google-profile page) from the SAME rule — the client UI is never the only gate.
 *
 * PRO ENTITLEMENT = tier is 'Pro' or 'Internal'. Everything AI-lane keys off this.
 */
import type { ClientTier } from '@/types/database'

/** True when the client's plan includes Pro features (Apnosh AI). Internal = staff/test, treated as Pro. */
export function isProTier(tier: ClientTier | string | null | undefined): boolean {
  return tier === 'Pro' || tier === 'Internal'
}
