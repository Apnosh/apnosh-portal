/**
 * Checkout Gates — booking writes. Creates/replaces the 30-min HOLD when a client picks a slot, and
 * CONFIRMS it once the charge clears (binding it to the shipped campaign + seeding the real shoot
 * date into the campaign). Server-only.
 *
 * Honesty by construction: a hold is only ever created for a slot the pure engine says is OPEN right
 * now (re-validated here against live bookings), so two clients can never both hold the last slot.
 * Degrades safely: a missing table (migration 218 not applied) surfaces a clear setup error to the
 * caller, never a crash.
 */
import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getActiveGateRule } from './availability-server'
import { computeOpenSlots } from './availability'
import type { BookingRef } from './types'

const HOLD_TTL_MS = 30 * 60 * 1000

export type HoldResult =
  | { ok: true; bookingId: string; holdExpiresAt: string; date: string; start: string; end: string; timezone: string }
  | { ok: false; code: 'setup' | 'slot_taken' | 'no_rule' | 'error'; error: string }

/** Live holds/confirmed bookings for a rule (the capacity inputs the engine needs). */
async function liveBookings(admin: ReturnType<typeof createAdminClient>, ruleId: string): Promise<BookingRef[]> {
  const { data } = await admin
    .from('bookings')
    .select('rule_id, slot_date, slot_start, status, hold_expires_at')
    .eq('rule_id', ruleId)
    .in('status', ['held', 'confirmed'])
  return ((data ?? []) as Array<Record<string, unknown>>).map((b) => ({
    ruleId: (b.rule_id as string) ?? null,
    slotDate: (b.slot_date as string) ?? null,
    slotStart: (b.slot_start as string) ?? null,
    status: (b.status as BookingRef['status']) ?? 'held',
    holdExpiresAt: (b.hold_expires_at as string) ?? null,
  }))
}

/**
 * Hold a slot for a client, bound to their checkout PaymentIntent. ONE active hold per PaymentIntent:
 * a re-pick replaces the prior hold (so changing your mind before paying never strands capacity or
 * duplicates a booking). The slot must be open in the live engine, or we refuse (slot_taken).
 */
export async function holdBooking(opts: {
  clientId: string
  paymentIntentId: string
  gateKind: string
  date: string
  start: string
  createdBy?: string | null
}): Promise<HoldResult> {
  const admin = createAdminClient()
  const rule = await getActiveGateRule(opts.gateKind)
  if (!rule) return { ok: false, code: 'no_rule', error: 'Scheduling isn’t open right now.' }

  try {
    // Re-validate against the LIVE engine: the exact (date,start) must be an open slot this instant.
    const bookings = await liveBookings(admin, rule.id)
    const slot = computeOpenSlots(rule, bookings, new Date().toISOString(), 400)
      .find((s) => s.date === opts.date && s.start === opts.start)
    if (!slot) return { ok: false, code: 'slot_taken', error: 'That time was just taken. Pick another.' }

    const holdExpiresAt = new Date(Date.now() + HOLD_TTL_MS).toISOString()
    const row = {
      client_id: opts.clientId,
      gate_kind: opts.gateKind,
      rule_id: rule.id,
      slot_date: slot.date,
      slot_start: slot.start,
      slot_end: slot.end,
      timezone: rule.timezone,
      status: 'held' as const,
      hold_expires_at: holdExpiresAt,
      stripe_payment_intent_id: opts.paymentIntentId,
      created_by: opts.createdBy ?? null,
      updated_at: new Date().toISOString(),
    }

    // Replace any existing HELD hold for this PaymentIntent (a re-pick), else insert a fresh one.
    const { data: existing } = await admin
      .from('bookings')
      .select('id')
      .eq('stripe_payment_intent_id', opts.paymentIntentId)
      .eq('status', 'held')
      .maybeSingle()

    let bookingId: string | null = null
    if (existing?.id) {
      const { error } = await admin.from('bookings').update(row).eq('id', existing.id)
      if (error) throw error
      bookingId = existing.id as string
    } else {
      const { data, error } = await admin.from('bookings').insert(row).select('id').single()
      if (error) throw error
      bookingId = data.id as string
    }
    return { ok: true, bookingId: bookingId!, holdExpiresAt, date: slot.date, start: slot.start, end: slot.end, timezone: rule.timezone }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === '42P01') return { ok: false, code: 'setup', error: 'Scheduling isn’t set up yet. Apply migration 218 and try again.' }
    return { ok: false, code: 'error', error: err.message || 'Could not hold that time.' }
  }
}

/**
 * Confirm the held booking for a paid checkout and bind it to the shipped campaign. Flips held →
 * confirmed, stamps campaign_id, and seeds the REAL shoot date into the campaign: execution.shootTimes
 * (so the readiness "best days to film" reads as an already-answered confirmed date), target_date when
 * unset, and every shoot service work order's due_date. Idempotent + best-effort: a checkout with no
 * booking (non-shoot campaign) is a clean no-op, and a failure never breaks the paid+shipped order.
 * Returns whether a booking was confirmed.
 */
export async function confirmBookingForPayment(paymentIntentId: string, campaignId: string): Promise<boolean> {
  const admin = createAdminClient()
  try {
    // The hold for this PI (or an already-confirmed row on a retry).
    const { data: b } = await admin
      .from('bookings')
      .select('id, status, slot_date, slot_start, slot_end, timezone, campaign_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .in('status', ['held', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!b) return false

    // Confirm + bind (idempotent: a second call over an already-confirmed+bound row changes nothing).
    if (b.status !== 'confirmed' || b.campaign_id !== campaignId) {
      await admin.from('bookings')
        .update({ status: 'confirmed', campaign_id: campaignId, hold_expires_at: null, updated_at: new Date().toISOString() })
        .eq('id', b.id)
    }

    const dateISO = (b.slot_date as string) ?? null
    if (dateISO) {
      // Seed the real date into the campaign so the tracker + readiness show it as CONFIRMED, not
      // estimated. Best-effort, each independent.
      const label = shootLabel(dateISO, (b.slot_start as string) ?? null, (b.timezone as string) ?? null)
      // execution.shootTimes (merge — never clobber other keys).
      const { data: camp } = await admin.from('campaigns').select('execution, target_date').eq('id', campaignId).maybeSingle()
      const exec = ((camp?.execution as Record<string, unknown>) ?? {})
      await admin.from('campaigns')
        .update({ execution: { ...exec, shootTimes: label }, ...(camp?.target_date ? {} : { target_date: dateISO }), updated_at: new Date().toISOString() })
        .eq('id', campaignId)
      // Point every shoot service work order at the real date (best-effort; table may be absent pre-190).
      await setShootWorkOrderDates(admin, campaignId, dateISO)
    }
    return true
  } catch {
    return false
  }
}

/** A plain confirmed-shoot label, e.g. "Fri, Aug 7 · 9:00 AM (America/Los_Angeles)". */
function shootLabel(dateISO: string, start: string | null, tz: string | null): string {
  const day = new Date(`${dateISO}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  const time = start ? ` · ${fmtTime(start)}` : ''
  const zone = tz ? ` (${tz})` : ''
  return `${day}${time}${zone}`
}

function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}

/** Set the due_date of a campaign's shoot service work orders to the booked date. */
async function setShootWorkOrderDates(admin: ReturnType<typeof createAdminClient>, campaignId: string, dateISO: string): Promise<void> {
  try {
    const { turnaroundFor } = await import('../data/service-turnaround')
    const { data: wos } = await admin.from('service_work_orders').select('id, service_id').eq('campaign_id', campaignId)
    const shootIds = ((wos ?? []) as Array<{ id: string; service_id: string }>)
      .filter((w) => { const t = turnaroundFor(w.service_id); return t?.class === 'creative' && !!t.needsShoot })
      .map((w) => w.id)
    if (shootIds.length) await admin.from('service_work_orders').update({ due_date: dateISO, updated_at: new Date().toISOString() }).in('id', shootIds)
  } catch { /* pre-190 or no shoot WOs — nothing to date */ }
}

/** The confirmed booking for a campaign (for the tracker). Null when none / on any failure. */
export async function getConfirmedBookingForCampaign(campaignId: string): Promise<{ date: string; start: string | null; end: string | null; timezone: string | null; label: string } | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('bookings')
      .select('slot_date, slot_start, slot_end, timezone, status')
      .eq('campaign_id', campaignId)
      .eq('status', 'confirmed')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data || !data.slot_date) return null
    return {
      date: data.slot_date as string,
      start: (data.slot_start as string) ?? null,
      end: (data.slot_end as string) ?? null,
      timezone: (data.timezone as string) ?? null,
      label: shootLabel(data.slot_date as string, (data.slot_start as string) ?? null, (data.timezone as string) ?? null),
    }
  } catch {
    return null
  }
}
