'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, Check, RotateCcw, Clock, Calendar, FileText,
  Download, AlertTriangle, Loader2, Image as ImageIcon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { approveDeliverable, requestRevision } from '@/lib/actions'
import MvpShell from '@/components/mvp/mvp-shell'
import { MvpDetailHeader } from '@/components/mvp/mvp-detail'

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface DeliverableDetail {
  id: string
  title: string
  type: string
  status: string
  version: number
  content: Record<string, unknown>
  file_urls: string[]
  preview_urls: string[]
  client_feedback: string | null
  revision_notes: string | null
  approved_at: string | null
  approved_by: string | null
  created_at: string
  updated_at: string
  description: string | null
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const typeLabels: Record<string, string> = {
  graphic: 'Graphic', video: 'Video', caption: 'Caption',
  email: 'Email', website_page: 'Website', seo: 'SEO',
  branding: 'Branding', photography: 'Photo', other: 'Other',
}

const typeBadgeColors: Record<string, string> = {
  graphic: 'bg-purple-50 text-purple-700',
  video: 'bg-blue-50 text-blue-700',
  caption: 'bg-amber-50 text-amber-700',
  email: 'bg-emerald-50 text-emerald-700',
  website_page: 'bg-cyan-50 text-cyan-700',
  seo: 'bg-lime-50 text-lime-700',
  branding: 'bg-fuchsia-50 text-fuchsia-700',
  photography: 'bg-rose-50 text-rose-700',
  other: 'bg-ink-6 text-ink-3',
}

const statusConfig: Record<string, { label: string; color: string }> = {
  draft: { label: 'Draft', color: 'bg-ink-6 text-ink-3' },
  internal_review: { label: 'Internal Review', color: 'bg-purple-50 text-purple-700' },
  client_review: { label: 'Needs Review', color: 'bg-amber-50 text-amber-700' },
  revision_requested: { label: 'Revision Requested', color: 'bg-red-50 text-red-700' },
  approved: { label: 'Approved', color: 'bg-emerald-50 text-emerald-700' },
  scheduled: { label: 'Scheduled', color: 'bg-blue-50 text-blue-700' },
  published: { label: 'Published', color: 'bg-teal-50 text-teal-700' },
}

const REVISION_LIMIT = 3

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

function ApprovalDetailPageInner() {
  const params = useParams()
  const router = useRouter()
  const id = params.id as string

  const [deliverable, setDeliverable] = useState<DeliverableDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [showFeedback, setShowFeedback] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [toast, setToast] = useState<{
    type: 'success' | 'error'
    message: string
  } | null>(null)

  const fetchDeliverable = useCallback(async () => {
    const supabase = createClient()
    const { data, error } = await supabase
      .from('deliverables')
      .select(
        'id, title, type, status, version, content, file_urls, preview_urls, client_feedback, revision_notes, approved_at, approved_by, created_at, updated_at, description'
      )
      .eq('id', id)
      .single()

    if (error || !data) {
      setLoading(false)
      return
    }
    setDeliverable(data as DeliverableDetail)
    setLoading(false)
  }, [id])

  useEffect(() => {
    fetchDeliverable()
  }, [fetchDeliverable])

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message })
    setTimeout(() => setToast(null), 4000)
  }

  const [showSendOff, setShowSendOff] = useState(false)

  const handleApprove = async () => {
    setActionLoading(true)
    const result = await approveDeliverable(id)
    if (result.success) {
      showToast('success', 'Content approved!')
      /* SO-1: a postable piece does not dead-end at Approved — the Send-off
       * asks how it reaches their feed. Everything else redirects as before. */
      if (deliverable && ['graphic', 'video'].includes(deliverable.type)) {
        setShowSendOff(true)
      } else {
        setTimeout(() => router.push('/dashboard/approvals'), 1500)
      }
    } else {
      showToast('error', result.error || 'Failed to approve')
    }
    setActionLoading(false)
  }

  const handleRequestRevision = async () => {
    if (!feedbackText.trim()) return
    setActionLoading(true)
    const result = await requestRevision(id, feedbackText.trim())
    if (result.success) {
      showToast('success', 'Revision requested!')
      setShowFeedback(false)
      setFeedbackText('')
      await fetchDeliverable()
    } else {
      showToast('error', result.error || 'Failed to request revision')
    }
    setActionLoading(false)
  }

  /* ---- Loading ---- */
  if (loading) {
    return (
      <div className="max-w-3xl mx-auto flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 text-ink-4 animate-spin" />
      </div>
    )
  }

  /* ---- Not found ---- */
  if (!deliverable) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <Link
          href="/dashboard/approvals"
          className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Approvals
        </Link>
        <div className="bg-white rounded-xl border border-ink-6 p-12 text-center">
          <p className="text-ink-3 text-sm">Deliverable not found.</p>
        </div>
      </div>
    )
  }

  /* ---- Derived data ---- */
  const content = deliverable.content || {}
  const caption = content.caption as string | undefined
  const hashtags = (content.hashtags as string[]) || []
  const platform = (content.platform as string) || null
  const scheduledTime = (content.scheduled_time as string) || null
  const status = statusConfig[deliverable.status] || statusConfig.draft
  const typeBadge = typeBadgeColors[deliverable.type] || typeBadgeColors.other
  const typeLabel = typeLabels[deliverable.type] || deliverable.type
  const isPending = deliverable.status === 'client_review'
  const revisionCount = deliverable.version - 1
  const atRevisionLimit = deliverable.version >= REVISION_LIMIT + 1

  return (
    <div className="max-w-3xl mx-auto space-y-5">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : 'bg-red-50 text-red-700 border border-red-200'
          }`}
        >
          {toast.message}
        </div>
      )}

      {/* Back link */}
      <Link
        href="/dashboard/approvals"
        className="inline-flex items-center gap-1.5 text-sm text-ink-3 hover:text-ink transition-colors"
      >
        <ArrowLeft className="w-4 h-4" /> Back to Approvals
      </Link>

      {/* ============================================================ */}
      {/*  Main card                                                    */}
      {/* ============================================================ */}
      <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-ink-6">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h1 className="font-[family-name:var(--font-display)] text-xl text-ink">
                {deliverable.title}
              </h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${typeBadge}`}
                >
                  {typeLabel}
                </span>
                {platform && (
                  <span className="rounded-full px-2.5 py-0.5 text-[11px] font-medium bg-ink-6 text-ink-3 capitalize">
                    {platform.replace('_', ' ')}
                  </span>
                )}
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${status.color}`}
                >
                  {status.label}
                </span>
              </div>
            </div>
            <div className="text-right text-xs text-ink-4 flex-shrink-0">
              <div>v{deliverable.version}</div>
            </div>
          </div>
        </div>

        {/* Content preview */}
        <div className="p-5 space-y-5">
          {/* Description */}
          {deliverable.description && (
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-1.5">
                Description
              </div>
              <p className="text-sm text-ink-2">{deliverable.description}</p>
            </div>
          )}

          {/* Caption */}
          {caption && (
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-1.5">
                Caption
              </div>
              <div className="bg-bg-2 rounded-lg p-3 text-sm text-ink-2 whitespace-pre-wrap">
                {caption}
              </div>
            </div>
          )}

          {/* Hashtags */}
          {hashtags.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-1.5">
                Hashtags
              </div>
              <div className="flex flex-wrap gap-1.5">
                {hashtags.map((h: string) => (
                  <span
                    key={h}
                    className="text-xs bg-ink-6 text-ink-3 px-2 py-0.5 rounded"
                  >
                    #{h}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Preview images */}
          {deliverable.preview_urls && deliverable.preview_urls.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-1.5">
                Preview
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {deliverable.preview_urls.map((url, i) => (
                  <a
                    key={i}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block rounded-lg overflow-hidden border border-ink-6 hover:border-brand transition-colors"
                  >
                    <img
                      src={url}
                      alt={`Preview ${i + 1}`}
                      className="w-full h-32 object-cover"
                    />
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* File attachments */}
          {deliverable.file_urls && deliverable.file_urls.length > 0 && (
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider mb-1.5">
                Attachments
              </div>
              <div className="space-y-1.5">
                {deliverable.file_urls.map((url, i) => {
                  const fileName = url.split('/').pop() || `File ${i + 1}`
                  return (
                    <a
                      key={i}
                      href={url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 bg-bg-2 rounded-lg px-3 py-2 text-sm text-ink-2 hover:bg-ink-6 transition-colors"
                    >
                      <FileText className="w-4 h-4 text-ink-4" />
                      <span className="flex-1 truncate">{fileName}</span>
                      <Download className="w-3.5 h-3.5 text-ink-4" />
                    </a>
                  )
                })}
              </div>
            </div>
          )}

          {/* Meta info */}
          <div className="grid grid-cols-2 gap-4 pt-3 border-t border-ink-6">
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                Created
              </div>
              <div className="text-sm text-ink-2 mt-0.5">
                {new Date(deliverable.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            <div>
              <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                Last Updated
              </div>
              <div className="text-sm text-ink-2 mt-0.5">
                {new Date(deliverable.updated_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </div>
            </div>
            {scheduledTime && (
              <div>
                <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                  Scheduled
                </div>
                <div className="text-sm text-ink-2 mt-0.5 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-ink-4" />
                  {scheduledTime}
                </div>
              </div>
            )}
            {deliverable.approved_at && (
              <div>
                <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                  Approved
                </div>
                <div className="text-sm text-emerald-600 mt-0.5">
                  {new Date(deliverable.approved_at).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Revision counter */}
          <div className="pt-3 border-t border-ink-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
                  Revisions
                </div>
                <div className="text-sm text-ink-2 mt-0.5">
                  Revision {revisionCount} of {REVISION_LIMIT}
                </div>
              </div>
              <div className="w-24 h-1.5 bg-ink-6 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    revisionCount >= REVISION_LIMIT ? 'bg-red-500' : 'bg-brand'
                  }`}
                  style={{
                    width: `${Math.min(
                      (revisionCount / REVISION_LIMIT) * 100,
                      100
                    )}%`,
                  }}
                />
              </div>
            </div>
            {atRevisionLimit && (
              <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  Revision limit reached. Additional revisions are available as an
                  add-on &mdash; message your strategist to add one.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ============================================================ */}
        {/*  Feedback history                                             */}
        {/* ============================================================ */}
        {(deliverable.client_feedback || deliverable.revision_notes) && (
          <div className="border-t border-ink-6 p-5 space-y-3">
            <div className="text-[11px] font-medium text-ink-4 uppercase tracking-wider">
              Feedback History
            </div>
            {deliverable.client_feedback && (
              <div className="bg-red-50 rounded-lg px-3 py-2.5 text-sm">
                <span className="font-medium text-red-700">
                  Client Feedback:
                </span>{' '}
                <span className="text-red-600">
                  {deliverable.client_feedback}
                </span>
              </div>
            )}
            {deliverable.revision_notes && (
              <div className="bg-blue-50 rounded-lg px-3 py-2.5 text-sm">
                <span className="font-medium text-blue-700">
                  Revision Notes:
                </span>{' '}
                <span className="text-blue-600">
                  {deliverable.revision_notes}
                </span>
              </div>
            )}
          </div>
        )}

        {/* GD-4 honesty note: an AI draft made without the brand says so, and
            points at the fix — add the brand, or order a logo if none exists. */}
        {content.source === 'ai-draft' && (() => {
          const bu = (content.brandUsed ?? {}) as { logo?: boolean; color?: boolean }
          if (bu.logo && bu.color) return null
          return (
            <div className="mx-5 mb-4 rounded-lg bg-amber-50 border border-amber-200 px-4 py-3 text-xs text-amber-800 leading-relaxed">
              This draft was made {!bu.logo && !bu.color ? 'without your logo and brand colors' : !bu.logo ? 'without your logo' : 'without your brand colors'}.
              Add them and every future draft matches your brand.{' '}
              <Link href="/dashboard/business-info/brand" className="font-semibold underline">Add your brand →</Link>
              {!bu.logo && (
                <>
                  {' '}· Don&apos;t have a logo?{' '}
                  <Link href="/dashboard/requests?type=logo" className="font-semibold underline">Have one made →</Link>
                </>
              )}
            </div>
          )
        })()}

        {/* ============================================================ */}
        {/*  Action buttons                                               */}
        {/* ============================================================ */}
        {isPending && (
          <div className="border-t border-ink-6 p-5 space-y-4">
            {/* Feedback form */}
            {showFeedback && (
              <div className="space-y-3">
                <div className="text-sm font-medium text-ink">
                  Request Changes
                </div>
                <textarea
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Describe what needs to change..."
                  className="w-full border border-ink-6 rounded-lg p-2.5 text-sm min-h-[100px] focus:outline-none focus:ring-2 focus:ring-brand/30 focus:border-brand resize-none"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleRequestRevision}
                    disabled={!feedbackText.trim() || actionLoading}
                    className="px-4 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    {actionLoading && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    )}
                    Submit Feedback
                  </button>
                  <button
                    onClick={() => {
                      setShowFeedback(false)
                      setFeedbackText('')
                    }}
                    className="px-3 py-2 text-sm text-ink-3 hover:text-ink-2"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Action row */}
            {!showFeedback && (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleApprove}
                  disabled={actionLoading}
                  className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand hover:bg-brand-dark text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  Approve
                </button>
                <button
                  onClick={() => setShowFeedback(true)}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-white border border-ink-6 text-ink-2 text-sm font-medium rounded-lg hover:bg-bg-2 transition-colors"
                >
                  <RotateCcw className="w-4 h-4" /> Request Revision
                </button>
              </div>
            )}

            {/* GD-2: the free-draft to paid-polish ladder. A graphic draft can be
                approved as-is (free) or handed to a designer who starts FROM it. */}
            {!showFeedback && deliverable.type === 'graphic' && (
              <Link
                href={`/dashboard/design/order?draft=${deliverable.id}`}
                className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:text-brand-dark"
              >
                <ImageIcon className="w-4 h-4" /> Have a designer finish this
                <span className="text-ink-3 font-normal">· starts from this draft, priced per piece</span>
              </Link>
            )}
          </div>
        )}

        {/* SO-1: the Send-off — how does this piece get posted? Shown right
            after approval, and on any already-approved postable piece that has
            not chosen yet. */}
        {deliverable && ['graphic', 'video'].includes(deliverable.type)
          && (showSendOff || (deliverable.status === 'approved' && !(deliverable.content as Record<string, unknown>)?.sendOff)) && (
          <SendOffPanel deliverableId={deliverable.id} onDone={() => router.push('/dashboard/approvals')} />
        )}
      </div>
    </div>
  )
}

/* ── SO-1: the Send-off chooser ─────────────────────────────────────────────
   Three lanes, the platform's own language. 'auto' is approval-first: the API
   returns the exact caption + accounts, the owner can edit the caption, and
   nothing is scheduled until their explicit confirm. The choice is remembered
   as their posting preference (changeable on any piece). */
function SendOffPanel({ deliverableId, onDone }: { deliverableId: string; onDone: () => void }) {
  const [busy, setBusy] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [preview, setPreview] = useState<{ caption: string; platforms: string[]; skipped?: { platform: string; reason: string }[] } | null>(null)
  const [caption, setCaption] = useState('')

  const call = async (payload: Record<string, unknown>) => {
    const r = await fetch('/api/deliverables/send-off', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ deliverableId, ...payload }),
    })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'That did not go through. Try again.')
    return d
  }

  const pick = async (lane: 'auto' | 'human' | 'self') => {
    setBusy(lane); setErr(null)
    try {
      if (lane === 'auto') {
        const d = await call({ lane })
        if (d.preview) { setPreview(d.preview); setCaption(d.preview.caption) }
      } else {
        await call({ lane })
        onDone()
        return
      }
    } catch (e) { setErr(e instanceof Error ? e.message : 'That did not go through.') }
    setBusy(null)
  }

  const confirmAuto = async () => {
    setBusy('confirm'); setErr(null)
    try {
      await call({ lane: 'auto', confirm: true, caption })
      onDone()
      return
    } catch (e) { setErr(e instanceof Error ? e.message : 'That did not go through.') }
    setBusy(null)
  }

  return (
    <div className="border-t border-ink-6 p-5">
      <div className="text-sm font-semibold text-ink">How should this get posted?</div>
      <div className="text-xs text-ink-3 mt-0.5 mb-3">We&apos;ll remember your choice. You can pick differently on any piece.</div>
      {err && <div className="text-xs text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-3">{err}</div>}
      {!preview ? (
        <div className="flex flex-col gap-2">
          <button onClick={() => pick('auto')} disabled={busy !== null}
            className="text-left px-4 py-3 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
            {busy === 'auto' ? 'Writing the caption…' : 'Post it for me'}
            <span className="block text-xs font-normal opacity-85 mt-0.5">We write the caption, you confirm, it posts to your connected accounts.</span>
          </button>
          <button onClick={() => pick('human')} disabled={busy !== null}
            className="text-left px-4 py-3 rounded-lg bg-white border border-ink-6 text-ink text-sm font-medium disabled:opacity-50">
            Have someone post it
            <span className="block text-xs font-normal text-ink-3 mt-0.5">Your team handles the caption, timing, and posting.</span>
          </button>
          <button onClick={() => pick('self')} disabled={busy !== null}
            className="text-left px-4 py-3 rounded-lg bg-white border border-ink-6 text-ink text-sm font-medium disabled:opacity-50">
            I&apos;ll post it myself
            <span className="block text-xs font-normal text-ink-3 mt-0.5">Download the files above and post whenever you like.</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="text-xs font-semibold text-ink-2 uppercase tracking-wide">Your caption — edit anything</div>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)}
            className="w-full border border-ink-6 rounded-lg p-2.5 text-sm min-h-[90px] focus:outline-none focus:ring-2 focus:ring-brand/30" />
          <div className="text-xs text-ink-3">Posting to: <span className="font-medium text-ink-2 capitalize">{preview.platforms.join(', ')}</span></div>
          {(preview.skipped ?? []).map((sk) => (
            <div key={sk.platform} className="text-xs text-amber-800 bg-amber-50 rounded-lg px-3 py-2">
              <span className="capitalize font-medium">{sk.platform}</span>: {sk.reason}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <button onClick={confirmAuto} disabled={busy !== null || !caption.trim()}
              className="px-5 py-2.5 rounded-lg bg-brand text-white text-sm font-medium disabled:opacity-50">
              {busy === 'confirm' ? 'Scheduling…' : 'Post it'}
            </button>
            <button onClick={() => { setPreview(null); setErr(null) }} className="px-3 py-2 text-sm text-ink-3">Back</button>
          </div>
        </div>
      )}
    </div>
  )
}


/* MVP port (owner ask 2026-08-19): the approvals surfaces were pre-redesign
 * survivors — desktop-era layout with no shell. Wrapping every render path in
 * MvpShell gives them the standard header, phone frame, and bottom nav without
 * re-plumbing any of the working actions. */
export default function ApprovalDetailPage() {
  return (
    <MvpShell active="inbox" header={<MvpDetailHeader title="Review" subtitle="Approve, request changes, or send it off" backHref="/dashboard/approvals" backLabel="Approvals" />}>
      <div style={{ background: '#f5f5f7', minHeight: '100%', padding: '14px 14px 28px', boxSizing: 'border-box' }}>
        <ApprovalDetailPageInner />
      </div>
    </MvpShell>
  )
}
