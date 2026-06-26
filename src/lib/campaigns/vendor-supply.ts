/**
 * Real-supply bridge (Phase 5c): resolve a creator assigned to an order to their real
 * vendor record (migration 146) when one exists, so payouts use the vendor's NEGOTIATED
 * take-rate instead of the flat platform default. The seeded creator pool (creators.ts)
 * uses non-UUID ids ('v_maya'), so those short-circuit to the default with no query; a
 * real vendor's order carries the vendor's UUID id, which resolves its
 * platform_fee_percent. Server-only (admin client).
 *
 * NOTE: auto-ASSIGNING real vendors by discipline still needs a craft field on the
 * vendors table + the seeded pool swapped for a live query; that, plus real creator
 * signup/onboarding, is the remaining half of Phase 5c. This module is the money side,
 * correct the moment a real vendor is the assignee.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { DEFAULT_PLATFORM_FEE } from './work-orders-core'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** The platform take-rate (%) for the creator assigned to an order: a real vendor's
 *  negotiated platform_fee_percent, or the platform default for a seeded pool creator
 *  (or any unresolved id). Never throws — degrades to the default. */
export async function feePercentForCreator(creatorId: string): Promise<number> {
  if (!creatorId || !UUID.test(creatorId)) return DEFAULT_PLATFORM_FEE   // a seeded pool id → never a real vendor
  const admin = createAdminClient()
  const { data, error } = await admin.from('vendors').select('platform_fee_percent').eq('id', creatorId).maybeSingle()
  if (error || !data) return DEFAULT_PLATFORM_FEE
  const pct = Number(data.platform_fee_percent)
  return Number.isFinite(pct) ? pct : DEFAULT_PLATFORM_FEE
}
