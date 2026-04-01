'use client'

import { useState, useRef, useEffect } from 'react'
import {
  Bell, CheckCircle, Package, BarChart3, CreditCard, MessageSquare, X
} from 'lucide-react'

interface Notification {
  id: string
  type: 'approval' | 'deliverable' | 'report' | 'payment' | 'message'
  title: string
  body: string
  time: string
  read: boolean
}

const iconMap = {
  approval: { icon: CheckCircle, color: 'bg-emerald-50 text-emerald-600' },
  deliverable: { icon: Package, color: 'bg-blue-50 text-blue-600' },
  report: { icon: BarChart3, color: 'bg-purple-50 text-purple-600' },
  payment: { icon: CreditCard, color: 'bg-amber-50 text-amber-600' },
  message: { icon: MessageSquare, color: 'bg-brand-tint text-brand-dark' },
}

const initialNotifications: Notification[] = [
  {
    id: '1',
    type: 'approval',
    title: 'Content ready for approval',
    body: 'March Instagram carousel — 5 slides awaiting your review.',
    time: '2h ago',
    read: false,
  },
  {
    id: '2',
    type: 'message',
    title: 'New message from your strategist',
    body: 'Hey! Just wanted to check in on the Q2 campaign direction.',
    time: '4h ago',
    read: false,
  },
  {
    id: '3',
    type: 'deliverable',
    title: 'Deliverable uploaded',
    body: 'Brand guidelines PDF v2 is ready to download.',
    time: '6h ago',
    read: false,
  },
  {
    id: '4',
    type: 'report',
    title: 'Weekly analytics report',
    body: 'Your Instagram engagement increased 12% this week.',
    time: 'Yesterday',
    read: true,
  },
  {
    id: '5',
    type: 'payment',
    title: 'Invoice paid',
    body: 'Payment of $647.00 for March services was processed.',
    time: 'Yesterday',
    read: true,
  },
  {
    id: '6',
    type: 'approval',
    title: 'Revision submitted',
    body: 'Updated Facebook ad copy based on your feedback.',
    time: '2 days ago',
    read: true,
  },
  {
    id: '7',
    type: 'message',
    title: 'Team update',
    body: 'Your account has been assigned a new project manager.',
    time: '3 days ago',
    read: true,
  },
]

export default function Notifications() {
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState(initialNotifications)
  const ref = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter((n) => !n.read).length

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAsRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    )
  }

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
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
                  onClick={markAllRead}
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
            {notifications.map((n) => {
              const { icon: Icon, color } = iconMap[n.type]
              return (
                <button
                  key={n.id}
                  onClick={() => markAsRead(n.id)}
                  className={`w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-bg-2 transition-colors ${
                    !n.read ? 'bg-brand-tint/30' : ''
                  }`}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 w-2 pt-2">
                    {!n.read && (
                      <span className="block w-2 h-2 bg-brand rounded-full" />
                    )}
                  </div>

                  {/* Icon */}
                  <div className={`flex-shrink-0 w-8 h-8 rounded-lg ${color} flex items-center justify-center`}>
                    <Icon className="w-4 h-4" />
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm leading-tight ${!n.read ? 'font-medium text-ink' : 'text-ink-2'}`}>
                      {n.title}
                    </p>
                    <p className="text-[12px] text-ink-4 mt-0.5 truncate">{n.body}</p>
                    <p className="text-[11px] text-ink-4 mt-1">{n.time}</p>
                  </div>
                </button>
              )
            })}
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
