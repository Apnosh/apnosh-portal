/**
 * /creator/availability — "When you shoot". A creator sets the hours restaurants can book them.
 * Server component: resolves their current hours (or sensible defaults), then hands off to the
 * client editor. A visitor who is not a linked creator sees an honest "not set up yet" state.
 */

import { getMyAvailability } from '@/lib/marketplace/creator-availability'
import AvailabilityEditor from '@/components/creator/availability-editor'

export const dynamic = 'force-dynamic'

export default async function CreatorAvailabilityPage() {
  const { vendor, form } = await getMyAvailability()
  return <AvailabilityEditor initialVendor={vendor} initialForm={form} />
}
