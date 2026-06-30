/**
 * Readiness — the honest envelope around every business signal the brain reads.
 *
 * The audit's rule: a missing signal must be structurally unable to change a plan, and a null
 * must never be read as a real zero. So every signal the brain consumes is wrapped in a Reading
 * that says whether it is usable and when it was measured. Per the audit, readiness is a BOOLEAN
 * at the point of use (usable / not) plus a timestamp for an "as of" badge — not a four-state
 * enum the plan would branch on but no owner could ever see.
 *
 * Pure, no IO. Used by the signal assembler (Phase 1 wiring) and every rule that gates on data.
 */

export type Readiness = 'usable' | 'unusable'

export interface Reading<T> {
  /** The value, or null when we do not actually have it. Never a fabricated default. */
  value: T | null
  readiness: Readiness
  /** ISO timestamp of when this was measured, for an "as of" freshness note. Null if unknown. */
  measuredAt: string | null
}

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false
  if (typeof v === 'number' && Number.isNaN(v)) return false
  if (typeof v === 'string' && v.trim() === '') return false
  if (Array.isArray(v) && v.length === 0) return false
  return true
}

/** Wrap a value as a Reading. Usable iff it is actually present (and not explicitly marked stale).
 *  `usable: false` lets a caller mark a present-but-untrustworthy value (e.g. a lagged-zero) unusable. */
export function reading<T>(value: T | null | undefined, opts?: { measuredAt?: string | null; usable?: boolean }): Reading<T> {
  const has = present(value)
  const ok = (opts?.usable ?? true) && has
  return { value: has ? (value as T) : null, readiness: ok ? 'usable' : 'unusable', measuredAt: opts?.measuredAt ?? null }
}

/** An explicitly-missing signal. */
export function missing<T>(): Reading<T> {
  return { value: null, readiness: 'unusable', measuredAt: null }
}

/** Type guard: the reading is usable and carries a real value. The ONLY way a rule should read a signal. */
export function usable<T>(r: Reading<T> | undefined | null): r is Reading<T> & { value: T } {
  return !!r && r.readiness === 'usable' && r.value !== null
}

/** The value if usable, else the caller's explicit fallback. Never invents — the fallback is the caller's choice. */
export function gateValue<T>(r: Reading<T> | undefined | null, fallback: T): T {
  return usable(r) ? r.value : fallback
}
