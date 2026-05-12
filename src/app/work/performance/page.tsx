/**
 * /work/performance — cross-client rollup of how their book is doing.
 *
 * Reuses the admin reports page (which is already a cross-client
 * rollup of metrics). RLS scopes data; strategist sees only their
 * assigned clients in the totals.
 */

import { requireCapability } from '@/lib/auth/require-capability'
import AdminReportsClient from '@/app/admin/reports/page'

export const dynamic = 'force-dynamic'

export default async function WorkPerformancePage() {
  await requireCapability('strategist')
  return <AdminReportsClient />
}
