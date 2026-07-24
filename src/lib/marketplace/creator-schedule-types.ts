/**
 * Shared types for per-creator scheduling. A plain module (no 'use server', no 'server-only') so
 * both the server action files and the client components can import these without pulling server
 * code into the client bundle, and so the action files only ever export async functions.
 */

import type { Window, OpenSlot } from '@/lib/campaigns/gates/types'

/** Instant book, or accept each request. The creator's choice. */
export type ConfirmMode = 'instant' | 'request'

/** A vendor's open slots (or honest request-mode), what the product page's picker reads. */
export interface VendorSchedule {
  available: boolean
  reason?: 'no_availability'
  timezone: string | null
  confirmMode: ConfirmMode
  ruleId: string | null
  slots: OpenSlot[]
}

/** Everything the availability editor reads and writes. */
export interface CreatorAvailabilityForm {
  weekly: Record<string, Window[]>
  slotMinutes: number
  capacity: number
  leadTimeDays: number
  horizonDays: number
  timezone: string
  confirmMode: ConfirmMode
  active: boolean
}

/** One add-on the restaurant chose at booking — its label and the extra it adds to the price. */
export interface BookingOption {
  label: string
  priceDeltaCents: number
}

/** The restaurant's slot pick, sent to hold a booking. */
export interface HoldSlotInput {
  vendorSlug: string
  listingSlug: string
  tierName?: string | null
  date: string
  start: string
  intake?: Record<string, string>
  /** Add-ons the buyer chose — each adds to the price (and the multi-delivery split). */
  options?: BookingOption[]
}

export type HoldSlotResult =
  | { ok: true; bookingId: string; status: 'held' | 'confirmed'; confirmMode: ConfirmMode; date: string; start: string; end: string; timezone: string }
  | { ok: false; needsLogin?: boolean; code?: 'slot_taken' | 'no_rule' | 'setup' | 'error'; error: string }

/** One deliverable behind a booking (client-safe mirror of BookingWork). A single-handoff booking
 *  has one; a multi-delivery booking (or an accruing monthly plan) has several, each delivered +
 *  approved + billed on its own. */
export interface BookingDeliverable {
  orderId: string
  title: string
  status: string
  deliveredUrl: string | null
  amountCents: number
  dueDate: string | null
}

/** One of the current restaurant's creator bookings (their side of the shared status). */
export interface ClientBooking {
  id: string
  status: string
  date: string | null
  start: string | null
  timezone: string | null
  vendorSlug: string
  vendorName: string
  listingTitle: string
  tierName: string | null
  /** The requirements the restaurant filled in at booking, as question -> answer (the map key is the
   *  creator's question). Empty when nothing was asked. Lets the restaurant see what they told the creator. */
  intake: Record<string, string>
  /** The offer's FULL question list (labels, in order), so the restaurant can fill in any it skipped
   *  at booking, not just the ones it already answered. */
  questions: string[]
  /** The deliverable behind a confirmed booking (once the bridge mints one): the work order id, its
   *  status (accepted | in_progress | delivered | approved | revision | declined), and the delivered
   *  link. null until a work order exists (a held request has none yet). */
  orderId?: string | null
  workStatus?: string | null
  deliveredUrl?: string | null
  amountCents?: number | null
  /** Every deliverable behind this booking (one for a single handoff, several for a multi-delivery
   *  offer or an accruing monthly plan). The singular fields above mirror the "lead" (most-actionable)
   *  one for the single-delivery UI. */
  deliverables: BookingDeliverable[]
  /** Which booking shape this is: scheduled | async | recurring | quote (absent = scheduled). */
  shape?: string | null
  /** Quote jobs only: the price the creator named (cents), and where the quote is
   *  ('requested' = waiting on the creator's number, 'quoted' = ready for the restaurant to accept). */
  quotedCents?: number | null
  quoteStatus?: string | null
}

/** A custom (quote) job waiting for the creator to name a price. */
export interface QuoteRequest {
  id: string
  listingTitle: string
  tierName: string | null
  intake: Record<string, string>
  quotedCents: number | null
  quoteStatus: string
}

/** Result of a create-booking action that has no slot (async/recurring/quote). */
export type SimpleBookingResult =
  | { ok: true; bookingId: string; dueDate?: string | null; startDate?: string | null }
  | { ok: false; needsLogin?: boolean; error: string }

/** One dated thing on the creator's master calendar — a shoot (has a time) or a deliverable deadline
 *  (no time). Sourced from their work orders (every confirmed booking + campaign piece mints one),
 *  so it's every shape in one place: shoots on their day, editing/design/plan work on its due date. */
export interface CalendarItem {
  id: string
  /** YYYY-MM-DD (the due date, or the shoot day). */
  date: string
  /** HH:MM for a scheduled shoot; null for remote/deadline work. */
  time: string | null
  title: string
  status: string
  kind: 'shoot' | 'work'
  /** The booking this piece belongs to (for tapping through to the booking detail). null for a
   *  campaign piece that isn't a marketplace booking. */
  bookingId: string | null
}

/** One row in a creator's incoming list. */
export interface IncomingBooking {
  id: string
  status: string
  date: string | null
  start: string | null
  end: string | null
  timezone: string | null
  holdExpiresAt: string | null
  listingTitle: string
  tierName: string | null
  intake: Record<string, string>
}
