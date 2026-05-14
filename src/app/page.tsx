/**
 * Root route — bounce to the right home based on the user's
 * highest-priority capability.
 *
 *   - No session              -> /login
 *   - Has any capability      -> that capability's landingPath
 *                                  (admin -> /admin
 *                                   strategist -> /work/clients
 *                                   client_owner -> /dashboard
 *                                   etc.)
 *   - No capability + has client membership (legacy fallback)
 *                              -> /dashboard
 *   - Nothing                  -> /login
 *
 * Previously this hardcoded admin -> /admin, everyone else -> /dashboard.
 * Internal users with only strategist/designer/etc. capabilities were
 * silently routed to the client portal, which feels broken.
 */

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getActiveRole } from '@/lib/auth/capabilities'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /* Honor the capability system: it already knows each role's
     correct landing path (admin -> /admin, strategist -> /work/clients,
     client_owner -> /dashboard, etc.) and picks the highest-priority
     capability the user holds. */
  const role = await getActiveRole()
  if (role?.landingPath) redirect(role.landingPath)

  /* No capabilities at all — last-resort fallback for very old
     accounts that never got migrated. */
  redirect('/dashboard')
}
