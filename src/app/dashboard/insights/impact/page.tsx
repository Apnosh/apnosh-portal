/**
 * /dashboard/insights/impact was the monthly "This month, so far" report. Gone (owner
 * 2026-09-11): the analyst's read at /dashboard/insights/analyst is the report now. The
 * monthly emails and the More hub linked here for months, so the address still lands there.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function ImpactRedirect({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams
  redirect(`/dashboard/insights/analyst${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`)
}
