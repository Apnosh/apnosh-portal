/**
 * Page-level gate for /admin/clients/[slug]/* sub-pages.
 *
 * Pre-Phase-0 these pages assumed profile.role === 'admin'. With the
 * multi-role model a strategist also needs access — but only to clients
 * in their assigned book. This helper centralizes the check so adding
 * a new strategist sub-page is one import, one call.
 *
 * Returns the access decision plus the resolved client id so callers
 * don't have to look it up twice.
 */

import { redirect } from 'next/navigation'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface ClientDetailAccess {
  userId: string
  clientId: string
  isAdmin: boolean
  isAssignedStrategist: boolean
}

/**
 * Asserts the signed-in user can view /admin/clients/[slug]/<anything>.
 * Allowed if either:
 *   - profile.role = 'admin', OR
 *   - person_capabilities has an active 'strategist' row for this user
 *     AND role_assignments has an open (ended_at IS NULL) row scoping
 *     them to this client.
 *
 * Otherwise redirects to /dashboard (which itself bounces strategists
 * to /work/today and clients to their portal).
 */
export async function assertClientDetailAccess(slug: string): Promise<ClientDetailAccess> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const admin = createAdminClient()

  // Resolve client + role in parallel; admin client bypasses RLS for
  // the cross-cutting lookups (the strategist's RLS view of clients
  // is filtered to their book, which we don't want here).
  const [profileRes, clientRes] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    admin.from('clients').select('id').eq('slug', slug).maybeSingle(),
  ])

  if (!clientRes.data) redirect('/dashboard')
  const clientId = clientRes.data.id as string

  const isAdmin = (profileRes.data?.role as string | null) === 'admin'

  // Skip the strategist join for admins — they're allowed everywhere.
  let isAssignedStrategist = false
  if (!isAdmin) {
    const [capRes, asnRes] = await Promise.all([
      admin
        .from('person_capabilities')
        .select('person_id')
        .eq('person_id', user.id)
        .eq('capability', 'strategist')
        .eq('status', 'active')
        .maybeSingle(),
      admin
        .from('role_assignments')
        .select('id')
        .eq('person_id', user.id)
        .eq('client_id', clientId)
        .eq('role', 'strategist')
        .is('ended_at', null)
        .maybeSingle(),
    ])
    isAssignedStrategist = Boolean(capRes.data) && Boolean(asnRes.data)
  }

  if (!isAdmin && !isAssignedStrategist) redirect('/dashboard')

  return { userId: user.id, clientId, isAdmin, isAssignedStrategist }
}
