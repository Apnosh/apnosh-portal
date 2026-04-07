'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import type {
  UserProfile,
  Business,
  Order,
  OrderStatus,
  Deliverable,
  DeliverableStatus,
  Notification,
  MessageThread,
  Message,
  AnalyticsSnapshot,
  Platform,
} from '@/types/database'

// ---------------------------------------------------------------------------
// Generic hook return type
// ---------------------------------------------------------------------------

interface UseQueryResult<T> {
  data: T | null
  loading: boolean
  error: Error | null
  refetch: () => void
}

// ---------------------------------------------------------------------------
// Generic Supabase query hook
// ---------------------------------------------------------------------------

function useSupabaseQuery<T>(
  queryFn: (supabase: ReturnType<typeof createClient>) => Promise<{ data: T | null; error: { message: string } | null }>,
  deps: unknown[] = []
): UseQueryResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const [trigger, setTrigger] = useState(0)

  const refetch = useCallback(() => setTrigger((n) => n + 1), [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError(null)

    const supabase = createClient()
    queryFn(supabase).then(({ data: result, error: err }) => {
      if (cancelled) return
      if (err) {
        setError(new Error(err.message))
        setData(null)
      } else {
        setData(result)
      }
      setLoading(false)
    })

    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger, ...deps])

  return { data, loading, error, refetch }
}

// ---------------------------------------------------------------------------
// useUser — returns the current authenticated user profile
// ---------------------------------------------------------------------------

export function useUser(): UseQueryResult<UserProfile> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    return { data: data as UserProfile | null, error }
  })
}

// ---------------------------------------------------------------------------
// useBusiness — returns the user's business profile
// ---------------------------------------------------------------------------

export interface UseBusinessParams {
  businessId?: string
}

export function useBusiness(params?: UseBusinessParams): UseQueryResult<Business> {
  return useSupabaseQuery(async (supabase) => {
    if (params?.businessId) {
      const { data, error } = await supabase
        .from('businesses')
        .select('*')
        .eq('id', params.businessId)
        .single()
      return { data: data as Business | null, error }
    }

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data, error } = await supabase
      .from('businesses')
      .select('*')
      .eq('owner_id', user.id)
      .single()

    return { data: data as Business | null, error }
  }, [params?.businessId])
}

// ---------------------------------------------------------------------------
// useOrders — returns orders for the business
// ---------------------------------------------------------------------------

export interface UseOrdersParams {
  businessId?: string
  status?: OrderStatus
  limit?: number
}

export function useOrders(params?: UseOrdersParams): UseQueryResult<Order[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!business) return { data: [], error: null }

    let query = supabase
      .from('orders')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })

    if (params?.status) query = query.eq('status', params.status)
    if (params?.limit) query = query.limit(params.limit)

    const { data, error } = await query
    return { data: (data as Order[]) || [], error }
  }, [params?.status, params?.limit])
}

// ---------------------------------------------------------------------------
// useDeliverables — returns deliverables pending review
// ---------------------------------------------------------------------------

export interface UseDeliverablesParams {
  businessId?: string
  status?: DeliverableStatus
  limit?: number
}

export function useDeliverables(params?: UseDeliverablesParams): UseQueryResult<Deliverable[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!business) return { data: [], error: null }

    let query = supabase
      .from('deliverables')
      .select('*')
      .eq('business_id', business.id)
      .order('created_at', { ascending: false })

    if (params?.status) query = query.eq('status', params.status)
    if (params?.limit) query = query.limit(params.limit)

    const { data, error } = await query
    return { data: (data as Deliverable[]) || [], error }
  }, [params?.status, params?.limit])
}

// ---------------------------------------------------------------------------
// useNotifications — returns notifications for the user
// ---------------------------------------------------------------------------

export interface UseNotificationsParams {
  unreadOnly?: boolean
  limit?: number
}

export function useNotifications(params?: UseNotificationsParams): UseQueryResult<Notification[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    let query = supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })

    if (params?.unreadOnly) query = query.is('read_at', null)
    if (params?.limit) query = query.limit(params.limit)

    const { data, error } = await query
    return { data: (data as Notification[]) || [], error }
  }, [params?.unreadOnly, params?.limit])
}

// ---------------------------------------------------------------------------
// useMessages — returns message threads
// ---------------------------------------------------------------------------

export interface UseMessagesParams {
  threadId?: string
  businessId?: string
  limit?: number
}

export function useMessages(params?: UseMessagesParams): UseQueryResult<MessageThread[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!business) return { data: [], error: null }

    let query = supabase
      .from('message_threads')
      .select('*')
      .eq('business_id', business.id)
      .order('last_message_at', { ascending: false })

    if (params?.limit) query = query.limit(params.limit)

    const { data, error } = await query
    return { data: (data as MessageThread[]) || [], error }
  }, [params?.limit])
}

export function useThreadMessages(threadId: string): UseQueryResult<Message[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data, error } = await supabase
      .from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })

    return { data: (data as Message[]) || [], error }
  }, [threadId])
}

// ---------------------------------------------------------------------------
// useAnalytics — returns analytics data for the business
// ---------------------------------------------------------------------------

export interface UseAnalyticsParams {
  businessId?: string
  platform?: Platform
  dateFrom?: string
  dateTo?: string
}

export function useAnalytics(params?: UseAnalyticsParams): UseQueryResult<AnalyticsSnapshot[]> {
  return useSupabaseQuery(async (supabase) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { data: null, error: { message: 'Not authenticated' } }

    const { data: business } = await supabase
      .from('businesses')
      .select('id')
      .eq('owner_id', user.id)
      .single()

    if (!business) return { data: [], error: null }

    let query = supabase
      .from('analytics_snapshots')
      .select('*')
      .eq('business_id', business.id)
      .order('date', { ascending: false })

    if (params?.platform) query = query.eq('platform', params.platform)
    if (params?.dateFrom) query = query.gte('date', params.dateFrom)
    if (params?.dateTo) query = query.lte('date', params.dateTo)

    const { data, error } = await query
    return { data: (data as AnalyticsSnapshot[]) || [], error }
  }, [params?.platform, params?.dateFrom, params?.dateTo])
}

// ---------------------------------------------------------------------------
// useIsAdmin — boolean check for admin role
// ---------------------------------------------------------------------------

export function useIsAdmin(): { isAdmin: boolean; loading: boolean } {
  const { data: user, loading } = useUser()
  return { isAdmin: user?.role === 'admin', loading }
}

// ---------------------------------------------------------------------------
// signOut — signs out the user and redirects to login
// ---------------------------------------------------------------------------

export async function signOut() {
  const supabase = createClient()
  await supabase.auth.signOut()
  window.location.href = '/login'
}
