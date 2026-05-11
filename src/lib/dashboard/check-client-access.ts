/**
 * Shared auth helper for dashboard API routes.
 *
 * Resolves whether the signed-in user is allowed to access a given
 * client's data. Mirrors the linkage paths that ClientProvider uses on
 * the frontend -- checks ALL four so endpoints don't 403 anyone the
 * portal would have rendered as the client.
 *
 * Linkage paths checked (any one passes):
 *   1. profile.role in ('admin', 'super_admin')         -- staff
 *   2. profile.client_id === clientId                   -- direct client linkage
 *   3. row in businesses where owner_id = user.id AND
 *      client_id = clientId                              -- business-owner
 *   4. row in client_users where auth_user_id = user.id
 *      AND client_id = clientId                          -- magic-link portal
 *
 * Uses the admin client to bypass RLS on client_users + businesses
 * (those tables have policies that prevent the user from reading their
 * own membership row directly).
 *
 * PERFORMANCE: Paths 1-4 are checked in PARALLEL via Promise.all.
 * Previously this function did 4 sequential database roundtrips
 * (~200ms+ overhead per API call). Parallel = ~50ms.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export interface AccessCheckResult {
  authorized: boolean
  userId?: string
  reason?: 'unauthenticated' | 'forbidden'
}

export async function checkClientAccess(clientId: string): Promise<AccessCheckResult> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { authorized: false, reason: 'unauthenticated' }

  const admin = createAdminClient()

  // Fire all four linkage queries in parallel. We accept the cost of
  // running paths 3+4 even when path 1/2 would have authorized -- the
  // overhead is one extra parallel query, far cheaper than the previous
  // sequential cascade.
  const [profileRes, businessRes, clientUserRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('role, client_id')
      .eq('id', user.id)
      .maybeSingle(),
    admin
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle(),
    admin
      .from('client_users')
      .select('client_id')
      .eq('auth_user_id', user.id)
      .eq('client_id', clientId)
      .maybeSingle(),
  ])

  const profile = profileRes.data
  // Path 1: staff role
  if (profile?.role === 'admin' || profile?.role === 'super_admin') {
    return { authorized: true, userId: user.id }
  }
  // Path 2: direct client linkage on profile
  if (profile?.client_id === clientId) {
    return { authorized: true, userId: user.id }
  }
  // Path 3: business owner
  if (businessRes.data) return { authorized: true, userId: user.id }
  // Path 4: magic-link portal user
  if (clientUserRes.data) return { authorized: true, userId: user.id }

  return { authorized: false, userId: user.id, reason: 'forbidden' }
}
