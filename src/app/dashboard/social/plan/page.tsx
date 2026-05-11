/**
 * /dashboard/social/plan — the editorial plan.
 *
 * Shows the client what's planned this month: theme, content pillars,
 * key dates to plan around, and the slate of content lined up against
 * them. Plus a forward look at next month.
 *
 * Strategist sets these on /admin/clients/[slug]/themes; client sees
 * only the 'shared' status (planning state is hidden so strategists
 * can iterate privately).
 */

import { redirect } from 'next/navigation'
import { getEditorialPlan } from '@/lib/dashboard/get-editorial-plan'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import EditorialPlanView from './plan-view'

export const dynamic = 'force-dynamic'

interface PageProps {
  searchParams: Promise<{ clientId?: string }>
}

export default async function EditorialPlanPage({ searchParams }: PageProps) {
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')
  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to see your editorial plan.
      </div>
    )
  }

  const data = await getEditorialPlan(clientId)
  return <EditorialPlanView data={data} />
}
