'use server'

/**
 * Marketplace booking actions.
 *
 * Creates a booking_request row for any vendor_listings click-through.
 * For Apnosh bundles: status='confirmed' (the AM picks it up to set
 * up Stripe + onboarding). For third-party vendors: status='open'
 * (AM mediates the conversation).
 *
 * The Stripe Checkout integration for Apnosh bundles is intentionally
 * deferred — a $299+/mo subscription with onboarding photo shoots
 * benefits from an AM touchpoint to confirm fit, schedule the shoot,
 * and sequence the website deliverable before the first charge.
 */

import { revalidatePath } from 'next/cache'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface BookingResult {
  ok: boolean
  bookingId?: string
  error?: string
  needsLogin?: boolean
}

export async function requestMarketplaceBooking({
  vendorSlug,
  listingSlug,
  brief,
}: {
  vendorSlug: string
  listingSlug: string
  brief?: string
}): Promise<BookingResult> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, needsLogin: true, error: 'Please sign in to book' }

  const admin = createAdminClient()

  /* Resolve current client (the buying side). */
  const { data: cu } = await admin
    .from('client_users')
    .select('client_id')
    .eq('auth_user_id', user.id)
    .maybeSingle() as { data: { client_id: string } | null }
  if (!cu?.client_id) return { ok: false, error: 'No client account linked to your login' }

  /* Resolve vendor + listing. */
  const { data: vendor } = await admin
    .from('vendors')
    .select('id, name, is_apnosh')
    .eq('slug', vendorSlug)
    .maybeSingle() as { data: { id: string; name: string; is_apnosh: boolean } | null }
  if (!vendor) return { ok: false, error: 'Vendor not found' }

  const { data: listing } = await admin
    .from('vendor_listings')
    .select('id, title, category, listing_type')
    .eq('vendor_id', vendor.id)
    .eq('slug', listingSlug)
    .eq('active', true)
    .maybeSingle() as { data: { id: string; title: string; category: string; listing_type: string } | null }
  if (!listing) return { ok: false, error: 'Listing not found' }

  /* Apnosh subscriptions get auto-confirmed so AM picks them up
     immediately. Third parties stay 'open' so the strategist can
     negotiate before confirming. */
  const status = vendor.is_apnosh && listing.listing_type === 'subscription'
    ? 'confirmed'
    : 'open'

  const briefText = brief?.trim() || (vendor.is_apnosh
    ? `Subscribe to ${listing.title}. Auto-created from /marketplace/${vendorSlug}#${listingSlug}.`
    : `Interest in ${listing.title} from ${vendor.name}.`)

  const { data: booking, error } = await admin
    .from('booking_requests')
    .insert({
      client_id: cu.client_id,
      vendor_id: vendor.id,
      listing_id: listing.id,
      requested_by: user.id,
      category: listing.category,
      brief: briefText,
      status,
    })
    .select('id')
    .single() as { data: { id: string } | null; error: { message: string } | null }
  if (error || !booking) return { ok: false, error: error?.message ?? 'Failed to create booking' }

  revalidatePath(`/marketplace/${vendorSlug}`)
  return { ok: true, bookingId: booking.id }
}
