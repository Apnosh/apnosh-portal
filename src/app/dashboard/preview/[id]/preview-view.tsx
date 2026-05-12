'use client'

import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  CheckCircle2, ArrowLeft, Loader2, AlertCircle, Calendar, Sparkles, MessageSquare,
} from 'lucide-react'

interface Props {
  draftId: string
  idea: string
  caption: string
  hashtags: string[]
  status: string
  platforms: string[]
  targetPublishDate: string | null
  approvedAt: string | null
  clientSignedOffAt: string | null
}

export default function PreviewView({
  draftId, idea, caption, hashtags, status, platforms, targetPublishDate,
  approvedAt, clientSignedOffAt,
}: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<null | 'approve' | 'revise'>(null)
  const [error, setError] = useState<string | null>(null)
  const [signedOff, setSignedOff] = useState<string | null>(clientSignedOffAt)
  const [reviseNote, setReviseNote] = useState('')
  const [showRevise, setShowRevise] = useState(false)

  const approve = useCallback(async () => {
    setBusy('approve'); setError(null)
    try {
      const res = await fetch(`/api/dashboard/drafts/${draftId}/sign-off`, { method: 'POST' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      const j = await res.json()
      setSignedOff(j.signedOffAt ?? new Date().toISOString())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [draftId])

  const requestRevise = useCallback(async () => {
    if (!reviseNote.trim()) {
      setError('Tell us what to change so we can revise.')
      return
    }
    setBusy('revise'); setError(null)
    try {
      const res = await fetch(`/api/dashboard/drafts/${draftId}/revise-request`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ note: reviseNote.trim() }),
      })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error ?? `HTTP ${res.status}`)
      }
      router.push('/dashboard/inbox')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed')
    } finally {
      setBusy(null)
    }
  }, [draftId, reviseNote, router])

  const platformsLabel = platforms.length > 0 ? platforms.join(' · ') : 'Instagram'
  const isSignedOff = !!signedOff

  return (
    <div className="max-w-2xl mx-auto py-6 px-4">
      <Link href="/dashboard/inbox" className="inline-flex items-center gap-1 text-[12px] text-ink-3 hover:text-ink mb-4">
        <ArrowLeft className="w-3.5 h-3.5" /> Back to inbox
      </Link>

      <header className="mb-6">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-1.5 inline-flex items-center gap-1.5">
          <Sparkles className="w-3 h-3" /> Ready for your review
        </p>
        <h1 className="text-[22px] font-bold text-ink leading-tight tracking-tight">{idea || 'Content draft'}</h1>
        <p className="text-[12px] text-ink-3 mt-1.5">
          {platformsLabel}
          {targetPublishDate && (
            <>
              <span className="text-ink-5 mx-1.5">·</span>
              <span className="inline-flex items-center gap-1">
                <Calendar className="w-3 h-3" /> {new Date(targetPublishDate).toLocaleDateString()}
              </span>
            </>
          )}
        </p>
      </header>

      {/* Caption preview */}
      <section className="bg-white rounded-2xl ring-1 ring-ink-6 p-5 mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 mb-2">Caption</p>
        <p className="text-[14px] text-ink leading-relaxed whitespace-pre-wrap">{caption || <span className="text-ink-4 italic">Working on the words…</span>}</p>
        {hashtags.length > 0 && (
          <p className="text-[13px] text-ink-3 mt-3 leading-relaxed">
            {hashtags.map(h => h.startsWith('#') ? h : '#' + h).join(' ')}
          </p>
        )}
      </section>

      {isSignedOff ? (
        <div className="rounded-2xl bg-emerald-50 ring-1 ring-emerald-200 p-4 text-center">
          <CheckCircle2 className="w-6 h-6 text-emerald-700 mx-auto mb-2" />
          <p className="text-[14px] font-semibold text-emerald-900">You signed off on this.</p>
          <p className="text-[12px] text-emerald-800 mt-1">Your team will schedule and publish it shortly.</p>
        </div>
      ) : (
        <>
          {error && (
            <div className="mb-3 flex items-start gap-1.5 text-[12px] text-red-700">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {!showRevise ? (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <button onClick={approve} disabled={busy !== null}
                className="flex-1 text-[14px] font-semibold px-4 py-3 rounded-xl bg-brand text-white hover:bg-brand-dark disabled:opacity-50 inline-flex items-center justify-center gap-2">
                {busy === 'approve' ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                Looks good — schedule it
              </button>
              <button onClick={() => setShowRevise(true)} disabled={busy !== null}
                className="text-[14px] font-medium px-4 py-3 rounded-xl ring-1 ring-ink-6 text-ink-2 hover:bg-ink-7 disabled:opacity-50 inline-flex items-center justify-center gap-2">
                <MessageSquare className="w-4 h-4" />
                Request changes
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-2xl ring-1 ring-amber-200 p-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-800 mb-2">What needs to change?</p>
              <textarea
                value={reviseNote}
                onChange={e => setReviseNote(e.target.value)}
                rows={4}
                placeholder="A sentence or two about the tone, angle, or specifics. Your team will rework it."
                className="w-full text-[13px] p-2.5 rounded-lg ring-1 ring-ink-6 focus:ring-amber-500 focus:outline-none resize-y leading-relaxed"
              />
              <div className="mt-3 flex items-center gap-2">
                <button onClick={requestRevise} disabled={busy !== null}
                  className="text-[12px] font-semibold px-3 py-1.5 rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50 inline-flex items-center gap-1.5">
                  {busy === 'revise' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  Send back to team
                </button>
                <button onClick={() => setShowRevise(false)} className="text-[12px] text-ink-3 hover:text-ink px-2 py-1.5">Cancel</button>
              </div>
            </div>
          )}
        </>
      )}

      {approvedAt && (
        <p className="text-[10px] text-ink-4 text-center mt-4">
          Approved internally {new Date(approvedAt).toLocaleString()}
        </p>
      )}

      {/* Reference status so it's not unused if the layout changes */}
      <p className="sr-only">Status: {status}</p>
    </div>
  )
}
