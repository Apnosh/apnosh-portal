/**
 * Resolve the auth-user IDs that own / belong to a client, so background
 * jobs can notify the right people. Mirrors how client-context resolves a
 * user's client, but in reverse:
 *   - businesses.owner_id  (the primary owner account)
 *   - client_users.auth_user_id  (magic-link / invited portal users)
 */

import type { SupabaseClient } from '@supabase/supabase-js'

export async function getClientOwnerUserIds(
  admin: SupabaseClient,
  clientId: string,
): Promise<string[]> {
  const [bizRes, cuRes] = await Promise.all([
    admin.from('businesses').select('owner_id').eq('client_id', clientId),
    admin.from('client_users').select('auth_user_id').eq('client_id', clientId),
  ])

  const ids = new Set<string>()
  for (const b of (bizRes.data ?? []) as Array<{ owner_id: string | null }>) {
    if (b.owner_id) ids.add(b.owner_id)
  }
  for (const c of (cuRes.data ?? []) as Array<{ auth_user_id: string | null }>) {
    if (c.auth_user_id) ids.add(c.auth_user_id)
  }
  return [...ids]
}
