/**
 * /work/specialists — cross-client specialist directory.
 *
 * Staff-facing source of truth for who's a specialist, what hats they
 * wear (person_capabilities), and the profile fields the client-facing
 * Marketplace tab reads from. Editing on this page ripples directly
 * into what clients see.
 */

import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { isCapable } from '@/lib/auth/require-any-capability'
import { getAllSpecialists } from '@/lib/work/get-specialists'
import SpecialistsView from './specialists-view'

export const dynamic = 'force-dynamic'

export default async function Page() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /* Strategists + onboarders edit specialists; admin always passes. */
  if (!(await isCapable(['strategist', 'onboarder']))) {
    redirect('/work')
  }

  const specialists = await getAllSpecialists()
  return <SpecialistsView specialists={specialists} />
}
