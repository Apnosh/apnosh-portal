/**
 * /creator/bookings — the creator's Bookings tab: a master Calendar (everything dated in one place)
 * plus the Requests list to accept / price / reschedule. Server component: loads once, client handles
 * the rest.
 */

import { getVendorIncomingBookings, getVendorQuoteRequests } from '@/lib/marketplace/creator-booking'
import { currentVendor } from '@/lib/marketplace/creator-schedule'
import { getMyCalendar } from '@/lib/marketplace/creator-store-actions'
import BookingsScreen from '@/components/creator/bookings-screen'

export const dynamic = 'force-dynamic'

export default async function CreatorBookingsPage() {
  const vendor = await currentVendor()
  const [bookings, quotes, calendar] = vendor
    ? await Promise.all([getVendorIncomingBookings(), getVendorQuoteRequests(), getMyCalendar()])
    : [[], [], []]
  return (
    <BookingsScreen
      calendar={calendar}
      initialVendor={vendor ? { name: vendor.name, slug: vendor.slug } : null}
      initialBookings={bookings}
      initialQuotes={quotes}
    />
  )
}
