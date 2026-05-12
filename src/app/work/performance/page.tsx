/**
 * /work/performance — data analyst's book-level rollup.
 *
 * Shows the compounding loop in numbers: drafts created, judged,
 * approved, published, replied to, reviewed. Plus top performing
 * posts and a per-client activity rail. AI synthesis surfaces
 * patterns the analyst should brief upstream.
 */

import { requireAnyCapability } from '@/lib/auth/require-any-capability'
import { getPerformanceData } from '@/lib/work/get-performance-data'
import PerformanceView from './performance-view'

export const dynamic = 'force-dynamic'

export default async function PerformancePage() {
  await requireAnyCapability(['strategist', 'data_analyst'])
  const data = await getPerformanceData()
  return <PerformanceView initialData={data} />
}
