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
import { createClient } from '@/lib/supabase/server'
import { getGoalsCatalog, getActiveClientGoals } from '@/lib/goals/queries'
import GoalsSelector from './goals-selector'

export const dynamic = 'force-dynamic'

export default async function GoalsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve client_id the same way the rest of the portal does: an
  // onboarded owner is linked via businesses.owner_id -> client_id; a
  // magic-link portal user via client_users.auth_user_id. (We do NOT read
  // profiles.client_id — that column doesn't exist, so the old query here
  // always errored and made owners fall through to the gate below.)
  const { data: business } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  let clientId = business?.client_id as string | null | undefined

  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = cu?.client_id as string | null | undefined
  }

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

  return <GoalsSelector clientId={clientId} catalog={catalog} activeGoals={activeGoals} />
}
