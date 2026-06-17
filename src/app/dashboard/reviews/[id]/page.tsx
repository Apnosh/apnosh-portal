'use client'

/**
 * Owner review page — the full review + an AI-assisted reply. Reached from the
 * Notifications feed (a review row links here instead of expanding inline).
 * Loads one review (/api/dashboard/reviews/[id]), drafts a reply with a real
 * model call (/api/dashboard/reviews/draft), and posts it (replyToReview).
 * Renders its own full-screen frame (back header), like the campaign detail.
 */
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { ChevronLeft, Star, Sparkles, Loader2, Check, Send } from 'lucide-react'
import { replyToReview } from '@/app/dashboard/inbox/actions'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', ink2: '#3a3a3c', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7', preview: '#f4f5f6',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const GRAD = 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)'

interface ReviewData { id: string; author: string; rating: number; text: string; source: string; postedAt: string | null; responseText: string | null; respondedAt: string | null }

const TONES = [
  { key: 'friendly', label: 'Friendly' },
  { key: 'apologetic', label: 'Make it right' },
  { key: 'professional', label: 'Professional' },
  { key: 'short', label: 'Short' },
]

function sourceLabel(s: string) { return s === 'instagram' ? 'Instagram' : s === 'yelp' ? 'Yelp' : s === 'facebook' ? 'Facebook' : 'Google' }
function fmtDate(iso: string | null) { return iso ? new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '' }

export default function ReviewPage() {
  const params = useParams()
  const router = useRouter()
  const id = String(params?.id ?? '')

  const [review, setReview] = useState<ReviewData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [text, setText] = useState('')
  const [tone, setTone] = useState('friendly')
  const [drafting, setDrafting] = useState(false)
  const [draftErr, setDraftErr] = useState<string | null>(null)
  const [posting, setPosting] = useState(false)
  const [postErr, setPostErr] = useState<string | null>(null)
  const [posted, setPosted] = useState(false)

  useEffect(() => {
    let live = true
    fetch(`/api/dashboard/reviews/${id}`)
      .then(async (r) => { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || `Load failed (${r.status})`); return r.json() })
      .then((j: { review: ReviewData }) => {
        if (!live) return
        setReview(j.review)
        if (j.review.responseText) { setText(j.review.responseText); setPosted(true) }
      })
      .catch((e) => { if (live) setError(e.message) })
    return () => { live = false }
  }, [id])

  const draft = async () => {
    if (drafting) return
    setDraftErr(null); setDrafting(true)
    try {
      const res = await fetch('/api/dashboard/reviews/draft', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reviewId: id, tone }) })
      const j = await res.json().catch(() => ({}))
      if (res.ok && j.reply) { setText(j.reply); setPosted(false) }
      else setDraftErr(j.error || 'Could not write a reply. Try again.')
    } catch { setDraftErr('Network problem. Try again.') }
    setDrafting(false)
  }
  const post = async () => {
    if (!text.trim() || posting) return
    setPostErr(null); setPosting(true)
    try {
      const res = await replyToReview(id, text.trim())
      if (res.ok) setPosted(true)
      else setPostErr(res.error || 'Could not post your reply. Try again.')
    } catch { setPostErr('Could not post your reply. Try again.') }
    setPosting(false)
  }

  const tone6 = review ? ['#4abd98', '#a85c3c', '#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b'][(review.author.charCodeAt(0) || 0) % 6] : C.green

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 60, background: '#f0f0f3', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 480, background: '#fff', display: 'flex', flexDirection: 'column', height: '100dvh', overflow: 'hidden', boxShadow: '0 0 40px rgba(0,0,0,0.06)' }}>
        {/* header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 6, padding: '12px 12px 12px 6px', borderBottom: `0.5px solid ${C.line}` }}>
          <button onClick={() => { if (typeof window !== 'undefined' && window.history.length > 1) router.back(); else router.push('/dashboard/inbox?tab=reviews') }} aria-label="Back" style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', background: 'none', color: C.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><ChevronLeft size={24} /></button>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18 }}>Review</div>
        </div>

        {error ? (
          <Centered>Couldn&apos;t load this review: {error}</Centered>
        ) : !review ? (
          <Centered><Loader2 size={16} className="animate-spin" /> Loading…</Centered>
        ) : (
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 18px calc(24px + env(safe-area-inset-bottom))' }}>
            {/* reviewer */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 52, height: 52, borderRadius: '50%', background: tone6, color: '#fff', fontWeight: 700, fontSize: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{review.author.charAt(0).toUpperCase()}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 16.5, color: C.ink }}>{review.author}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 3 }}>
                  <Stars n={review.rating} />
                  <span style={{ fontSize: 12, color: C.faint }}>{sourceLabel(review.source)}{review.postedAt ? ` · ${fmtDate(review.postedAt)}` : ''}</span>
                </div>
              </div>
            </div>

            {/* full review text */}
            <div style={{ marginTop: 14, background: C.preview, borderRadius: 14, padding: '14px 15px', fontSize: 14.5, color: C.ink, lineHeight: 1.55, whiteSpace: 'pre-wrap' }}>
              {review.text || <span style={{ color: C.faint }}>No written comment, just a {review.rating}-star rating.</span>}
            </div>

            {/* reply */}
            <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17 }}>Your reply</div>
              {posted && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, fontWeight: 700, color: C.greenDk, background: C.greenSoft, borderRadius: 99, padding: '5px 11px' }}><Check size={13} /> Posted</span>}
            </div>

            {/* tone chips */}
            <div style={{ display: 'flex', gap: 8, marginTop: 12, overflowX: 'auto', paddingBottom: 2 }} className="rev-x">
              {TONES.map((t) => (
                <button key={t.key} onClick={() => setTone(t.key)} style={{ flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${tone === t.key ? C.green : '#d8d8de'}`, background: tone === t.key ? C.greenSoft : '#fff', color: tone === t.key ? C.greenDk : C.ink2, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>{t.label}</button>
              ))}
            </div>

            <button onClick={draft} disabled={drafting} style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: `1.5px solid ${C.green}`, background: C.greenSoft, color: C.greenDk, borderRadius: 12, padding: '12px', fontWeight: 700, fontSize: 14, cursor: drafting ? 'default' : 'pointer' }}>
              {drafting ? <><Loader2 size={16} className="animate-spin" /> Writing a reply…</> : <><Sparkles size={16} /> {text.trim() ? 'Redraft for me' : 'Draft a reply for me'}</>}
            </button>
            {draftErr && <div style={{ fontSize: 12.5, color: '#c0564f', marginTop: 8 }}>{draftErr}</div>}

            <textarea
              value={text}
              onChange={(e) => { setText(e.target.value); if (posted) setPosted(false) }}
              placeholder="Write your reply, or let us draft one above…"
              rows={7}
              style={{ width: '100%', marginTop: 12, border: `1px solid ${C.line}`, borderRadius: 14, padding: 14, fontSize: 14.5, color: C.ink, fontFamily: 'inherit', resize: 'vertical', boxSizing: 'border-box', lineHeight: 1.5, outline: 'none' }}
            />

            <button onClick={post} disabled={!text.trim() || posting} style={{ marginTop: 12, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, border: 'none', background: text.trim() ? GRAD : '#e3e9e6', color: '#fff', borderRadius: 12, padding: '14px', fontWeight: 700, fontSize: 15, cursor: text.trim() && !posting ? 'pointer' : 'default' }}>
              {posting ? <Loader2 size={17} className="animate-spin" /> : <Send size={17} />}{posted ? 'Update reply' : 'Post reply'}
            </button>
            {postErr && <div style={{ fontSize: 12.5, color: '#c0564f', textAlign: 'center', marginTop: 10 }}>{postErr}</div>}
            <div style={{ fontSize: 11.5, color: C.faint, textAlign: 'center', marginTop: 10, lineHeight: 1.45 }}>
              Your reply is recorded here. Posting it publicly to {sourceLabel(review.source)} is coming soon.
            </div>
          </div>
        )}
        <style>{`.rev-x{scrollbar-width:none}.rev-x::-webkit-scrollbar{display:none}`}</style>
      </div>
    </div>
  )
}

function Centered({ children }: { children: React.ReactNode }) {
  return <div style={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: C.faint, fontSize: 13.5, padding: 24, textAlign: 'center', fontFamily: "'Inter',system-ui,sans-serif" }}>{children}</div>
}
function Stars({ n }: { n: number }) {
  return <span style={{ display: 'inline-flex', gap: 1.5 }}>{[1, 2, 3, 4, 5].map((i) => <Star key={i} size={15} color={i <= n ? '#f5a623' : '#dfe3e1'} fill={i <= n ? '#f5a623' : 'none'} />)}</span>
}
