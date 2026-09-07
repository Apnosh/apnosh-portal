import 'server-only'
/**
 * "Is this person allowed to read this client?" — the one rule, for API routes.
 *
 * resolveCurrentClient (src/lib/auth/resolve-client.ts) is how PAGES answer it, and it looks at
 * businesses.owner_id FIRST, then client_users. Routes had been checking client_users only, so
 * an owner whose row lives on businesses (most of them — client_users is the extra-seats table)
 * got a 403 on their own data. Same order here, so a route and a page never disagree.
 *
 * Service role on purpose: this is the check itself, not a read the caller's session should be
 * able to shape. Fails CLOSED — a read error is a no.
 */
import { createAdminClient } from '@/lib/supabase/admin'

export async function userMayReadClient(userId: string, clientId: string): Promise<boolean> {
  if (!userId || !clientId) return false
  try {
    const admin = createAdminClient()
    const [owned, member] = await Promise.all([
      admin.from('businesses').select('id').eq('owner_id', userId).eq('client_id', clientId).limit(1),
      admin.from('client_users').select('client_id').eq('auth_user_id', userId).eq('client_id', clientId).limit(1),
    ])
    return (owned.data?.length ?? 0) > 0 || (member.data?.length ?? 0) > 0
  } catch (e) {
    console.warn('[client-access] check failed', (e as Error)?.message)
    return false
  }
}
