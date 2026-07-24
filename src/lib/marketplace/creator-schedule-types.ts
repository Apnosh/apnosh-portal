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

/** The restaurant's slot pick, sent to hold a booking. */
export interface HoldSlotInput {
  vendorSlug: string
  listingSlug: string
  tierName?: string | null
  date: string
  start: string
  intake?: Record<string, string>
}

export type HoldSlotResult =
  | { ok: true; bookingId: string; status: 'held' | 'confirmed'; confirmMode: ConfirmMode; date: string; start: string; end: string; timezone: string }
  | { ok: false; needsLogin?: boolean; code?: 'slot_taken' | 'no_rule' | 'setup' | 'error'; error: string }

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
  /** The deliverable behind a confirmed booking (once the bridge mints one): the work order id, its
   *  status (accepted | in_progress | delivered | approved | revision | declined), and the delivered
   *  link. null until a work order exists (a held request has none yet). */
  orderId?: string | null
  workStatus?: string | null
  deliveredUrl?: string | null
  amountCents?: number | null
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
