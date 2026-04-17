'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft, Check, Loader2, MessageSquare, Image as ImageIcon,
  Copy, Clock, RefreshCw, X as XIcon, Trash2, Download, Film,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { useClient } from '@/lib/client-context'
import { submitClientFeedback, cancelContentRequest } from '@/lib/client-portal-actions'
import { GraphicBriefView } from '@/components/dashboard/graphic-brief-view'
import { VideoBriefView } from '@/components/dashboard/video-brief-view'
import type { ContentQueueItem, ClientFeedbackEntry, QueueStatus, ContentQueueDraft } from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Submitted — under review',
  confirmed: 'Confirmed',
  drafting: 'In production',
  in_review: 'Ready for your review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Posted',
  cancelled: 'Cancelled',
}

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  confirmed: 'bg-blue-50 text-blue-700 border-blue-200',
  drafting: 'bg-purple-50 text-purple-700 border-purple-200',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  posted: 'bg-green-50 text-green-700 border-green-200',
  cancelled: 'bg-ink-6 text-ink-3 border-ink-5',
}

export interface RequestDetailProps {
  requestId: string
  backHref: string
  backLabel?: string
}

export function ClientRequestDetail({ requestId, backHref, backLabel = 'Back to requests' }: RequestDetailProps) {
  const supabase = createClient()
  const router = useRouter()
  const { enrolledServices } = useClient()
  const managesSocial = enrolledServices.has('social')

  const [request, setRequest] = useState<ContentQueueItem | null>(null)
  const [feedback, setFeedback] = useState<ClientFeedbackEntry[]>([])
  const [loading, setLoading] = useState(true)

  const [approving, setApproving] = useState(false)
  const [approveSubmitted, setApproveSubmitted] = useState(false)
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [revisionSubmitted, setRevisionSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancelConfirm, setCancelConfirm] = useState(false)
  const [cancelling, setCancelling] = useState(false)

  const load = useCallback(async () => {
    const [reqRes, fbRes] = await Promise.all([
      supabase.from('content_queue').select('*').eq('id', requestId).single(),
      supabase.from('client_feedback').select('*').eq('content_queue_id', requestId).order('created_at', { ascending: true }),
    ])

    if (reqRes.data) setRequest(reqRes.data as ContentQueueItem)
    if (fbRes.data) setFeedback(fbRes.data as ClientFeedbackEntry[])
    setLoading(false)
  }, [requestId, supabase])

  useEffect(() => { load() }, [load])
  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  async function handleApprove() {
    setApproving(true)
    setError(null)
    const result = await submitClientFeedback(requestId, 'approval')
    if (result.success) {
      setApproveSubmitted(true)
      // Refetch immediately so the page reflects the new status
      await load()
      setApproving(false)
      // Give the user ~2.5s to read the confirmation, then route back to the queue
      setTimeout(() => router.push(backHref), 2500)
    } else {
      setApproving(false)
      setError(result.error)
    }
  }

  async function handleSubmitRevision() {
    if (!revisionMessage.trim()) {
      setError('Please tell us what to change')
      return
    }
    setSubmittingRevision(true)
    setError(null)
    const result = await submitClientFeedback(requestId, 'revision', revisionMessage)
    if (result.success) {
      setShowRevisionForm(false)
      setRevisionMessage('')
      setRevisionSubmitted(true)
      // Immediately refetch the request so status + revision_count update
      // (don't rely on realtime alone — it can lag a beat behind).
      await load()
      setSubmittingRevision(false)
      // Give the user ~2.5s to read the thank-you banner, then return to the
      // Content Queue where they'll see the request in its new "Being revised" slot.
      setTimeout(() => router.push(backHref), 2500)
    } else {
      setSubmittingRevision(false)
      setError(result.error)
    }
  }

  async function handleCancel() {
    setCancelling(true)
    setError(null)
    const result = await cancelContentRequest(requestId)
    if (result.success) {
      // Redirect back to the requests list so the user has an obvious
      // "I'm done" state. Previously we just closed the confirm bar and
      // left the user on the cancelled detail page, which looked broken.
      setCancelConfirm(false)
      router.push('/dashboard/social/requests')
    } else {
      setCancelling(false)
      setError(result.error)
    }
  }

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="h-8 w-48 bg-ink-6 rounded animate-pulse" />
        <div className="bg-white rounded-xl border border-ink-6 p-6 h-64 animate-pulse" />
      </div>
    )
  }

  if (!request) {
    return (
      <div className="max-w-3xl mx-auto py-20 text-center">
        <h2 className="font-[family-name:var(--font-display)] text-xl text-ink mb-2">Request not found</h2>
        <Link href={backHref} className="text-brand hover:underline text-sm">
          {backLabel}
        </Link>
      </div>
    )
  }

  const selectedDraft: ContentQueueDraft | null =
    request.selected_draft != null && request.drafts[request.selected_draft]
      ? (request.drafts[request.selected_draft] as ContentQueueDraft)
      : null

  const showReviewActions = request.status === 'in_review' && selectedDraft && !revisionSubmitted && !approveSubmitted

  // Cancel is allowed any time before the request is locked in (posted/cancelled).
  // Approved/scheduled also stay cancellable so a client can pull the plug late.
  const canCancel = !['posted', 'cancelled'].includes(request.status)

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      <div className="flex items-start gap-3">
        <Link href={backHref} className="text-ink-4 hover:text-ink transition-colors mt-1">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${STATUS_COLOR[request.status]}`}>
              {STATUS_LABEL[request.status]}
            </span>
            <span className="text-[10px] text-ink-4">
              Submitted {new Date(request.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-xl text-ink">
            Request #{request.id.slice(0, 8)}
          </h1>
        </div>
        {canCancel && (
          <button
            onClick={() => setCancelConfirm(true)}
            className="text-xs text-ink-4 hover:text-red-600 transition-colors flex items-center gap-1 mt-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
      </div>

      {/* Cancelled banner */}
      {request.status === 'cancelled' && (
        <div className="bg-ink-6/40 border border-ink-5 rounded-xl p-4 flex items-start gap-3">
          <XIcon className="w-5 h-5 text-ink-3 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-ink-2">This request was cancelled</p>
            {request.cancelled_reason && (
              <p className="text-xs text-ink-3 mt-0.5">Reason: {request.cancelled_reason}</p>
            )}
            <p className="text-xs text-ink-4 mt-0.5">
              Need a new version? Submit a new request from the Content Queue.
            </p>
          </div>
        </div>
      )}

      {/* Cancel confirmation card */}
      {cancelConfirm && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-red-900 mb-1">Cancel this request?</p>
          <p className="text-xs text-red-700 mb-3">
            This will pull the request from our queue. You can always submit a new one.
          </p>
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {cancelling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
              Yes, cancel it
            </button>
            <button
              onClick={() => setCancelConfirm(false)}
              className="text-xs text-ink-3 hover:text-ink transition-colors px-2"
            >
              Keep request
            </button>
          </div>
        </div>
      )}

      {/* Approval submitted — thank-you banner */}
      {approveSubmitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <Check className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Approved — thanks!
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {managesSocial
                ? "We'll handle the rest from here. Taking you back to your queue…"
                : "Your file is ready to download from the queue. Taking you back…"}
            </p>
          </div>
          <Loader2 className="w-4 h-4 text-emerald-700 animate-spin flex-shrink-0 mt-1" />
        </div>
      )}

      {/* Revision submitted — thank-you banner */}
      {revisionSubmitted && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center flex-shrink-0">
            <RefreshCw className="w-4 h-4 text-emerald-700" />
          </div>
          <div className="flex-1">
            <p className="text-sm font-semibold text-emerald-900">
              Revision sent — now under review
            </p>
            <p className="text-xs text-emerald-700 mt-0.5">
              Thank you. Our team has been notified and will revise this for you. Taking you back to your queue…
            </p>
          </div>
          <Loader2 className="w-4 h-4 text-emerald-700 animate-spin flex-shrink-0 mt-1" />
        </div>
      )}

      {/* Status banner */}
      {request.status === 'new' && (
        <div className="bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-cyan-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-cyan-900">Submitted — under review</p>
            <p className="text-xs text-cyan-700 mt-0.5">
              Our team is reviewing your request. You&apos;ll get a confirmation as soon as we&apos;re ready to start.
            </p>
          </div>
        </div>
      )}
      {request.status === 'confirmed' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">Confirmed — production starting</p>
            <p className="text-xs text-blue-700 mt-0.5">
              Your request is in our queue. We&apos;ll notify you the moment a draft is ready to review.
            </p>
          </div>
        </div>
      )}
      {request.status === 'drafting' && (
        request.revision_count > 0 ? (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
            <RefreshCw className="w-5 h-5 text-amber-700 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-semibold text-amber-900">
                  Being revised
                </p>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-200 text-amber-900">
                  Revision {request.revision_count} of {request.revision_limit}
                </span>
              </div>
              <p className="text-xs text-amber-800 mt-0.5">
                Our team is working on your revisions now. We&apos;ll send the updated draft over shortly.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
            <Loader2 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5 animate-spin" />
            <div>
              <p className="text-sm font-medium text-purple-900">In production</p>
              <p className="text-xs text-purple-700 mt-0.5">Our team is editing this now. We&apos;ll send the draft over when it&apos;s ready.</p>
            </div>
          </div>
        )
      )}
      {request.status === 'approved' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-900">Approved</p>
            <p className="text-xs text-emerald-700 mt-0.5">
              {managesSocial
                ? "Thanks for approving. We'll post this for you."
                : "Thanks for approving. Your file is ready to download below."}
            </p>
          </div>
        </div>
      )}
      {request.status === 'scheduled' && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-indigo-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-indigo-900">
              Scheduled to post
              {request.scheduled_for && ` on ${new Date(request.scheduled_for).toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`}
            </p>
            <p className="text-xs text-indigo-700 mt-0.5">Sit back — we&apos;ll publish this on the planned date.</p>
          </div>
        </div>
      )}
      {request.status === 'posted' && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-green-900">Posted</p>
            <p className="text-xs text-green-700 mt-0.5">This is live. Performance will start showing in your reports.</p>
          </div>
        </div>
      )}

      {/* Structured creative brief — graphic or video */}
      {request.content_format === 'graphic' && (
        <GraphicBriefView contentQueueId={request.id} />
      )}
      {request.content_format === 'short_form_video' && (
        <VideoBriefView contentQueueId={request.id} />
      )}

      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h2 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">
          {request.content_format === 'graphic' ? 'Summary' : 'Your Request'}
        </h2>
        <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed">
          {request.input_text || 'No description'}
        </p>
        {request.input_photo_url && (
          <div className="mt-3">
            <img
              src={request.input_photo_url}
              alt="Reference"
              className="w-40 h-40 object-cover rounded-lg border border-ink-6"
            />
          </div>
        )}
        <div className="flex flex-wrap gap-2 mt-4">
          {request.content_format && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 capitalize">
              {request.content_format.replace(/_/g, ' ')}
            </span>
          )}
          {request.platform && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 capitalize">
              {request.platform}
            </span>
          )}
        </div>
      </div>

      {selectedDraft && (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">Delivered</h2>
              {request.status === 'approved' && (
                <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Approved
                </span>
              )}
              {request.status === 'scheduled' && (
                <span className="text-[10px] font-medium text-indigo-600 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Scheduled
                </span>
              )}
              {request.status === 'posted' && (
                <span className="text-[10px] font-medium text-green-700 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Posted
                </span>
              )}
            </div>
            {selectedDraft.image_url && (
              <a
                href={selectedDraft.image_url}
                download
                target="_blank"
                rel="noopener noreferrer"
                className="bg-white border border-ink-6 hover:border-brand/40 hover:text-brand-dark text-ink-2 text-xs font-medium rounded-lg px-3 py-1.5 flex items-center gap-1.5 transition-colors flex-shrink-0"
              >
                <Download className="w-3.5 h-3.5" />
                Download
              </a>
            )}
          </div>

          {(() => {
            const url = selectedDraft.image_url
            if (!url) {
              return (
                <div className="bg-bg-2 p-12 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-ink-5" />
                </div>
              )
            }
            // Detect external links (Drive, Dropbox, WeTransfer, etc.)
            const isExternalLink =
              url.includes('drive.google.com') ||
              url.includes('dropbox.com') ||
              url.includes('wetransfer.com') ||
              url.includes('docs.google.com') ||
              (!url.match(/\.(jpg|jpeg|png|gif|webp|svg|mp4|mov|webm|mkv)(\?|$)/i) &&
               !url.includes('supabase'))

            if (isExternalLink) {
              return (
                <div className="bg-bg-2 flex flex-col items-center justify-center p-10 gap-3">
                  <Film className="w-8 h-8 text-ink-4" />
                  <p className="text-sm text-ink-2 font-medium">Draft delivered via link</p>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors"
                  >
                    <Download className="w-4 h-4" />
                    Open &amp; Download
                  </a>
                </div>
              )
            }

            if (request.content_format === 'short_form_video') {
              return (
                <div className="bg-bg-2 flex items-center justify-center p-6">
                  <video
                    src={url}
                    controls
                    playsInline
                    className="max-w-full max-h-[600px] rounded-lg shadow-sm bg-black"
                  />
                </div>
              )
            }

            return (
              <div className="bg-bg-2 flex items-center justify-center p-6">
                <img
                  src={url}
                  alt="Delivered content"
                  className="max-w-full max-h-[500px] object-contain rounded-lg shadow-sm"
                />
              </div>
            )
          })()}

          <div className="p-5 space-y-4">
            {selectedDraft.caption && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Notes</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedDraft.caption)}
                    className="text-[10px] text-ink-4 hover:text-ink flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <p className="text-sm text-ink-2 whitespace-pre-wrap leading-relaxed bg-bg-2 rounded-lg p-3">
                  {selectedDraft.caption}
                </p>
              </div>
            )}
            {selectedDraft.hashtags && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Tags</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(selectedDraft.hashtags)}
                    className="text-[10px] text-ink-4 hover:text-ink flex items-center gap-1 transition-colors"
                  >
                    <Copy className="w-3 h-3" /> Copy
                  </button>
                </div>
                <p className="text-sm text-ink-3 bg-bg-2 rounded-lg p-3">{selectedDraft.hashtags}</p>
              </div>
            )}
          </div>

          {showReviewActions && (
            <div className="border-t border-ink-6 p-5 bg-amber-50/30">
              {(() => {
                const used = request.revision_count ?? 0
                const limit = request.revision_limit ?? 2
                const remaining = Math.max(0, limit - used)
                const atLimit = used >= limit
                if (showRevisionForm) return null

                return (
                  <div>
                    <div className="mb-3">
                      <p className="text-sm text-ink font-semibold">How does it look?</p>
                      <p className="text-[11px] text-ink-3 mt-0.5">
                        Approve to move forward, or send it back with what needs to change.
                      </p>
                    </div>

                    {/* Prominent revision counter card */}
                    <div className={`rounded-lg border p-3 mb-3 flex items-center gap-3 ${
                      atLimit
                        ? 'bg-red-50 border-red-200'
                        : remaining === 1
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-white border-ink-6'
                    }`}>
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        atLimit ? 'bg-red-100' : remaining === 1 ? 'bg-amber-100' : 'bg-bg-2'
                      }`}>
                        <RefreshCw className={`w-4 h-4 ${
                          atLimit ? 'text-red-700' : remaining === 1 ? 'text-amber-700' : 'text-ink-3'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${
                          atLimit ? 'text-red-900' : remaining === 1 ? 'text-amber-900' : 'text-ink'
                        }`}>
                          {atLimit
                            ? 'No revisions left'
                            : `${remaining} ${remaining === 1 ? 'revision' : 'revisions'} remaining`}
                        </p>
                        <p className={`text-[11px] mt-0.5 ${
                          atLimit ? 'text-red-700' : remaining === 1 ? 'text-amber-800' : 'text-ink-4'
                        }`}>
                          {atLimit
                            ? "You've used all revisions. Message your account manager for more."
                            : `You get ${limit} free revisions per graphic. ${used} used so far.`}
                        </p>
                      </div>
                      {/* Dot indicator */}
                      <div className="flex gap-1 flex-shrink-0">
                        {Array.from({ length: limit }).map((_, i) => (
                          <div
                            key={i}
                            className={`w-2 h-2 rounded-full ${
                              i < used
                                ? (atLimit ? 'bg-red-400' : 'bg-amber-400')
                                : 'bg-ink-6'
                            }`}
                          />
                        ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-3">
                      <button
                        onClick={handleApprove}
                        disabled={approving}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50"
                      >
                        {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                        Approve
                      </button>
                      <button
                        onClick={() => setShowRevisionForm(true)}
                        disabled={approving || atLimit}
                        title={atLimit ? `You've used all ${limit} revisions for this request` : undefined}
                        className="bg-white border border-ink-6 hover:border-amber-400 text-ink text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <RefreshCw className="w-4 h-4" />
                        {atLimit ? 'Revision limit reached' : 'Request Revision'}
                      </button>
                    </div>
                    {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                  </div>
                )
              })()}
              {showRevisionForm && (
                <div className="space-y-3">
                  <div>
                    <label className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-1.5 block">
                      What should we change?
                    </label>
                    <textarea
                      value={revisionMessage}
                      onChange={e => setRevisionMessage(e.target.value)}
                      placeholder="Tell us what to adjust..."
                      rows={4}
                      className="w-full border border-ink-6 rounded-lg px-3 py-2 text-sm text-ink placeholder:text-ink-4 focus:outline-none focus:ring-2 focus:ring-brand/20 focus:border-brand resize-none bg-white"
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleSubmitRevision}
                      disabled={submittingRevision || !revisionMessage.trim()}
                      className="bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg px-4 py-2 flex items-center gap-2 transition-colors disabled:opacity-50"
                    >
                      {submittingRevision ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                      Send Revision Request
                    </button>
                    <button
                      onClick={() => { setShowRevisionForm(false); setRevisionMessage(''); setError(null) }}
                      className="text-sm text-ink-3 hover:text-ink transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-600">{error}</p>}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {feedback.length > 0 && (
        <div className="bg-white rounded-xl border border-ink-6 p-5">
          <h2 className="text-sm font-semibold text-ink mb-3 flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-ink-4" />
            History
          </h2>
          <div className="space-y-3">
            {feedback.map(fb => (
              <div key={fb.id} className="bg-bg-2 rounded-lg p-3">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      fb.feedback_type === 'approval'
                        ? 'bg-emerald-100 text-emerald-700'
                        : fb.feedback_type === 'revision'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-ink-6 text-ink-3'
                    }`}
                  >
                    {fb.feedback_type}
                  </span>
                  <span className="text-[10px] text-ink-4">
                    {new Date(fb.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                  </span>
                </div>
                {fb.message && <p className="text-xs text-ink-2 whitespace-pre-wrap">{fb.message}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
