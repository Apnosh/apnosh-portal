/**
 * /creator/bookings — a creator's incoming bookings: requests to accept, and the shoots already on
 * their calendar. Server component: loads the list once, then the client list handles Accept.
 */

import { getVendorIncomingBookings, getVendorQuoteRequests } from '@/lib/marketplace/creator-booking'
import { currentVendor } from '@/lib/marketplace/creator-schedule'
import BookingsList from '@/components/creator/bookings-list'

export const dynamic = 'force-dynamic'

export default async function CreatorBookingsPage() {
  const vendor = await currentVendor()
  const [bookings, quotes] = vendor
    ? await Promise.all([getVendorIncomingBookings(), getVendorQuoteRequests()])
    : [[], []]
  return <BookingsList initialVendor={vendor ? { name: vendor.name, slug: vendor.slug } : null} initialBookings={bookings} initialQuotes={quotes} />
}
