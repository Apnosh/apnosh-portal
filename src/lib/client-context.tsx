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

export function ClientProvider({ children }: { children: React.ReactNode }) {
  const supabase = createClient()
  const [client, setClient] = useState<Client | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

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

    if (!clientId) { setLoading(false); return }

    const { data: clientRow } = await supabase
      .from('clients')
      .select('*')
      .eq('id', clientId)
      .maybeSingle()

    if (clientRow) setClient(clientRow as Client)
    setLoading(false)
  }, [supabase])

  useEffect(() => {
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
