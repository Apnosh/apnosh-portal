/**
 * getActiveRateCard — the ONE server-side door to design pricing (GD-1).
 *
 * Reads the highest ACTIVE design_price_sheets row and lays it over the code
 * RATE_CARD (missing keys fall back, so a partial sheet can change one number
 * without restating the rest). No active row — or any read/shape problem — means
 * version 0: the code card, exactly today's behavior. Pricing must never fail
 * because the sheet table is empty, missing, or malformed.
 *
 * The returned version is stamped into every order's brief, so "what sheet was
 * this bought under" is always answerable.
 *
 * Margin floor: when a sheet carries costs, any price at or below its stated
 * cost logs a loud warning. Advisory by design — a warning never blocks an
 * order the client already saw a price for.
 *
 * SERVER-ONLY (admin client). The flow UI keeps reading the code card until an
 * owner-facing sheet editor exists; the server's number is authoritative either
 * way (the route never trusts the client's total).
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { RATE_CARD, type RateCard } from './rate-card'

export interface ActiveRateCard {
  card: RateCard
  /** 0 = the code card (no active sheet row) */
  version: number
}

const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/* one-minute cache: order bursts should not re-read a row that changes rarely */
let cache: { at: number; value: ActiveRateCard } | null = null
const CACHE_MS = 60_000

export async function getActiveRateCard(): Promise<ActiveRateCard> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value
  const fallback: ActiveRateCard = { card: RATE_CARD, version: 0 }
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('design_price_sheets')
      .select('version, card, costs')
      .eq('active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) {
      // table missing (migration not run) or simply no active sheet → code card
      cache = { at: Date.now(), value: fallback }
      return fallback
    }
    const c = (data.card ?? {}) as Partial<Record<keyof RateCard, unknown>>
    const merged: RateCard = {
      ...RATE_CARD,
      ...(typeof c.approved === 'boolean' ? { approved: c.approved } : {}),
      tierBase: {
        1: num((c.tierBase as Record<string, unknown> | undefined)?.['1']) ? Number((c.tierBase as Record<string, unknown>)['1']) : RATE_CARD.tierBase[1],
        2: num((c.tierBase as Record<string, unknown> | undefined)?.['2']) ? Number((c.tierBase as Record<string, unknown>)['2']) : RATE_CARD.tierBase[2],
        3: num((c.tierBase as Record<string, unknown> | undefined)?.['3']) ? Number((c.tierBase as Record<string, unknown>)['3']) : RATE_CARD.tierBase[3],
      },
      destinationAdder: {
        ...RATE_CARD.destinationAdder,
        ...Object.fromEntries(Object.entries((c.destinationAdder as Record<string, unknown>) ?? {}).filter(([, v]) => num(v))),
      } as RateCard['destinationAdder'],
      ...(num(c.photoSourcing) ? { photoSourcing: c.photoSourcing } : {}),
      ...(num(c.printManagement) ? { printManagement: c.printManagement } : {}),
      ...(num(c.rushMultiplier) && (c.rushMultiplier as number) >= 1 ? { rushMultiplier: c.rushMultiplier as number } : {}),
      ...(num(c.rushWindowHours) ? { rushWindowHours: c.rushWindowHours } : {}),
      ...(num(c.includedRevisions) ? { includedRevisions: c.includedRevisions } : {}),
    }
    // margin-floor warnings: any priced key at or under its stated cost is loud
    const costs = (data.costs ?? {}) as Record<string, unknown>
    for (const [key, cost] of Object.entries(costs)) {
      if (!num(cost)) continue
      const price = key.startsWith('tier')
        ? merged.tierBase[Number(key.slice(4)) as 1 | 2 | 3]
        : key in merged.destinationAdder
          ? merged.destinationAdder[key as keyof RateCard['destinationAdder']]
          : (merged as unknown as Record<string, unknown>)[key]
      if (num(price) && price <= cost) {
        console.warn(`[design-price-sheet] v${data.version} ${key}: price $${price} <= cost $${cost} (margin floor)`)
      }
    }
    const value = { card: merged, version: Number(data.version) || 0 }
    cache = { at: Date.now(), value }
    return value
  } catch {
    return fallback
  }
}
