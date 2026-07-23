/**
 * /dashboard/bookings — the restaurant's creator bookings: status, when, and reschedule + cancel.
 * The client's side of the shared booking status (the creator sees the same at /creator/bookings).
 */

import { getMyCreatorBookings } from '@/lib/marketplace/creator-booking'
import ClientBookings from '@/components/marketplace/client-bookings'

export const dynamic = 'force-dynamic'

export default async function DashboardBookingsPage() {
  const bookings = await getMyCreatorBookings()
  return <ClientBookings initialBookings={bookings} />
}
