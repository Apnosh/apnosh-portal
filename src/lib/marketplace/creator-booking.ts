'use server'

/**
 * CREATOR BOOKING — the write side of per-creator scheduling. A restaurant picks a real open slot
 * and it HOLDS; the creator confirms (or, in instant mode, it is confirmed on the spot). Reuses the
 * shared `bookings` table and the pure slot engine (re-validated here, so two restaurants can never
 * both hold the last slot). No money: a hold is a plain row, never a charge.
 *
 * Marketplace context (which listing, which level, the intake answers) rides in `bookings.note` as
 * JSON — the vendor is known from the rule (scope_id), so no schema change is needed. Async and
 * recurring products do not come through here; they stay on the existing request path with the
 * intake folded into the brief.
 */

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { computeOpenSlots } from '@/lib/campaigns/gates/availability'
import { rowToRule } from '@/lib/campaigns/gates/availability-server'
import { notifyClientOwners, createNotification } from '@/lib/notifications'
import {
  currentVendor, getVendorRule, getVendorScheduleBySlug, vendorIdForSlug, bookingsForRule,
  CREATOR_GATE_KIND, type VendorSchedule,
} from './creator-schedule'
import type { HoldSlotInput, HoldSlotResult, IncomingBooking, ClientBooking, SimpleBookingResult, QuoteRequest } from './creator-schedule-types'
import { mintBookingWorkOrder, voidBookingWorkOrder, redateBookingWorkOrder, workOrdersForBookings } from './booking-work-order'

const HOLD_TTL_MS = 24 * 60 * 60 * 1000 // a request-mode hold waits a day on the creator

/** What we stash in bookings.note so the marketplace can read a booking back without new columns. */
interface CreatorBookingMeta {
  kind: 'creator'
  vendorId: string
  vendorSlug: string
  listingId: string | null
  listingSlug: string
  listingTitle: string
  tierName: string | null
  intake: Record<string, string>
  /** Booking shape (absent = scheduled, the original bridge). */
  shape?: 'scheduled' | 'async' | 'recurring' | 'quote'
  /** Quote jobs: the creator's named price (cents) + where the quote is. */
  quotedCents?: number
  quoteStatus?: 'requested' | 'quoted'
}

function parseMeta(note: string | null | undefined): CreatorBookingMeta | null {
  if (!note) return null
  try {
    const m = JSON.parse(note) as CreatorBookingMeta
    return m && m.kind === 'creator' ? m : null
  } catch {
    return null
  }
}

/** The open slots for a vendor — the product page's slot picker calls this. */
export async function fetchCreatorSlots(vendorSlug: string): Promise<VendorSchedule> {
  return getVendorScheduleBySlug(vendorSlug)
}

/** Hold (or instantly confirm) a real open slot for the current restaurant. */
export async function holdCreatorBooking(input: HoldSlotInput): Promise<HoldSlotResult> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, needsLogin: true, error: 'Please sign in to book.' }

  const admin = createAdminClient()
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu?.client_id) return { ok: false, error: 'No restaurant account is linked to your login.' }

  const vendorId = await vendorIdForSlug(input.vendorSlug)
  if (!vendorId) return { ok: false, error: 'Creator not found.' }
  const found = await getVendorRule(vendorId)
  if (!found) return { ok: false, code: 'no_rule', error: 'This creator has not opened their calendar yet.' }

  try {
    // Re-validate against the live engine: the exact (date, start) must be open this instant.
    const bookings = await bookingsForRule(found.rule.id)
    const slot = computeOpenSlots(found.rule, bookings, new Date().toISOString(), 400)
      .find((s) => s.date === input.date && s.start === input.start)
    if (!slot) return { ok: false, code: 'slot_taken', error: 'That time was just taken. Pick another.' }

    // Resolve the listing (for a stable id + a title to show later).
    const { data: listing } = await admin
      .from('vendor_listings').select('id, title').eq('vendor_id', vendorId).eq('slug', input.listingSlug).maybeSingle()

    const instant = found.confirmMode === 'instant'
    const meta: CreatorBookingMeta = {
      kind: 'creator', vendorId, vendorSlug: input.vendorSlug,
      listingId: (listing?.id as string) ?? null, listingSlug: input.listingSlug,
      listingTitle: (listing?.title as string) ?? input.listingSlug,
      tierName: input.tierName ?? null,
      intake: cleanIntake(input.intake),
    }
    const row = {
      client_id: cu.client_id as string,
      gate_kind: CREATOR_GATE_KIND,
      rule_id: found.rule.id,
      slot_date: slot.date, slot_start: slot.start, slot_end: slot.end, timezone: found.rule.timezone,
      status: instant ? 'confirmed' as const : 'held' as const,
      hold_expires_at: instant ? null : new Date(Date.now() + HOLD_TTL_MS).toISOString(),
      note: JSON.stringify(meta),
      created_by: user.id,
      updated_at: new Date().toISOString(),
    }
    const { data, error } = await admin.from('bookings').insert(row).select('id').single()
    if (error) throw error
    // Instant confirm is deliverable work the moment it lands — mint its order now. A request-mode
    // hold waits for the creator's yes (acceptCreatorBooking mints it then). Best-effort by design.
    if (instant) await mintBookingWorkOrder(data.id as string)
    revalidatePath(`/marketplace/${input.vendorSlug}`)
    return { ok: true, bookingId: data.id as string, status: row.status, confirmMode: found.confirmMode, date: slot.date, start: slot.start, end: slot.end, timezone: found.rule.timezone }
  } catch (e) {
    const err = e as { code?: string; message?: string }
    if (err.code === '42P01') return { ok: false, code: 'setup', error: 'Scheduling isn’t set up yet.' }
    return { ok: false, code: 'error', error: err.message || 'Could not hold that time.' }
  }
}

function cleanIntake(intake?: Record<string, string>): Record<string, string> {
  if (!intake || typeof intake !== 'object') return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(intake)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim().slice(0, 500)
  }
  return out
}

/** The current creator's incoming bookings (held = awaiting their yes, confirmed = on the calendar). */
export async function getVendorIncomingBookings(): Promise<IncomingBooking[]> {
  const vendor = await currentVendor()
  if (!vendor) return []
  const found = await getVendorRule(vendor.id)
  if (!found) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin
      .from('bookings')
      .select('id, status, slot_date, slot_start, slot_end, timezone, hold_expires_at, note')
      .eq('rule_id', found.rule.id)
      .in('status', ['held', 'confirmed'])
      .order('slot_date', { ascending: true })
    return ((data ?? []) as Array<Record<string, unknown>>).map((b) => {
      const meta = parseMeta(b.note as string | null)
      return {
        id: b.id as string,
        status: b.status as string,
        date: (b.slot_date as string) ?? null,
        start: (b.slot_start as string) ?? null,
        end: (b.slot_end as string) ?? null,
        timezone: (b.timezone as string) ?? null,
        holdExpiresAt: (b.hold_expires_at as string) ?? null,
        listingTitle: meta?.listingTitle ?? 'Booking',
        tierName: meta?.tierName ?? null,
        intake: meta?.intake ?? {},
      }
    })
  } catch {
    return []
  }
}

/** The creator accepts a held request → confirmed. Guarded to their own vendor's bookings. */
export async function acceptCreatorBooking(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const vendor = await currentVendor()
  if (!vendor) return { ok: false, error: 'You are not set up as a creator yet.' }
  const admin = createAdminClient()
  try {
    // The booking must be against one of THIS vendor's rules (tenancy guard via scope_id).
    const { data: b } = await admin.from('bookings').select('id, rule_id, status').eq('id', bookingId).maybeSingle()
    if (!b || !b.rule_id) return { ok: false, error: 'Booking not found.' }
    const { data: rule } = await admin.from('availability_rules').select('scope_id, scope_kind').eq('id', b.rule_id as string).maybeSingle()
    if (!rule || rule.scope_kind !== 'vendor' || rule.scope_id !== vendor.id) return { ok: false, error: 'That booking is not yours.' }
    if (b.status !== 'held') return { ok: b.status === 'confirmed', error: b.status === 'confirmed' ? undefined : 'That booking can no longer be accepted.' }
    // Atomic claim: only ONE concurrent accept wins the held→confirmed flip, so only the winner mints
    // (defends against a double-clicked / double-tab accept minting two work orders for one booking).
    const { data: claimed, error } = await admin.from('bookings').update({ status: 'confirmed', hold_expires_at: null, updated_at: new Date().toISOString() }).eq('id', bookingId).eq('status', 'held').select('id').maybeSingle()
    if (error) throw error
    if (!claimed) return { ok: true }
    // Accepting the request confirms the shoot — it is now deliverable work.
    await mintBookingWorkOrder(bookingId)
    revalidatePath('/creator/bookings')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Could not accept that booking.' }
  }
}

/** Read one creator booking's status back (the product page polls this after holding). */
export async function getCreatorBookingStatus(bookingId: string): Promise<{ status: string; date: string | null; start: string | null; timezone: string | null } | null> {
  try {
    const supabase = await createServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const admin = createAdminClient()
    const { data } = await admin.from('bookings').select('status, slot_date, slot_start, timezone, created_by').eq('id', bookingId).maybeSingle()
    if (!data || data.created_by !== user.id) return null
    return { status: data.status as string, date: (data.slot_date as string) ?? null, start: (data.slot_start as string) ?? null, timezone: (data.timezone as string) ?? null }
  } catch {
    return null
  }
}

/* ── reschedule + cancel (both sides), and the restaurant's own bookings list ─────────── */

function fmtT(hhmm: string | null): string {
  if (!hhmm) return ''
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm)
  if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function bookingLabel(date: string | null, start: string | null): string {
  if (!date) return 'your booking'
  const d = new Date(`${date}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
  return start ? `${d} · ${fmtT(start)}` : d
}

/** Tell whichever side did NOT act. Creator acted → notify the restaurant; restaurant acted →
 *  notify the creator (only if they have a linked login). Best-effort. */
async function notifyOtherSide(admin: ReturnType<typeof createAdminClient>, o: { actorIsVendor: boolean; clientId: string; vendorId: string; title: string; clientTitle: string; body: string }): Promise<void> {
  try {
    if (o.actorIsVendor) {
      await notifyClientOwners(o.clientId, { kind: 'client_request', title: o.clientTitle, body: o.body, link: '/dashboard/bookings' })
    } else if (o.vendorId) {
      const { data: v } = await admin.from('vendors').select('person_id').eq('id', o.vendorId).maybeSingle()
      if (v?.person_id) await createNotification({ userId: v.person_id as string, kind: 'client_request', title: o.title, body: o.body, link: '/creator/bookings' })
    }
  } catch { /* notifications never block the change */ }
}

/** The current restaurant's creator bookings (their side of the shared status). */
export async function getMyCreatorBookings(): Promise<ClientBooking[]> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return []
  const admin = createAdminClient()
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu?.client_id) return []
  try {
    const { data } = await admin
      .from('bookings')
      .select('id, status, slot_date, slot_start, timezone, note')
      .eq('client_id', cu.client_id as string)
      .like('note', '%"kind":"creator"%')
      .in('status', ['held', 'confirmed', 'needs_reschedule'])
      .order('slot_date', { ascending: true })
    const rows = (data ?? []) as Array<Record<string, unknown>>
    const metas = rows.map((r) => ({ r, m: parseMeta(r.note as string | null) })).filter((x) => x.m)
    const vendorIds = [...new Set(metas.map((x) => x.m!.vendorId).filter(Boolean))]
    const nameById = new Map<string, string>()
    if (vendorIds.length) {
      const { data: vs } = await admin.from('vendors').select('id, name').in('id', vendorIds)
      for (const v of vs ?? []) nameById.set(v.id as string, (v.name as string) ?? '')
    }
    const base = metas.map(({ r, m }) => ({
      id: r.id as string,
      status: r.status as string,
      date: (r.slot_date as string) ?? null,
      start: (r.slot_start as string) ?? null,
      timezone: (r.timezone as string) ?? null,
      vendorSlug: m!.vendorSlug,
      vendorName: (nameById.get(m!.vendorId) || '').replace(/\s*\(example\)/i, '') || 'Creator',
      listingTitle: m!.listingTitle,
      tierName: m!.tierName,
      intake: m!.intake ?? {},
      shape: m!.shape ?? 'scheduled',
      quotedCents: m!.quotedCents ?? null,
      quoteStatus: m!.quoteStatus ?? null,
    }))
    // Attach each booking's deliverables (one for a single handoff, several for a multi-delivery
    // offer or an accruing monthly plan) so the list can show each piece's state + approve gate.
    const work = await workOrdersForBookings(base.map((x) => x.id))
    return base.map((x) => {
      const list = work[x.id] ?? []
      // Lead deliverable = what to act on first: something delivered to review, else the first not-yet-
      // approved piece, else the first. Mirrored into the singular fields for the single-delivery UI.
      const lead = list.find((w) => w.status === 'delivered') ?? list.find((w) => w.status !== 'approved') ?? list[0] ?? null
      return {
        ...x,
        deliverables: list,
        orderId: lead?.orderId ?? null,
        workStatus: lead?.status ?? null,
        deliveredUrl: lead?.deliveredUrl ?? null,
        amountCents: lead?.amountCents ?? null,
      }
    })
  } catch { return [] }
}

/** Move a booking to a new open slot. Either side may do it (tenancy-guarded); the other is told. */
export async function rescheduleCreatorBooking(input: { bookingId: string; date: string; start: string }): Promise<{ ok: boolean; error?: string; label?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in.' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, created_by, rule_id, status, client_id').eq('id', input.bookingId).maybeSingle()
  if (!b || !b.rule_id) return { ok: false, error: 'Booking not found.' }
  if (b.status === 'cancelled' || b.status === 'completed') return { ok: false, error: 'This booking can’t be changed.' }
  const { data: ruleRow } = await admin.from('availability_rules').select('*').eq('id', b.rule_id as string).maybeSingle()
  if (!ruleRow) return { ok: false, error: 'This creator’s calendar is closed.' }
  const isClient = b.created_by === user.id
  const vendor = await currentVendor()
  const isVendor = !!vendor && ruleRow.scope_kind === 'vendor' && ruleRow.scope_id === vendor.id
  if (!isClient && !isVendor) return { ok: false, error: 'That booking is not yours.' }
  try {
    const rule = rowToRule(ruleRow as Parameters<typeof rowToRule>[0])
    const bookings = await bookingsForRule(rule.id)
    const slot = computeOpenSlots(rule, bookings, new Date().toISOString(), 400).find((s) => s.date === input.date && s.start === input.start)
    if (!slot) return { ok: false, error: 'That time was just taken. Pick another.' }
    const { error } = await admin.from('bookings').update({ status: 'confirmed', slot_date: slot.date, slot_start: slot.start, slot_end: slot.end, timezone: rule.timezone, hold_expires_at: null, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) throw error
    // Keep the deliverable's due date in step with the new shoot day. Also mints the order if a
    // request-mode booking is being rescheduled straight from held → its first confirmed slot.
    await mintBookingWorkOrder(b.id as string)
    await redateBookingWorkOrder(b.id as string, slot.date)
    const label = bookingLabel(slot.date, slot.start)
    await notifyOtherSide(admin, { actorIsVendor: isVendor, clientId: b.client_id as string, vendorId: ruleRow.scope_id as string, title: 'A booking was rescheduled', clientTitle: 'Your booking was moved', body: `New time: ${label}.` })
    revalidatePath('/creator/bookings'); revalidatePath('/dashboard/bookings')
    return { ok: true, label }
  } catch { return { ok: false, error: 'Could not reschedule. Try again.' } }
}

/** Cancel a booking and release the slot. Either side may do it (tenancy-guarded); the other is told. */
export async function cancelCreatorBooking(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in.' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, created_by, rule_id, status, client_id').eq('id', bookingId).maybeSingle()
  if (!b || !b.rule_id) return { ok: false, error: 'Booking not found.' }
  if (b.status === 'cancelled' || b.status === 'completed') return { ok: true }
  const { data: ruleRow } = await admin.from('availability_rules').select('scope_kind, scope_id').eq('id', b.rule_id as string).maybeSingle()
  const isClient = b.created_by === user.id
  const vendor = await currentVendor()
  const isVendor = !!vendor && ruleRow?.scope_kind === 'vendor' && ruleRow?.scope_id === vendor.id
  if (!isClient && !isVendor) return { ok: false, error: 'That booking is not yours.' }
  try {
    const { error } = await admin.from('bookings').update({ status: 'cancelled', hold_expires_at: null, updated_at: new Date().toISOString() }).eq('id', b.id)
    if (error) throw error
    // Release the deliverable too (unless it is already delivered/approved — that stays as history).
    await voidBookingWorkOrder(bookingId)
    await notifyOtherSide(admin, { actorIsVendor: isVendor, clientId: b.client_id as string, vendorId: (ruleRow?.scope_id as string) ?? '', title: 'A booking was cancelled', clientTitle: 'Your booking was cancelled', body: 'The time was released.' })
    revalidatePath('/creator/bookings'); revalidatePath('/dashboard/bookings')
    return { ok: true }
  } catch { return { ok: false, error: 'Could not cancel. Try again.' } }
}

/* ── async / recurring / quote bookings — the other three shapes, all onto the same pay loop ─────────
   Scheduled shoots hold a slot (holdCreatorBooking, above). These three have no calendar slot, so
   they create a slot-less `bookings` row (no rule_id) carrying the shape in note JSON, then mint the
   same creator_work_order the shoot bridge does. Money stays honest: async/recurring are priced by the
   booked tier; a quote is priced by the creator FIRST, and mints only once the restaurant accepts. */

async function resolveBookingParties(vendorSlug: string, listingSlug: string): Promise<
  | { ok: true; userId: string; clientId: string; vendorId: string; listing: { id: string; title: string; category: string; listing_type: string; details: unknown } }
  | { ok: false; needsLogin?: boolean; error: string }
> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, needsLogin: true, error: 'Please sign in to book.' }
  const admin = createAdminClient()
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu?.client_id) return { ok: false, error: 'No restaurant account is linked to your login.' }
  const vendorId = await vendorIdForSlug(vendorSlug)
  if (!vendorId) return { ok: false, error: 'Creator not found.' }
  const { data: listing } = await admin
    .from('vendor_listings').select('id, title, category, listing_type, details')
    .eq('vendor_id', vendorId).eq('slug', listingSlug).maybeSingle()
  if (!listing) return { ok: false, error: 'Listing not found.' }
  return { ok: true, userId: user.id, clientId: cu.client_id as string, vendorId, listing: listing as { id: string; title: string; category: string; listing_type: string; details: unknown } }
}

function turnaroundDueISO(details: unknown): string {
  const d = (details && typeof details === 'object' ? details : {}) as { turnaroundDays?: unknown }
  const days = typeof d.turnaroundDays === 'number' && d.turnaroundDays > 0 ? d.turnaroundDays : 7
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10)
}

function newBookingMeta(p: { vendorId: string; vendorSlug: string; listingId: string; listingSlug: string; listingTitle: string; tierName?: string | null; intake?: Record<string, string>; shape: CreatorBookingMeta['shape']; quoteStatus?: 'requested' | 'quoted' }): string {
  const meta: CreatorBookingMeta = {
    kind: 'creator', vendorId: p.vendorId, vendorSlug: p.vendorSlug, listingId: p.listingId,
    listingSlug: p.listingSlug, listingTitle: p.listingTitle, tierName: p.tierName ?? null,
    intake: cleanIntake(p.intake), shape: p.shape, ...(p.quoteStatus ? { quoteStatus: p.quoteStatus } : {}),
  }
  return JSON.stringify(meta)
}

/** Ping a creator's linked login (if any) that something needs them. Best-effort. */
async function notifyVendorPerson(admin: ReturnType<typeof createAdminClient>, vendorId: string, title: string, body: string, link = '/creator/bookings'): Promise<void> {
  try {
    const { data: v } = await admin.from('vendors').select('person_id').eq('id', vendorId).maybeSingle()
    if (v?.person_id) await createNotification({ userId: v.person_id as string, kind: 'client_request', title, body, link })
  } catch { /* never blocks */ }
}

/** ASYNC (design/brief): a priced job with no calendar. Confirms + mints straight away, due by the
 *  creator's turnaround. Then deliver → the restaurant approves → it bills, exactly like a shoot. */
export async function confirmAsyncBooking(input: { vendorSlug: string; listingSlug: string; tierName?: string | null; intake?: Record<string, string> }): Promise<SimpleBookingResult> {
  const r = await resolveBookingParties(input.vendorSlug, input.listingSlug)
  if (!r.ok) return { ok: false, needsLogin: r.needsLogin, error: r.error }
  const admin = createAdminClient()
  const dueISO = turnaroundDueISO(r.listing.details)
  const note = newBookingMeta({ vendorId: r.vendorId, vendorSlug: input.vendorSlug, listingId: r.listing.id, listingSlug: input.listingSlug, listingTitle: r.listing.title, tierName: input.tierName, intake: input.intake, shape: 'async' })
  const { data, error } = await admin.from('bookings').insert({
    client_id: r.clientId, gate_kind: CREATOR_GATE_KIND, slot_date: dueISO, timezone: 'America/Los_Angeles',
    status: 'confirmed', note, created_by: r.userId, updated_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !data) return { ok: false, error: 'Could not book. Try again.' }
  await mintBookingWorkOrder(data.id as string)
  await notifyVendorPerson(admin, r.vendorId, 'New booking to deliver', `${r.listing.title} was booked. Deliver it from your work.`, '/creator/work')
  revalidatePath('/dashboard/bookings')
  return { ok: true, bookingId: data.id as string, dueDate: dueISO }
}

/** RECURRING (monthly plan): confirms + mints MONTH 1 now; the recurring cron mints each later month.
 *  Honest by construction — every month is its own deliver → approve → bill (no silent auto-charge). */
export async function startRecurringBooking(input: { vendorSlug: string; listingSlug: string; tierName?: string | null; startDate?: string; intake?: Record<string, string> }): Promise<SimpleBookingResult> {
  const r = await resolveBookingParties(input.vendorSlug, input.listingSlug)
  if (!r.ok) return { ok: false, needsLogin: r.needsLogin, error: r.error }
  const admin = createAdminClient()
  const startISO = input.startDate && /^\d{4}-\d{2}-\d{2}$/.test(input.startDate) ? input.startDate : new Date().toISOString().slice(0, 10)
  const note = newBookingMeta({ vendorId: r.vendorId, vendorSlug: input.vendorSlug, listingId: r.listing.id, listingSlug: input.listingSlug, listingTitle: r.listing.title, tierName: input.tierName, intake: input.intake, shape: 'recurring' })
  const { data, error } = await admin.from('bookings').insert({
    client_id: r.clientId, gate_kind: CREATOR_GATE_KIND, slot_date: startISO, timezone: 'America/Los_Angeles',
    status: 'confirmed', note, created_by: r.userId, updated_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !data) return { ok: false, error: 'Could not start the plan. Try again.' }
  await mintBookingWorkOrder(data.id as string, { month: 1, dueDateISO: startISO })
  await notifyVendorPerson(admin, r.vendorId, 'New monthly plan', `${r.listing.title} started. This month's work is in your queue.`, '/creator/work')
  revalidatePath('/dashboard/bookings')
  return { ok: true, bookingId: data.id as string, startDate: startISO }
}

/** QUOTE (custom job): the restaurant describes it; NO price yet, NO work order. The creator names a
 *  price (setBookingQuote), the restaurant accepts (acceptBookingQuote), and only then does it mint. */
export async function requestQuote(input: { vendorSlug: string; listingSlug: string; tierName?: string | null; intake?: Record<string, string> }): Promise<SimpleBookingResult> {
  const r = await resolveBookingParties(input.vendorSlug, input.listingSlug)
  if (!r.ok) return { ok: false, needsLogin: r.needsLogin, error: r.error }
  const admin = createAdminClient()
  const note = newBookingMeta({ vendorId: r.vendorId, vendorSlug: input.vendorSlug, listingId: r.listing.id, listingSlug: input.listingSlug, listingTitle: r.listing.title, tierName: input.tierName, intake: input.intake, shape: 'quote', quoteStatus: 'requested' })
  const { data, error } = await admin.from('bookings').insert({
    client_id: r.clientId, gate_kind: CREATOR_GATE_KIND, slot_date: null, timezone: 'America/Los_Angeles',
    status: 'held', note, created_by: r.userId, updated_at: new Date().toISOString(),
  }).select('id').single()
  if (error || !data) return { ok: false, error: 'Could not send the request. Try again.' }
  await notifyVendorPerson(admin, r.vendorId, 'A restaurant wants a quote', `${r.listing.title}: send them a price.`)
  revalidatePath('/dashboard/bookings')
  return { ok: true, bookingId: data.id as string }
}

/** The creator's pending quote requests — the ones still waiting on a price. */
export async function getVendorQuoteRequests(): Promise<QuoteRequest[]> {
  const vendor = await currentVendor()
  if (!vendor) return []
  try {
    const admin = createAdminClient()
    const { data } = await admin.from('bookings').select('id, note, status, created_at')
      .like('note', `%"vendorId":"${vendor.id}"%`).like('note', '%"shape":"quote"%').eq('status', 'held')
      .order('created_at', { ascending: true })
    return ((data ?? []) as Array<Record<string, unknown>>).map((b) => {
      const m = parseMeta(b.note as string | null)
      return { id: b.id as string, listingTitle: m?.listingTitle ?? 'Custom job', tierName: m?.tierName ?? null, intake: m?.intake ?? {}, quotedCents: m?.quotedCents ?? null, quoteStatus: m?.quoteStatus ?? 'requested' }
    // Drop the ones already priced — those are waiting on the restaurant, not the creator, so they
    // must leave the "send a price" queue (else a priced quote reappears as un-priced work).
    }).filter((q) => q.quoteStatus !== 'quoted')
  } catch { return [] }
}

/** The creator names a price on a quote request → the restaurant can accept it. */
export async function setBookingQuote(input: { bookingId: string; priceCents: number }): Promise<{ ok: boolean; error?: string }> {
  const vendor = await currentVendor()
  if (!vendor) return { ok: false, error: 'You are not set up as a creator yet.' }
  if (!(input.priceCents > 0)) return { ok: false, error: 'Enter a price above zero.' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, note, status, client_id').eq('id', input.bookingId).maybeSingle()
  if (!b) return { ok: false, error: 'Quote not found.' }
  const meta = parseMeta(b.note as string | null)
  if (!meta || meta.shape !== 'quote' || meta.vendorId !== vendor.id) return { ok: false, error: 'That quote is not yours.' }
  if (b.status !== 'held') return { ok: false, error: 'This request is closed, so it can no longer be priced.' }
  const next: CreatorBookingMeta = { ...meta, quotedCents: Math.round(input.priceCents), quoteStatus: 'quoted' }
  const { error } = await admin.from('bookings').update({ note: JSON.stringify(next), updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return { ok: false, error: 'Could not send the quote.' }
  await notifyClientOwners(b.client_id as string, { kind: 'client_request', title: 'You have a quote', body: `${meta.listingTitle}: $${Math.round(input.priceCents / 100)}. Review and accept it.`, link: '/dashboard/bookings' })
  revalidatePath('/creator/bookings'); revalidatePath('/dashboard/bookings')
  return { ok: true }
}

/** The restaurant accepts a quote → it mints the work order at the quoted price + starts the loop. */
export async function acceptBookingQuote(bookingId: string): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in.' }
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, note, status, client_id').eq('id', bookingId).maybeSingle()
  if (!b) return { ok: false, error: 'Quote not found.' }
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu || cu.client_id !== b.client_id) return { ok: false, error: 'That quote is not yours.' }
  const meta = parseMeta(b.note as string | null)
  if (!meta || meta.shape !== 'quote' || !meta.quotedCents) return { ok: false, error: 'No quote to accept yet.' }
  // Only a live (held) quote can be accepted — never resurrect a cancelled/expired one into billable work.
  if (b.status !== 'held') return { ok: b.status === 'confirmed', error: b.status === 'confirmed' ? undefined : 'This quote can no longer be accepted.' }
  const dueISO = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10)
  // Atomic claim: only ONE accept wins the held→confirmed flip, so a double-accept mints once.
  const { data: claimed, error } = await admin.from('bookings').update({ status: 'confirmed', slot_date: dueISO, updated_at: new Date().toISOString() }).eq('id', b.id).eq('status', 'held').select('id').maybeSingle()
  if (error) return { ok: false, error: 'Could not accept the quote.' }
  if (!claimed) return { ok: true }
  await mintBookingWorkOrder(bookingId)
  await notifyVendorPerson(admin, meta.vendorId, 'Quote accepted', `${meta.listingTitle} is a go. Deliver it from your work.`, '/creator/work')
  revalidatePath('/dashboard/bookings')
  return { ok: true }
}

/* ── one booking's full detail + fill-anytime requirements ───────────────────────────────── */

export interface CreatorBookingDetailDeliverable {
  orderId: string
  title: string
  status: string
  amountCents: number
  dueDate: string | null
  deliveredUrl: string | null
}

export interface CreatorBookingDetail {
  id: string
  status: string
  shape: string
  listingTitle: string
  tierName: string | null
  date: string | null
  start: string | null
  end: string | null
  timezone: string | null
  intake: Record<string, string>
  deliverables: CreatorBookingDetailDeliverable[]
  totalCents: number
}

/** Everything the creator needs to see about ONE of their bookings in one place: when it is, the
 *  requirements the restaurant answered, every delivery + its state, and the total value. Scoped to
 *  the creator's own vendor (via the note's vendorId), so a forged id can't read another creator's. */
export async function getCreatorBookingDetail(bookingId: string): Promise<CreatorBookingDetail | null> {
  const vendor = await currentVendor()
  if (!vendor) return null
  const admin = createAdminClient()
  const { data: b } = await admin.from('bookings').select('id, status, slot_date, slot_start, slot_end, timezone, note').eq('id', bookingId).maybeSingle()
  if (!b) return null
  const meta = parseMeta(b.note as string | null)
  if (!meta || meta.vendorId !== vendor.id) return null
  const work = await workOrdersForBookings([bookingId])
  const list = work[bookingId] ?? []
  return {
    id: b.id as string,
    status: b.status as string,
    shape: meta.shape ?? 'scheduled',
    listingTitle: meta.listingTitle,
    tierName: meta.tierName,
    date: (b.slot_date as string) ?? null,
    start: (b.slot_start as string) ?? null,
    end: (b.slot_end as string) ?? null,
    timezone: (b.timezone as string) ?? null,
    intake: meta.intake ?? {},
    deliverables: list.map((d) => ({ orderId: d.orderId, title: d.title, status: d.status, amountCents: d.amountCents, dueDate: d.dueDate, deliveredUrl: d.deliveredUrl })),
    totalCents: list.reduce((s, d) => s + (d.amountCents || 0), 0),
  }
}

/** The restaurant updates its own answers to the offer's questions on a booking, any time after
 *  booking (fill-anytime requirements). Merges into the note's intake map. Scoped to the booking's
 *  own client, so only the restaurant that booked it can edit. */
export async function updateBookingIntake(input: { bookingId: string; intake: Record<string, string> }): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Please sign in.' }
  const admin = createAdminClient()
  const { data: cu } = await admin.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle()
  if (!cu?.client_id) return { ok: false, error: 'No restaurant account is linked to your login.' }
  const { data: b } = await admin.from('bookings').select('id, note, client_id').eq('id', input.bookingId).maybeSingle()
  if (!b || b.client_id !== cu.client_id) return { ok: false, error: 'That booking is not yours.' }
  const meta = parseMeta(b.note as string | null)
  if (!meta) return { ok: false, error: 'That booking cannot be updated.' }
  const next: CreatorBookingMeta = { ...meta, intake: { ...meta.intake, ...cleanIntake(input.intake) } }
  const { error } = await admin.from('bookings').update({ note: JSON.stringify(next), updated_at: new Date().toISOString() }).eq('id', b.id)
  if (error) return { ok: false, error: 'Could not save. Try again.' }
  revalidatePath('/dashboard/bookings')
  return { ok: true }
}
