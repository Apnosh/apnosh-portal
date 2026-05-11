/**
 * /dashboard/restaurant — your restaurant shape.
 *
 * Per docs/PRODUCT-SPEC.md Phase B3. Captures the 4 dimensions
 * (footprint / concept / customer_mix / digital_maturity) that drive
 * playbook adaptation. Owner-supplied; strategist sanity-checks.
 *
 * Currently the only surface where shape is editable; future onboarding
 * redesign will capture this earlier.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getClientShape } from '@/lib/goals/queries'
import ShapeEditor from './shape-editor'

export const dynamic = 'force-dynamic'

export default async function RestaurantShapePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve client_id via profile or client_users.
  const { data: profile } = await supabase
    .from('profiles')
    .select('client_id')
    .eq('id', user.id)
    .maybeSingle()
  let clientId = profile?.client_id as string | null | undefined
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
        Sign in as a client to set up your restaurant.
      </div>
    )
  }

  const shape = await getClientShape(clientId)
  return <ShapeEditor clientId={clientId} initialShape={shape} />
}
