'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Check, Loader2, Eye, Clock, ChevronDown, ChevronRight,
  Image as ImageIcon, Film, RefreshCw, X, MessageSquare,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useClient } from '@/lib/client-context'
import { useRealtimeRefresh } from '@/lib/realtime'
import { submitClientFeedback } from '@/lib/client-portal-actions'
import type { ContentQueueItem, ContentQueueDraft, ClientFeedbackEntry } from '@/types/database'
import EmptyState from '@/components/ui/empty-state'

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const hr = Math.floor(diffMs / 3600000)
  if (hr < 1) return 'just now'
  if (hr < 24) return `${hr}h`
  const days = Math.floor(hr / 24)
  return `${days}d`
}

function daysWaiting(iso: string): string {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (days === 0) return 'Sent today'
  if (days === 1) return 'Waiting 1 day'
  return `Waiting ${days} days`
}

export function ApprovalsView() {
  const supabase = createClient()
  const router = useRouter()
  const { client, loading: clientLoading } = useClient()

  const [pending, setPending] = useState<ContentQueueItem[]>([])
  const [recentRevisions, setRecentRevisions] = useState<ContentQueueItem[]>([])
  const [feedback, setFeedback] = useState<Map<string, ClientFeedbackEntry[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [showRejected, setShowRejected] = useState(false)

  // Action state
  const [approvingId, setApprovingId] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectMessage, setRejectMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [successId, setSuccessId] = useState<string | null>(null)
  const [successType, setSuccessType] = useState<'approved' | 'rejected' | null>(null)

  const load = useCallback(async () => {
    if (!client?.id) { setLoading(false); return }

    const [pendingRes, revisionsRes] = await Promise.all([
      // Items needing approval
      supabase
        .from('content_queue')
        .select('*')
        .eq('client_id', client.id)
        .eq('service_area', 'social')
        .eq('status', 'in_review')
        .order('scheduled_for', { ascending: true, nullsFirst: false }),
      // Recently rejected (now being revised)
      supabase
        .from('content_queue')
        .select('*')
        .eq('client_id', client.id)
        .eq('service_area', 'social')
        .eq('status', 'drafting')
        .gt('revision_count', 0)
        .order('updated_at', { ascending: false })
        .limit(10),
    ])

    const pendingItems = (pendingRes.data ?? []) as ContentQueueItem[]
    const revisionItems = (revisionsRes.data ?? []) as ContentQueueItem[]
    setPending(pendingItems)
    setRecentRevisions(revisionItems)

    // Load feedback for revision items
    const allIds = [...pendingItems, ...revisionItems].map(r => r.id)
    if (allIds.length > 0) {
      const { data: fb } = await supabase
        .from('client_feedback')
        .select('*')
        .in('content_queue_id', allIds)
        .eq('feedback_type', 'revision')
        .order('created_at', { ascending: false })

      const map = new Map<string, ClientFeedbackEntry[]>()
      for (const f of (fb ?? []) as ClientFeedbackEntry[]) {
        if (!map.has(f.content_queue_id)) map.set(f.content_queue_id, [])
        map.get(f.content_queue_id)!.push(f)
      }
      setFeedback(map)
    }

    setLoading(false)
  }, [client?.id, supabase])

  useEffect(() => { if (!clientLoading) load() }, [load, clientLoading])
  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  async function handleApprove(id: string) {
    setApprovingId(id)
    setSubmitting(true)
    const result = await submitClientFeedback(id, 'approval')
    setSubmitting(false)
    if (result.success) {
      setSuccessId(id)
      setSuccessType('approved')
      setTimeout(() => { setSuccessId(null); load() }, 2000)
    }
    setApprovingId(null)
  }

  async function handleReject(id: string) {
    if (!rejectMessage.trim()) return
    setSubmitting(true)
    const result = await submitClientFeedback(id, 'revision', rejectMessage)
    setSubmitting(false)
    if (result.success) {
      setRejectingId(null)
      setRejectMessage('')
      setSuccessId(id)
      setSuccessType('rejected')
      setTimeout(() => { setSuccessId(null); load() }, 2000)
    }
  }

  return (
    <div className="space-y-6">
      {/* Header is provided by the Inbox container */}
      {loading || clientLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-ink-6 h-36 animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          {/* ── Pending section ── */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Eye className="w-4 h-4 text-amber-600" />
              <h2 className="text-sm font-semibold text-ink">Waiting for you</h2>
              <span className="text-xs text-ink-4">
                {pending.length} {pending.length === 1 ? 'item' : 'items'}
              </span>
            </div>

            {pending.length === 0 ? (
              <div className="bg-white rounded-xl border border-ink-6">
                <EmptyState
                  icon={Check}
                  title="You're all caught up"
                  description="Nothing needs your attention right now. We'll let you know as soon as something is ready for your review."
                />
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map(item => {
                  const draft: ContentQueueDraft | null =
                    item.selected_draft != null && item.drafts[item.selected_draft]
                      ? item.drafts[item.selected_draft] as ContentQueueDraft
                      : null
                  const isVideo = item.content_format === 'short_form_video'
                  const isSuccess = successId === item.id

                  if (isSuccess) {
                    return (
                      <div key={item.id} className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                        <Check className="w-5 h-5 text-emerald-600 mx-auto mb-1" />
                        <p className="text-sm font-medium text-emerald-900">
                          {successType === 'approved'
                            ? 'Approved! We\'ll handle the rest.'
                            : 'Got it! Your team is making changes.'}
                        </p>
                      </div>
                    )
                  }

                  const scheduledLabel = item.scheduled_for
                    ? `Scheduled for ${new Date(item.scheduled_for).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`
                    : null

                  return (
                    <div
                      key={item.id}
                      className="bg-white rounded-xl border border-amber-300 ring-1 ring-amber-200 overflow-hidden"
                    >
                      <div className="flex items-start gap-4 p-4">
                        {/* Thumbnail */}
                        <Link
                          href={`/dashboard/social/requests/${item.id}`}
                          className="w-20 h-20 rounded-lg bg-bg-2 flex items-center justify-center flex-shrink-0 overflow-hidden hover:opacity-80 transition-opacity"
                        >
                          {draft?.image_url ? (
                            isVideo ? (
                              <div className="relative w-full h-full">
                                <video src={draft.image_url} className="w-full h-full object-cover" muted preload="metadata" />
                                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                                  <Film className="w-5 h-5 text-white" />
                                </div>
                              </div>
                            ) : (
                              <img src={draft.image_url} alt="" className="w-full h-full object-cover" />
                            )
                          ) : (
                            <ImageIcon className="w-6 h-6 text-ink-4" />
                          )}
                        </Link>

                        {/* Body */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              {isVideo ? 'Reel' : item.content_format === 'graphic' ? 'Graphic' : 'Post'}
                            </span>
                            <span className="text-[10px] text-ink-4">{daysWaiting(item.updated_at)}</span>
                          </div>

                          {scheduledLabel && (
                            <p className="text-xs text-ink font-medium mb-1">
                              {scheduledLabel} — please review before then
                            </p>
                          )}

                          <p className="text-sm text-ink-2 line-clamp-2">
                            {draft?.caption || item.input_text || 'Content ready for your review'}
                          </p>

                          <Link
                            href={`/dashboard/social/requests/${item.id}`}
                            className="text-[10px] text-brand hover:text-brand-dark font-medium mt-1 inline-block"
                          >
                            View full details →
                          </Link>
                        </div>
                      </div>

                      {/* Action bar */}
                      {rejectingId === item.id ? (
                        <div className="border-t border-amber-200 p-4 bg-amber-50/30 space-y-3">
                          <div>
                            <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
                              Tell us what to change <span className="text-red-500">*</span>
                            </label>
                            <textarea
                              value={rejectMessage}
                              onChange={e => setRejectMessage(e.target.value)}
                              placeholder="Be specific — what should we change?"
                              rows={3}
                              autoFocus
                              className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none bg-white"
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleReject(item.id)}
                              disabled={submitting || !rejectMessage.trim()}
                              className="bg-brand hover:bg-brand-dark text-white text-xs font-medium rounded-lg px-4 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                              Send changes
                            </button>
                            <button
                              onClick={() => { setRejectingId(null); setRejectMessage('') }}
                              className="text-xs text-ink-3 hover:text-ink transition-colors"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="border-t border-amber-200 px-4 py-3 bg-amber-50/30 flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <button
                              onClick={() => handleApprove(item.id)}
                              disabled={submitting && approvingId === item.id}
                              className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                            >
                              {submitting && approvingId === item.id
                                ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                : <Check className="w-3.5 h-3.5" />}
                              Approve
                            </button>
                            <button
                              onClick={() => setRejectingId(item.id)}
                              className="bg-white border border-ink-6 hover:border-amber-400 text-ink text-xs font-medium rounded-lg px-4 py-2 flex items-center gap-1.5 transition-colors"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Request changes
                            </button>
                          </div>
                          <div className="text-[10px] text-ink-4">
                            Revisions: {item.revision_count} / {item.revision_limit}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ── Recently rejected section ── */}
          {recentRevisions.length > 0 && (
            <div>
              <button
                onClick={() => setShowRejected(!showRejected)}
                className="flex items-center gap-2 text-sm text-ink-3 hover:text-ink transition-colors mb-2"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="font-medium">Recently sent back</span>
                <span className="text-xs text-ink-4">({recentRevisions.length})</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${showRejected ? 'rotate-180' : ''}`} />
              </button>

              {showRejected && (
                <div className="space-y-2">
                  {recentRevisions.map(item => {
                    const latestFb = feedback.get(item.id)?.[0]
                    return (
                      <Link
                        key={item.id}
                        href={`/dashboard/social/requests/${item.id}`}
                        className="block bg-white rounded-xl border border-ink-6 p-4 hover:border-brand/30 transition-all"
                      >
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center flex-shrink-0">
                            <RefreshCw className="w-4 h-4 text-amber-600" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                                Being revised
                              </span>
                              <span className="text-[10px] text-ink-4">
                                Revision {item.revision_count} of {item.revision_limit}
                              </span>
                            </div>
                            <p className="text-sm text-ink truncate">{item.input_text || 'Content request'}</p>
                            {latestFb?.message && (
                              <p className="text-xs text-ink-4 mt-1 truncate">
                                You asked: &ldquo;{latestFb.message}&rdquo;
                              </p>
                            )}
                            <p className="text-[10px] text-purple-600 font-medium mt-1">
                              Your team is working on changes
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-ink-4 flex-shrink-0 mt-1" />
                        </div>
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
