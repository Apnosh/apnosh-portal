/**
 * /dashboard/bookings/[id] — one booking, focused: the restaurant's full view of a single creator
 * booking (requirements to fill, deliverables to approve, reschedule/cancel), reusing the same
 * interactive card as the list. Scoped by getMyCreatorBookings (the current client's bookings only),
 * so an id that isn't theirs falls through to the list.
 */

import { redirect } from 'next/navigation'
import { getMyCreatorBookings } from '@/lib/marketplace/creator-booking'
import ClientBookings from '@/components/marketplace/client-bookings'

export const dynamic = 'force-dynamic'

export default async function DashboardBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const all = await getMyCreatorBookings()
  const booking = all.find((b) => b.id === id)
  if (!booking) redirect('/dashboard/bookings')
  return <ClientBookings initialBookings={[booking]} title="Booking" subtitle="Your booking and its work to approve" backHref="/dashboard/bookings" backLabel="Bookings" linkToDetail={false} />
}
