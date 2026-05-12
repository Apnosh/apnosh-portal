/**
 * /work/engage — community manager queue.
 *
 * Unified inbox across the entire assigned book. Open items first,
 * with a separate rail for anything flagged "requires attention".
 * Replies are AI-assisted and audited; every approved reply becomes
 * voice training data via the social_interactions table.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getEngageInbox } from '@/lib/work/get-engage-inbox'
import EngageView from './engage-view'

export const dynamic = 'force-dynamic'

export default async function EngagePage() {
  await requireAnyCapability(['community_mgr'])
  const inbox = await getEngageInbox()
  return <EngageView initialInbox={inbox} />
}
