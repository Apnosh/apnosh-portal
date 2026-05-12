/**
 * /work/inbox — staff's incoming queue.
 *
 * Primary rail: client_request tasks (someone hit /dashboard/social/request).
 * Secondary rail: internal action items (invoice chases, system tasks).
 * Tertiary rail: recently closed (last 7 days).
 *
 * Each open request can be Accepted (creates a content_draft seeded
 * with the request body, marks the task in_progress and links the
 * content_id), Snoozed, or Dismissed.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getInbox } from '@/lib/work/get-inbox'
import InboxView from './inbox-view'

export const dynamic = 'force-dynamic'

export default async function InboxPage() {
  await requireAnyCapability(['strategist', 'copywriter', 'community_mgr', 'onboarder'])
  const inbox = await getInbox()
  return <InboxView initialInbox={inbox} />
}
