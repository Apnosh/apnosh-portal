'use client'

/**
 * Compact form-submissions card for the Website Overview. Surfaces
 * unread count + the 3 most recent submissions so owners notice
 * inbound leads without leaving the dashboard.
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Inbox, ChevronRight, Mail } from 'lucide-react'
import { listFormSubmissions, type FormSubmission } from '@/lib/form-submissions'

export default function FormInboxCard() {
  const [items, setItems] = useState<FormSubmission[] | null>(null)

  useEffect(() => {
    let cancelled = false
    listFormSubmissions({ status: 'all' })
      .then(d => { if (!cancelled) setItems(d) })
      .catch(() => { if (!cancelled) setItems([]) })
    return () => { cancelled = true }
  }, [])

  if (items === null) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-20" />
      </div>
    )
  }
  if (items.length === 0) return null

  const unread = items.filter(s => s.status === 'new').length

  return (
    <div className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-ink-6">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Form submissions</h2>
          {unread > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand-dark px-1.5 py-0.5 rounded">
              {unread} new
            </span>
          )}
        </div>
        <Link href="/dashboard/website/forms" className="text-[11px] font-medium text-brand-dark hover:underline">
          See all →
        </Link>
      </div>
      <ul>
        {items.slice(0, 3).map(s => (
          <li key={s.id}>
            <Link
              href={`/dashboard/website/forms?id=${s.id}`}
              className={`flex items-center gap-3 px-5 py-3 hover:bg-bg-2/40 transition-colors ${
                s.status === 'new' ? 'font-medium' : ''
              }`}
            >
              {s.status === 'new'
                ? <span className="w-1.5 h-1.5 rounded-full bg-brand flex-shrink-0" />
                : <Mail className="w-3 h-3 text-ink-4 flex-shrink-0" />}
              <div className="flex-1 min-w-0">
                <p className="text-[13px] text-ink truncate">{s.display_name || s.display_email || 'Anonymous'}</p>
                <p className="text-[10.5px] text-ink-4 capitalize">{s.kind.replace('_', ' ')}</p>
              </div>
              <span className="text-[10px] text-ink-4 flex-shrink-0">{relTime(s.submitted_at)}</span>
              <ChevronRight className="w-3 h-3 text-ink-4 flex-shrink-0" />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const m = Math.floor(ms / 60000)
  if (m < 1) return 'now'
  if (m < 60) return `${m}m`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}
