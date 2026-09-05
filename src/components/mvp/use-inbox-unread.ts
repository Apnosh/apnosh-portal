'use client'

import { useEffect, useState } from 'react'

/**
 * The bell's number: how many Inbox rows the owner has not opened (needs-you items plus
 * unread good-to-know rows), from the inbox route's counts. One call per client, cached in
 * the tab for a minute; refreshed when the inbox fires apnosh:inbox-changed (a row opened
 * or dismissed) and when the tab comes back into focus. Returns null until it knows.
 */
export function useInboxUnread(clientId: string | null | undefined, enabled = true): number | null {
  const [n, setN] = useState<number | null>(null)
  useEffect(() => {
    if (!enabled || !clientId) return
    let alive = true
    const key = `apnosh:inbox-unread:${clientId}`
    const load = async (force = false) => {
      try {
        if (!force) {
          const raw = sessionStorage.getItem(key)
          if (raw) { const c = JSON.parse(raw) as { n: number; at: number }; if (Date.now() - c.at < 60_000) { if (alive) setN(c.n); return } }
        }
        const r = await fetch(`/api/dashboard/inbox?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json() as { counts?: { unread?: number } }
        const nn = Number(j.counts?.unread ?? 0)
        sessionStorage.setItem(key, JSON.stringify({ n: nn, at: Date.now() }))
        if (alive) setN(nn)
      } catch { /* the bell just stays quiet */ }
    }
    void load()
    const bump = () => { void load(true) }
    window.addEventListener('apnosh:inbox-changed', bump)
    window.addEventListener('focus', bump)
    return () => { alive = false; window.removeEventListener('apnosh:inbox-changed', bump); window.removeEventListener('focus', bump) }
  }, [clientId, enabled])
  return n
}
