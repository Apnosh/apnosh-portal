/**
 * /work/briefs — copywriter's caption queue.
 *
 * Filtered view of content_drafts focused on what NEEDS captions:
 *   - status = 'idea'        (no caption yet)
 *   - status = 'revising'    (strategist asked for changes)
 *   - status = 'draft'       (caption written, ready for review/polish)
 *
 * The strategist gates these via judgments at /work/drafts; the
 * copywriter polishes the caption text and submits back. Both
 * surfaces share the same data, the same RLS, and the same lifecycle
 * API — they're just two different lenses on the same work.
 *
 * Accessible to strategist + copywriter + designer (the creative
 * pod), per the additive role model.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getMyDrafts } from '@/lib/work/get-drafts'
import BriefsView from './briefs-view'

export const dynamic = 'force-dynamic'

export default async function BriefsPage() {
  await requireAnyCapability(['strategist','copywriter','designer'])
  // Filter to drafts that need caption work.
  const drafts = await getMyDrafts({ status: ['idea','draft','revising'] })
  return <BriefsView initialDrafts={drafts} />
}
