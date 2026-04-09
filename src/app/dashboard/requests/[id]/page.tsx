'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import {
  ArrowLeft, Check, Loader2, MessageSquare, Image as ImageIcon,
  Copy, Clock, RefreshCw,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRealtimeRefresh } from '@/lib/realtime'
import { submitClientFeedback } from '@/lib/client-portal-actions'
import type { ContentQueueItem, ClientFeedbackEntry, QueueStatus, ContentQueueDraft } from '@/types/database'

const STATUS_LABEL: Record<QueueStatus, string> = {
  new: 'Submitted',
  drafting: 'In Production',
  in_review: 'Ready for Your Review',
  approved: 'Approved',
  scheduled: 'Scheduled',
  posted: 'Posted',
}

const STATUS_COLOR: Record<QueueStatus, string> = {
  new: 'bg-blue-50 text-blue-700 border-blue-200',
  drafting: 'bg-purple-50 text-purple-700 border-purple-200',
  in_review: 'bg-amber-50 text-amber-700 border-amber-200',
  approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  scheduled: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  posted: 'bg-green-50 text-green-700 border-green-200',
}

export default function DashboardRequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  const supabase = createClient()

  const [request, setRequest] = useState<ContentQueueItem | null>(null)
  const [feedback, setFeedback] = useState<ClientFeedbackEntry[]>([])
  const [loading, setLoading] = useState(true)

  // Action state
  const [approving, setApproving] = useState(false)
  const [showRevisionForm, setShowRevisionForm] = useState(false)
  const [revisionMessage, setRevisionMessage] = useState('')
  const [submittingRevision, setSubmittingRevision] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [reqRes, fbRes] = await Promise.all([
      supabase.from('content_queue').select('*').eq('id', id).single(),
      supabase.from('client_feedback').select('*').eq('content_queue_id', id).order('created_at', { ascending: true }),
    ])

    if (reqRes.data) setRequest(reqRes.data as ContentQueueItem)
    if (fbRes.data) setFeedback(fbRes.data as ClientFeedbackEntry[])
    setLoading(false)
  }, [id, supabase])

  useEffect(() => {
    load()
  }, [load])

  useRealtimeRefresh(['content_queue', 'client_feedback'], load)

  async function handleApprove() {
    setApproving(true)
    setError(null)
    const result = await submitClientFeedback(id, 'approval')
    setApproving(false)
    if (!result.success) setError(result.error)
  }

  async function handleSubmitRevision() {
    if (!revisionMessage.trim()) {
      setError('Please tell us what to change')
      return
    }
    setSubmittingRevision(true)
    setError(null)
    const result = await submitClientFeedback(id, 'revision', revisionMessage)
    setSubmittingRevision(false)
    if (result.success) {
      setShowRevisionForm(false)
      setRevisionMessage('')
    } else {
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
        <Link href="/dashboard/requests" className="text-brand hover:underline text-sm">
          Back to requests
        </Link>
      </div>
    )
  }

  const selectedDraft: ContentQueueDraft | null =
    request.selected_draft != null && request.drafts[request.selected_draft]
      ? (request.drafts[request.selected_draft] as ContentQueueDraft)
      : null

  const showReviewActions = request.status === 'in_review' && selectedDraft

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Link
          href="/dashboard/requests"
          className="text-ink-4 hover:text-ink transition-colors mt-1"
        >
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
      </div>

      {/* Status banner */}
      {request.status === 'new' && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
          <Clock className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-blue-900">We got your request</p>
            <p className="text-xs text-blue-700 mt-0.5">Our team will start working on it shortly. You&apos;ll see updates here.</p>
          </div>
        </div>
      )}
      {request.status === 'drafting' && (
        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-start gap-3">
          <Loader2 className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5 animate-spin" />
          <div>
            <p className="text-sm font-medium text-purple-900">In production</p>
            <p className="text-xs text-purple-700 mt-0.5">Our team is creating your content right now.</p>
          </div>
        </div>
      )}
      {request.status === 'approved' && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-start gap-3">
          <Check className="w-5 h-5 text-emerald-600 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-900">Approved</p>
            <p className="text-xs text-emerald-700 mt-0.5">Thanks for approving. We&apos;ll schedule and publish it soon.</p>
          </div>
        </div>
      )}

      {/* Original request */}
      <div className="bg-white rounded-xl border border-ink-6 p-5">
        <h2 className="text-[11px] text-ink-4 font-medium uppercase tracking-wide mb-3">Your Request</h2>
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
          {request.template_type && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 capitalize">
              {request.template_type}
            </span>
          )}
          {request.platform && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3 capitalize">
              {request.platform}
            </span>
          )}
          {request.size && (
            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-bg-2 text-ink-3">
              {request.size}
            </span>
          )}
        </div>
      </div>

      {/* Delivered content */}
      {selectedDraft && (
        <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
          <div className="px-5 py-3 border-b border-ink-6 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Delivered Content</h2>
            {request.status === 'approved' && (
              <span className="text-[10px] font-medium text-emerald-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> Approved
              </span>
            )}
          </div>

          {selectedDraft.image_url ? (
            <div className="bg-bg-2 flex items-center justify-center p-6">
              <img
                src={selectedDraft.image_url}
                alt="Delivered content"
                className="max-w-full max-h-[500px] object-contain rounded-lg shadow-sm"
              />
            </div>
          ) : (
            <div className="bg-bg-2 p-12 flex items-center justify-center">
              <ImageIcon className="w-8 h-8 text-ink-5" />
            </div>
          )}

          <div className="p-5 space-y-4">
            {selectedDraft.caption && (
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Caption</span>
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
                  <span className="text-[11px] text-ink-4 font-medium uppercase tracking-wide">Hashtags</span>
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
              {!showRevisionForm ? (
                <div>
                  <p className="text-sm text-ink mb-3 font-medium">How does it look?</p>
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
                      disabled={approving}
                      className="bg-white border border-ink-6 hover:border-amber-400 text-ink text-sm font-medium rounded-lg px-5 py-2.5 flex items-center gap-2 transition-colors"
                    >
                      <RefreshCw className="w-4 h-4" />
                      Request Revision
                    </button>
                  </div>
                  {error && <p className="text-xs text-red-600 mt-2">{error}</p>}
                </div>
              ) : (
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

      {/* Feedback history */}
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
