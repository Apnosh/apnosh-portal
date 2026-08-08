'use client'

/**
 * THE REQUEST DESK — ask us for anything (creative requests, owner side).
 *
 * The design order generalized: one desk where an owner asks for any marketing work.
 * Request first, quote later: nothing here shows or charges a price. The team reads
 * every request and answers with a plan and a real number in the owner's inbox.
 *
 * The asking is a WALK, not a form (same idea as the campaign walk and the Drafting
 * Table): one question per screen, big tap targets, and THE BRIEF building visibly
 * below as every answer inks onto it. The review screen is the finished brief plus
 * the $0 receipt, sealed with the press-and-hold stamp.
 *
 * Visual language is the Strategist's Desk kit (desk/ui.tsx). All statuses come from
 * the catalog (STATUS_LABEL / STATUS_OWNER_LINE).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Palette, BookOpen, Sparkles, Globe, Clapperboard, Camera, Share2, Mail,
  Megaphone, Printer, PenLine, MessageCircle, ChevronRight, ChevronLeft, type LucideIcon,
} from 'lucide-react'
import {
  DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule,
  SealButton, PlanSheet, type PlanSheetLine,
} from '@/components/campaigns/desk/ui'
import {
  REQUEST_TYPES, questionsFor, STATUS_LABEL, STATUS_OWNER_LINE, requestTypeById,
  type RequestType, type RequestTypeId, type RequestAnswers, type RequestStatus, type RequestQuestion,
} from '@/lib/requests/catalog'

const TYPE_ICONS: Record<RequestTypeId, LucideIcon> = {
  graphic: Palette, menu: BookOpen, logo: Sparkles, website: Globe, video: Clapperboard,
  photos: Camera, social: Share2, email: Mail, ads: Megaphone, print: Printer,
  copy: PenLine, other: MessageCircle,
}

interface RequestRow {
  id: string
  type: string
  brief: RequestAnswers
  status: RequestStatus
  team_note: string | null
  created_at: string
}

const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

const STATUS_TONE: Record<RequestStatus, { fg: string; bg: string }> = {
  requested: { fg: DESK.ink2, bg: '#EFEDE6' },
  in_review: { fg: DESK.ink2, bg: '#EFEDE6' },
  quoted: { fg: DESK.mintDeep, bg: DESK.mintWash },
  in_progress: { fg: DESK.mintDeep, bg: DESK.mintWash },
  delivered: { fg: DESK.mintDeep, bg: DESK.mintWash },
  closed: { fg: DESK.mute, bg: '#EFEDE6' },
  declined: { fg: DESK.amber, bg: DESK.amberWash },
}

export default function RequestFlow() {
  const [view, setView] = useState<'hub' | 'form' | 'done'>('hub')
  const [type, setType] = useState<RequestType | null>(null)
  const [answers, setAnswers] = useState<RequestAnswers>({})
  const [step, setStep] = useState(0)
  const [mine, setMine] = useState<RequestRow[]>([])
  const [loadingMine, setLoadingMine] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)

  const loadMine = useCallback(async () => {
    try {
      const r = await fetch('/api/requests')
      const d = await r.json().catch(() => ({}))
      setMine(Array.isArray(d.requests) ? d.requests : [])
    } catch {
      setMine([])
    }
    setLoadingMine(false)
  }, [])
  useEffect(() => { loadMine() }, [loadMine])

  /* Deep link: a Creatives-shelf card arrives as /dashboard/requests?type=<id> and lands
   * straight on that type's first question. An unknown type falls back to the hub, calmly. */
  useEffect(() => {
    const wanted = new URLSearchParams(window.location.search).get('type')
    const t = wanted ? requestTypeById(wanted) : null
    if (t) { setType(t); setAnswers({}); setStep(0); setView('form') }
  }, [])

  const start = (t: RequestType) => { setType(t); setAnswers({}); setStep(0); setError(null); setView('form') }
  const setA = (id: string, val: string) => setAnswers((a) => ({ ...a, [id]: val }))

  const qs = type ? questionsFor(type) : []
  const onReview = step >= qs.length
  const q: RequestQuestion | null = onReview ? null : qs[step] ?? null
  const missing = qs.filter((x) => !x.optional && !(answers[x.id] ?? '').trim())
  const canSend = type !== null && missing.length === 0

  const advance = () => setStep((s) => Math.min(s + 1, qs.length))
  const goBack = () => {
    if (step === 0) { setView('hub'); setType(null) } else setStep((s) => s - 1)
  }

  async function send() {
    if (!type || sending) return
    setSending(true)
    setError(null)
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: type.id, answers }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) throw new Error(typeof d.error === 'string' ? d.error : 'Could not send. Try again.')
      setView('done')
      loadMine()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send. Try again.')
    }
    setSending(false)
  }

  const label = { fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: DESK.mute }
  const inputStyle = {
    width: '100%', padding: '13px 15px', borderRadius: 13, border: `1.5px solid ${DESK.line}`,
    background: DESK.card, fontFamily: DESK.body, fontSize: 15, color: DESK.ink, outline: 'none',
  }

  /* THE BRIEF: answered questions ink in, the rest wait as ghosts. Shown under every
   * question and complete on the review screen — the walk's live artboard. */
  const briefLines = (strong: boolean): PlanSheetLine[] =>
    qs.map((x) => {
      const val = (answers[x.id] ?? '').trim()
      if (!val) return { text: x.prompt, ghost: true }
      return { text: `${x.prompt}  ·  ${val.length > 60 ? `${val.slice(0, 60)}...` : val}`, strong }
    })

  /* ── DONE: the sent stamp ─────────────────────────────────────────────────────────── */
  if (view === 'done' && type) {
    return (
      <div style={{ ...paperGround, minHeight: '100dvh', padding: '48px 18px 40px', textAlign: 'center' }}>
        <DeskKeyframes />
        <div style={{ marginTop: 40 }}><Stamp mint>Request sent</Stamp></div>
        <h1 style={{ fontFamily: DESK.disp, fontSize: 22, color: DESK.ink, margin: '26px 0 8px' }}>
          The team has {type.noun}.
        </h1>
        <p style={{ fontFamily: DESK.body, fontSize: 14, color: DESK.ink2, lineHeight: 1.55, maxWidth: 320, margin: '0 auto' }}>
          A real person reads every request. You will get a plan and a price in your inbox. No charge until you say yes.
        </p>
        <button
          type="button"
          onClick={() => { setView('hub'); setType(null); setAnswers({}); setStep(0) }}
          style={{
            marginTop: 28, padding: '13px 26px', borderRadius: 999, border: 'none', cursor: 'pointer',
            background: DESK.grad, color: '#fff', fontFamily: DESK.disp, fontWeight: 700, fontSize: 14.5,
          }}
        >
          Back to the desk
        </button>
      </div>
    )
  }

  /* ── FORM: the walk — one question per screen, the brief inking in below ──────────── */
  if (view === 'form' && type) {
    const Icon = TYPE_ICONS[type.id]
    return (
      <div style={{ ...paperGround, minHeight: '100dvh', padding: '14px 16px 120px' }}>
        <DeskKeyframes />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button
            type="button"
            onClick={goBack}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: DESK.ink2, fontFamily: DESK.body, fontSize: 13.5, padding: '6px 4px' }}
          >
            <ChevronLeft size={16} /> {step === 0 ? 'All requests' : 'Back'}
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: DESK.body, fontSize: 12.5, fontWeight: 600, color: DESK.ink2 }}>
            <Icon size={14} style={{ color: DESK.mintDeep }} /> {type.label}
          </span>
        </div>

        {!onReview && q ? (
          /* ── one question, big and alone ── */
          <div key={q.id} className="dk-ink">
            <div style={{ ...label, margin: '18px 2px 6px' }}>
              Question {step + 1} of {qs.length}{q.optional ? '  ·  optional' : ''}
            </div>
            <h1 style={{ fontFamily: DESK.disp, fontSize: 23, color: DESK.ink, margin: '0 0 18px', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
              {q.prompt}
            </h1>

            {q.kind === 'choice' ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {(q.options ?? []).map((opt) => (
                  <Ticket
                    key={opt}
                    name={opt}
                    on={answers[q.id] === opt}
                    onClick={() => { setA(q.id, opt); setTimeout(advance, 170) }}
                  />
                ))}
              </div>
            ) : (
              <>
                {q.kind === 'long' ? (
                  <textarea
                    autoFocus
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setA(q.id, e.target.value)}
                    placeholder={q.hint}
                    rows={4}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 100 }}
                  />
                ) : (
                  <input
                    autoFocus
                    value={answers[q.id] ?? ''}
                    onChange={(e) => setA(q.id, e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && ((answers[q.id] ?? '').trim() || q.optional)) advance() }}
                    placeholder={q.hint}
                    style={inputStyle}
                  />
                )}
                <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                  <button
                    type="button"
                    disabled={!((answers[q.id] ?? '').trim() || q.optional)}
                    onClick={advance}
                    style={{
                      flex: 1, padding: '13px 0', borderRadius: 13, border: 'none',
                      cursor: 'pointer', background: DESK.grad, color: '#fff',
                      fontFamily: DESK.disp, fontWeight: 700, fontSize: 15,
                      opacity: (answers[q.id] ?? '').trim() || q.optional ? 1 : 0.45,
                    }}
                  >
                    Next
                  </button>
                  {q.optional && (answers[q.id] ?? '').trim() === '' && (
                    <button
                      type="button"
                      onClick={advance}
                      style={{ padding: '13px 18px', borderRadius: 13, border: `1.5px solid ${DESK.line}`, background: DESK.card, color: DESK.ink2, fontFamily: DESK.body, fontWeight: 600, fontSize: 14, cursor: 'pointer' }}
                    >
                      Skip
                    </button>
                  )}
                </div>
              </>
            )}

            <div style={{ marginTop: 26 }}>
              <PlanSheet title="The brief" lines={briefLines(false)} />
            </div>
          </div>
        ) : (
          /* ── review: the finished brief, the $0 receipt, the seal ── */
          <div className="dk-ink">
            <div style={{ ...label, margin: '18px 2px 6px' }}>Read it back</div>
            <h1 style={{ fontFamily: DESK.disp, fontSize: 23, color: DESK.ink, margin: '0 0 18px', letterSpacing: '-0.01em' }}>
              Your brief, ready to send.
            </h1>
            <PlanSheet title="The brief" lines={briefLines(true)} />

            <ReceiptFrame style={{ marginTop: 18 }}>
              <ReceiptRow label="What this costs to send" amount="$0" />
              <ReceiptRule />
              <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink2, lineHeight: 1.5 }}>
                We read it, then send you a plan and a real price. Work starts only after you say yes.
              </div>
            </ReceiptFrame>

            {error && (
              <div style={{ marginTop: 14, background: DESK.amberWash, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '10px 13px', fontFamily: DESK.body, fontSize: 13, color: DESK.amber }}>
                {error}
              </div>
            )}

            <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
              {canSend ? (
                <SealButton label={sending ? 'Sending...' : 'Press\nto send'} disabled={sending} onSealed={send} />
              ) : (
                <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, textAlign: 'center' }}>
                  {missing.length} answer{missing.length === 1 ? '' : 's'} still missing. Go back and fill them in.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    )
  }

  /* ── HUB: the picker + your requests ──────────────────────────────────────────────── */
  return (
    <div style={{ ...paperGround, minHeight: '100dvh', padding: '22px 16px 90px' }}>
      <DeskKeyframes />
      <div style={label}>The request desk</div>
      <h1 style={{ fontFamily: DESK.disp, fontSize: 24, color: DESK.ink, margin: '6px 0 4px', letterSpacing: '-0.01em' }}>
        What do you need made?
      </h1>
      <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, margin: '0 0 18px', lineHeight: 1.5 }}>
        Ask for anything. We answer with a plan and a price. Nothing is charged until you say yes.
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {REQUEST_TYPES.map((t) => {
          const Icon = TYPE_ICONS[t.id]
          return (
            <Ticket
              key={t.id}
              name={
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                  <Icon size={16} style={{ color: DESK.mintDeep, flexShrink: 0 }} />
                  {t.label}
                </span>
              }
              sub={t.blurb}
              right={<ChevronRight size={17} />}
              onClick={() => start(t)}
            />
          )
        })}
      </div>

      <div style={{ ...label, margin: '30px 2px 10px' }}>Your requests</div>
      {loadingMine ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>Loading...</div>
      ) : mine.length === 0 ? (
        <div style={{ fontFamily: DESK.body, fontSize: 13, color: DESK.mute, padding: '8px 2px' }}>
          Nothing yet. Your first request will show up here.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {mine.map((r) => {
            const t = requestTypeById(r.type)
            const tone = STATUS_TONE[r.status] ?? STATUS_TONE.requested
            const isOpen = open === r.id
            return (
              <div key={r.id} style={{ background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 14, overflow: 'hidden' }}>
                <button
                  type="button"
                  onClick={() => setOpen(isOpen ? null : r.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '12px 14px', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                >
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: DESK.disp, fontWeight: 700, fontSize: 14, color: DESK.ink }}>
                      {t?.label ?? 'Request'}
                    </span>
                    <span style={{ display: 'block', fontFamily: DESK.body, fontSize: 12, color: DESK.mute, marginTop: 1 }}>
                      Sent {fmtDay(r.created_at)}
                    </span>
                  </span>
                  <span style={{ flexShrink: 0, fontFamily: DESK.mono, fontSize: 10.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: tone.fg, background: tone.bg, borderRadius: 999, padding: '5px 10px' }}>
                    {STATUS_LABEL[r.status] ?? r.status}
                  </span>
                </button>
                {isOpen && (
                  <div className="dk-ink" style={{ padding: '0 14px 13px', borderTop: `1px dashed ${DESK.line}` }}>
                    <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink2, lineHeight: 1.5, paddingTop: 11 }}>
                      {STATUS_OWNER_LINE[r.status] ?? ''}
                    </div>
                    {r.team_note && (
                      <div style={{ marginTop: 10, background: DESK.mintWash, border: `1px solid ${DESK.mintLine}`, borderRadius: 10, padding: '10px 12px', fontFamily: DESK.body, fontSize: 13, color: DESK.ink, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {r.team_note}
                      </div>
                    )}
                    {Object.entries(r.brief).length > 0 && (
                      <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {Object.entries(r.brief).map(([k, v]) => (
                          <div key={k} style={{ fontFamily: DESK.body, fontSize: 12, color: DESK.mute, lineHeight: 1.45 }}>
                            <span style={{ color: DESK.ink2, fontWeight: 600 }}>{k}: </span>{v}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
