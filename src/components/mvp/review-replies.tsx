'use client'

/**
 * ReviewReplies — the owner-run walkthrough for replying to Google reviews.
 *
 * Same shape as the order-button fixer and the profile fixer: read what is true, one
 * decision per screen, nothing posts without a yes, and the end shows what actually
 * happened. It shares their look through walkthrough-kit.
 *
 * One thing makes this card different from the other two, and the copy has to respect it:
 * REPLYING NEVER FINISHES. Fixing a phone number is done forever. New reviews arrive every
 * week. So the promise here is "caught up on what is waiting", never "solved", and the
 * done screen says what is still open rather than implying a clean slate.
 *
 *   1 look    how many are waiting, how bad, how long they have sat
 *   2 reply   one review at a time, worst first, with a draft to edit
 *   3 done    what posted, and what is still open
 */

import { useCallback, useEffect, useState } from 'react'
import { Check, Loader2, Star, AlertCircle } from 'lucide-react'
import {
  C, Panel, Progress, H, Fine, Section, Note, Bad, Loading, Next, Nav, Chip, SaysLabel,
} from './walkthrough-kit'

interface Queued { id: string; rating: number | null; author: string; text: string; postedAt: string | null; waitingDays: number | null }
interface QueueRead {
  queue: Queued[]
  total: number; replied: number; critical: number
  longestWaitDays: number | null; unreachable: number; average: number | null
  headline: string
}

const STEPS = ['Look', 'Reply', 'Done'] as const

/** Google's own tones, as the draft route names them. Which one leads is set by the stars,
 *  because the right opening for a one-star is not the right opening for a five. */
const TONES = ['thankful', 'professional', 'short', 'winback'] as const
type Tone = typeof TONES[number]
function defaultTone(rating: number | null): Tone {
  if ((rating ?? 5) <= 2) return 'winback'
  if ((rating ?? 5) === 3) return 'professional'
  return 'thankful'
}

export default function ReviewReplies({ campaignId }: { campaignId?: string }) {
  const [read, setRead] = useState<QueueRead | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [step, setStep] = useState(0)

  const [i, setI] = useState(0)
  const [draft, setDraft] = useState('')
  const [tone, setTone] = useState<Tone>('thankful')
  const [drafting, setDrafting] = useState(false)
  const [draftFailed, setDraftFailed] = useState(false)
  const [posting, setPosting] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  /** What actually happened, kept per review so the done screen reports rather than assumes. */
  const [posted, setPosted] = useState<string[]>([])
  const [skipped, setSkipped] = useState<string[]>([])

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/reviews/queue')
      const body = await res.json()
      if (!res.ok) { setLoadError(body?.error ?? 'Could not read your reviews.'); return }
      setRead(body as QueueRead)
    } catch { setLoadError('Could not read your reviews.') }
  }, [])
  useEffect(() => { void load() }, [load])

  const current = read?.queue[i] ?? null

  /** Draft for whichever review is on screen. The AI can be down (no credits, a timeout), and
   *  when it is, the owner still gets an empty box they can type in rather than a dead screen.
   *  A blank draft is a worse product, not a broken one, and the difference is worth saying. */
  const drawDraft = useCallback(async (reviewId: string, t: Tone) => {
    setDrafting(true); setDraftFailed(false)
    try {
      const res = await fetch('/api/dashboard/reviews/draft', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reviewId, tone: t }),
      })
      const body = await res.json()
      if (res.ok && typeof body?.reply === 'string' && body.reply.trim()) setDraft(body.reply.trim())
      else setDraftFailed(true)
    } catch { setDraftFailed(true) } finally { setDrafting(false) }
  }, [])

  // Entering a review: pick its tone from the stars and draft once.
  useEffect(() => {
    if (step !== 1 || !current) return
    const t = defaultTone(current.rating)
    setTone(t); setDraft(''); setErr(null)
    void drawDraft(current.id, t)
  }, [step, current, drawDraft])

  function advance(from: 'posted' | 'skipped') {
    if (!current) return
    if (from === 'posted') setPosted((p) => [...p, current.id])
    else setSkipped((s) => [...s, current.id])
    const next = i + 1
    if (next >= (read?.queue.length ?? 0)) { setStep(2); void finish() } else setI(next)
  }

  async function post() {
    if (!current || !draft.trim()) return
    setPosting(true); setErr(null)
    try {
      const res = await fetch(`/api/dashboard/reviews/${current.id}/reply`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ replyText: draft.trim() }),
      })
      const body = await res.json()
      if (!res.ok) { setErr(body?.error ?? 'That did not post. Your team was told.'); return }
      advance('posted')
    } catch { setErr('That did not post. Your team was told.') } finally { setPosting(false) }
  }

  /** Ask the server to re-check and stamp. It only stamps when nothing is waiting, so a pass
   *  where the owner skipped half leaves the task open, which is the truth. */
  async function finish() {
    if (!campaignId) return
    try { await fetch(`/api/campaigns/${campaignId}/reviews-caught-up`, { method: 'POST' }) } catch { /* the stamp is not the work */ }
  }

  if (loadError) return <Panel><Bad>{loadError}</Bad></Panel>
  if (!read) return <Panel><Loading>Reading your reviews…</Loading></Panel>

  return (
    <Panel>
      <Progress steps={STEPS} step={step} />

      {/* 1 ── what is waiting. Counted from the same rows the queue is built from. */}
      {step === 0 && (
        <>
          <H>{read.headline}</H>

          {read.queue.length > 0 && (
            <Section title="Waiting on you">
              <Stat label="No reply yet" value={String(read.queue.length)} />
              {read.critical > 0 && <Stat label="3 stars or below" value={String(read.critical)} warn />}
              {read.longestWaitDays != null && <Stat label="Longest wait" value={`${read.longestWaitDays} days`} warn={read.longestWaitDays > 30} />}
              {read.average != null && <Stat label="Your rating" value={`${read.average} of 5`} />}
            </Section>
          )}

          {read.unreachable > 0 && (
            <Note>
              {read.unreachable} more {read.unreachable === 1 ? 'review has' : 'reviews have'} no reply, but Google
              did not give us an address to post to. Those have to be answered on Google itself.
            </Note>
          )}

          <Fine>Reviews sync once a day, so anything you answered on Google directly may still show here until tomorrow.</Fine>

          {read.queue.length > 0
            ? <Next onClick={() => { setI(0); setStep(1) }}>Start with the worst</Next>
            : <Fine style={{ textAlign: 'center', marginTop: 8 }}>Nothing to do here today.</Fine>}
        </>
      )}

      {/* 2 ── one review, one reply. Worst first. */}
      {step === 1 && current && (
        <>
          <Fine style={{ marginBottom: 6 }}>{i + 1} of {read.queue.length}</Fine>
          <ReviewCard r={current} />

          <div style={{ background: C.greenSoft, borderRadius: 14, padding: '13px 14px', marginBottom: 12 }}>
            <SaysLabel generic={draftFailed} />
            {drafting
              ? <Loading>Writing a reply…</Loading>
              : (
                <>
                  {draftFailed && <Fine>We could not draft this one. Write it yourself and it posts the same way.</Fine>}
                  <textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={5}
                    placeholder="Your reply"
                    style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `1px solid ${C.line}`, padding: '11px 12px', fontSize: 14, color: C.ink, font: 'inherit', lineHeight: 1.5, resize: 'vertical', background: '#fff' }} />
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 9 }}>
                    {TONES.map((t) => (
                      <button key={t} type="button" onClick={() => { setTone(t); void drawDraft(current.id, t) }}
                        style={{
                          border: 'none', borderRadius: 8, padding: '5px 10px', fontSize: 12, fontWeight: 600, font: 'inherit', cursor: 'pointer',
                          background: t === tone ? C.greenDk : '#fff', color: t === tone ? '#fff' : C.mute,
                        }}>{TONE_WORDS[t]}</button>
                    ))}
                  </div>
                  <Fine style={{ margin: '8px 0 0' }}>Edit anything. Nothing posts until you tap below.</Fine>
                </>
              )}
          </div>

          {err && <Bad>{err}</Bad>}

          <Nav onBack={() => (i === 0 ? setStep(0) : setI(i - 1))}>
            <Next onClick={() => void post()} disabled={posting || drafting || !draft.trim()}>
              {posting ? <><Loader2 size={14} className="mvp-spin" /> Posting…</> : 'Post to Google'}
            </Next>
          </Nav>
          {/* Skipping is real: some reviews are spam, or want a phone call instead. It is not
              "skip for now" on a required step, it is a decision about this one review. */}
          <button type="button" onClick={() => advance('skipped')} disabled={posting}
            style={{ display: 'block', width: '100%', background: 'none', border: 'none', cursor: 'pointer', font: 'inherit', fontSize: 13, fontWeight: 600, color: C.mute, marginTop: 10 }}>
            Leave this one for now
          </button>
        </>
      )}

      {/* 3 ── what actually happened. */}
      {step === 2 && (
        <>
          <H>{posted.length > 0 ? `${posted.length} ${posted.length === 1 ? 'reply is' : 'replies are'} live on Google` : 'Nothing posted'}</H>
          <div style={{ background: posted.length ? C.greenSoft : C.amberSoft, borderRadius: 13, padding: 13, marginBottom: 14 }}>
            <Line ok label={`${posted.length} posted`} />
            {skipped.length > 0 && <Line label={`${skipped.length} left for later`} />}
          </div>
          {skipped.length > 0
            ? <Fine>The ones you left are still waiting. They will be here whenever you come back.</Fine>
            : <Fine>You are caught up. New reviews will show up here as they come in.</Fine>}
          <Section title="Worth knowing">
            <Fine>Replying to reviews is never finished. This card stays open so you can come back each time a few pile up.</Fine>
          </Section>
        </>
      )}
    </Panel>
  )
}

const TONE_WORDS: Record<Tone, string> = {
  thankful: 'Warm', professional: 'Straight', short: 'Short', winback: 'Win them back',
}

function ReviewCard({ r }: { r: Queued }) {
  const stars = r.rating ?? 0
  return (
    <div style={{ border: `1px solid ${C.line}`, borderRadius: 13, padding: 13, marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
        <span style={{ display: 'flex', gap: 1 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <Star key={n} size={13} color={n <= stars ? C.amber : C.line} fill={n <= stars ? C.amber : 'none'} />
          ))}
        </span>
        <span style={{ fontSize: 13.5, fontWeight: 650, color: C.ink }}>{r.author}</span>
        {r.waitingDays != null && <Chip tone="ink">{r.waitingDays === 0 ? 'today' : `${r.waitingDays} days ago`}</Chip>}
      </div>
      <div style={{ fontSize: 13.5, color: C.mute, lineHeight: 1.55 }}>{r.text || 'They left stars but no words.'}</div>
    </div>
  )
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: warn ? C.amber : C.green, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, flex: 1 }}>{label}</span>
      <span style={{ fontSize: 13.5, color: C.mute }}>{value}</span>
    </div>
  )
}

function Line({ ok, label }: { ok?: boolean; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13.5, color: C.ink, padding: '3px 0' }}>
      {ok ? <Check size={13} color={C.greenDk} /> : <AlertCircle size={13} color={C.amber} />} {label}
    </div>
  )
}
