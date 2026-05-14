'use client'

/**
 * "Handled by your Apnosh team" — surfaces the last few admin actions
 * taken on this client's listing so the owner sees concrete value
 * being delivered, not just an analytics dashboard.
 *
 * Pulls from gbp_listing_audit + reviews.responded_at to build a
 * unified activity feed.
 */

import { useEffect, useState } from 'react'
import { CheckCircle2, MessageSquare, FileEdit, Loader2 } from 'lucide-react'
import { useClient } from '@/lib/client-context'

interface ActivityEntry {
  date: string
  kind: 'listing_update' | 'review_reply' | 'menu_update' | 'attributes'
  description: string
}

export default function HandledByTeamPanel() {
  const { client } = useClient()
  const [entries, setEntries] = useState<ActivityEntry[] | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!client?.id) return
    let cancelled = false
    setLoading(true)
    fetch(`/api/dashboard/team-activity?clientId=${client.id}`)
      .then(r => r.ok ? r.json() : { entries: [] })
      .then(d => { if (!cancelled) setEntries(d.entries as ActivityEntry[]) })
      .catch(() => { if (!cancelled) setEntries([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [client?.id])

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading recent activity…
        </div>
      </div>
    )
  }
  if (!entries || entries.length === 0) return null

  return (
    <div className="rounded-2xl border border-ink-6 bg-white p-5">
      <div className="flex items-center gap-2 mb-1">
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <h2 className="text-sm font-semibold text-ink">Handled by your Apnosh team</h2>
      </div>
      <p className="text-xs text-ink-3 mb-3">
        Recent work on your listing — so you can see what we&rsquo;ve been up to.
      </p>
      <ul className="space-y-2">
        {entries.slice(0, 6).map((e, i) => {
          const Icon = e.kind === 'review_reply' ? MessageSquare : FileEdit
          return (
            <li key={i} className="flex items-start gap-2.5 text-[12.5px]">
              <Icon className="w-3.5 h-3.5 text-ink-3 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-ink-2">{e.description}</p>
                <p className="text-[10.5px] text-ink-4 mt-0.5">{formatRel(e.date)}</p>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function formatRel(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const days = Math.floor(ms / (24 * 60 * 60 * 1000))
  if (days === 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}
