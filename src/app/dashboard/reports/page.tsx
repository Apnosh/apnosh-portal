/**
 * /dashboard/reports — retired (owner 2026-09-05). The team-written "Monthly Reports" list is
 * gone; the monthly report built from the account's own numbers lives at /dashboard/insights/impact.
 */
import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default async function RetiredReportsPage({ searchParams }: { searchParams: Promise<{ clientId?: string }> }) {
  const { clientId } = await searchParams
  redirect(`/dashboard/insights/impact${clientId ? `?clientId=${encodeURIComponent(clientId)}` : ''}`)
}
