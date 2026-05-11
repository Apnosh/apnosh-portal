/**
 * /setup/goals — step 2 of onboarding.
 * Wraps the existing goals selector with a stepper header.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getGoalsCatalog, getActiveClientGoals } from '@/lib/goals/queries'
import SetupStepHeader from '../setup-step-header'
import GoalsSelector from '@/app/dashboard/goals/goals-selector'

export const dynamic = 'force-dynamic'

export default async function SetupGoalsStep() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: business } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  let clientId = (business?.client_id as string | null) ?? null
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = (cu?.client_id as string | null) ?? null
  }
  if (!clientId) redirect('/login')

  const [catalog, activeGoals] = await Promise.all([
    getGoalsCatalog(),
    getActiveClientGoals(clientId),
  ])

  return (
    <div>
      <SetupStepHeader currentStep={2} />
      <GoalsSelector
        clientId={clientId}
        catalog={catalog}
        activeGoals={activeGoals}
        nextHref="/setup/connect"
      />
    </div>
  )
}
