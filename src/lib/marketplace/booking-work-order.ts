import 'server-only'

/**
 * BOOKING → WORK ORDER bridge. A confirmed marketplace booking (the `bookings` rail) becomes a real
 * creator_work_order (the delivery + money rail), so a directly-booked creator can deliver, the
 * restaurant can approve, and the existing charge + payout machinery runs — end to end, without a
 * campaign. Covers all four booking shapes:
 *   scheduled  a shot at a picked slot (price = the booked tier)
 *   async      a design/brief delivered by a date (price = the booked tier)
 *   quote      a custom job the creator prices first (price = the accepted quote)
 *   recurring  a monthly plan (one payable order PER MONTH, price = the monthly tier)
 *
 * The order carries campaign_id = NULL (this is a marketplace booking, not a campaign piece). That
 * null is the marker every campaign-only side effect keys off. creator_id = the vendor UUID, which is
 * exactly what getCreatorIdForUser resolves for a logged-in creator, so one login sees the booking
 * under /creator/bookings AND the deliverable under /creator/work with no new identity code.
 *
 * The booking id rides in campaign_piece_key as `booking:<id>` (one-shot) or `booking:<id>#<month>`
 * (recurring month N) — the idempotency key AND the join key the restaurant's bookings list reads
 * work state back through. Money is honest: no charge at booking time; the owner charge + creator
 * payout only accrue when the restaurant approves the delivery, via the shared updateWorkOrder path.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { rowToPackage, startingPriceCents, type ListingRow } from './package'

export type BookingShapeKind = 'scheduled' | 'async' | 'recurring' | 'quote'

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
  /** Which booking shape this is (absent = scheduled, the original bridge). */
  shape?: BookingShapeKind
  /** For quote jobs: the price the creator named and the restaurant accepted. Overrides the tier. */
  quotedCents?: number
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

/** The stable per-booking key an order carries. A recurring booking gets one order per month, so its
 *  key carries the 1-based month; one-shot shapes use the bare `booking:<id>`. */
export function bookingOrderKey(bookingId: string, month?: number): string {
  return month && month > 1 ? `booking:${bookingId}#${month}` : `booking:${bookingId}`
}
/** The booking id behind any order key, ignoring the `#month` suffix. */
function bookingIdFromKey(key: string | null | undefined): string | null {
  if (!key || !key.startsWith('booking:')) return null
  return key.slice('booking:'.length).split('#')[0]
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

/** Split `total` cents into `n` whole-cent parts that sum EXACTLY to total (the last part takes the
 *  remainder). So N deliveries of one booking bill, together, exactly the price the restaurant agreed. */
function splitCents(total: number, n: number): number[] {
  if (n <= 0) return []
  const base = Math.floor(total / n)
  const out = Array(n).fill(base)
  out[n - 1] = total - base * (n - 1)
  return out
}

/** ISO date `offset` days after `iso` (null-safe). Used to stagger a delivery's due date. */
function addDaysISO(iso: string | null, offset: number): string | null {
  if (!iso) return iso
  const t = Date.parse(`${iso}T00:00:00Z`)
  if (!Number.isFinite(t)) return iso
  return new Date(t + offset * 86400000).toISOString().slice(0, 10)
}

/** The price the restaurant agreed to: an accepted quote wins, else the booked tier, else the
 *  listing's starting price, else 0 (an unpriced quote — the approval path flags it for staff). */
function resolvePriceCents(meta: CreatorBookingMeta, listing: ListingRow | null): number {
  if (typeof meta.quotedCents === 'number' && meta.quotedCents > 0) return Math.round(meta.quotedCents)
  if (!listing) return 0
  const pkg = rowToPackage(listing)
  const tier = meta.tierName ? pkg.tiers.find((t) => t.name === meta.tierName) : null
  return tier ? tier.priceCents : (startingPriceCents(pkg) ?? 0)
}

/**
 * Mint the work order for a CONFIRMED marketplace booking. Idempotent (returns the existing order id
 * for the same key), best-effort, and a silent no-op if the booking isn't a confirmed creator
 * booking, isn't priced yet (a quote awaiting its number), or the vendor can't be resolved. Never
 * throws — a booking must never fail because the bridge did.
 *
 * opts.month + opts.dueDateISO drive the recurring case: month N gets its own order, dated to that
 * month's cycle. One-shot shapes call it with no opts.
 */
export async function mintBookingWorkOrder(bookingId: string, opts?: { month?: number; dueDateISO?: string }): Promise<string | null> {
  try {
    const admin = createAdminClient()
    const month = opts?.month
    const key = bookingOrderKey(bookingId, month)

    // Idempotency: one order per key, ever.
    const { data: existing } = await admin
      .from('creator_work_orders')
      .select('id')
      .eq('campaign_piece_key', key)
      .limit(1)
      .maybeSingle()
    if (existing?.id) return existing.id as string

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

    const { data: listing } = await admin
      .from('vendor_listings')
      .select('id, slug, title, category, listing_type, description, price_cents, billing_period, details, active')
      .eq('vendor_id', meta.vendorId)
      .eq('slug', meta.listingSlug)
      .maybeSingle()
    const amountCents = resolvePriceCents(meta, (listing as ListingRow) ?? null)
    const category = listing ? (listing.category as string) : ''
    const shape: BookingShapeKind = meta.shape ?? 'scheduled'
    const discipline = ((vendor.craft as string | null) || CATEGORY_TO_DISCIPLINE[category] || 'Photo')
    const monthTag = month && month > 1 ? ` · month ${month}` : ''
    const baseTitle = (meta.tierName ? `${meta.listingTitle} · ${meta.tierName}` : meta.listingTitle) + monthTag
    const baseDueISO = opts?.dueDateISO ?? ((b.slot_date as string) ?? null)
    const intakeLines = Object.entries(meta.intake).filter(([, v]) => typeof v === 'string' && v.trim())
    const dueWord = shape === 'scheduled' ? 'Shoot day' : shape === 'recurring' ? 'This month' : 'Deliver by'
    const shapeWord = shape === 'recurring' ? 'Monthly plan' : shape === 'quote' ? 'Custom job' : shape === 'async' ? 'Booked work' : 'Booked shoot'

    // Build one work-order row for a single piece (title, its own due date, its own price share, key).
    const buildRow = (pieceTitle: string, pieceDueISO: string | null, pieceAmount: number, pieceKey: string): Record<string, unknown> => {
      const dayLabel = shootDayLabel(pieceDueISO)
      const brief = [
        `${shapeWord}: ${pieceTitle}.`,
        dayLabel ? `${dueWord}: ${dayLabel}.` : '',
        ...intakeLines.map(([q, v]) => `${q}: ${v}.`),
        'Deliver the finished work here when it is ready — the restaurant reviews and approves it.',
      ].filter(Boolean).join(' ')
      return {
        campaign_id: null, client_id: b.client_id as string, creator_id: meta.vendorId, vendor_id: meta.vendorId,
        discipline, slot: 0, title: pieceTitle, brief, due_date: pieceDueISO, status: 'accepted',
        concept_status: 'approved', amount_cents: pieceAmount, campaign_piece_key: pieceKey, surcharge_cents: 0,
      }
    }

    // Insert one row, tolerating a missing surcharge_cents column (42703) and a concurrent duplicate
    // (23505, unique on campaign_piece_key, migration 227 → return the winner). Returns id or null.
    const insertRow = async (row: Record<string, unknown>, pieceKey: string): Promise<string | null> => {
      let { data, error } = await admin.from('creator_work_orders').insert(row).select('id').single()
      if (error && (error as { code?: string }).code === '42703') {
        const stripped = { ...row }; delete stripped.surcharge_cents
        ;({ data, error } = await admin.from('creator_work_orders').insert(stripped).select('id').single())
      }
      if (error && (error as { code?: string }).code === '23505') {
        const { data: ex } = await admin.from('creator_work_orders').select('id').eq('campaign_piece_key', pieceKey).is('campaign_id', null).maybeSingle()
        return (ex?.id as string) ?? null
      }
      if (error || !data) return null
      return data.id as string
    }

    // MULTI-DELIVERY: an offer with >= 2 separate deliveries mints one tracked order per piece (one-
    // shot shapes only — a recurring month always stays one order, keyed by month). The level price
    // splits evenly and cent-conserved, so the pieces together bill exactly the agreed price. The
    // per-delivery key uses `#d<n>` — distinct from the recurring `#<month>` so the two never collide.
    // Prefer the booked LEVEL's own deliveries (so Standard=3 reels, Premium=5), else the offer-level
    // deliveries, else a single handoff. Recurring months always stay one order.
    const pkgForDeliveries = (!month && listing) ? rowToPackage(listing as ListingRow) : null
    const bookedTier = pkgForDeliveries && meta.tierName ? pkgForDeliveries.tiers.find((t) => t.name === meta.tierName) : null
    const deliveries = pkgForDeliveries ? ((bookedTier?.deliveries && bookedTier.deliveries.length) ? bookedTier.deliveries : pkgForDeliveries.deliveries) : []
    if (deliveries.length >= 2) {
      const amounts = splitCents(amountCents, deliveries.length)
      let firstId: string | null = null
      for (let i = 0; i < deliveries.length; i++) {
        const d = deliveries[i]
        const pieceKey = `booking:${bookingId}#d${i + 1}`
        const { data: has } = await admin.from('creator_work_orders').select('id').eq('campaign_piece_key', pieceKey).is('campaign_id', null).limit(1).maybeSingle()
        if (has?.id) { firstId = firstId ?? (has.id as string); continue }
        const pieceDue = d.offsetDays != null ? addDaysISO(baseDueISO, d.offsetDays) : baseDueISO
        const id = await insertRow(buildRow(`${baseTitle} · ${d.label}`, pieceDue, amounts[i], pieceKey), pieceKey)
        if (id && !firstId) firstId = id
      }
      return firstId
    }

    // SINGLE handoff (the default) or a recurring month: one order on the bare / #month key.
    return await insertRow(buildRow(baseTitle, baseDueISO, amountCents, key), key)
  } catch {
    return null
  }
}

/** One deliverable behind a booking, for the restaurant's bookings list. A single-handoff booking has
 *  one; a multi-delivery booking (or an accruing monthly plan) has several, each its own deliver +
 *  approve + charge. */
export interface BookingWork {
  orderId: string
  title: string
  status: string
  deliveredUrl: string | null
  amountCents: number
  dueDate: string | null
}

/** Where a booking-order key sits in its booking, for ordering: bare = 0; `#d<n>` = n (a delivery
 *  slot); `#<m>` = m (a recurring month). Deliveries and months never coexist on one booking. */
function keySeq(key: string): number {
  const hash = key.indexOf('#')
  if (hash < 0) return 0
  const suffix = key.slice(hash + 1)
  return (suffix.startsWith('d') ? Number(suffix.slice(1)) : Number(suffix)) || 0
}

/** Read the deliverables for a set of bookings, keyed by booking id, each list ordered by piece
 *  (delivery slot or month). Only bookings that have at least one order appear. */
export async function workOrdersForBookings(bookingIds: string[]): Promise<Record<string, BookingWork[]>> {
  if (!bookingIds.length) return {}
  try {
    const admin = createAdminClient()
    // Match the bare key and any `#…` variant (delivery slots or months). `like` per id, index-free.
    const orFilter = bookingIds.map((id) => `campaign_piece_key.like.booking:${id}*`).join(',')
    const { data } = await admin
      .from('creator_work_orders')
      .select('id, campaign_piece_key, title, status, delivered_url, amount_cents, due_date')
      .or(orFilter)
    const tmp: Record<string, Array<{ w: BookingWork; seq: number }>> = {}
    for (const r of (data ?? []) as Array<Record<string, unknown>>) {
      const key = (r.campaign_piece_key as string) || ''
      const id = bookingIdFromKey(key)
      if (!id || !bookingIds.includes(id)) continue
      ;(tmp[id] ??= []).push({
        seq: keySeq(key),
        w: {
          orderId: r.id as string,
          title: (r.title as string) ?? '',
          status: (r.status as string) ?? '',
          deliveredUrl: (r.delivered_url as string) ?? null,
          amountCents: (r.amount_cents as number) ?? 0,
          dueDate: (r.due_date as string) ?? null,
        },
      })
    }
    const out: Record<string, BookingWork[]> = {}
    for (const id of Object.keys(tmp)) out[id] = tmp[id].sort((a, b) => a.seq - b.seq).map((x) => x.w)
    return out
  } catch {
    return {}
  }
}

/** Void the work order behind a booking when the booking is cancelled — never touching work already
 *  in flight past delivery (a delivered/approved piece has proof + money and stays as history). For a
 *  recurring booking this releases every not-yet-delivered month. Direct update (not the status
 *  machine): a cancel is a system void, not a creator's decline. Best-effort. */
export async function voidBookingWorkOrder(bookingId: string): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('creator_work_orders')
      .update({ status: 'declined', note: 'Booking cancelled', updated_at: new Date().toISOString() })
      .like('campaign_piece_key', `booking:${bookingId}%`)
      .in('status', ['offered', 'accepted', 'in_progress', 'revision'])
  } catch { /* a cancel never fails because the void did */ }
}

/** Keep the deliverable's due date in step with a rescheduled booking. Best-effort; only moves work
 *  that hasn't been delivered yet. Scoped to the bare key (recurring months carry their own dates). */
export async function redateBookingWorkOrder(bookingId: string, newDateISO: string | null): Promise<void> {
  try {
    const admin = createAdminClient()
    await admin
      .from('creator_work_orders')
      .update({ due_date: newDateISO, updated_at: new Date().toISOString() })
      // The single handoff (bare key) and every delivery slot (#d<n>), but not recurring months
      // (#<m>), which carry their own per-month dates.
      .or(`campaign_piece_key.eq.booking:${bookingId},campaign_piece_key.like.booking:${bookingId}#d%`)
      .in('status', ['offered', 'accepted', 'in_progress', 'revision'])
  } catch { /* a reschedule never fails because the re-date did */ }
}

/* ── Recurring monthly plans ─────────────────────────────────────────────────────────────────────
   A monthly plan mints ONE payable order per month. Subscribing mints month 1; the recurring cron
   mints each later month when its cycle comes due. Honest by construction: every month is its own
   deliver → approve → charge, so nothing auto-bills without the restaurant approving that month's
   work. (Real Stripe autopay is the separate, legal-gated later step.) */

const MS_PER_DAY = 86400000

/** How many monthly cycles should exist for a plan that started on startISO, as of nowISO. Cycle 1 is
 *  the start; a new cycle every ~month (30-day step keeps it timezone-free and predictable). Capped so
 *  a long-idle cron can't mint a burst. */
export function monthsDueSince(startISO: string | null, nowISO: string, cap = 24): number {
  if (!startISO) return 1
  const start = Date.parse(`${startISO}T00:00:00Z`)
  const now = Date.parse(nowISO)
  if (!Number.isFinite(start) || !Number.isFinite(now) || now < start) return 1
  return Math.min(cap, 1 + Math.floor((now - start) / (30 * MS_PER_DAY)))
}
/** The due date for month N of a plan that started on startISO (month 1 = the start). */
export function recurringMonthDueISO(startISO: string, month: number): string {
  const start = Date.parse(`${startISO}T00:00:00Z`)
  return new Date(start + (month - 1) * 30 * MS_PER_DAY).toISOString().slice(0, 10)
}

/** Mint any monthly orders a confirmed recurring booking is missing, up to the cycle due as of nowISO.
 *  Idempotent (per-month key). Returns how many new months it minted. Used by the recurring cron. */
export async function mintDueRecurringMonths(bookingId: string, startISO: string | null, nowISO: string): Promise<number> {
  const due = monthsDueSince(startISO, nowISO)
  let minted = 0
  for (let m = 1; m <= due; m++) {
    const before = bookingOrderKey(bookingId, m)
    const admin = createAdminClient()
    const { data: has } = await admin.from('creator_work_orders').select('id').eq('campaign_piece_key', before).limit(1).maybeSingle()
    if (has?.id) continue
    const dueISO = startISO ? recurringMonthDueISO(startISO, m) : nowISO.slice(0, 10)
    const id = await mintBookingWorkOrder(bookingId, { month: m, dueDateISO: dueISO })
    if (id) minted++
  }
  return minted
}
