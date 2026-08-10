'use client'

/**
 * THE CREATIVE FLOW — the Drafting Table engine for every non-graphic creative.
 *
 * Renders a per-type spec (src/lib/requests/flows.ts) in the design order flow's exact
 * grammar: the live board pinned on top becoming every answer, numbered steps with
 * tickets and chips sized to the thing, a REAL calendar for the date, Back and Next
 * pills, the spoken-sentence review, the $0 send receipt, and the hold-to-send seal.
 *
 * Request first, quote later: no number appears anywhere; the seal posts the brief to
 * /api/requests in the catalog's own validated vocabulary (the calendar date folds into
 * the honest timing buckets and rides exactly in the notes).
 */

import { useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import WalkCalendar from '@/components/campaigns/monthly/walk-calendar'
import {
  DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule, ReceiptTotal, ConfirmButton,
} from '@/components/campaigns/desk/ui'
import RequestBoard from '@/components/requests/request-boards'
import { requestTypeById, questionsFor, type RequestAnswers } from '@/lib/requests/catalog'
import { priceCreativeRequest, fmtCents, CREATIVE_LEVELS, VALVE_LINE, REVISION_LINE } from '@/lib/requests/pricing'
import { flowFor, bucketForDate, type FlowControl, type TicketOption } from '@/lib/requests/flows'

const fmtDay = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString(undefined, { month: 'long', day: 'numeric' })

const inputStyle = {
  width: '100%', padding: '13px 15px', borderRadius: 14, border: `1.5px solid ${DESK.line}`,
  background: DESK.card, fontFamily: DESK.body, fontSize: 15, color: DESK.ink, outline: 'none',
  boxSizing: 'border-box' as const,
}

function StepHead({ n, total, title, sub }: { n: number; total: number; title: string; sub?: string }) {
  return (
    <div style={{ margin: '4px 0 14px' }}>
      <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DESK.mute, marginBottom: 5 }}>
        {n} of {total}
      </div>
      <div style={{ fontFamily: DESK.disp, fontSize: 22, fontWeight: 700, color: DESK.ink, letterSpacing: '-0.01em', lineHeight: 1.2 }}>{title}</div>
      {sub && <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: DESK.ink2, marginTop: 4, lineHeight: 1.45 }}>{sub}</div>}
    </div>
  )
}

function Chip({ label, on, onClick }: { label: string; on?: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        padding: '8px 13px', borderRadius: 999, cursor: 'pointer',
        border: `1.5px solid ${on ? DESK.mint : DESK.line}`, background: on ? DESK.mintWash : DESK.card,
        color: on ? DESK.mintDeep : DESK.ink2, fontFamily: DESK.body, fontWeight: on ? 700 : 500, fontSize: 13,
      }}
    >
      {label}
    </button>
  )
}

/** The mini shape a menu ticket wears: the piece it will become. */
function MenuFrame({ frame }: { frame: NonNullable<TicketOption['frame']> }) {
  const base = { border: `1.5px solid ${DESK.ink2}`, background: DESK.paper, display: 'block' as const }
  if (frame === 'trifold') {
    return (
      <span style={{ display: 'inline-flex', gap: 1 }}>
        {[0, 1, 2].map((i) => <span key={i} style={{ ...base, width: 8, height: 26, borderRadius: 1, transform: `rotate(${(i - 1) * 4}deg)` }} />)}
      </span>
    )
  }
  if (frame === 'phone') return <span style={{ ...base, width: 15, height: 27, borderRadius: 5 }} />
  if (frame === 'tall') return <span style={{ ...base, width: 13, height: 28, borderRadius: 2 }} />
  if (frame === 'qr') {
    return (
      <span style={{ ...base, width: 15, height: 27, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ width: 8, height: 8, background: `repeating-conic-gradient(${DESK.ink} 0% 25%, transparent 0% 50%)`, backgroundSize: '4px 4px', opacity: 0.8 }} />
      </span>
    )
  }
  return <span style={{ ...base, width: 20, height: 26, borderRadius: 2 }} />
}

export default function CreativeFlow({ typeId, onBack, onDone, menu = [] }: { typeId: string; onBack: () => void; onDone?: () => void; menu?: { id: string; name: string }[] }) {
  const type = requestTypeById(typeId)
  const flow = flowFor(typeId)
  const [answers, setAnswers] = useState<RequestAnswers>({})
  const [dueISO, setDueISO] = useState<string | null>(null)
  const [notes, setNotes] = useState('')
  const [step, setStep] = useState(0)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [files, setFiles] = useState<{ url: string; name: string; path?: string }[]>([])
  const [uploading, setUploading] = useState(false)
  /* per-question "Something else" free text (see the escape hatch below) */
  const [others, setOthers] = useState<Record<string, string>>({})
  const [otherOn, setOtherOn] = useState<Record<string, boolean>>({})
  /* the cart screen between Add to cart and Confirm order */
  const [cart, setCart] = useState(false)
  const [orderAmount, setOrderAmount] = useState<number | null>(null)

  if (!type || !flow) return null
  const today = new Date().toISOString().slice(0, 10)
  const total = flow.steps.length + 1 // + review
  const onReview = step >= flow.steps.length
  const current = onReview ? null : flow.steps[step]
  const dueLabel = dueISO ? fmtDay(dueISO) : null

  const setA = (qid: string, val: string) => setAnswers((a) => ({ ...a, [qid]: val }))
  const picksOf = (qid: string) => (answers[qid] ?? '').split(', ').filter(Boolean)
  const toggle = (qid: string, val: string) => {
    const picks = picksOf(qid)
    setA(qid, (picks.includes(val) ? picks.filter((p) => p !== val) : [...picks, val]).join(', '))
  }

  /* THE ESCAPE HATCH: every fixed-choice question also takes "Something else" in the
   * owner's own words, so a miss in our lists never blocks a request. The typed words
   * ARE the answer (single) or ride as one more pick (multi) — the same plain-string
   * vocabulary the team already reads. Commas fold to spaces so multi joins stay
   * parseable. */
  const setOtherText = (qid: string, multi: boolean, raw: string) => {
    const text = raw.replace(/,/g, ' ').replace(/\s{2,}/g, ' ')
    const prev = (others[qid] ?? '').trim()
    if (multi) {
      const picks = picksOf(qid).filter((p) => p !== prev)
      setA(qid, [...picks, text.trim()].filter(Boolean).join(', '))
    } else {
      setA(qid, text.trim())
    }
    setOthers((o) => ({ ...o, [qid]: text }))
  }
  const toggleOther = (qid: string, multi: boolean) => {
    const on = otherOn[qid] === true
    if (on) {
      const prev = (others[qid] ?? '').trim()
      if (multi) setA(qid, picksOf(qid).filter((p) => p !== prev).join(', '))
      else if ((answers[qid] ?? '') === prev) setA(qid, '')
      setOthers((o) => ({ ...o, [qid]: '' }))
    } else if (!multi) {
      setA(qid, '')
    }
    setOtherOn((o) => ({ ...o, [qid]: !on }))
  }

  const canNext = current
    ? current.requires.every((qid) => (qid === 'when' ? dueISO != null : (answers[qid] ?? '').trim().length > 0))
    : true

  /* Files land in storage the moment they are picked, so send() only ships URLs. */
  const addFiles = async (list: FileList | null) => {
    if (!list || !list.length || uploading) return
    setUploading(true)
    setSendError(null)
    for (const f of Array.from(list).slice(0, 10 - files.length)) {
      try {
        const fd = new FormData()
        fd.append('file', f)
        const r = await fetch('/api/dashboard/upload-asset', { method: 'POST', body: fd })
        const j = (await r.json().catch(() => ({}))) as { url?: string; path?: string; error?: string }
        if (!r.ok || !j.url) throw new Error(typeof j.error === 'string' ? j.error : 'Upload failed')
        setFiles((prev) => [...prev, { url: j.url!, name: f.name, path: j.path }])
      } catch (e) {
        setSendError(e instanceof Error ? `${f.name}: ${e.message}` : 'Upload failed. Try again.')
        break
      }
    }
    setUploading(false)
  }

  /* Confirm order: the brief goes down the ORDER lane at the price sheet's number
   * (the server computes its own and never trusts ours); the work order mints on
   * the house team right away. */
  const send = async () => {
    if (sending) return
    setSending(true)
    setSendError(null)
    const composedNotes = [dueISO ? `In hand by ${fmtDay(dueISO)} (${dueISO})` : '', notes.trim()].filter(Boolean).join('. ')
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: type.id,
          answers: { ...answers, when: bucketForDate(dueISO, today), ...(composedNotes ? { notes: composedNotes } : {}) },
          ...(dueISO ? { due_date: dueISO } : {}),
          ...(files.length ? { attachments: files } : {}),
          order: true,
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string; order?: { amount_cents?: number } }
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : 'Could not send. Try again.')
      if (typeof j.order?.amount_cents === 'number') setOrderAmount(j.order.amount_cents)
      setSubmitted(true)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send. Try again.')
    }
    setSending(false)
  }

  const ground = { ...paperGround, minHeight: '100dvh', padding: '16px 16px 40px', fontFamily: DESK.body, boxSizing: 'border-box' as const }

  /* ── done: the stamped board ── */
  if (submitted) {
    return (
      <div style={{ ...ground, textAlign: 'center', paddingTop: 40 }}>
        <DeskKeyframes />
        <RequestBoard typeId={type.id} answers={answers} />
        <div style={{ marginTop: 6 }}><Stamp mint>Order placed</Stamp></div>
        <div style={{ fontFamily: DESK.disp, fontSize: 22, fontWeight: 700, color: DESK.ink, marginTop: 14 }}>
          Your team has {type.noun}.
        </div>
        <div style={{ fontSize: 13.5, color: DESK.ink2, marginTop: 8, maxWidth: '36ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
          Work starts now. Follow progress and talk to us in Your requests.
        </div>
        {orderAmount != null && (
          <div style={{ fontFamily: DESK.mono, fontSize: 14, fontWeight: 700, color: DESK.mintDeep, marginTop: 12 }}>
            {fmtCents(orderAmount)} · Your Apnosh creative team
          </div>
        )}
        <button
          type="button" onClick={onDone ?? onBack}
          style={{ marginTop: 24, padding: '13px 26px', borderRadius: 999, border: 'none', cursor: 'pointer', background: DESK.grad, color: '#fff', fontFamily: DESK.disp, fontWeight: 700, fontSize: 14.5 }}
        >
          See your order
        </button>
      </div>
    )
  }

  /* ── THE CART: one item, one honest total, one tap to confirm ── */
  if (cart) {
    const price = priceCreativeRequest(type.id, answers)
    return (
      <div style={ground}>
        <DeskKeyframes />
        <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DESK.mute, margin: '4px 0 10px' }}>Your cart</div>
        <RequestBoard typeId={type.id} answers={answers} />
        <div style={{ fontSize: 13, color: DESK.ink2, margin: '10px 0 12px', lineHeight: 1.5 }}>One more look, then confirm. Work starts right away.</div>
        {price && (
          <ReceiptFrame>
            {price.lines.map((l, i) => <ReceiptRow key={i} label={l.label} amount={fmtCents(l.amountCents)} />)}
            <ReceiptRule />
            <ReceiptTotal label="Total" big={fmtCents(price.totalCents)} />
          </ReceiptFrame>
        )}
        <div style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '12px 14px', margin: '12px 0' }}>
          <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 4 }}>Assigned to</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: DESK.ink }}>Your Apnosh creative team</div>
          <div style={{ fontSize: 12, color: DESK.ink2, marginTop: 3, lineHeight: 1.45 }}>A named creator picks it up within 1 business day. You can follow it in Your requests.</div>
        </div>
        {sendError && (
          <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.45 }}>
            {sendError}
          </div>
        )}
        <ConfirmButton
          label={sending ? 'Placing your order...' : `Confirm order${price ? ` · ${price.startsAt ? 'from ' : ''}${fmtCents(price.totalCents)}` : ''}`}
          sub="Goes on your Apnosh bill. Nothing else to do."
          disabled={sending}
          onClick={() => { void send() }}
        />
        <div style={{ fontSize: 11.5, color: DESK.mute, margin: '8px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>{VALVE_LINE}</div>
        <div style={{ height: 10 }} />
        <ConfirmButton label="Change something" tone="paper" disabled={sending} onClick={() => setCart(false)} />
      </div>
    )
  }

  const renderControl = (c: FlowControl, i: number) => {
    if (c.kind === 'calendar') {
      return (
        <div key={i}>
          <WalkCalendar
            goal="more-new"
            value={dueISO ?? undefined}
            classify={() => 'ok'}
            tagLine="In hand by"
            onChange={(day: string) => setDueISO(day)}
          />
        </div>
      )
    }
    if (c.kind === 'tickets') {
      const isOtherOn = otherOn[c.qid] === true
      return (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
          {c.options.map((o) => {
            const on = c.multi ? picksOf(c.qid).includes(o.value) : !isOtherOn && answers[c.qid] === o.value
            return (
              <Ticket
                key={o.value}
                on={on}
                name={
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                    {o.frame && <MenuFrame frame={o.frame} />}
                    <span style={o.style}>{o.value}</span>
                  </span>
                }
                sub={o.sub}
                onClick={() => {
                  if (!c.multi && isOtherOn) toggleOther(c.qid, false)
                  if (c.multi) toggle(c.qid, o.value)
                  else setA(c.qid, answers[c.qid] === o.value ? '' : o.value)
                }}
              />
            )
          })}
          <Ticket
            on={isOtherOn}
            name="Something else"
            sub="Say it your way. We read every word."
            onClick={() => toggleOther(c.qid, c.multi === true)}
          />
          {isOtherOn && (
            <input
              value={others[c.qid] ?? ''}
              onChange={(e) => setOtherText(c.qid, c.multi === true, e.target.value)}
              placeholder="Tell us what you have in mind"
              aria-label="Something else"
              style={inputStyle}
              autoFocus
            />
          )}
        </div>
      )
    }
    const val = answers[c.qid] ?? ''
    return (
      <div key={i} style={{ marginBottom: 12 }}>
        {c.kind === 'textarea' ? (
          <textarea
            value={val} onChange={(e) => setA(c.qid, e.target.value)} placeholder={c.hint} rows={3}
            style={{ ...inputStyle, resize: 'none', lineHeight: 1.5 }}
          />
        ) : (
          <input value={val} onChange={(e) => setA(c.qid, e.target.value)} placeholder={c.hint} style={inputStyle} />
        )}
        {c.chips && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 10 }}>
            {c.chips.map((label) => (
              <Chip key={label} label={label} on={val === label} onClick={() => setA(c.qid, val === label ? '' : label)} />
            ))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div style={ground}>
      <DeskKeyframes />
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button
          type="button"
          onClick={() => (step === 0 ? onBack() : setStep((s) => s - 1))}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: DESK.ink2, fontFamily: DESK.body, fontSize: 13.5, padding: '6px 4px' }}
        >
          <ChevronLeft size={16} /> {step === 0 ? 'Store' : 'Back'}
        </button>
        <span style={{ fontFamily: DESK.body, fontSize: 12.5, fontWeight: 600, color: DESK.ink2 }}>{type.label}</span>
      </div>

      <div style={{ background: DESK.mintWash, color: DESK.mintDeep, border: `1px solid ${DESK.mintLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, margin: '10px 0 2px', lineHeight: 1.4 }}>
        Sending this is free. We answer with a plan and a real price. Nothing is charged until you say yes.
      </div>

      {/* the board rides every step, becoming each answer */}
      <RequestBoard typeId={type.id} answers={dueISO ? { ...answers, when: bucketForDate(dueISO, today) } : answers} />

      {!onReview && current ? (
        <div key={step} className="dk-ink">
          <StepHead n={step + 1} total={total} title={current.title} sub={current.sub} />
          {current.controls.map(renderControl)}
          {step === 0 && menu.length > 0 && type.questions.some((q) => q.id === 'featuring') && (() => {
            /* FEATURING, FROM YOUR MENU: multi-pick chips over the owner's real dishes,
             * whole-menu explore (Show all + search past 12) and the own-words hatch.
             * Rides the catalog's optional 'featuring' answer. */
            const picks = picksOf('featuring')
            const q = (others['featuring.q'] ?? '').trim().toLowerCase()
            const open = otherOn['featuring.open'] === true
            const shown = open ? menu.filter((m) => !q || m.name.toLowerCase().includes(q)) : menu.slice(0, 8)
            return (
              <div style={{ marginTop: 4, marginBottom: 12 }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '2px 0 8px' }}>
                  Featuring, from your menu <span style={{ textTransform: 'none', letterSpacing: 0, fontWeight: 500 }}>· optional, pick as many as you want</span>
                </div>
                {open && menu.length > 12 && (
                  <input
                    value={others['featuring.q'] ?? ''} onChange={(e) => setOthers((o) => ({ ...o, 'featuring.q': e.target.value }))}
                    placeholder="Search your menu" aria-label="Search your menu"
                    style={{ ...inputStyle, marginBottom: 8 }}
                  />
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {shown.map((m) => (
                    <Chip key={m.id} label={m.name} on={picks.includes(m.name)} onClick={() => toggle('featuring', m.name)} />
                  ))}
                  {!open && menu.length > 8 && (
                    <Chip label={`Show all ${menu.length}`} onClick={() => setOtherOn((o) => ({ ...o, 'featuring.open': true }))} />
                  )}
                  {open && (
                    <Chip label="Show less" onClick={() => setOtherOn((o) => ({ ...o, 'featuring.open': false }))} />
                  )}
                  <Chip label="Something else" on={otherOn['featuring'] === true} onClick={() => toggleOther('featuring', true)} />
                </div>
                {otherOn['featuring'] === true && (
                  <input
                    value={others['featuring'] ?? ''}
                    onChange={(e) => setOtherText('featuring', true, e.target.value)}
                    placeholder="Name the dish or special" aria-label="Featuring something else"
                    style={{ ...inputStyle, marginTop: 8 }}
                  />
                )}
              </div>
            )
          })()}
          <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
            {step > 0 && (
              <button
                type="button" onClick={() => setStep((s) => s - 1)}
                style={{ flexShrink: 0, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink, fontFamily: DESK.body, fontSize: 14.5, fontWeight: 600 }}
              >
                Back
              </button>
            )}
            <button
              type="button" disabled={!canNext} onClick={() => setStep((s) => s + 1)}
              style={{
                flex: 1, height: 50, borderRadius: 25, border: 'none', cursor: canNext ? 'pointer' : 'default',
                background: canNext ? DESK.grad : '#E7E4DB', color: canNext ? '#fff' : DESK.mute,
                fontFamily: DESK.disp, fontSize: 16, fontWeight: 700,
                boxShadow: canNext ? '0 8px 20px rgba(46,154,120,0.3)' : 'none',
              }}
            >
              Next
            </button>
          </div>
        </div>
      ) : (
        /* ── review: the WHOLE brief itemized, the real price, then Add to cart ── */
        <div className="dk-ink">
          <StepHead n={total} total={total} title="Look right?" sub="This exact brief is what the team works from." />
          <div className="dk-ink" style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '4px 16px 2px', boxShadow: '0 2px 8px rgba(22,33,28,0.05)' }}>
            {questionsFor(type).filter((q) => q.id !== 'notes' && q.id !== 'when' && (answers[q.id] ?? '').trim()).map((q) => (
              <div key={q.id} style={{ padding: '10px 0', borderBottom: `1px solid ${DESK.line}` }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 3 }}>{q.prompt.replace(/\?$/, '')}</div>
                <div style={{ fontSize: 13.5, color: DESK.ink, lineHeight: 1.5 }}>{answers[q.id]}</div>
              </div>
            ))}
            <div style={{ padding: '10px 0', borderBottom: `1px solid ${DESK.line}` }}>
              <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 3 }}>In hand</div>
              <div style={{ fontSize: 13.5, color: DESK.ink, lineHeight: 1.5 }}>{dueLabel ?? 'No firm date'}</div>
            </div>
            <div style={{ padding: '10px 0' }}>
              <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 3 }}>Assigned to</div>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: DESK.ink }}>Your Apnosh creative team</div>
              <div style={{ fontSize: 11.5, color: DESK.ink2, marginTop: 2, lineHeight: 1.45 }}>A named creator picks it up within 1 business day. You can follow it in Your requests.</div>
            </div>
          </div>
          {CREATIVE_LEVELS[type.id] && (() => {
            /* THE TIER CHOICE (persona-tested): Standard is the default, so this is never
             * a required decision; each ticket shows ITS OWN total so picking visibly
             * changes the price; promises are countable, never vibes. */
            const std = priceCreativeRequest(type.id, { ...answers, level: 'Standard' })
            const wrk = priceCreativeRequest(type.id, { ...answers, level: 'The works' })
            const isWorks = (answers.level ?? '') === 'The works'
            return (
              <div style={{ margin: '14px 0 2px' }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 8 }}>
                  How good should it be?
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Ticket
                    on={!isWorks}
                    name={<span>Standard <span style={{ fontFamily: DESK.mono, fontSize: 10, fontWeight: 700, color: DESK.mintDeep }}>most owners pick this</span></span>}
                    sub={CREATIVE_LEVELS[type.id].standard}
                    price={std ? fmtCents(std.totalCents) : undefined}
                    onClick={() => setA('level', 'Standard')}
                  />
                  <Ticket
                    on={isWorks}
                    name="The works"
                    sub={CREATIVE_LEVELS[type.id].works}
                    price={wrk ? fmtCents(wrk.totalCents) : undefined}
                    onClick={() => setA('level', 'The works')}
                  />
                </div>
              </div>
            )
          })()}
          <div style={{ margin: '12px 0' }}>
            <textarea
              value={notes} onChange={(e) => setNotes(e.target.value)} rows={2}
              placeholder="Anything else we should know? Links, examples, things to avoid"
              style={{ ...inputStyle, resize: 'none', lineHeight: 1.5, fontSize: 13.5 }}
            />
          </div>
          {/* the hand-off: menus, logos, examples — files most jobs cannot start without */}
          <div style={{ margin: '0 0 12px' }}>
            <label style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
              border: `1.5px dashed ${DESK.line}`, borderRadius: 12, padding: '11px 12px',
              fontFamily: DESK.body, fontSize: 13, color: uploading ? DESK.mute : DESK.ink2,
              cursor: uploading ? 'default' : 'pointer', background: DESK.card,
            }}>
              <input
                type="file" multiple accept="image/*,application/pdf" disabled={uploading || files.length >= 10}
                onChange={(e) => { void addFiles(e.target.files); e.target.value = '' }}
                style={{ display: 'none' }}
              />
              {uploading ? 'Uploading...' : 'Hand us files — your menu, logo, photos, examples'}
            </label>
            {files.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {files.map((f, i) => (
                  <span key={`${f.url}-${i}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: '100%',
                    background: DESK.mintWash, border: `1px solid ${DESK.mintLine}`, borderRadius: 999,
                    padding: '5px 10px', fontFamily: DESK.body, fontSize: 12, color: DESK.mintDeep,
                  }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>{f.name}</span>
                    <button
                      type="button" aria-label={`Remove ${f.name}`}
                      onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                      style={{ border: 'none', background: 'none', color: DESK.mintDeep, cursor: 'pointer', padding: 0, fontSize: 13, lineHeight: 1 }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>
          {(() => {
            const price = priceCreativeRequest(type.id, answers)
            return price ? (
              <>
                <ReceiptFrame>
                  {price.lines.map((l, i) => <ReceiptRow key={i} label={l.label} amount={fmtCents(l.amountCents)} />)}
                  <ReceiptRule />
                  <ReceiptTotal label={price.startsAt ? 'Starts at' : 'Total'} big={fmtCents(price.totalCents)} />
                </ReceiptFrame>
                {price.startsAt && (
                  <div style={{ fontSize: 12, color: DESK.ink2, marginTop: 8, lineHeight: 1.5 }}>
                    This is the starting point. The final number is agreed in your thread before work starts. We answer within 1 business day.
                  </div>
                )}
                <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 8, lineHeight: 1.5 }}>{REVISION_LINE}</div>
              </>
            ) : null
          })()}
          {sendError && (
            <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, margin: '12px 0', lineHeight: 1.45 }}>
              {sendError}
            </div>
          )}
          <div style={{ marginTop: 16 }}>
            <ConfirmButton
              label={`Add to cart${priceCreativeRequest(type.id, answers) ? ` · ${fmtCents(priceCreativeRequest(type.id, answers)!.totalCents)}` : ''}`}
              onClick={() => { setSendError(null); setCart(true) }}
            />
          </div>
        </div>
      )}
    </div>
  )
}
