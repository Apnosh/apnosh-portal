'use server'

/**
 * CREATOR AVAILABILITY — a creator sets their own hours (the "When you shoot" editor). Writes a
 * VENDOR-scoped row in the shared availability_rules table, so the same slot engine that runs
 * Apnosh's own shoots now runs each creator's. Identity is from the session; a creator can only
 * ever touch their own rule. No money, no new tables.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { currentVendor, defaultWeekly, confirmLabel, parseConfirmMode, CREATOR_GATE_KIND } from './creator-schedule'
import type { Window } from '@/lib/campaigns/gates/types'
import type { CreatorAvailabilityForm, ConfirmMode } from './creator-schedule-types'

const HHMM = /^([01]?\d|2[0-3]):[0-5]\d$/
const posInt = (n: unknown, min: number, max: number, fallback: number): number => {
  const v = Math.round(Number(n))
  return Number.isFinite(v) && v >= min && v <= max ? v : fallback
}

/** Keep only well-formed windows (valid HH:MM, start before end); drop the rest silently. */
function cleanWeekly(weekly: unknown): Record<string, Window[]> {
  if (!weekly || typeof weekly !== 'object' || Array.isArray(weekly)) return {}
  const out: Record<string, Window[]> = {}
  for (const [day, arr] of Object.entries(weekly as Record<string, unknown>)) {
    if (!/^[0-6]$/.test(day) || !Array.isArray(arr)) continue
    const wins = arr.flatMap((w) => {
      const ww = w as Window
      if (!ww || typeof ww !== 'object' || !HHMM.test(ww.start) || !HHMM.test(ww.end) || ww.start >= ww.end) return []
      return [{ start: ww.start, end: ww.end }]
    })
    if (wins.length) out[day] = wins
  }
  return out
}

/** The creator's current hours, or sensible defaults when they have not set any yet. */
export async function getMyAvailability(): Promise<{ vendor: { id: string; name: string; slug: string } | null; form: CreatorAvailabilityForm }> {
  const defaults: CreatorAvailabilityForm = {
    weekly: defaultWeekly(), slotMinutes: 120, capacity: 1, leadTimeDays: 3, horizonDays: 45,
    timezone: 'America/Los_Angeles', confirmMode: 'request', active: false,
  }
  const vendor = await currentVendor()
  if (!vendor) return { vendor: null, form: defaults }

  const admin = createAdminClient()
  const { data } = await admin
    .from('availability_rules')
    .select('*')
    .eq('gate_kind', CREATOR_GATE_KIND).eq('scope_kind', 'vendor').eq('scope_id', vendor.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const form: CreatorAvailabilityForm = data ? {
    weekly: cleanWeekly(data.weekly),
    slotMinutes: posInt(data.slot_minutes, 30, 480, 120),
    capacity: posInt(data.capacity, 1, 10, 1),
    leadTimeDays: posInt(data.lead_time_days, 0, 30, 3),
    horizonDays: posInt(data.horizon_days, 7, 120, 45),
    timezone: (data.timezone as string) || 'America/Los_Angeles',
    confirmMode: parseConfirmMode(data.label as string | null),
    active: !!data.active,
  } : defaults

  return { vendor: { id: vendor.id, name: vendor.name, slug: vendor.slug }, form }
}

/** Save the creator's hours. Updates their existing rule, or inserts one. Scoped to their vendor. */
export async function saveMyAvailability(input: CreatorAvailabilityForm): Promise<{ ok: boolean; error?: string }> {
  const vendor = await currentVendor()
  if (!vendor) return { ok: false, error: 'You are not set up as a creator yet.' }

  const weekly = cleanWeekly(input.weekly)
  if (input.active && Object.keys(weekly).length === 0) {
    return { ok: false, error: 'Add at least one time window before turning your calendar on.' }
  }
  const mode: ConfirmMode = input.confirmMode === 'instant' ? 'instant' : 'request'
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const admin = createAdminClient()

  const row = {
    gate_kind: CREATOR_GATE_KIND,
    scope_kind: 'vendor',
    scope_id: vendor.id,
    label: confirmLabel(mode),
    timezone: input.timezone || 'America/Los_Angeles',
    weekly,
    slot_minutes: posInt(input.slotMinutes, 30, 480, 120),
    capacity: posInt(input.capacity, 1, 10, 1),
    lead_time_days: posInt(input.leadTimeDays, 0, 30, 3),
    horizon_days: posInt(input.horizonDays, 7, 120, 45),
    active: !!input.active,
    updated_at: new Date().toISOString(),
  }

  try {
    const { data: existing } = await admin
      .from('availability_rules')
      .select('id')
      .eq('gate_kind', CREATOR_GATE_KIND).eq('scope_kind', 'vendor').eq('scope_id', vendor.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()

    if (existing?.id) {
      const { error } = await admin.from('availability_rules').update(row).eq('id', existing.id)
      if (error) throw error
    } else {
      const { error } = await admin.from('availability_rules').insert({ ...row, created_by: user?.id ?? null })
      if (error) throw error
    }
    revalidatePath('/creator/availability')
    return { ok: true }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === '42P01') return { ok: false, error: 'Scheduling isn’t set up yet (availability table missing).' }
    return { ok: false, error: err.message || 'That did not save. Try again.' }
  }
}
