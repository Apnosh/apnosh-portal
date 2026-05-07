'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { resolveEnrolledServices, hasService as hasServiceUtil } from '@/lib/service-access'
import type { Client, ServiceArea } from '@/types/database'

interface ClientContextValue {
  client: Client | null
  loading: boolean
  enrolledServices: Set<ServiceArea>
  hasService: (area: ServiceArea) => boolean
  refresh: () => Promise<void>
}

const ClientContext = createContext<ClientContextValue>({
  client: null,
  loading: true,
  enrolledServices: new Set(),
  hasService: () => false,
  refresh: async () => {},
})

// Cache key + TTL — keeps client data across navigations within the same
// browser session so every page click doesn't re-fetch.
const CACHE_KEY = 'apnosh:client-context:v1'
const CACHE_TTL_MS = 5 * 60 * 1000 // 5 minutes — refresh in background after this

interface CachedShape {
  client: Client | null
  cachedAt: number
}

function readCache(): CachedShape | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(CACHE_KEY)
    if (!raw) return null
    return JSON.parse(raw) as CachedShape
  } catch { return null }
}

function writeCache(client: Client | null): void {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ client, cachedAt: Date.now() }))
  } catch { /* quota exceeded etc — ignore */ }
}

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  // Start with cached value if we have it — page renders instantly with
  // last-known client, then refreshes in background if stale.
  const [client, setClient] = useState<Client | null>(() => readCache()?.client ?? null)
  const [loading, setLoading] = useState(() => readCache() === null)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); writeCache(null); return }

    // Resolve via dashboard (businesses.client_id) first
    const { data: business } = await supabase
      .from('businesses')
      .select('client_id')
      .eq('owner_id', user.id)
      .maybeSingle()

    let clientId: string | null = business?.client_id ?? null

    // Fall back to client_users (magic link portal)
    if (!clientId) {
      const { data: clientUser } = await supabase
        .from('client_users')
        .select('client_id')
        .eq('auth_user_id', user.id)
        .maybeSingle()
      if (clientUser?.client_id) clientId = clientUser.client_id
    }

    if (!clientId) { setLoading(false); writeCache(null); return }

    const { data: clientRow } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle()

    if (clientRow) {
      setClient(clientRow as Client)
      writeCache(clientRow as Client)
    }
    setLoading(false)
  }, [supabase])

  useEffect(() => {
    const cached = readCache()
    const fresh = cached && Date.now() - cached.cachedAt < CACHE_TTL_MS
    if (fresh) {
      // We already painted with cached value; nothing to do until cache expires.
      return
    }
    // No cache or stale — fetch (in background if we have a stale value to show)
    refresh()
  }, [refresh])

  const enrolledServices = resolveEnrolledServices(client?.services_active)

  const hasService = (area: ServiceArea) => hasServiceUtil(client?.services_active, area)

  return (
    <ClientContext.Provider value={{ client, loading, enrolledServices, hasService, refresh }}>
      {children}
    </ClientContext.Provider>
  )
}

export function useClient() {
  return useContext(ClientContext)
}
