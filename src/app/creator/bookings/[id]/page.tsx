/**
 * /creator/bookings/[id] — one booking's full detail for the creator: when, the requirements the
 * restaurant answered, every delivery + its state, and what it's worth. Scoped to the creator's own
 * vendor inside getCreatorBookingDetail, so a stranger's id resolves to null → back to the list.
 */

import { redirect } from 'next/navigation'
import { getCreatorBookingDetail } from '@/lib/marketplace/creator-booking'
import CreatorBookingDetail from '@/components/creator/booking-detail'

export const dynamic = 'force-dynamic'

export default async function CreatorBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const detail = await getCreatorBookingDetail(id)
  if (!detail) redirect('/creator/bookings')
  return <CreatorBookingDetail detail={detail} />
}
