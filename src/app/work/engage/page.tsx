/**
 * /work/engage — community manager queue.
 *
 * Comments + DMs across every assigned client, with AI-suggested
 * replies inline. Phase 0 ships the gated shell. Real implementation
 * reuses the existing /dashboard/social/engage logic but joins across
 * assigned_client_ids() instead of a single client.
 */

import { MessagesSquare } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'
import QueueShell, { ComingSoonState } from '@/components/work/queue-shell'

export const dynamic = 'force-dynamic'

export default async function CommunityQueue() {
  await requireCapability('community_mgr')
  return (
    <QueueShell
      icon={<MessagesSquare className="w-4.5 h-4.5" />}
      accent="teal"
      eyebrow="Community"
      title="Reply queue"
      description="Comments and DMs across your assigned clients. AI suggests a reply for every message — approve, edit, or write your own."
      empty={
        <ComingSoonState>
          The unified reply queue lands here once we wire it across multiple clients. Live for single-client view inside each /dashboard/social/engage.
        </ComingSoonState>
      }
    />
  )
}
