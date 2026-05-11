/**
 * /work/briefs — copywriter queue.
 *
 * Caption + copy jobs. Each card: image/clip preview, owner voice notes,
 * brand voice doc link, due date. Inline caption editor and submit-for-
 * review action. Phase 0 ships the gated shell.
 */

import { PenLine } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'
import QueueShell, { ComingSoonState } from '@/components/work/queue-shell'

export const dynamic = 'force-dynamic'

export default async function CopywriterQueue() {
  await requireCapability('copywriter')
  return (
    <QueueShell
      icon={<PenLine className="w-4.5 h-4.5" />}
      accent="sky"
      eyebrow="Copywriter"
      title="Caption queue"
      description="Caption and copy jobs across your assigned clients. Each card includes brand voice and any owner voice notes."
      empty={
        <ComingSoonState>
          Caption jobs land here once a post is in production. We&rsquo;re wiring the live queue next.
        </ComingSoonState>
      }
    />
  )
}
