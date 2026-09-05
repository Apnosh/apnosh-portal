'use client'

import { useEffect, useState } from 'react'

/**
 * The bell's number: how many Inbox rows the owner has not opened (needs-you items plus
 * unread good-to-know rows), from the inbox route's counts. One call per client, cached in
 * the tab for a minute; refreshed when the inbox fires apnosh:inbox-changed (a row opened
 * or dismissed) and when the tab comes back into focus. Returns null until it knows.
 */
export interface InboxCounts { unread: number; needsYou: number }

/** The full pair (unread + needs-you) for callers that colour the bell by attention. */
export function useInboxCounts(clientId: string | null | undefined, enabled = true): InboxCounts | null {
  const [n, setN] = useState<InboxCounts | null>(null)
  useEffect(() => {
    if (!enabled || !clientId) return
    let alive = true
    const key = `apnosh:inbox-unread:${clientId}`
    const load = async (force = false) => {
      try {
        if (!force) {
          const raw = sessionStorage.getItem(key)
          if (raw) { const c = JSON.parse(raw) as { n: number; needs?: number; at: number }; if (Date.now() - c.at < 60_000 && typeof c.needs === 'number') { if (alive) setN({ unread: c.n, needsYou: c.needs }); return } }
        }
        const r = await fetch(`/api/dashboard/inbox?clientId=${encodeURIComponent(clientId)}`, { cache: 'no-store' })
        if (!r.ok) return
        const j = await r.json() as { counts?: { unread?: number; needsYou?: number } }
        const nn = Number(j.counts?.unread ?? 0), needs = Number(j.counts?.needsYou ?? 0)
        sessionStorage.setItem(key, JSON.stringify({ n: nn, needs, at: Date.now() }))
        if (alive) setN({ unread: nn, needsYou: needs })
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

/** The bell's number alone (kept for existing callers). */
export function useInboxUnread(clientId: string | null | undefined, enabled = true): number | null {
  const c = useInboxCounts(clientId, enabled)
  return c ? c.unread : null
}
