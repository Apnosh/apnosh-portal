'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import {
  Bell, CheckCircle, Package, BarChart3, CreditCard, MessageSquare, X
} from 'lucide-react'
import { useNotifications } from '@/lib/supabase/hooks'
import { markNotificationRead } from '@/lib/actions'
import { useRealtimeRefresh } from '@/lib/realtime'

const iconMap: Record<string, { icon: typeof CheckCircle; color: string }> = {
  approval_needed: { icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
  deliverable_ready: { icon: Package, color: 'bg-blue-50 text-blue-600' },
  report_ready: { icon: BarChart3, color: 'bg-purple-50 text-purple-600' },
  payment: { icon: CreditCard, color: 'bg-amber-50 text-amber-600' },
  message: { icon: MessageSquare, color: 'bg-brand-tint text-brand-dark' },
  order_confirmed: { icon: Package, color: 'bg-blue-50 text-blue-600' },
  system: { icon: Bell, color: 'bg-gray-50 text-gray-600' },
}

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export default function Notifications() {
  const [open, setOpen] = useState(false)
  const { data: notifications, refetch } = useNotifications({ limit: 20 })
  const ref = useRef<HTMLDivElement>(null)

  const items = notifications || []
  const unreadCount = items.filter((n) => !n.read_at).length

  // Auto-refresh when new notifications arrive via realtime
  const stableRefetch = useCallback(() => refetch(), [refetch])
  useRealtimeRefresh(['notifications'], stableRefetch)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleMarkRead = async (id: string) => {
    await markNotificationRead(id)
    refetch()
  }

  const handleMarkAllRead = async () => {
    for (const n of items.filter((n) => !n.read_at)) {
      await markNotificationRead(n.id)
    }
    refetch()
  }

  return (
    <div className="relative" ref={ref}>
      {/* Bell button */}
      <button
        onClick={() => setOpen(!open)}
        className="relative text-ink-4 hover:text-ink transition-colors"
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-2 h-2 bg-brand rounded-full" />
        )}
      </button>

      {/* Dropdown panel */}
      {open && (
        <div className="absolute right-0 top-full mt-2 w-[380px] max-h-[480px] bg-white rounded-xl border border-ink-6 shadow-lg shadow-black/8 z-50 flex flex-col overflow-hidden">
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-ink-6">
            <h3 className="text-sm font-semibold text-ink">Notifications</h3>
            <div className="flex items-center gap-3">
              {unreadCount > 0 && (
                <button
                  onClick={handleMarkAllRead}
                  className="text-[11px] font-medium text-brand-dark hover:underline"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setOpen(false)}
                className="text-ink-4 hover:text-ink transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Notification list */}
          <div className="flex-1 overflow-y-auto divide-y divide-ink-6">
            {items.length === 0 ? (
              <div className="p-6 text-center text-sm text-ink-4">No notifications yet.</div>
            ) : (
              items.map((n) => {
                const mapping = iconMap[n.type] || iconMap.system
                const Icon = mapping.icon
                const color = mapping.color
                return (
                  <button
                    key={n.id}
                    onClick={() => !n.read_at && handleMarkRead(n.id)}
                    className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-2 transition-colors ${
                      !n.read_at ? 'bg-brand-tint/30' : ''
                    }`}
                  >
                    {/* Unread dot */}
                    <div className="flex-shrink-0 w-2 pt-2">
                      {!n.read_at && (
                        <span className="block w-2 h-2 bg-brand rounded-full" />
                      )}
                    </div>

                    {/* Icon */}
                    <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
                      <Icon className="w-4 h-4" />
                    </div>

                    {/* Text */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm leading-tight ${!n.read_at ? 'font-medium text-ink' : 'text-ink-2'}`}>
                        {n.title}
                      </p>
                      <p className="text-[12px] text-ink-4 mt-0.5 truncate">{n.body}</p>
                      <p className="text-[11px] text-ink-4 mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </button>
                )
              })
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-ink-6 px-4 py-2.5 text-center">
            <button className="text-xs font-medium text-brand-dark hover:underline">
              View all notifications
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
