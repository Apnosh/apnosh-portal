/**
 * Per-request client resolver — the single most impactful perf change.
 *
 * Before this helper, every dashboard page did 4 sequential awaits
 * (auth.getUser → profile.role → businesses → client_users), each
 * ~50ms round-trip. Even a "fast" page was eating 200-300ms of
 * pure latency before any actual data fetching started.
 *
 * resolveCurrentClient() does it all in one shot and is wrapped in
 * React's cache() — so within a single request, subsequent calls
 * return the memoized result with zero additional cost.
 *
 * Returns:
 *   { user, isAdmin, clientId, clientName, error }
 *
 * Pages can pull just the bits they need:
 *   const { clientId, isAdmin } = await resolveCurrentClient()
 */

import { cache } from 'react'
import { createClient as createServerClient } from '@/lib/supabase/server'

export interface ResolvedClient {
  user: { id: string; email?: string | null } | null
  isAdmin: boolean
  /** The resolved client id. For admins, comes from the URL ?clientId=
      query param (caller passes it in via resolveCurrentClient(clientIdParam)).
      For non-admins, resolved from businesses/client_users. */
  clientId: string | null
  /** True when no client could be resolved AND there's a valid user. */
  needsClientPick: boolean
}

interface ResolveOptions {
  /** Admin-mode override: explicit clientId from the URL. */
  clientIdParam?: string | null
}

/**
 * Internal resolver. Wrapped in cache() below so it dedupes within a request.
 */
async function _resolve(clientIdParam: string | null): Promise<ResolvedClient> {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { user: null, isAdmin: false, clientId: null, needsClientPick: false }
  }

  // All three lookups in parallel. Most pages need profile.role plus
  // either businesses or client_users; doing them concurrently is the
  // perf win.
  const [profileRes, businessRes, clientUserRes] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
    supabase.from('businesses').select('client_id').eq('owner_id', user.id).maybeSingle(),
    supabase.from('client_users').select('client_id').eq('auth_user_id', user.id).maybeSingle(),
  ])

  const isAdmin = (profileRes.data?.role as string | null) === 'admin'

  let clientId: string | null = null
  if (isAdmin) {
    clientId = clientIdParam ?? null
  } else {
    clientId =
      (businessRes.data?.client_id as string | null) ??
      (clientUserRes.data?.client_id as string | null) ??
      null
  }

  return {
    user: { id: user.id, email: user.email ?? null },
    isAdmin,
    clientId,
    needsClientPick: !clientId && !!user,
  }
}

/**
 * Public cached resolver. The cache() wrapper memoizes by argument
 * within a single request, so calling it 10 times across helpers and
 * subcomponents costs the same as calling it once.
 *
 * Pass the URL ?clientId= param when you're on a route that supports
 * admin picking; pass undefined/null on routes that don't.
 */
export const resolveCurrentClient = cache(
  (clientIdParam: string | null = null): Promise<ResolvedClient> =>
    _resolve(clientIdParam),
)
