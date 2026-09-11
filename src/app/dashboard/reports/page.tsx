/**
 * /dashboard/reports — retired (owner 2026-09-05). The team-written "Monthly Reports" list is
 * gone; the report is the analyst's read at /dashboard/insights/analyst (the impact page is gone, 2026-09-11).
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RetiredReportsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams
  redirect(`/dashboard/insights/analyst${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`)
}
