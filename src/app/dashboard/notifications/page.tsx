'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import {
  Bell, Check, CheckCheck, Filter, Settings, ChevronRight,
  Eye, MessageSquare, FileText, CreditCard, Star, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import type { NotificationRow } from '@/types/database'

const TYPE_ICON: Record<string, typeof Bell> = {
  approval_needed: Eye,
  content_ready: Eye,
  content_request: FileText,
  client_feedback: MessageSquare,
  deliverable_ready: Eye,
  order_confirmed: FileText,
  message: MessageSquare,
  report_ready: FileText,
  payment: CreditCard,
  review: Star,
  system: AlertCircle,
}

const TYPE_COLOR: Record<string, string> = {
  approval_needed: 'bg-amber-50 text-amber-600',
  content_ready: 'bg-amber-50 text-amber-600',
  content_request: 'bg-blue-50 text-blue-600',
  client_feedback: 'bg-purple-50 text-purple-600',
  deliverable_ready: 'bg-amber-50 text-amber-600',
  order_confirmed: 'bg-emerald-50 text-emerald-600',
  message: 'bg-sky-50 text-sky-600',
  report_ready: 'bg-indigo-50 text-indigo-600',
  payment: 'bg-emerald-50 text-emerald-600',
  review: 'bg-amber-50 text-amber-600',
  system: 'bg-ink-6 text-ink-3',
}

function timeAgo(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = Math.floor(diff / 60_000)
  if (min < 1) return 'Just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.floor(hr / 24)
  if (day < 7) return `${day}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function NotificationsPage() {
  const supabase = createClient()

  const [notifications, setNotifications] = useState<NotificationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('all')
  const [markingAll, setMarkingAll] = useState(false)

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    const { data } = await supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200)

    setNotifications((data ?? []) as NotificationRow[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['notifications'], load)

  const filtered = useMemo(() => {
    return notifications.filter(n => {
      if (filter === 'unread') return !n.read_at
      if (filter === 'read') return !!n.read_at
      return true
    })
  }, [notifications, filter])

  const unreadCount = notifications.filter(n => !n.read_at).length

  async function markAsRead(id: string) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', user.id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read_at: new Date().toISOString() } : n))
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setMarkingAll(true)
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
    setNotifications(prev => prev.map(n => n.read_at ? n : { ...n, read_at: new Date().toISOString() }))
    setMarkingAll(false)
  }

  // Group by day
  const grouped = useMemo(() => {
    const groups: { label: string; items: NotificationRow[] }[] = []
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)

    for (const n of filtered) {
      const d = new Date(n.created_at); d.setHours(0, 0, 0, 0)
      let label: string
      if (d.getTime() === today.getTime()) label = 'Today'
      else if (d.getTime() === yesterday.getTime()) label = 'Yesterday'
      else label = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: d.getFullYear() !== today.getFullYear() ? 'numeric' : undefined })

      const group = groups.find(g => g.label === label)
      if (group) group.items.push(n)
      else groups.push({ label, items: [n] })
    }
    return groups
  }, [filtered])

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl text-ink flex items-center gap-2">
            <Bell className="w-6 h-6 text-ink-4" />
            Notifications
          </h1>
          <p className="text-ink-3 text-sm mt-0.5">
            {unreadCount > 0 ? `${unreadCount} unread` : 'You&apos;re all caught up'}
          </p>
        </div>
        <Link
          href="/dashboard/settings/notifications"
          className="text-sm text-ink-3 hover:text-ink transition-colors flex items-center gap-1.5"
        >
          <Settings className="w-4 h-4" />
          Preferences
        </Link>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2">
        <Filter className="w-4 h-4 text-ink-4" />
        <div className="flex gap-1 border border-ink-6 rounded-lg p-0.5 bg-white">
          {(['all', 'unread', 'read'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                filter === f
                  ? 'bg-brand-tint text-brand-dark'
                  : 'text-ink-3 hover:text-ink'
              }`}
            >
              {f === 'all' ? 'All' : f === 'unread' ? `Unread (${unreadCount})` : 'Read'}
            </button>
          ))}
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            disabled={markingAll}
            className="ml-auto text-xs font-medium text-brand hover:text-brand-dark transition-colors flex items-center gap-1"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            Mark all as read
          </button>
        )}
      </div>

      {/* List */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 p-4 h-16 animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <Bell className="w-6 h-6 text-ink-4 mx-auto mb-3" />
          <p className="text-sm font-medium text-ink-2">
            {filter === 'unread' ? 'No unread notifications' : filter === 'read' ? 'No read notifications' : 'No notifications yet'}
          </p>
          <p className="text-xs text-ink-4 mt-1">
            {filter === 'all'
              ? 'You&apos;ll see updates about content, messages, reviews, and billing here.'
              : 'Switch filters to see more.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(group => (
            <div key={group.label}>
              <h2 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-2 px-1">{group.label}</h2>
              <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
                {group.items.map((n, i) => {
                  const Icon = TYPE_ICON[n.type] || Bell
                  const iconColor = TYPE_COLOR[n.type] || 'bg-ink-6 text-ink-3'
                  const isUnread = !n.read_at

                  const content = (
                    <div
                      className={`flex items-start gap-3 px-4 py-3.5 transition-colors ${
                        i > 0 ? 'border-t border-ink-6' : ''
                      } ${isUnread ? 'bg-brand-tint/10' : ''} ${n.link ? 'hover:bg-bg-2' : ''}`}
                    >
                      <div className={`w-8 h-8 rounded-lg ${iconColor} flex items-center justify-center flex-shrink-0`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className={`text-sm ${isUnread ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                            {n.title}
                          </p>
                          {isUnread && (
                            <span className="w-2 h-2 rounded-full bg-brand flex-shrink-0 mt-1.5" />
                          )}
                        </div>
                        {n.body && (
                          <p className="text-xs text-ink-3 mt-0.5 line-clamp-2">{n.body}</p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5">
                          <span className="text-[10px] text-ink-4">{timeAgo(n.created_at)}</span>
                          {isUnread && (
                            <button
                              onClick={e => { e.preventDefault(); e.stopPropagation(); markAsRead(n.id) }}
                              className="text-[10px] text-ink-4 hover:text-brand-dark transition-colors flex items-center gap-0.5"
                            >
                              <Check className="w-3 h-3" /> Mark read
                            </button>
                          )}
                        </div>
                      </div>
                      {n.link && <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />}
                    </div>
                  )

                  return n.link ? (
                    <Link
                      key={n.id}
                      href={n.link}
                      onClick={() => isUnread && markAsRead(n.id)}
                    >
                      {content}
                    </Link>
                  ) : (
                    <div key={n.id}>{content}</div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
