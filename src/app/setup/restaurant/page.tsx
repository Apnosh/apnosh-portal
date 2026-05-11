/**
 * /setup/restaurant — step 1 of onboarding.
 * Wraps the existing shape editor with a stepper header.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientShape } from '@/lib/goals/queries'
import SetupStepHeader from '../setup-step-header'
import ShapeEditor from '@/app/dashboard/restaurant/shape-editor'

export const dynamic = 'force-dynamic'

export default async function SetupRestaurantStep() {
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

  const shape = await getClientShape(clientId)
  return (
    <div>
      <SetupStepHeader currentStep={1} />
      <ShapeEditor clientId={clientId} initialShape={shape} nextHref="/setup/goals" />
    </div>
  )
}
