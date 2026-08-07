'use client'

/**
 * THE REQUEST DESK — ask us for anything (creative requests, owner side).
 *
 * The design order generalized: one desk where an owner asks for any marketing work.
 * Pick what you need, answer a few plain questions, press to send. Request first,
 * quote later: nothing here shows or charges a price. The team reads every request
 * and answers with a plan and a real number in the owner's inbox.
 *
 * Visual language is the Strategist's Desk kit (desk/ui.tsx) so the whole shop reads
 * as one place. All statuses come from the catalog (STATUS_LABEL / STATUS_OWNER_LINE).
 */

import { useCallback, useEffect, useState } from 'react'
import {
  Palette, BookOpen, Sparkles, Globe, Clapperboard, Camera, Share2, Mail,
  Megaphone, Printer, PenLine, MessageCircle, ChevronRight, ChevronLeft, type LucideIcon,
} from 'lucide-react'
import {
  DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule, SealButton,
} from '@/components/campaigns/desk/ui'
import {
  REQUEST_TYPES, questionsFor, STATUS_LABEL, STATUS_OWNER_LINE, requestTypeById,
  type RequestType, type RequestTypeId, type RequestAnswers, type RequestStatus,
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

  const start = (t: RequestType) => { setType(t); setAnswers({}); setError(null); setView('form') }
  const setA = (id: string, val: string) => setAnswers((a) => ({ ...a, [id]: val }))

  const qs = type ? questionsFor(type) : []
  const missing = qs.filter((q) => !q.optional && !(answers[q.id] ?? '').trim())
  const canSend = type !== null && missing.length === 0

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
    width: '100%', padding: '12px 14px', borderRadius: 12, border: `1.5px solid ${DESK.line}`,
    background: DESK.card, fontFamily: DESK.body, fontSize: 14.5, color: DESK.ink, outline: 'none',
  }

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
          onClick={() => { setView('hub'); setType(null); setAnswers({}) }}
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

  /* ── FORM: the chosen type's questions ────────────────────────────────────────────── */
  if (view === 'form' && type) {
    const Icon = TYPE_ICONS[type.id]
    return (
      <div style={{ ...paperGround, minHeight: '100dvh', padding: '14px 16px 120px' }}>
        <DeskKeyframes />
        <button
          type="button"
          onClick={() => setView('hub')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: DESK.ink2, fontFamily: DESK.body, fontSize: 13.5, padding: '6px 4px' }}
        >
          <ChevronLeft size={16} /> All requests
        </button>

        <div style={{ display: 'flex', alignItems: 'center', gap: 11, margin: '10px 2px 4px' }}>
          <span style={{ width: 40, height: 40, borderRadius: 12, background: DESK.mintWash, color: DESK.mintDeep, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={20} />
          </span>
          <div>
            <h1 style={{ fontFamily: DESK.disp, fontSize: 20, color: DESK.ink, margin: 0 }}>{type.label}</h1>
            <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.mute }}>{type.blurb}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, marginTop: 18 }}>
          {qs.map((q) => (
            <div key={q.id} className="dk-ink">
              <div style={{ ...label, marginBottom: 8 }}>
                {q.prompt}{q.optional ? '  ·  optional' : ''}
              </div>
              {q.kind === 'choice' ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {(q.options ?? []).map((opt) => {
                    const on = answers[q.id] === opt
                    return (
                      <button
                        key={opt}
                        type="button"
                        onClick={() => setA(q.id, on ? '' : opt)}
                        style={{
                          padding: '9px 14px', borderRadius: 999, cursor: 'pointer',
                          border: `1.5px solid ${on ? DESK.mint : DESK.line}`,
                          background: on ? DESK.mintWash : DESK.card,
                          color: on ? DESK.mintDeep : DESK.ink2,
                          fontFamily: DESK.body, fontWeight: on ? 700 : 500, fontSize: 13.5,
                        }}
                      >
                        {opt}
                      </button>
                    )
                  })}
                </div>
              ) : q.kind === 'long' ? (
                <textarea
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setA(q.id, e.target.value)}
                  placeholder={q.hint}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical', minHeight: 84 }}
                />
              ) : (
                <input
                  value={answers[q.id] ?? ''}
                  onChange={(e) => setA(q.id, e.target.value)}
                  placeholder={q.hint}
                  style={inputStyle}
                />
              )}
            </div>
          ))}
        </div>

        <ReceiptFrame style={{ marginTop: 26 }}>
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
              {missing.length} more to answer before you can send
            </div>
          )}
        </div>
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
