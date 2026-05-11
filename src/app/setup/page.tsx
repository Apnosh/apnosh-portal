/**
 * /setup — the new-client onboarding flow.
 *
 * Gates new clients before they see the daily dashboard. Three steps:
 *   1. Restaurant shape  (4 dimensions)
 *   2. Goals             (up to 3 from the 8-goal catalog)
 *   3. Connect accounts  (optional; "I'll do this later" exits to dashboard)
 *
 * This server component routes to the right step based on what's already
 * captured. Once shape + goals are set, sends the user to /dashboard.
 *
 * Per docs/PRODUCT-SPEC.md: the goal-selection screen is the moat in
 * product form. This route is where it lives, not on the dashboard.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientShape, getActiveClientGoals } from '@/lib/goals/queries'

export const dynamic = 'force-dynamic'

export default async function SetupRouter() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve client_id via profile or client_users.
  let clientId: string | null = null
  const { data: business } = await supabase
    .from('businesses')
    .select('client_id')
    .eq('owner_id', user.id)
    .maybeSingle()
  clientId = (business?.client_id as string | null) ?? null
  if (!clientId) {
    const { data: cu } = await supabase
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .maybeSingle()
    clientId = (cu?.client_id as string | null) ?? null
  }

  if (!clientId) {
    redirect('/login')
  }

  // Check what's already done.
  const [shape, goals] = await Promise.all([
    getClientShape(clientId),
    getActiveClientGoals(clientId),
  ])

  // Decide next step.
  if (!shape?.footprint) {
    redirect('/setup/restaurant')
  }
  if (goals.length === 0) {
    redirect('/setup/goals')
  }

  // Both done — send to dashboard.
  redirect('/dashboard')
}
