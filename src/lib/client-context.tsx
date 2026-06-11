'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { resolveEnrolledServices, hasService as hasServiceUtil } from '@/lib/service-access'
import type { Client, ServiceArea } from '@/types/database'

interface ClientContextValue {
  client: Client | null
  loading: boolean
  /** True when the signed-in user has profiles.role === 'admin'. */
  isAdmin: boolean
  enrolledServices: Set<ServiceArea>
  hasService: (area: ServiceArea) => boolean
  refresh: () => Promise<void>
}

const ClientContext = createContext<ClientContextValue>({
  client: null,
  loading: true,
  isAdmin: false,
  enrolledServices: new Set(),
  hasService: () => false,
  refresh: async () => {},
})

// Cache key + TTL — keeps client data across navigations within the same
// browser session so every page click doesn't re-fetch. Bumped to v2 when
// we added isAdmin to the cached shape.
const CACHE_KEY = 'apnosh:client-context:v2'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — refresh in background after this

interface CachedShape {
  client: Client | null
  isAdmin: boolean
  cachedAt: number
  /** auth user this cache belongs to — guards against a different account
      signing in to the same tab inheriting the previous user's client. */
  userId: string | null
}

function readCache(): CachedShape | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedShape
  } catch { return null }
}

function clearCache(): void {
  if (typeof window === 'undefined') return
  try { sessionStorage.removeItem(CACHE_KEY) } catch { /* ignore */ }
}

function writeCache(client: Client | null, isAdmin: boolean, userId: string | null): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({
      client, isAdmin, cachedAt: Date.now(), userId,
    }))
  } catch { /* quota exceeded etc — ignore */ }
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const searchParams = useSearchParams()
  // Admins pick a client via this query param; non-admins ignore it.
  // Re-resolving when it changes is how the picker hands control back
  // to the rest of the app.
  const urlClientId = searchParams?.get('clientId') ?? null
  const cached = typeof window !== 'undefined' ? readCache() : null
  // Only seed from cache when it's still fresh. A stale cache (past TTL) must
  // NOT paint a client name/data before we re-verify against the DB — that's
  // how the previous account briefly bleeds into the current one. When stale
  // we start blank + loading so consumers wait for the verified resolve.
  const cachedFresh = !!cached && Date.now() - cached.cachedAt < CACHE_TTL_MS
  const [client, setClient] = useState<Client | null>(cachedFresh ? cached!.client : null)
  const [isAdmin, setIsAdmin] = useState<boolean>(cachedFresh ? cached!.isAdmin : false)
  const [loading, setLoading] = useState(!cachedFresh)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setClient(null); setIsAdmin(false); setLoading(false)
      writeCache(null, false, null)
      return
    }

    // Role check first — admins use a different resolution rule.
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()
    const admin = (profile?.role as string | null) === 'admin'
    setIsAdmin(admin)

    let clientId: string | null = null

    if (admin) {
      // Admins never auto-resolve. They explicitly pick a client via
      // ?clientId=<id> in the URL (set by the in-app picker). This avoids
      // the bug where an admin who has a row in businesses or client_users
      // for testing gets silently locked to that client's dashboard.
      if (typeof window !== 'undefined') {
        clientId = new URLSearchParams(window.location.search).get('clientId')
      }
    } else {
      // Regular clients: resolve via businesses.owner_id, fall back to
      // client_users.auth_user_id (magic-link portal users).
      const { data: business } = await supabase
        .from('businesses')
        .select('id, client_id')
        .eq('owner_id', user.id)
        .maybeSingle()
      clientId = (business?.client_id as string | null) ?? null

      // Fall back to an existing client_users linkage (magic-link portal
      // users). This MUST come before any self-provisioning so an invited
      // user who also happens to have an empty businesses row resolves to
      // the client they were invited to, not a freshly-created one.
      if (!clientId) {
        const { data: clientUser } = await supabase
          .from('client_users')
          .select('client_id')
          .eq('auth_user_id', user.id)
          .maybeSingle()
        clientId = (clientUser?.client_id as string | null) ?? null
      }

      // Last resort — self-heal a stranded onboarding. A skipped or
      // partly-finished setup can leave a businesses row with no linked
      // client (e.g. the CRM provisioning step failed). With no client the
      // dashboard has nothing to resolve and would spin forever. Provision
      // one now so the portal works. ensureClientForBusiness is idempotent
      // and only runs when no linkage was found above.
      if (!clientId && business?.id) {
        try {
          const { ensureClientForBusiness } = await import('@/lib/onboarding-actions')
          clientId = await ensureClientForBusiness(business.id as string)
        } catch { /* leave clientId null — handled below */ }
      }
    }

    if (!clientId) {
      setClient(null)
      setLoading(false)
      writeCache(null, admin, user.id)
      return
    }

    const { data: clientRow } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle()

    if (clientRow) {
      setClient(clientRow as Client)
      writeCache(clientRow as Client, admin, user.id)
    } else {
      setClient(null)
      writeCache(null, admin, user.id)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const c = readCache()
    const cachedFresh = c && Date.now() - c.cachedAt < CACHE_TTL_MS
    // When admin's URL clientId no longer matches the cached client,
    // we MUST re-resolve regardless of cache freshness — that's how
    // the in-app picker hands control back. For non-admins, cache
    // freshness rules as before.
    const cachedAdminMismatch =
      cachedFresh && c.isAdmin && (c.client?.id ?? null) !== urlClientId
    if (cachedFresh && !cachedAdminMismatch) return
    refresh()
  }, [refresh, urlClientId])

  // A different account signing in to the same tab must never inherit the
  // previous user's cached client (that briefly shows the wrong account's
  // name + data). When the auth user changes, drop the cache and re-resolve;
  // on sign-out, clear immediately. Same-user token refreshes are ignored so
  // the cache keeps serving instant navigations.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        clearCache()
        setClient(null); setIsAdmin(false); setLoading(false)
        return
      }
      const newUserId = session?.user?.id ?? null
      const cachedUserId = readCache()?.userId ?? null
      if (newUserId && cachedUserId && newUserId !== cachedUserId) {
        clearCache()
        setLoading(true)
        refresh()
      }
    })
    return () => sub.subscription.unsubscribe()
  }, [supabase, refresh])

  const enrolledServices = resolveEnrolledServices(client?.services_active)
  const hasService = (area: ServiceArea) => hasServiceUtil(client?.services_active, area)

  return (
    <ClientContext.Provider value={{ client, loading, isAdmin, enrolledServices, hasService, refresh }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  return useContext(ClientContext)
}
