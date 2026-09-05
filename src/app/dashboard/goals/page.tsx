/**
 * /dashboard/goals — set your active goals.
 *
 * Per docs/PRODUCT-SPEC.md and decision 0001 (8-goal catalog).
 *
 * Owner picks up to 3 active goals from the spec's 8, with priority 1, 2, 3.
 * Each goal has a rationale shown next to it — this is the educational moment
 * (moat in product form). Goals reviewed every 90 days with the strategist.
 *
 * Reads from goals_catalog (migration 092). Writes via setClientGoal()
 * server action; existing goals at the same priority get superseded.
 */

import { redirect } from 'next/navigation'
import { resolveCurrentClient } from '@/lib/auth/resolve-client'
import { getGoalsCatalog, getActiveClientGoals } from '@/lib/goals/queries'
import MvpGoals from './mvp-goals'

export const dynamic = 'force-dynamic'

interface PageProps { searchParams: Promise<{ clientId?: string }> }

export default async function GoalsPage({ searchParams }: PageProps) {
  /* the shared resolver (owner → their business; admin → ?clientId), so an admin can see and
     set a client's goals from the switcher like every other More page (portal redesign 2026-09-04) */
  const { clientId: clientIdParam } = await searchParams
  const { user, clientId } = await resolveCurrentClient(clientIdParam ?? null)
  if (!user) redirect('/login')

  if (!clientId) {
    return (
      <div className="max-w-2xl mx-auto py-12 text-center text-ink-3">
        Sign in as a client to set goals.
      </div>
    )
  }

  const [catalog, activeGoals] = await Promise.all([
    getGoalsCatalog(),
    getActiveClientGoals(clientId),
  ])

  return <MvpGoals clientId={clientId} catalog={catalog} activeGoals={activeGoals} />
}
