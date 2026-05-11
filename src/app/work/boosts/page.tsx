/**
 * /work/boosts — ad buyer queue.
 *
 * Pending boost requests grouped by client. The ad buyer sets up the
 * campaign, picks the audience seed, approves the budget, and ships.
 * Phase 0 ships the gated route + shell. Real data hooks in when we
 * onboard the first ad buyer (it'll read ad_campaigns where
 * status='requested' filtered by assigned_client_ids()).
 */

import { Megaphone } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'
import QueueShell, { ComingSoonState } from '@/components/work/queue-shell'

export const dynamic = 'force-dynamic'

export default async function AdBuyerQueue() {
  await requireCapability('ad_buyer')
  return (
    <QueueShell
      icon={<Megaphone className="w-4.5 h-4.5" />}
      accent="violet"
      eyebrow="Ad buyer"
      title="Boost queue"
      description="Pending boost requests across your book of clients. Approve a budget, set the audience seed, and ship."
      empty={
        <ComingSoonState>
          When a client requests a boost or a strategist queues one, it lands here. We&rsquo;re wiring the live queue next.
        </ComingSoonState>
      }
    />
  )
}
