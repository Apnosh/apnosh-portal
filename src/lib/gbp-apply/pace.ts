/**
 * gbp-apply/pace — the per-location write pacer, extracted from dispatch.ts so the
 * generic field-write engine (fields.ts) and the work-order dispatch engine share ONE
 * slot pool per GBP location. Google caps profile edits at 10/min and that cap cannot
 * be raised. Source of truth = the gbp_write_ledger RPC (atomic, shared across server
 * instances; migration 191). Until that migration is applied, fall back to the
 * in-memory per-instance bucket — safe for one careful operator, NOT for concurrent
 * fleets, which is why the durable path exists.
 */
import { createAdminClient } from '@/lib/supabase/admin'

const writeStamps = new Map<string, number[]>()
function acquireLocalSlot(key: string, limit = 10, windowMs = 60_000): boolean {
  const now = Date.now()
  const recent = (writeStamps.get(key) ?? []).filter((t) => now - t < windowMs)
  if (recent.length >= limit) { writeStamps.set(key, recent); return false }
  recent.push(now)
  writeStamps.set(key, recent)
  return true
}

export async function acquireWriteSlot(locationKey: string): Promise<boolean> {
  const admin = createAdminClient()
  try {
    const { data, error } = await admin.rpc('gbp_acquire_write_slot', { p_location: locationKey, p_limit: 10, p_window_secs: 60 })
    if (!error && typeof data === 'boolean') return data
  } catch { /* table/function not applied yet — fall back below */ }
  return acquireLocalSlot(locationKey)
}
