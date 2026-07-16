/**
 * Checkout Gates — server reader. Loads availability_rules + bookings via the service-role client and
 * hands them to the pure slot engine. Server-only.
 *
 * DEGRADES GRACEFULLY (like catalog-campaigns-server): a missing table (migration 218 not applied),
 * missing env, or any query error resolves to "no availability" — never a crash. The client then sees
 * honest request-mode ("we'll propose times"), never a fabricated slot.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { computeOpenSlots } from './availability'
import type { AvailabilityRule, BookingRef, OpenSlot, Window } from './types'

interface RuleRow {
  id: string
  gate_kind: string | null
  scope_kind: string | null
  scope_id: string | null
  label: string | null
  timezone: string | null
  weekly: unknown
  exceptions: unknown
  slot_minutes: number | null
  capacity: number | null
  lead_time_days: number | null
  horizon_days: number | null
  active: boolean | null
}

const isWindow = (v: unknown): v is Window =>
  !!v && typeof v === 'object' && typeof (v as Window).start === 'string' && typeof (v as Window).end === 'string'

/** Coerce a jsonb map of key → window[] defensively (drop malformed windows). */
function coerceWindowMap(v: unknown): Record<string, Window[]> {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return {}
  const out: Record<string, Window[]> = {}
  for (const [k, arr] of Object.entries(v as Record<string, unknown>)) {
    out[k] = Array.isArray(arr) ? (arr.filter(isWindow) as Window[]) : []
  }
  return out
}

export function rowToRule(r: RuleRow): AvailabilityRule {
  return {
    id: r.id,
    gateKind: r.gate_kind ?? 'shoot',
    scopeKind: r.scope_kind === 'vendor' ? 'vendor' : 'team',
    scopeId: r.scope_id ?? null,
    label: r.label ?? null,
    timezone: r.timezone || 'America/Los_Angeles',
    weekly: coerceWindowMap(r.weekly),
    exceptions: coerceWindowMap(r.exceptions),
    slotMinutes: Number(r.slot_minutes) > 0 ? Number(r.slot_minutes) : 120,
    capacity: Number(r.capacity) > 0 ? Number(r.capacity) : 1,
    leadTimeDays: Number.isFinite(Number(r.lead_time_days)) ? Number(r.lead_time_days) : 3,
    horizonDays: Number(r.horizon_days) > 0 ? Number(r.horizon_days) : 45,
    active: !!r.active,
  }
}

/** The active TEAM rule for a gate kind (Phase 1 scope is one team calendar). Null when none / on any
 *  failure — the caller renders request-mode. */
export async function getActiveGateRule(gateKind = 'shoot'): Promise<AvailabilityRule | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('availability_rules')
      .select('*')
      .eq('gate_kind', gateKind)
      .eq('scope_kind', 'team')
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return rowToRule(data as RuleRow)
  } catch {
    return null
  }
}

/** EVERY rule (drafts included), newest first — the admin Availability list. [] on any failure. */
export async function getAllGateRules(): Promise<AvailabilityRule[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin.from('availability_rules').select('*').order('created_at', { ascending: false })
    if (error || !data) return []
    return (data as RuleRow[]).map(rowToRule)
  } catch {
    return []
  }
}

/** Live bookings against a rule (only the states that can occupy a slot are needed). [] on failure. */
async function bookingsForRule(ruleId: string): Promise<BookingRef[]> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('bookings')
      .select('rule_id, slot_date, slot_start, status, hold_expires_at')
      .eq('rule_id', ruleId)
      .in('status', ['held', 'confirmed'])
    if (error || !data) return []
    return (data as Array<Record<string, unknown>>).map((b) => ({
      ruleId: (b.rule_id as string) ?? null,
      slotDate: (b.slot_date as string) ?? null,
      slotStart: (b.slot_start as string) ?? null,
      status: (b.status as BookingRef['status']) ?? 'held',
      holdExpiresAt: (b.hold_expires_at as string) ?? null,
    }))
  } catch {
    return []
  }
}

export interface OpenSlotsResult {
  available: boolean
  reason?: 'no_availability'
  timezone: string | null
  rule: { id: string; label: string | null; gateKind: string } | null
  slots: OpenSlot[]
}

/**
 * The client-facing read: open slots for the active rule of a gate kind, or an honest "no availability"
 * (request-mode) when nothing is published / the table is missing. Never throws, never fabricates.
 */
export async function getOpenSlots(gateKind = 'shoot', nowISO = new Date().toISOString(), maxSlots = 60): Promise<OpenSlotsResult> {
  const rule = await getActiveGateRule(gateKind)
  if (!rule) return { available: false, reason: 'no_availability', timezone: null, rule: null, slots: [] }
  const bookings = await bookingsForRule(rule.id)
  const slots = computeOpenSlots(rule, bookings, nowISO, maxSlots)
  return {
    available: slots.length > 0,
    ...(slots.length ? {} : { reason: 'no_availability' as const }),
    timezone: rule.timezone,
    rule: { id: rule.id, label: rule.label, gateKind: rule.gateKind },
    slots,
  }
}
