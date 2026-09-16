/**
 * A small per-client cache for reads that are slow to make and cheap to keep (migration 266).
 *
 * Every function here is best-effort: a missing table, a bad row or a network hiccup reads as
 * "nothing cached" and writes as a no-op, so a caller can always fall back to the live path.
 * Readers decide their own freshness: `readCache` hands back the payload and its age, nothing
 * more.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export interface CacheHit<T> { payload: T; computedAt: string; ageMs: number }

export async function readCache<T>(clientId: string, key: string): Promise<CacheHit<T> | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('client_cache').select('payload, computed_at').eq('client_id', clientId).eq('key', key).maybeSingle()
    if (!data?.payload) return null
    const computedAt = String(data.computed_at)
    const t = Date.parse(computedAt)
    return { payload: data.payload as T, computedAt, ageMs: Number.isFinite(t) ? Date.now() - t : Infinity }
  } catch {
    return null
  }
}

export async function writeCache(clientId: string, key: string, payload: unknown): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('client_cache').upsert({ client_id: clientId, key, payload, computed_at: new Date().toISOString() }, { onConflict: 'client_id,key' })
  } catch { /* the live path still works without the cache */ }
}

export async function dropCache(clientId: string, key: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin.from('client_cache').delete().eq('client_id', clientId).eq('key', key)
  } catch { /* nothing to drop */ }
}

/** A short stable key for a set of ids (the comments a read covered), order-independent. */
export function idsKey(ids: string[]): string {
  const s = ids.slice().sort().join('|')
  let h = 2166136261
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0 }
  return `${ids.length}-${h.toString(16)}`
}
