'use client'

/**
 * Bell + unread badge for the /work header. Polls /api/notifications
 * every 60s (cheap: one indexed count query) and refreshes when the
 * tab gains focus so a returning user sees fresh counts without a
 * reload. Clicking the bell opens a dropdown with the most recent 12
 * items; opening the dropdown marks everything read.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import Link from 'next/link'
import { Bell, ExternalLink } from 'lucide-react'

interface NotificationItem {
  id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

const POLL_MS = 60_000

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  return `${d}d ago`
}

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([])
  const [unread, setUnread] = useState(0)
  const [open, setOpen] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' })
      if (!res.ok) return
      const j = await res.json()
      setItems(j.items ?? [])
      setUnread(j.unreadCount ?? 0)
    } catch { /* swallow — bell stays at last known state */ }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_MS)
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => { clearInterval(id); window.removeEventListener('focus', onFocus) }
  }, [load])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  const handleOpen = useCallback(() => {
    setOpen(o => {
      const next = !o
      if (next && unread > 0) {
        fetch('/api/notifications/mark-read', { method: 'POST' })
          .then(() => { setUnread(0); setItems(prev => prev.map(i => ({ ...i, read_at: i.read_at ?? new Date().toISOString() }))) })
          .catch(() => {})
      }
      return next
    })
  }, [unread])

  return (
    <div ref={panelRef} className="relative">
      <button
        onClick={handleOpen}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-lg text-ink-2 hover:bg-ink-7 hover:text-ink transition-colors"
      >
        <Bell className="w-4 h-4" />
        {unread > 0 && (
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 rounded-full bg-brand text-white text-[10px] font-bold inline-flex items-center justify-center ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-[340px] max-h-[460px] overflow-y-auto rounded-2xl bg-white shadow-xl ring-1 ring-ink-6/70 z-50">
          <div className="sticky top-0 bg-white px-4 py-3 border-b border-ink-6/60 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-ink">Notifications</p>
            <span className="text-[10px] text-ink-3">{items.length} recent</span>
          </div>

          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-[12px] text-ink-3">
              You&apos;re all caught up.
            </div>
          ) : (
            <ul className="divide-y divide-ink-6/40">
              {items.map(n => {
                const inner = (
                  <div className="px-4 py-3 hover:bg-ink-7/40 transition-colors">
                    <div className="flex items-start gap-2">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${n.read_at ? 'bg-transparent' : 'bg-brand'}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] font-semibold text-ink leading-snug">{n.title}</p>
                        {n.body && (
                          <p className="text-[12px] text-ink-2 mt-0.5 leading-snug line-clamp-2">{n.body}</p>
                        )}
                        <p className="text-[10px] text-ink-4 mt-1">{timeAgo(n.created_at)}</p>
                      </div>
                      {n.link && <ExternalLink className="w-3 h-3 text-ink-4 mt-1 flex-shrink-0" />}
                    </div>
                  </div>
                )
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)} className="block">{inner}</Link>
                    ) : inner}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
