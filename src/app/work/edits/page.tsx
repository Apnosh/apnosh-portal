/**
 * /work/edits — editor queue.
 *
 * Raw → final post-production jobs. Each job pairs source clips with
 * a target platform spec (aspect ratio, length, captions). Phase 0
 * ships the gated shell. Phase 2 fills in the queue once we attach
 * an edit_jobs table to shoot_uploads.
 */

import { Film } from 'lucide-react'
import { requireCapability } from '@/lib/auth/require-capability'
import QueueShell, { ComingSoonState } from '@/components/work/queue-shell'

export const dynamic = 'force-dynamic'

export default async function EditorQueue() {
  await requireCapability('editor')
  return (
    <QueueShell
      icon={<Film className="w-4.5 h-4.5" />}
      accent="indigo"
      eyebrow="Editor"
      title="Edit queue"
      description="Raw footage waiting for the cut. Open a job to see source clips, target platforms, and the brief."
      empty={
        <ComingSoonState>
          Edit jobs appear here when a shoot wraps and footage is uploaded. We&rsquo;re wiring the live queue next.
        </ComingSoonState>
      }
    />
  )
}
