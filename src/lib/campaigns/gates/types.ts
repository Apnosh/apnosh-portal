/**
 * Checkout Gates — shared types. A "gate" is a required agreement that must be settled BEFORE (or,
 * when flexible, right around) checkout. Scheduling a photoshoot is the flagship instance; the same
 * machinery generalizes to 'input' (a fact that changes feasibility) and 'agreement' (an explicit
 * acceptance) gates. Client-safe (pure types only) so both the admin editor and the client picker
 * import them.
 */

/** A weekly window of wall-clock time (in the rule's timezone). */
export interface Window {
  /** 'HH:MM' 24h. */
  start: string
  /** 'HH:MM' 24h, after start. */
  end: string
}

/** A published availability rule (the seller's supply for one gate kind). Mirrors availability_rules. */
export interface AvailabilityRule {
  id: string
  gateKind: string
  scopeKind: 'team' | 'vendor'
  scopeId: string | null
  label: string | null
  timezone: string
  /** weekday (0=Sun..6=Sat, as string keys) → windows that day is open. */
  weekly: Record<string, Window[]>
  /** 'YYYY-MM-DD' → [] (closed) or altered windows (overrides the weekly default that day). */
  exceptions: Record<string, Window[]>
  slotMinutes: number
  capacity: number
  leadTimeDays: number
  horizonDays: number
  active: boolean
}

/** A booking that consumes capacity. Only status + hold_expires_at matter to the slot math. */
export interface BookingRef {
  ruleId: string | null
  slotDate: string | null
  slotStart: string | null
  status: 'held' | 'confirmed' | 'needs_reschedule' | 'cancelled' | 'completed'
  holdExpiresAt: string | null
}

/** One computed open slot the client can pick (wall-clock, in the rule's timezone). */
export interface OpenSlot {
  ruleId: string
  /** 'YYYY-MM-DD'. */
  date: string
  /** 'HH:MM'. */
  start: string
  /** 'HH:MM'. */
  end: string
  timezone: string
  /** how many bookings this slot can still take (>= 1 for an open slot). */
  remaining: number
}

/** The gate kinds that ride the same booking machinery. */
export type GateKind = 'booking' | 'input' | 'agreement'

/** One gate on a catalog item (stored in catalog_*.gates jsonb). */
export interface GateDef {
  id: string
  kind: GateKind
  /** the availability_rules.gate_kind this booking gate draws slots from (booking gates only). */
  gateKind?: string
  when: 'pre-checkout' | 'flexible'
  required: boolean
  params?: Record<string, unknown>
}
