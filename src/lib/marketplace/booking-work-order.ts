import 'server-only'

/**
 * BOOKING → WORK ORDER bridge. A confirmed marketplace booking (the `bookings` rail) becomes a real
 * creator_work_order (the delivery + money rail), so a directly-booked creator can deliver, the
 * restaurant can approve, and the existing charge + payout machinery runs — end to end, without a
 * campaign.
 *
 * The order carries campaign_id = NULL (this is a marketplace booking, not a campaign piece). That
 * null is the marker every campaign-only side effect keys off (the publish bridge and the
 * decline-reassign both no-op for it — see work-orders.ts). creator_id = the vendor UUID, which is
 * exactly what getCreatorIdForUser resolves for a logged-in creator, so the same person sees the
 * booking under /creator/bookings AND the deliverable under /creator/work with no new identity code.
 *
 * The booking id rides in campaign_piece_key as `booking:<id>` — the idempotency key (never mint
 * twice for one booking) and the join key the restaurant's bookings list reads work state back
 * through. Money is honest: no charge at booking time; the owner charge + creator payout only accrue
 * when the restaurant approves the delivery, via the shared updateWorkOrder path.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { rowToPackage, startingPriceCents, type ListingRow } from './package'

/** The marketplace context stashed in bookings.note (mirror of creator-booking.ts's CreatorBookingMeta). */
interface CreatorBookingMeta {
  kind: 'creator'
  vendorId: string
  vendorSlug: string
  listingId: string | null
  listingSlug: string
  listingTitle: string
  tierName: string | null
  intake: Record<string, string>
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

/** The stable per-booking key an order carries so we never mint twice + can read work state back. */
export function bookingOrderKey(bookingId: string): string {
  return `booking:${bookingId}`
}
function bookingIdFromKey(key: string | null | undefined): string | null {
  return key && key.startsWith('booking:') ? key.slice('booking:'.length) : null
}

/** vendor_listings.category → the coarse work-order discipline, a last resort when vendors.craft is
 *  unset. The order's discipline is display-only for a marketplace piece (auto-reassign is off), so
 *  any of the four valid values is safe. */
const CATEGORY_TO_DISCIPLINE: Record<string, string> = {
  photographer: 'Photo',
  videographer: 'Video',
  food_influencer: 'Social',
  graphic_designer: 'Design',
  web_designer: 'Design',
  social_manager: 'Social',
  local_seo: 'Social',
  email_marketer: 'Social',
  pr_specialist: 'Social',
  strategist: 'Social',
  full_service_agency: 'Social',
  other: 'Photo',
}

function shootDayLabel(iso: string | null): string | null {
  if (!iso) return null
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/**
 * Mint the work order for a CONFIRMED marketplace booking. Idempotent (returns the existing order id
 * if one already exists for the booking), best-effort, and a silent no-op if the booking isn't a
 * confirmed creator booking or the vendor/listing can't be resolved. Never throws — the caller
 * (holdCreatorBooking / acceptCreatorBooking) must never have a booking fail because the bridge did.
 */
export async function mintBookingWorkOrder(bookingId: string): Promise<string | null> {
  try {
    const admin = createAdminClient()

    // Idempotency: one order per booking, ever.
    const { data: existing } = await admin
      .from('creator_work_orders')
      .select('id')
      .eq('campaign_piece_key', bookingOrderKey(bookingId))
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing.id as string

    // Only a confirmed booking becomes deliverable work; a held/expired request never mints.
    const { data: b } = await admin
      .from('bookings')
      .select('id, status, client_id, slot_date, note')
      .eq('id', bookingId)
      .maybeSingle()
    if (!b || b.status !== 'confirmed') return null
    const meta = parseMeta(b.note as string | null)
    if (!meta) return null

    const { data: vendor } = await admin
      .from('vendors')
      .select('id, name, craft')
      .eq('id', meta.vendorId)
      .maybeSingle()
    if (!vendor) return null

    // Price = the tier the restaurant booked (what they saw on the product page), else the listing's
    // starting price, else 0 (a quote — the approval path flags an unpriced piece for staff to price).
    const { data: listing } = await admin
      .from('vendor_listings')
      .select('id, slug, title, category, listing_type, description, price_cents, billing_period, details, active')
      .eq('vendor_id', meta.vendorId)
      .eq('slug', meta.listingSlug)
      .maybeSingle()
    let amountCents = 0
    let category = ''
    if (listing) {
      const pkg = rowToPackage(listing as ListingRow)
      category = pkg.category
      const tier = meta.tierName ? pkg.tiers.find((t) => t.name === meta.tierName) : null
      amountCents = tier ? tier.priceCents : (startingPriceCents(pkg) ?? 0)
    }

    const discipline = ((vendor.craft as string | null) || CATEGORY_TO_DISCIPLINE[category] || 'Photo')
    const title = meta.tierName ? `${meta.listingTitle} · ${meta.tierName}` : meta.listingTitle
    const dayLabel = shootDayLabel((b.slot_date as string) ?? null)
    const intakeLines = Object.values(meta.intake).filter((v) => typeof v === 'string' && v.trim())
    const brief = [
      `Booked shoot: ${title}.`,
      dayLabel ? `Shoot day: ${dayLabel}.` : '',
      ...intakeLines.map((v) => `Note: ${v}.`),
      'Deliver the finished work here when it is ready — the restaurant reviews and approves it.',
    ].filter(Boolean).join(' ')

    // status 'accepted' (the booking IS the acceptance) + concept 'approved' (a standard product, no
    // concept gate) → the creator's Work tab shows "Start work" immediately. campaign_id null routes
    // it out of every campaign-only side effect.
    const row: Record<string, unknown> = {
      campaign_id: null,
      client_id: b.client_id as string,
      creator_id: meta.vendorId,
      vendor_id: meta.vendorId,
      discipline,
      slot: 0,
      title,
      brief,
      due_date: (b.slot_date as string) ?? null,
      status: 'accepted',
      concept_status: 'approved',
      amount_cents: amountCents,
      campaign_piece_key: bookingOrderKey(bookingId),
      surcharge_cents: 0,
    }

    let { data, error } = await admin.from('creator_work_orders').insert(row).select('id').single()
    // Defensive parity with mintWorkOrders: pre-183/184 the key/surcharge columns are absent (42703).
    // Without campaign_piece_key we lose idempotency + the booking join, so only strip surcharge here;
    // prod is well past 184, so this is a belt-and-suspenders path that shouldn't run.
    if (error && (error as { code?: string }).code === '42703') {
      const stripped = { ...row }
      delete stripped.surcharge_cents
      ;({ data, error } = await admin.from('creator_work_orders').insert(stripped).select('id').single())
    }
    if (error || !data) return null
    return data.id as string
  } catch {
    return null
  }
}

/** One booking's live work state, for the restaurant's bookings list. */
export interface BookingWork {
  orderId: string
  status: string
  deliveredUrl: string | null
  amountCents: number
}

/** Read work state for a set of bookings, keyed by booking id (only bookings that have an order
 *  appear). One query; the restaurant's list uses this to show delivery status + the approve gate. */
export async function workOrdersForBookings(bookingIds: string[]): Promise<Record<string, BookingWork>> {
  if (!bookingIds.length) return {}
  try {
    const admin = createAdminClient()
    const keys = bookingIds.map(bookingOrderKey)
    const { data } = await admin
      .from('creator_work_orders')
      .select('id, campaign_piece_key, status, delivered_url, amount_cents')
      .in('campaign_piece_key', keys)
    const out: Record<string, BookingWork> = {}
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const id = bookingIdFromKey(r.campaign_piece_key as string | null)
      if (!id) continue
      out[id] = {
        orderId: r.id as string,
        status: (r.status as string) ?? '',
        deliveredUrl: (r.delivered_url as string) ?? null,
        amountCents: (r.amount_cents as number) ?? 0,
      }
    }
    return out
  } catch {
    return {}
  }
}

/** Void the work order behind a booking when the booking is cancelled — but never touch work that is
 *  already in flight past delivery (a delivered/approved piece has proof + money and stays as history).
 *  Direct update (not the status machine): a cancel is a system void, not a creator's decline, so it
 *  must not trip the decline-reassign path. Best-effort. */
export async function voidBookingWorkOrder(bookingId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('creator_work_orders')
      .update({ status: 'declined', note: 'Booking cancelled', updated_at: new Date().toISOString() })
      .eq('campaign_piece_key', bookingOrderKey(bookingId))
      .in('status', ['offered', 'accepted', 'in_progress', 'revision'])
  } catch { /* a cancel never fails because the void did */ }
}

/** Keep the deliverable's due date in step with a rescheduled booking. Best-effort; only moves work
 *  that hasn't been delivered yet (a delivered/approved piece is done, its date is history). */
export async function redateBookingWorkOrder(bookingId: string, newDateISO: string | null): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('creator_work_orders')
      .update({ due_date: newDateISO, updated_at: new Date().toISOString() })
      .eq('campaign_piece_key', bookingOrderKey(bookingId))
      .in('status', ['offered', 'accepted', 'in_progress', 'revision'])
  } catch { /* a reschedule never fails because the re-date did */ }
}
