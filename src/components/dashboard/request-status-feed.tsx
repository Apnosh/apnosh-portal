'use client'

/**
 * Shows the owner's open / in-progress / recently-completed change
 * requests on the Website Overview. Click any row to jump to the
 * request detail. Updates live via realtime so an owner watching
 * the page sees a request move from "Submitted" -> "In progress"
 * the moment a strategist picks it up.
 */

import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { Inbox, ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import type { ContentQueueItem, QueueStatus } from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Submitted',
  confirmed: 'Confirmed',
  drafting: 'In progress',
  in_review: 'Ready for your review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Done',
  cancelled: 'Cancelled',
}

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-blue-50 text-blue-700',
  confirmed: 'bg-blue-50 text-blue-700',
  drafting: 'bg-purple-50 text-purple-700',
  in_review: 'bg-amber-50 text-amber-700',
  approved: 'bg-emerald-50 text-emerald-700',
  scheduled: 'bg-indigo-50 text-indigo-700',
  posted: 'bg-green-50 text-green-700',
  cancelled: 'bg-ink-6 text-ink-3',
}

const OPEN_STATUSES = new Set<QueueStatus>(['new', 'confirmed', 'drafting', 'in_review'])

export default function RequestStatusFeed() {
  const { client } = useClient()
  const supabase = createClient()
  const [requests, setRequests] = useState<ContentQueueItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }
    const { data } = await supabase
      .from('content_queue')
      .select('*')
      .eq('client_id', client.id)
      .eq('service_area', 'website')
      .order('updated_at', { ascending: false })
      .limit(8)
    setRequests((data ?? []) as ContentQueueItem[])
    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { void load() }, [load])
  useRealtimeRefresh(['content_queue'], load)

  if (loading) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="animate-pulse h-24" />
      </div>
    )
  }

  const open = requests.filter(r => OPEN_STATUSES.has(r.status))
  const recent = requests.filter(r => !OPEN_STATUSES.has(r.status)).slice(0, 3)

  /* Empty state — encourage them to file the first one. */
  if (open.length === 0 && recent.length === 0) {
    return (
      <div className="rounded-2xl border border-ink-6 bg-white p-5">
        <div className="flex items-center gap-2 mb-1">
          <Inbox className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Change requests</h2>
        </div>
        <p className="text-xs text-ink-3 mb-3">
          Anything you want updated on your site — menu prices, holiday banner, hero photo, typos. Pick a template and we&rsquo;ll handle it.
        </p>
        <Link
          href="/dashboard/website/requests/new"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12.5px] font-semibold text-white bg-brand hover:bg-brand-dark"
        >
          <Plus className="w-3 h-3" />
          File your first request
        </Link>
      </div>
    )
  }

  return (
    <div className="rounded-2xl border border-ink-6 bg-white overflow-hidden">
      <div className="px-5 py-3 flex items-center justify-between border-b border-ink-6">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-brand" />
          <h2 className="text-sm font-semibold text-ink">Change requests</h2>
          {open.length > 0 && (
            <span className="inline-flex items-center text-[10px] font-bold uppercase tracking-wider bg-brand/15 text-brand-dark px-1.5 py-0.5 rounded">
              {open.length} open
            </span>
          )}
        </div>
        <Link href="/dashboard/website/requests" className="text-[11px] font-medium text-brand-dark hover:underline">
          See all →
        </Link>
      </div>
      <ul>
        {open.map(r => (
          <RequestRow key={r.id} req={r} />
        ))}
        {open.length > 0 && recent.length > 0 && (
          <li className="px-5 py-1.5 text-[10px] uppercase tracking-wider font-semibold text-ink-4 bg-bg-2/40">
            Recently completed
          </li>
        )}
        {recent.map(r => (
          <RequestRow key={r.id} req={r} dim />
        ))}
      </ul>
    </div>
  )
}

function RequestRow({ req, dim }: { req: ContentQueueItem; dim?: boolean }) {
  const isReview = req.status === 'in_review'
  return (
    <li>
      <Link
        href={`/dashboard/website/requests/${req.id}`}
        className={`flex items-center gap-3 px-5 py-3 hover:bg-bg-2/40 transition-colors ${
          isReview ? 'bg-amber-50/40' : ''
        } ${dim ? 'opacity-70' : ''}`}
      >
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full flex-shrink-0 ${STATUS_COLOR[req.status]}`}>
          {STATUS_LABEL[req.status]}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] text-ink truncate">{req.input_text || 'Untitled request'}</p>
          <p className="text-[10px] text-ink-4 mt-0.5">
            Updated {new Date(req.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </p>
        </div>
        <ChevronRight className="w-3.5 h-3.5 text-ink-4 flex-shrink-0" />
      </Link>
    </li>
  )
}
