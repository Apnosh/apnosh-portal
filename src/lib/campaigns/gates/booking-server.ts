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
import { notifyClientOwners, notifyStaffForClient } from '@/lib/notifications'
import { getActiveGateRule } from './availability-server'
import { computeOpenSlots, addBusinessDays } from './availability'
import type { BookingRef } from './types'

const HOLD_TTL_MS = 30 * 60 * 1000

/** The client can self-reschedule only while the slot is at least this many BUSINESS days out; inside
 *  the window it becomes a staff request instead (the shoot is too close to move unattended). */
export const SELF_RESCHEDULE_MIN_BIZ_DAYS = 3

/** True when a confirmed slot is still far enough out for the client to self-reschedule. */
export function withinSelfRescheduleWindow(slotDateISO: string, nowISO = new Date().toISOString()): boolean {
  const cutoff = addBusinessDays(nowISO.slice(0, 10), SELF_RESCHEDULE_MIN_BIZ_DAYS)
  return slotDateISO >= cutoff
}

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
    // The hold/request for this PI (or an already-bound row on a retry).
    const { data: b } = await admin
      .from('bookings')
      .select('id, status, slot_date, slot_start, slot_end, timezone, campaign_id, client_id')
      .eq('stripe_payment_intent_id', paymentIntentId)
      .in('status', ['requested', 'held', 'confirmed'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!b) return false

    // Request-mode (no availability was published): bind the campaign, keep 'requested' (NO date — the
    // UI can only say "we'll reach out"), and page staff to schedule. Never invents a slot.
    if (b.status === 'requested') {
      if (b.campaign_id !== campaignId) {
        await admin.from('bookings').update({ campaign_id: campaignId, updated_at: new Date().toISOString() }).eq('id', b.id)
      }
      await notifyStaffForClient((b.client_id as string) ?? '', ['strategist', 'community_mgr'], {
        kind: 'client_request',
        title: 'Schedule a shoot (no availability was published)',
        body: 'This order needs an on-site shoot but the calendar had no open times. Reach out to set a date, then assign it.',
        link: `/admin/campaign-orders?focus=${campaignId}`,
      }).catch(() => ({ notified: 0 }))
      return true
    }

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
        // shootDateISO is machine-readable (deriveSchedule's not-before clamp); shootTimes is
        // the owner-facing label. Both merge, never clobbering other execution keys.
        .update({ execution: { ...exec, shootTimes: label, shootDateISO: dateISO }, ...(camp?.target_date ? {} : { target_date: dateISO }), updated_at: new Date().toISOString() })
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

/** Ids of a campaign's SHOOT service work orders (class 'creative' + needsShoot). */
async function shootWorkOrderIds(admin: ReturnType<typeof createAdminClient>, campaignId: string): Promise<string[]> {
  try {
    const { turnaroundFor } = await import('../data/service-turnaround')
    const { data: wos } = await admin.from('service_work_orders').select('id, service_id').eq('campaign_id', campaignId)
    return ((wos ?? []) as Array<{ id: string; service_id: string }>)
      .filter((w) => { const t = turnaroundFor(w.service_id); return t?.class === 'creative' && !!t.needsShoot })
      .map((w) => w.id)
  } catch { return [] }
}

/** Set the due_date of a campaign's shoot service work orders to the booked date. */
async function setShootWorkOrderDates(admin: ReturnType<typeof createAdminClient>, campaignId: string, dateISO: string): Promise<void> {
  try {
    const ids = await shootWorkOrderIds(admin, campaignId)
    if (ids.length) await admin.from('service_work_orders').update({ due_date: dateISO, updated_at: new Date().toISOString() }).in('id', ids)
  } catch { /* pre-190 or no shoot WOs — nothing to date */ }
}

/** Block a campaign's shoot work orders on the client (their shoot date fell through). */
async function blockShootWorkOrders(admin: ReturnType<typeof createAdminClient>, campaignId: string, reason: string): Promise<void> {
  try {
    const ids = await shootWorkOrderIds(admin, campaignId)
    if (ids.length) await admin.from('service_work_orders').update({ status: 'blocked_client', blocked_reason: reason, updated_at: new Date().toISOString() }).in('id', ids)
  } catch { /* best-effort */ }
}

/** Un-block a campaign's shoot work orders and re-point them at the new booked date. */
async function unblockShootWorkOrders(admin: ReturnType<typeof createAdminClient>, campaignId: string, dateISO: string): Promise<void> {
  try {
    const ids = await shootWorkOrderIds(admin, campaignId)
    if (ids.length) await admin.from('service_work_orders').update({ status: 'queued', blocked_reason: null, due_date: dateISO, updated_at: new Date().toISOString() }).in('id', ids)
  } catch { /* best-effort */ }
}

/** Re-seed the campaign's shoot date onto execution.shootTimes + target_date (best-effort). */
async function seedCampaignShootDate(admin: ReturnType<typeof createAdminClient>, campaignId: string, dateISO: string, start: string | null, tz: string | null): Promise<void> {
  const { data: camp } = await admin.from('campaigns').select('execution').eq('id', campaignId).maybeSingle()
  const exec = ((camp?.execution as Record<string, unknown>) ?? {})
  await admin.from('campaigns')
    .update({ execution: { ...exec, shootTimes: shootLabel(dateISO, start, tz) }, target_date: dateISO, updated_at: new Date().toISOString() })
    .eq('id', campaignId)
}

/** Any active booking for a campaign (requested/held/confirmed/needs_reschedule), newest first, for the
 *  client tracker. Carries a status the UI branches on. Null / never-throws on failure. */
export async function getBookingForCampaign(campaignId: string): Promise<{ id: string; status: string; date: string | null; start: string | null; end: string | null; timezone: string | null; label: string | null; canSelfReschedule: boolean } | null> {
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('bookings')
      .select('id, status, slot_date, slot_start, slot_end, timezone')
      .eq('campaign_id', campaignId)
      .in('status', ['requested', 'held', 'confirmed', 'needs_reschedule'])
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!data) return null
    const date = (data.slot_date as string) ?? null
    const status = data.status as string
    return {
      id: data.id as string,
      status,
      date,
      start: (data.slot_start as string) ?? null,
      end: (data.slot_end as string) ?? null,
      timezone: (data.timezone as string) ?? null,
      label: date ? shootLabel(date, (data.slot_start as string) ?? null, (data.timezone as string) ?? null) : null,
      // Self-reschedule offered while confirmed AND still outside the 3-business-day window; a
      // needs_reschedule always lets them pick (they must). requested has no date to move.
      canSelfReschedule: (status === 'confirmed' && !!date && withinSelfRescheduleWindow(date)) || status === 'needs_reschedule',
    }
  } catch {
    return null
  }
}

/** Request-mode (Phase 3): no availability was published, so record an honest 'requested' booking for
 *  the PaymentIntent (no slot — the UI can only say "we'll reach out"). One per PI (idempotent). */
export async function requestBooking(opts: { clientId: string; paymentIntentId: string; gateKind: string; createdBy?: string | null }): Promise<{ ok: boolean; code?: 'setup' | 'error' }> {
  const admin = createAdminClient()
  try {
    const { data: existing } = await admin
      .from('bookings')
      .select('id')
      .eq('stripe_payment_intent_id', opts.paymentIntentId)
      .in('status', ['requested', 'held', 'confirmed'])
      .maybeSingle()
    if (existing?.id) return { ok: true }   // already tracked (a hold or a prior request)
    const { error } = await admin.from('bookings').insert({
      client_id: opts.clientId, gate_kind: opts.gateKind, status: 'requested',
      stripe_payment_intent_id: opts.paymentIntentId, created_by: opts.createdBy ?? null, updated_at: new Date().toISOString(),
    })
    if (error) {
      if (error.code === '42P01') return { ok: false, code: 'setup' }
      if (error.code === '23514') return { ok: false, code: 'setup' }   // pre-219: 'requested' not in CHECK
      return { ok: false, code: 'error' }
    }
    return { ok: true }
  } catch {
    return { ok: false, code: 'error' }
  }
}

export type RescheduleOutcome =
  | { ok: true; date: string; start: string; label: string }
  | { ok: false; code: 'not_found' | 'forbidden' | 'too_close' | 'slot_taken' | 'no_rule' | 'error'; error: string }

/**
 * Admin marks a confirmed booking as needing a reschedule (a shoot the team must move/cancel). The
 * booking goes to 'needs_reschedule', the shoot work orders are blocked on the client, and the owner
 * is notified with a link to pick a new day. Editing availability never does this — only an explicit
 * admin action can disturb a confirmed booking.
 */
export async function adminSetNeedsReschedule(bookingId: string, reason: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  try {
    const { data: b } = await admin.from('bookings').select('id, campaign_id, client_id, status').eq('id', bookingId).maybeSingle()
    if (!b) return { ok: false, error: 'Booking not found.' }
    await admin.from('bookings').update({ status: 'needs_reschedule', note: reason || null, updated_at: new Date().toISOString() }).eq('id', bookingId)
    const campaignId = (b.campaign_id as string | null) ?? null
    if (campaignId) {
      await blockShootWorkOrders(admin, campaignId, reason || 'Shoot date needs rescheduling')
      await notifyClientOwners((b.client_id as string) ?? '', {
        kind: 'client_request',
        title: 'Pick a new shoot day',
        body: reason ? `Your shoot needs a new date: ${reason}` : 'Your shoot needs a new date. Pick a time that works.',
        link: `/dashboard/campaigns/${campaignId}`,
      }).catch(() => ({ notified: 0 }))
    }
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not update the booking.' }
  }
}

/**
 * Assign / move a booking to a real open slot (admin resolving a needs_reschedule or a requested row;
 * also the client's self-reschedule path). Validates the slot is open in the live engine, re-seeds the
 * campaign date + shoot work orders, and unblocks them. `notify` picks who hears about it.
 */
export async function assignBookingSlot(opts: { bookingId: string; date: string; start: string; gateKind?: string; notify?: 'client' | 'staff' | 'none' }): Promise<RescheduleOutcome> {
  const admin = createAdminClient()
  try {
    const { data: b } = await admin.from('bookings').select('id, campaign_id, client_id, gate_kind, rule_id').eq('id', opts.bookingId).maybeSingle()
    if (!b) return { ok: false, code: 'not_found', error: 'Booking not found.' }
    const gateKind = opts.gateKind || (b.gate_kind as string) || 'shoot'
    const rule = await getActiveGateRule(gateKind)
    if (!rule) return { ok: false, code: 'no_rule', error: 'Scheduling isn’t open right now.' }

    const bookings = await liveBookings(admin, rule.id)
    const slot = computeOpenSlots(rule, bookings, new Date().toISOString(), 400).find((sl) => sl.date === opts.date && sl.start === opts.start)
    if (!slot) return { ok: false, code: 'slot_taken', error: 'That time was just taken. Pick another.' }

    await admin.from('bookings').update({
      status: 'confirmed', rule_id: rule.id, slot_date: slot.date, slot_start: slot.start, slot_end: slot.end,
      timezone: rule.timezone, hold_expires_at: null, updated_at: new Date().toISOString(),
    }).eq('id', opts.bookingId)

    const campaignId = (b.campaign_id as string | null) ?? null
    if (campaignId) {
      await unblockShootWorkOrders(admin, campaignId, slot.date)
      await seedCampaignShootDate(admin, campaignId, slot.date, slot.start, rule.timezone)
      const label = shootLabel(slot.date, slot.start, rule.timezone)
      if (opts.notify === 'client') {
        await notifyClientOwners((b.client_id as string) ?? '', { kind: 'client_request', title: 'Your shoot is rescheduled', body: `New shoot day: ${label}.`, link: `/dashboard/campaigns/${campaignId}` }).catch(() => ({ notified: 0 }))
      } else if (opts.notify === 'staff') {
        await notifyStaffForClient((b.client_id as string) ?? '', ['strategist', 'community_mgr'], { kind: 'client_request', title: 'Shoot rescheduled by the owner', body: `New shoot day: ${label}.`, link: `/admin/campaign-orders?focus=${campaignId}` }).catch(() => ({ notified: 0 }))
      }
    }
    return { ok: true, date: slot.date, start: slot.start, label: shootLabel(slot.date, slot.start, rule.timezone) }
  } catch (e) {
    return { ok: false, code: 'error', error: e instanceof Error ? e.message : 'Could not assign that time.' }
  }
}

/**
 * Client self-reschedule. Allowed while the current slot is outside the 3-business-day window (or the
 * booking is already needs_reschedule). Inside the window the shoot is too close to move unattended, so
 * it becomes a STAFF request (the admin moves it) — never a silent self-move. Tenancy-guarded.
 */
export async function clientReschedule(opts: { bookingId: string; clientId: string; date: string; start: string }): Promise<RescheduleOutcome | { ok: false; code: 'needs_staff'; error: string }> {
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, client_id, campaign_id, status, slot_date').eq('id', opts.bookingId).maybeSingle()
  if (!b) return { ok: false, code: 'not_found', error: 'Booking not found.' }
  if ((b.client_id as string) !== opts.clientId) return { ok: false, code: 'forbidden', error: 'Not your booking.' }
  const status = b.status as string
  const curDate = (b.slot_date as string) ?? null

  // A confirmed slot inside the 3-business-day window can't be self-moved → route to staff.
  if (status === 'confirmed' && curDate && !withinSelfRescheduleWindow(curDate)) {
    const campaignId = (b.campaign_id as string | null) ?? null
    await notifyStaffForClient(opts.clientId, ['strategist', 'community_mgr'], {
      kind: 'client_request',
      title: 'Owner wants to move a shoot (within 3 days)',
      body: `They asked to move to ${opts.date} ${opts.start}. It's inside the 3-business-day window — please handle it.`,
      link: `/admin/campaign-orders?focus=${campaignId ?? ''}`,
    }).catch(() => ({ notified: 0 }))
    return { ok: false, code: 'needs_staff', error: 'That shoot is within 3 business days — your team will handle the change. We’ve let them know.' }
  }

  // Otherwise self-serve the move (validates the slot is open; owner is the actor, so notify staff).
  return assignBookingSlot({ bookingId: opts.bookingId, date: opts.date, start: opts.start, notify: 'staff' })
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
