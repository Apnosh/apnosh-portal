/**
 * /work/drafts — the strategist's editorial workflow ledger.
 *
 * Shows content_drafts across the assigned book, grouped by status
 * (Ideas → Drafts → Approved → Scheduled → Published, plus Revising
 * and Rejected at the bottom). Each row shows the seed idea + caption
 * preview + provenance + AI-generation count. One-click approve,
 * tag-required revise, tag+note reject.
 *
 * The judgment capture (per principle #3) writes a row to
 * human_judgments AND transitions draft status. That table is the
 * irreplaceable training signal for future AI fine-tuning.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getMyDrafts } from '@/lib/work/get-drafts'
import DraftsView from './drafts-view'

export const dynamic = 'force-dynamic'

export default async function DraftsPage() {
  await requireAnyCapability(["strategist","copywriter","designer"])
  const drafts = await getMyDrafts()
  return <DraftsView initialDrafts={drafts} />
}
