import 'server-only'

/**
 * CREATOR SCHEDULE — the read side of per-creator booking. A creator publishes their hours as a
 * VENDOR-scoped availability rule; a restaurant sees only the slots that rule actually leaves open.
 *
 * This reuses the checkout-gates engine wholesale: the same `availability_rules` table (its
 * `scope_kind='vendor'` + `scope_id` columns, built but unused until now), the same `bookings`
 * table, and the same PURE `computeOpenSlots` so what a creator previews is exactly what a
 * restaurant can book. No new tables, no money: a creator rule is a plain row, a hold is a plain
 * row. The only marketplace-specific choices live here:
 *   - a rule is per-vendor (scope_kind='vendor', scope_id = the vendor id, gate_kind='shoot')
 *   - confirm mode (instant vs request) rides in the rule's `label` as `confirm:instant|request`,
 *     since the marketplace owns vendor-rule labels (no schema change needed)
 *
 * Degrades like the rest of the gate code: a missing table or any error resolves to "no
 * availability", so a restaurant sees honest request-mode, never a fabricated slot.
 */

import { cache } from 'react'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import { rowToRule } from '@/lib/campaigns/gates/availability-server'
import type { AvailabilityRule, BookingRef, Window } from '@/lib/campaigns/gates/types'
import type { ConfirmMode, VendorSchedule } from './creator-schedule-types'
export type { ConfirmMode, VendorSchedule }

/** The one gate kind creators schedule against today (on-site creative visits). */
export const CREATOR_GATE_KIND = 'shoot'

/** Read confirm mode from a vendor rule's label. New creators default to 'request' (owner decision). */
export function parseConfirmMode(label: string | null | undefined): ConfirmMode {
  return /confirm:instant/.test(label ?? '') ? 'instant' : 'request'
}
/** The label we store on a vendor rule to carry its confirm mode. */
export function confirmLabel(mode: ConfirmMode): string {
  return `confirm:${mode}`
}

/** The current logged-in creator's vendor, or null. Identity from the session, never the request.
 *  Wrapped in React cache() so repeat calls within ONE request collapse to a single getUser + vendors
 *  lookup (a page like /creator/bookings used to resolve this 3x = 6 round-trips). */
export const currentVendor = cache(async (): Promise<{ id: string; name: string; slug: string; craft: string | null } | null> => {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const admin = createAdminClient()
  const { data } = await admin.from('vendors').select('id, name, slug, craft').eq('person_id', user.id).maybeSingle()
  return data ? { id: data.id as string, name: data.name as string, slug: data.slug as string, craft: (data.craft as string | null) ?? null } : null
})

/** The active vendor rule for a vendor id, mapped to the pure engine shape (+ its confirm mode). */
export async function getVendorRule(vendorId: string): Promise<{ rule: AvailabilityRule; confirmMode: ConfirmMode } | null> {
  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('availability_rules')
      .select('*')
      .eq('gate_kind', CREATOR_GATE_KIND)
      .eq('scope_kind', 'vendor')
      .eq('scope_id', vendorId)
      .eq('active', true)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    const rule = rowToRule(data as Parameters<typeof rowToRule>[0])
    return { rule, confirmMode: parseConfirmMode((data as { label: string | null }).label) }
  } catch {
    return null
  }
}

/** Resolve a vendor id from its slug (public, bookable, non-Apnosh). Null when not found. */
export async function vendorIdForSlug(slug: string): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('vendors').select('id').eq('slug', slug).eq('bookable', true).neq('vendor_type', 'apnosh').maybeSingle()
    return (data?.id as string) ?? null
  } catch {
    return null
  }
}

/** Live held/confirmed bookings against a rule (the capacity inputs the slot engine needs). */
export async function bookingsForRule(ruleId: string): Promise<BookingRef[]> {
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

/** The client-facing read: a vendor's open slots, or honest request-mode when nothing is published. */
export async function getVendorSchedule(vendorId: string, nowISO = new Date().toISOString(), maxSlots = 60): Promise<VendorSchedule> {
  const found = await getVendorRule(vendorId)
  if (!found) return { available: false, reason: 'no_availability', timezone: null, confirmMode: 'request', ruleId: null, slots: [] }
  const bookings = await bookingsForRule(found.rule.id)
  const slots = computeOpenSlots(found.rule, bookings, nowISO, maxSlots)
  return {
    available: slots.length > 0,
    ...(slots.length ? {} : { reason: 'no_availability' as const }),
    timezone: found.rule.timezone,
    confirmMode: found.confirmMode,
    ruleId: found.rule.id,
    slots,
  }
}

/** Same read, by slug — what the product page calls (it has the vendor slug). */
export async function getVendorScheduleBySlug(vendorSlug: string, nowISO = new Date().toISOString(), maxSlots = 60): Promise<VendorSchedule> {
  const vendorId = await vendorIdForSlug(vendorSlug)
  if (!vendorId) return { available: false, reason: 'no_availability', timezone: null, confirmMode: 'request', ruleId: null, slots: [] }
  return getVendorSchedule(vendorId, nowISO, maxSlots)
}

/** A sensible starter week for a creator who has not set hours yet (the editor seeds from this). */
export function defaultWeekly(): Record<string, Window[]> {
  // Tue + Thu mornings, Sat late morning — a plausible creative-visit week.
  return {
    '2': [{ start: '09:00', end: '13:00' }],
    '4': [{ start: '09:00', end: '17:00' }],
    '6': [{ start: '10:00', end: '14:00' }],
  }
}
