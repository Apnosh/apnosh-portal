/**
 * /work/approvals — strategist's queue of drafts awaiting review.
 *
 * Reuses the admin queue page. RLS already scopes deliverables to the
 * strategist's assigned book (migration 104), so the queue surfaces
 * only what they need to approve.
 */

import { requireCapability } from '@/lib/auth/require-capability'
import AdminQueueClient from '@/app/admin/queue/page'

export const dynamic = 'force-dynamic'

export default async function WorkApprovalsPage() {
  await requireCapability('strategist')
  return <AdminQueueClient />
}
