/**
 * DAILY AGGREGATION — the pure heart of the POS sync (CHANNELS-PLAN P4b).
 *
 * Vendors hand us individual payments; the canonical table holds one row per
 * client x source x day. This module owns that fold so both adapters share one
 * bucketing rule and the goldens can pin it without a network.
 *
 * Days are UTC for v1 (recorded in meta.tz so a later merchant-timezone upgrade
 * can re-bucket honestly rather than silently shifting history).
 */

export interface PaymentEvent {
  /** epoch milliseconds of the payment */
  atMs: number
  /** completed amount in cents; refunds may be negative */
  cents: number
}

export interface DayTotal {
  day: string // 'YYYY-MM-DD' (UTC)
  gross_cents: number
  orders: number
}

export const dayOfMs = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

export function aggregateDaily(payments: PaymentEvent[]): DayTotal[] {
  const byDay = new Map<string, { gross: number; orders: number }>()
  for (const p of payments) {
    if (!Number.isFinite(p.atMs) || !Number.isFinite(p.cents)) continue
    const day = dayOfMs(p.atMs)
    const cur = byDay.get(day) ?? { gross: 0, orders: 0 }
    cur.gross += Math.round(p.cents)
    cur.orders += 1
    byDay.set(day, cur)
  }
  return [...byDay.entries()]
    .map(([day, v]) => ({ day, gross_cents: v.gross, orders: v.orders }))
    .sort((a, b) => (a.day < b.day ? -1 : 1))
}

/** The sync window: today back through N days. Idempotent upserts make re-reading
 *  the overlap free, and the overlap is what heals late-arriving payments. */
export function windowStartMs(nowMs: number, days = 7): number {
  return nowMs - days * 24 * 60 * 60 * 1000
}
