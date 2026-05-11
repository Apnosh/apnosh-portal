/**
 * Shared auth helper for dashboard API routes.
 *
 * Resolves whether the signed-in user is allowed to access a given
 * client's data. Mirrors the linkage paths that ClientProvider uses on
 * the frontend -- checks ALL three so endpoints don't 403 anyone the
 * portal would have rendered as the client.
 *
 * Linkage paths checked (any one passes):
 *   1. profile.role in ('admin', 'super_admin')         -- staff
 *   2. row in businesses where owner_id = user.id AND
 *      client_id = clientId                              -- business-owner
 *   3. row in client_users where auth_user_id = user.id
 *      AND client_id = clientId                          -- magic-link portal
 *
 * Uses the admin client to bypass RLS on client_users + businesses
 * (those tables have policies that prevent the user from reading their
 * own membership row directly).
 *
 * PERFORMANCE: All three checks fire in PARALLEL via Promise.all.
 * Previously this function did 4 sequential database roundtrips
 * (~200ms+ overhead per API call). Parallel = ~50ms.
 *
 * Note: profiles table does not have a client_id column -- direct
 * profile.client_id linkage was an aspirational 4th path that never
 * shipped. Removed the query so it doesn't error silently every call.
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

  // Fire all three linkage queries in parallel.
  const [profileRes, businessRes, clientUserRes] = await Promise.all([
    supabase
      .from('profiles')
      .select('role')
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
  // Path 2: business owner
  if (businessRes.data) return { authorized: true, userId: user.id }
  // Path 3: magic-link portal user
  if (clientUserRes.data) return { authorized: true, userId: user.id }

  return { authorized: false, userId: user.id, reason: 'forbidden' }
}
