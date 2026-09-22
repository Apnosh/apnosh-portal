/**
 * /dashboard/plan — the month moved to the Plan ahead tab (owner 2026-09-22). Old links follow.
 */
import { redirect } from 'next/navigation'

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ clientId?: string; month?: string }> }) {
  const { clientId, month } = await searchParams
  const q = [clientId ? `clientId=${encodeURIComponent(clientId)}` : '', month ? `month=${encodeURIComponent(month)}` : ''].filter(Boolean).join('&')
  redirect(`/dashboard/campaigns${q ? `?${q}` : ''}`)
}
