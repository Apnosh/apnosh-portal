'use client'

import { createContext, useContext, useEffect, useRef, useState, useCallback, type ReactNode } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type TableName =
  | 'deliverables'
  | 'invoices'
  | 'agreements'
  | 'messages'
  | 'notifications'
  | 'orders'
  | 'subscriptions'
  | 'client_activity_log'
  | 'message_threads'
  | 'businesses'
  | 'content_queue'
  | 'client_feedback'
  | 'social_metrics'
  | 'reviews'

type EventType = 'INSERT' | 'UPDATE' | 'DELETE'

interface RealtimeEvent {
  table: TableName
  eventType: EventType
  new: Record<string, unknown>
  old: Record<string, unknown>
}

type Listener = (event: RealtimeEvent) => void

interface RealtimeContextValue {
  /** Subscribe to changes on a table. Returns an unsubscribe function. */
  subscribe: (table: TableName, listener: Listener) => () => void
  /** Last event received (for simple reactivity) */
  lastEvent: RealtimeEvent | null
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RealtimeContext = createContext<RealtimeContextValue>({
  subscribe: () => () => {},
  lastEvent: null,
})

export function useRealtime() {
  return useContext(RealtimeContext)
}

// ---------------------------------------------------------------------------
// Hook: subscribe to a specific table and auto-refetch
// ---------------------------------------------------------------------------

export function useRealtimeRefresh(tables: TableName[], refetch: () => void) {
  const { subscribe } = useRealtime()

  useEffect(() => {
    const unsubs = tables.map((table) =>
      subscribe(table, () => {
        refetch()
      })
    )
    return () => unsubs.forEach((u) => u())
  }, [tables, subscribe, refetch])
}

// ---------------------------------------------------------------------------
// Hook: listen for new notifications for the current user
// ---------------------------------------------------------------------------

export function useRealtimeNotifications(userId: string | undefined, onNew: () => void) {
  const { subscribe } = useRealtime()

  useEffect(() => {
    if (!userId) return
    return subscribe('notifications', (event) => {
      if (event.eventType === 'INSERT' && event.new.user_id === userId) {
        onNew()
      }
    })
  }, [userId, subscribe, onNew])
}

// ---------------------------------------------------------------------------
// Provider — single channel for all table subscriptions
// ---------------------------------------------------------------------------

const TRACKED_TABLES: TableName[] = [
  'deliverables',
  'invoices',
  'agreements',
  'messages',
  'notifications',
  'orders',
  'subscriptions',
  'client_activity_log',
  'message_threads',
  'businesses',
  'content_queue',
  'client_feedback',
  'social_metrics',
  'reviews',
]

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const listenersRef = useRef<Map<TableName, Set<Listener>>>(new Map())
  const channelRef = useRef<RealtimeChannel | null>(null)
  const [lastEvent, setLastEvent] = useState<RealtimeEvent | null>(null)

  // Set up the Supabase realtime channel once
  useEffect(() => {
    const supabase = createClient()

    let channel = supabase.channel('portal-sync')

    for (const table of TRACKED_TABLES) {
      channel = channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table },
        (payload) => {
          const event: RealtimeEvent = {
            table,
            eventType: payload.eventType as EventType,
            new: (payload.new as Record<string, unknown>) || {},
            old: (payload.old as Record<string, unknown>) || {},
          }
          setLastEvent(event)

          // Notify all listeners for this table
          const tableListeners = listenersRef.current.get(table)
          if (tableListeners) {
            tableListeners.forEach((listener) => {
              try { listener(event) } catch (e) { console.error('Realtime listener error:', e) }
            })
          }
        }
      )
    }

    channel.subscribe()
    channelRef.current = channel

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  const subscribe = useCallback((table: TableName, listener: Listener) => {
    if (!listenersRef.current.has(table)) {
      listenersRef.current.set(table, new Set())
    }
    listenersRef.current.get(table)!.add(listener)

    return () => {
      listenersRef.current.get(table)?.delete(listener)
    }
  }, [])

  return (
    <RealtimeContext.Provider value={{ subscribe, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  )
}
