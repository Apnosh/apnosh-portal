/**
 * /work/boosts — paid media buyer queue.
 *
 * Three rails: pending requests (launch these), live (monitor + adjust),
 * and opportunities (top organic posts not yet boosted — the buyer's
 * outbound prospect list). History is collapsed in the view.
 *
 * Accessible to paid_media + legacy ad_buyer per the additive role
 * model. Strategist sees a read-only view via separate surface.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getBoostQueue } from '@/lib/work/get-boost-queue'
import BoostsView from './boosts-view'

export const dynamic = 'force-dynamic'

export default async function BoostsPage() {
  await requireAnyCapability(['paid_media', 'ad_buyer'])
  const queue = await getBoostQueue()
  return <BoostsView initialQueue={queue} />
}
