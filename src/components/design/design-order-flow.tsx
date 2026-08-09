/**
 * THE DESIGN ORDER FLOW: THE DRAFTING TABLE (DESIGN-ORDERING spec, Phase B; desk restyle).
 *
 * One idea carries every step: your graphic is a LIVE ARTBOARD pinned to the strategist's
 * desk, and every answer visibly changes it. The job sketches it in, destinations fan it out
 * into real-ratio frames, your words ink onto it, your photo paints it, the date sticks on as
 * a tape tag, and ordering is the press-and-hold seal that stamps it ORDERED. Nothing is
 * decoration: everything on the board is an answer you gave.
 *
 * Visual language is the Strategist's Desk kit (desk/ui.tsx) so the campaign builder and the
 * design order read as one shop. All owner copy comes from the question bank (design-copy.ts).
 * Money stays engine-truth: destination tiles show their own line amount from the live quote.
 *
 * THE PLACEHOLDER GATE: while RATE_CARD.approved is false, the amber banner marks every price
 * as a test number. This surface must not be sold until the reviewed rate card flips the flag.
 */
'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'
import WalkCalendar from '@/components/campaigns/monthly/walk-calendar'
import { DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule, ReceiptTotal, SealButton } from '@/components/campaigns/desk/ui'
import { DESTINATIONS, type DestinationId, type DestinationSpec } from '@/lib/design/destinations'
import { RATE_CARD } from '@/lib/design/rate-card'
import { priceDesignOrder, productionBufferDays, rushApplies, type DesignOrderAnswers, type DesignFact } from '@/lib/design/design-pricing'
import { DESIGN_JOBS, type DesignJobId, type DesignRead } from '@/lib/design/design-read'
import { DESIGN_TITLES, DESIGN_SUBS, DESIGN_LINES, fill } from '@/lib/design/design-copy'

/* Shorthands: every owner-facing string lives in the question bank (design-copy.ts), same
 * pattern and lint as the campaign walk. Nothing user-visible is authored inline here. */
const T = DESIGN_TITLES
const S = DESIGN_SUBS
const L = DESIGN_LINES

export interface DesignAsset {
  id: string
  url: string
  width: number
  height: number
  label?: string
}

/** The upload quality gate: honest and simple. Small images fail loudly, never silently. */
export const passesQualityGate = (a: { width: number; height: number }) => Math.min(a.width, a.height) >= 1000

const fmtDay = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
const fmtLong = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/* Typical counts, PLACEHOLDER ONLY — shown gray in the empty input, never charged as a
 * default. A quantity is money-adjacent; it is always the owner's own tap (law 4). */
const QTY_HINT: Partial<Record<DestinationId, string>> = {
  'printed-flyer': '200', 'table-tent': '25', 'menu-board': '2', poster: '10', banner: '1', 'gift-card': '100',
}

/* Starter headlines per job: the honest fallback when nothing was read. What was actually
 * read (their message, their menu item, their deal) always ranks first. */
const JOB_HEADLINES: Partial<Record<DesignJobId, string>> = {
  'weekly-special': 'This Week Only',
  announcement: 'Big News',
  'new-menu': 'Our New Menu',
  'holiday-hours': 'Holiday Hours',
  hiring: 'Join Our Team',
}
const todayISO = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

/* ── desk-flavored micro-motion, once per screen ─────────────────────────────────────────── */
function BoardKeyframes() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        .db-pop { animation: dbPop .38s cubic-bezier(.2,1.4,.4,1) both }
        @keyframes dbPop { from { opacity: 0; transform: scale(.92) translateY(5px) } to { opacity: 1; transform: none } }
        .db-tape { animation: dbTape .4s cubic-bezier(.2,1.5,.4,1) both }
        @keyframes dbTape { from { opacity: 0; transform: rotate(3deg) translateY(-8px) } to { opacity: 1; transform: rotate(3deg) } }
      }
    `}</style>
  )
}

/* ── the step ticker: the order sheet's own header ───────────────────────────────────────── */
function StepHead({ n, title, sub }: { n: number; title: string; sub: string }) {
  return (
    <div className="db-pop" style={{ marginBottom: 14 }}>
      <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', color: DESK.mute, marginBottom: 7 }}>
        {'ORDER SHEET · '}{n}{' / 6'}
      </div>
      <h2 style={{ fontFamily: DESK.disp, fontSize: 25, fontWeight: 700, color: DESK.ink, lineHeight: 1.12, margin: '0 0 5px', letterSpacing: '-0.02em' }}>{title}</h2>
      <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, lineHeight: 1.5, margin: 0, maxWidth: '36ch' }}>{sub}</p>
    </div>
  )
}

/* ── the artboard: the graphic, alive on the desk, changed only by answers ───────────────── */
function Artboard({ jobLabel, headline, details, offer, photoUrl, tag, rush, stamped, compact }: {
  jobLabel?: string | null
  headline: string
  details: string
  offer: string
  photoUrl?: string | null
  /** the masking-tape date tag ("In hand September 9") */
  tag?: string | null
  rush?: boolean
  /** the ORDERED stamp, after the seal */
  stamped?: boolean
  compact?: boolean
}) {
  const hasWords = !!(headline || details || offer)
  return (
    <div style={{ position: 'relative', padding: '10px 4px 2px', marginBottom: 14 }}>
      {/* the pin */}
      <span aria-hidden style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: DESK.grad, boxShadow: '0 2px 5px rgba(22,33,28,0.35), inset 0 1px 2px rgba(255,255,255,0.5)', zIndex: 4 }} />
      <div style={{
        position: 'relative', transform: 'rotate(-1.1deg)', borderRadius: 8, overflow: 'hidden',
        background: photoUrl ? undefined : DESK.ink, minHeight: compact ? 118 : 158,
        boxShadow: '0 14px 30px rgba(22,33,28,0.18), 0 2px 6px rgba(22,33,28,0.12)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: compact ? '18px 16px' : '26px 20px', textAlign: 'center',
        transition: 'min-height .25s ease',
      }}>
        {photoUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,33,28,0.35), rgba(22,33,28,0.62))' }} />
          </>
        )}
        <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
          {jobLabel && (
            <div className="db-pop" style={{ fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.62)', marginBottom: 8 }}>
              {jobLabel}
            </div>
          )}
          {hasWords ? (
            <>
              {headline && (
                <div key={headline} className="db-pop" style={{ fontFamily: DESK.disp, fontSize: compact ? 20 : 25, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.12, overflowWrap: 'break-word', textShadow: photoUrl ? '0 1px 8px rgba(0,0,0,0.4)' : undefined }}>
                  {headline}
                </div>
              )}
              {details && (
                <div key={details} className="db-pop" style={{ fontFamily: DESK.body, fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.82)', marginTop: 7 }}>
                  {details}
                </div>
              )}
              {offer && (
                <div key={offer} className="db-pop" style={{ display: 'inline-block', marginTop: 11, background: DESK.grad, color: '#fff', borderRadius: 99, padding: '5px 13px', fontFamily: DESK.disp, fontSize: 12, fontWeight: 700, boxShadow: '0 3px 10px rgba(46,154,120,0.4)' }}>
                  {offer}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: 'rgba(255,255,255,0.4)', border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: '14px 16px', display: 'inline-block' }}>
              {L['board.empty']}
            </div>
          )}
        </div>
        {stamped && (
          <span style={{ position: 'absolute', right: 10, bottom: 10, zIndex: 3 }}>
            <Stamp mint>{L['done.stamp']}</Stamp>
          </span>
        )}
        {rush && !stamped && (
          <span style={{ position: 'absolute', left: 10, bottom: 10, zIndex: 3 }}>
            <Stamp>{L['board.rush']}</Stamp>
          </span>
        )}
      </div>
      {/* the masking-tape date tag */}
      {tag && (
        <div className="db-tape" style={{
          position: 'absolute', top: 3, right: 8, zIndex: 5, transform: 'rotate(3deg)',
          background: 'rgba(247,243,228,0.96)', border: `1px solid ${DESK.line}`, borderRadius: 3,
          padding: '4px 10px', fontFamily: DESK.mono, fontSize: 10, fontWeight: 700, color: DESK.ink2,
          boxShadow: '0 2px 6px rgba(22,33,28,0.15)',
        }}>
          {tag}
        </div>
      )}
    </div>
  )
}

/* ── a destination as a real-ratio frame of YOUR artwork ─────────────────────────────────── */
function DestFrame({ d, on, amount, photoUrl, headline, onClick }: {
  d: DestinationSpec
  on: boolean
  /** the engine's own line amount for this tile when selected (null = unselected) */
  amount: number | null
  photoUrl?: string | null
  headline: string
  onClick: () => void
}) {
  const ratio = d.dimensions.w / d.dimensions.h
  const w = ratio >= 2.2 ? 104 : ratio >= 1 ? 74 : 52
  const h = Math.max(34, Math.min(86, Math.round(w / ratio)))
  return (
    <button
      type="button" onClick={onClick} aria-pressed={on}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 4, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
    >
      <span style={{
        position: 'relative', width: w, height: h, borderRadius: 6, overflow: 'hidden',
        background: photoUrl ? undefined : DESK.ink,
        border: `2px solid ${on ? DESK.mint : DESK.line}`,
        boxShadow: on ? '0 4px 12px rgba(46,154,120,0.3)' : '0 1px 4px rgba(22,33,28,0.1)',
        transform: on ? 'translateY(-2px)' : undefined, transition: 'transform .18s ease, box-shadow .18s ease, border-color .18s ease',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {photoUrl && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(22,33,28,0.42)' }} />
          </>
        )}
        {/* your headline, scaled into the frame; bars when there are no words yet */}
        <span style={{ position: 'relative', zIndex: 2, padding: '0 4px', width: '100%', textAlign: 'center' }}>
          {headline ? (
            <span style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: Math.max(6, Math.min(9, h / 6)), color: '#fff', lineHeight: 1.1, display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headline}</span>
          ) : (
            <span aria-hidden style={{ display: 'block', margin: '0 auto', width: '62%' }}>
              <span style={{ display: 'block', height: 3.5, borderRadius: 2, background: 'rgba(255,255,255,0.75)' }} />
              <span style={{ display: 'block', height: 2.5, borderRadius: 2, background: 'rgba(255,255,255,0.35)', marginTop: 3, width: '72%', marginLeft: 'auto', marginRight: 'auto' }} />
            </span>
          )}
        </span>
        {on && (
          <span style={{ position: 'absolute', top: 3, right: 3, zIndex: 3, width: 15, height: 15, borderRadius: '50%', background: DESK.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Check size={9} strokeWidth={3.6} />
          </span>
        )}
      </span>
      <span style={{ fontFamily: DESK.body, fontSize: 10.5, fontWeight: 600, color: on ? DESK.mintDeep : DESK.ink2, lineHeight: 1.2, textAlign: 'center' }}>{d.label}</span>
      <span style={{ fontFamily: DESK.mono, fontSize: 9.5, fontWeight: 700, color: DESK.mintDeep, minHeight: 12 }}>
        {on && amount != null ? (amount === 0 ? L['dest.included'] : `+$${amount}`) : ''}
      </span>
    </button>
  )
}

/* ── small shared inputs, desk-inked ─────────────────────────────────────────────────────── */
const inputStyle = {
  width: '100%', boxSizing: 'border-box' as const, height: 46, padding: '0 13px',
  border: `1.5px solid ${DESK.line}`, borderRadius: 12, background: DESK.card, outline: 'none',
  fontFamily: DESK.body, fontSize: 14.5, color: DESK.ink,
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        cursor: 'pointer', background: on ? DESK.mintWash : DESK.card,
        border: `1.5px solid ${on ? DESK.mint : DESK.line}`, borderRadius: 99,
        padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: on ? DESK.mintDeep : DESK.ink,
        fontFamily: DESK.body, boxShadow: on ? 'none' : '0 1px 2px rgba(22,33,28,0.04)',
        transition: 'border-color .15s ease, background .15s ease', WebkitTapHighlightColor: 'transparent',
      }}
    >
      {label}
    </button>
  )
}

export default function DesignOrderFlow({ menu, assets }: { menu: { id: string; name: string }[]; assets: DesignAsset[] }) {
  const today = todayISO()

  const [step, setStep] = useState(1)
  const [described, setDescribed] = useState('')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<DesignRead | null>(null)
  const [job, setJob] = useState<DesignJobId | null>(null)
  const [dests, setDests] = useState<DestinationId[]>([])
  const [printQtys, setPrintQtys] = useState<Partial<Record<DestinationId, number>>>({})
  const [printer, setPrinter] = useState<'client' | 'us' | null>(null)
  const [headline, setHeadline] = useState('')
  const [details, setDetails] = useState('')
  const [offer, setOffer] = useState('')
  const [promoteItem, setPromoteItem] = useState<string | null>(null)
  const [picked, setPicked] = useState<string[]>([])
  const [uploaded, setUploaded] = useState<DesignAsset[]>([])
  const [sourcePhotos, setSourcePhotos] = useState(false)
  const [noPhotos, setNoPhotos] = useState(false)
  /* The event's own date, from the read. NEVER the delivery date: a flyer due the night of
   * the event promotes nothing. The need-by date (due) is always the owner's tap. */
  const [eventDate, setEventDate] = useState<string | null>(null)
  const [due, setDue] = useState<string | null>(null)
  const [rushConfirmed, setRushConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  /* REQUEST MODE: the same flow with every number removed, until the rate card is
   * signed. The seal sends a quote request (creative_requests) instead of recording
   * an order; the day RATE_CARD.approved flips, prices return and this mode ends.
   * One flow, two moments — never two builders. */
  const requestMode = !RATE_CARD.approved

  const src = (k: keyof DesignRead['cited']): DesignFact<never>['source'] => (read?.cited[k] ? 'read' : 'asked')
  const allAssets = [...assets, ...uploaded]
  const usable = allAssets.filter(passesQualityGate)
  const usingOwn = picked.length > 0 && !sourcePhotos && !noPhotos
  const printDestSpecs = dests
    .map((d) => DESTINATIONS.find((x) => x.id === d))
    .filter((d): d is (typeof DESTINATIONS)[number] => !!d && d.kind === 'print')
  const printPicked = printDestSpecs.length > 0
  const allQtysIn = printDestSpecs.every((d) => printQtys[d.id] != null)
  const bufferDays = productionBufferDays(dests)
  /* Standard delivery: design time plus the slowest destination's production buffer. */
  const standardDelivery = addDays(today, 4 + bufferDays)
  const rushEligible = rushApplies(due ?? undefined, today, RATE_CARD.rushWindowHours)
  /* A sensible head start before a known event; offered as one tap, never silently applied. */
  const suggestedDue = eventDate ? addDays(eventDate, -3) : null
  const afterEvent = due != null && eventDate != null && due > eventDate

  const answers: DesignOrderAnswers = {
    jobType: { value: job ?? 'other', source: src('jobType'), citedWords: read?.cited.jobType },
    destinations: { value: dests, source: src('destinations'), citedWords: read?.cited.destinations },
    ...(printPicked && allQtysIn ? { printQtys: { value: printQtys, source: 'asked' as const } } : {}),
    ...(printer != null ? { printer: { value: printer, source: 'asked' as const } } : {}),
    ...(usingOwn || sourcePhotos || noPhotos
      ? { photos: { value: noPhotos ? ('none' as const) : usingOwn ? ('own' as const) : ('source' as const), source: 'asked' as const } }
      : {}),
    tier: 2, // Phase C derives this from design history; standard custom until then
    ...(due ? { dueDateISO: { value: due, source: 'asked' as const } } : {}),
    todayISO: today,
    rushConfirmed,
  }
  const quote = priceDesignOrder(answers, RATE_CARD)
  const saidText = [headline, details, offer].map((t) => t.trim()).filter(Boolean).join('. ')
  /* The rush question shows real dollars: the engine's own delta, before it is agreed to. */
  const rushDelta = Math.round(quote.total * (RATE_CARD.rushMultiplier - 1))
  /* The board's photo: the first picked asset paints the artwork everywhere it appears. */
  const boardPhoto = usingOwn ? allAssets.find((a) => picked.includes(a.id))?.url ?? null : null
  const jobLabel = job ? DESIGN_JOBS.find((j) => j.id === job)?.label ?? null : null
  const boardTag = due ? fill(L['tag.inhand'], { date: fmtDay(due) }) : eventDate ? fill(L['tag.event'], { date: fmtDay(eventDate) }) : null
  const destAmount = (id: string): number | null => {
    const line = quote.lines.find((l) => l.id === `dest-${id}`)
    return line ? line.amount : null
  }

  const describe = async () => {
    const text = described.trim()
    if (text.length < 8 || reading) return
    setReading(true)
    try {
      const r = await fetch('/api/design/describe', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text }),
      })
      const j = (await r.json()) as { ok?: boolean; result?: { read: DesignRead } }
      const rd = j.ok && j.result ? j.result.read : null
      if (rd) {
        setRead(rd)
        if (rd.jobType) setJob(rd.jobType)
        if (rd.destinations?.length) setDests(rd.destinations)
        if (rd.message) setHeadline(titleCase(rd.message))
        if (rd.offer) setOffer(rd.offer)
        if (rd.eventDateISO) { setEventDate(rd.eventDateISO); setDetails(fmtLong(rd.eventDateISO)) }
      }
    } catch {
      /* the chips keep the flow alive; the read is a shortcut, never a dependency */
    } finally {
      setReading(false)
      setStep(2)
    }
  }

  const canNext =
    step === 1 ? job != null || described.trim().length >= 8
    : step === 2 ? dests.length > 0 && (!printPicked || (allQtysIn && printer != null))
    : step === 3 ? headline.trim().length > 0
    : step === 4 ? usingOwn || sourcePhotos || noPhotos
    : step === 5 ? due != null && !afterEvent && (!rushEligible || rushConfirmed || false)
    : true

  const upload = (files: FileList | null) => {
    if (!files) return
    for (const f of Array.from(files)) {
      const url = URL.createObjectURL(f)
      const img = new Image()
      img.onload = () => setUploaded((u) => [...u, { id: `up-${u.length}-${f.name}`, url, width: img.naturalWidth, height: img.naturalHeight, label: f.name }])
      img.src = url
    }
  }

  /* The owner's picked photos must actually travel with the request. Uploaded files
   * only exist as local blob: URLs until now — push those bytes through the asset
   * rail; library photos already have real URLs and pass straight through. Best-
   * effort per file: one bad photo must not sink the request. */
  const attachmentsForRequest = async (): Promise<{ url: string; name: string; path?: string }[]> => {
    if (!usingOwn) return []
    const out: { url: string; name: string; path?: string }[] = []
    for (const a of allAssets.filter((x) => picked.includes(x.id)).slice(0, 10)) {
      const name = a.label || 'photo'
      if (!a.url.startsWith('blob:')) { out.push({ url: a.url, name }); continue }
      try {
        const blob = await fetch(a.url).then((r) => r.blob())
        const fd = new FormData()
        fd.append('file', new File([blob], name, { type: blob.type || 'image/jpeg' }))
        const r = await fetch('/api/dashboard/upload-asset', { method: 'POST', body: fd })
        const j = (await r.json().catch(() => ({}))) as { url?: string; path?: string }
        if (r.ok && j.url) out.push({ url: j.url, name, path: j.path })
      } catch { /* skip this file, keep the rest */ }
    }
    return out
  }

  /* Request mode's seal: the finished brief goes to the Request Desk rail as a graphic
   * request. The mapping reuses the desk's validated vocabulary: destinations are the
   * same DESTINATIONS labels, timing folds into the four honest buckets. */
  const sendAsRequest = async () => {
    if (sending) return
    setSending(true)
    setSendError(null)
    const attachments = await attachmentsForRequest()
    const days = due ? Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000) : null
    const when = days == null ? 'No rush' : days <= 7 ? 'This week' : days <= 14 ? 'In 2 weeks' : days <= 31 ? 'This month' : 'No rush'
    const noteBits = [
      printPicked && allQtysIn ? printDestSpecs.map((d) => `${printQtys[d.id]} x ${d.label}`).join(', ') : '',
      printer === 'us' ? 'We print and deliver' : printer === 'client' ? 'Their shop prints' : '',
      noPhotos ? 'Text and brand only' : usingOwn ? 'Using their photos' : sourcePhotos ? 'Find photos for them' : '',
      eventDate ? `Event on ${fmtDay(eventDate)}` : '',
      due ? `In hand by ${fmtDay(due)}` : '',
      rushConfirmed ? 'Rush agreed' : '',
    ].filter(Boolean).join('. ')
    try {
      const r = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          type: 'graphic',
          answers: {
            what: `${jobLabel ?? 'A graphic'}${promoteItem ? ` featuring ${promoteItem}` : ''}`,
            where: dests.map((d) => DESTINATIONS.find((x) => x.id === d)?.label).filter(Boolean).join(', '),
            words: saidText || undefined,
            when,
            notes: noteBits || undefined,
          },
          ...(due ? { due_date: due } : {}),
          ...(attachments.length ? { attachments } : {}),
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string }
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : L['send.error'])
      setSubmitted(true)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : L['send.error'])
    }
    setSending(false)
  }

  const ground = { ...paperGround, minHeight: '100%', padding: '16px 16px 0', fontFamily: DESK.body, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const }

  if (submitted) {
    return (
      <div style={{ ...ground, padding: '44px 22px', textAlign: 'center' }}>
        <DeskKeyframes />
        <BoardKeyframes />
        <div style={{ maxWidth: 300, margin: '0 auto', width: '100%' }}>
          <Artboard jobLabel={jobLabel} headline={headline} details={details} offer={offer} photoUrl={boardPhoto} tag={boardTag} stamped />
        </div>
        <div style={{ fontFamily: DESK.disp, fontSize: 23, fontWeight: 700, color: DESK.ink, letterSpacing: '-0.02em', marginTop: 10 }}>{requestMode ? L['done.title.request'] : L['done.title']}</div>
        <div style={{ fontSize: 13.5, color: DESK.ink2, marginTop: 8, maxWidth: '36ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
          {requestMode ? L['done.sub.request'] : L['done.sub']}
        </div>
        {!requestMode && <div style={{ fontSize: 12, color: DESK.mute, marginTop: 14 }}>{L['done.testmode']}</div>}
      </div>
    )
  }

  return (
    <div style={ground}>
      <DeskKeyframes />
      <BoardKeyframes />
      {/* step 1's exit: back to the store where the cards live (later steps use Back) */}
      {step === 1 && (
        <button
          type="button"
          onClick={() => window.location.assign('/dashboard/campaigns/new?lens=creatives')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '2px 0', marginBottom: 8, cursor: 'pointer', fontFamily: DESK.body, fontSize: 14, fontWeight: 600, color: DESK.ink2 }}
        >
          {'‹'} Store
        </button>
      )}
      {requestMode && (
        <div style={{ background: DESK.mintWash, color: DESK.mintDeep, border: `1px solid ${DESK.mintLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginBottom: 12, lineHeight: 1.4 }}>
          {L['banner.request']}
        </div>
      )}

      {/* the artboard rides every step once the first answer exists */}
      {(step > 1 || job != null) && (
        <Artboard
          jobLabel={jobLabel}
          headline={headline} details={details} offer={offer}
          photoUrl={boardPhoto} tag={boardTag} rush={quote.rush}
          compact={step !== 3 && step !== 6}
        />
      )}

      <div style={{ flex: 1 }}>

        {/* ── 1. what do you need ── */}
        {step === 1 && (
          <>
            <StepHead n={1} title={T.job} sub={S.job} />
            <textarea
              value={described} onChange={(e) => setDescribed(e.target.value)}
              placeholder="A flyer and an Instagram post for our live music night on the 15th, 20% off pitchers…"
              rows={3}
              style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: 1.5, borderRadius: 14 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {DESIGN_JOBS.map((j) => (
                <Chip key={j.id} on={job === j.id} label={j.label} onClick={() => setJob(job === j.id ? null : j.id)} />
              ))}
            </div>
            <button
              type="button" disabled={!canNext || reading} onClick={() => (described.trim().length >= 8 ? describe() : setStep(2))}
              style={{
                width: '100%', height: 50, marginTop: 16, borderRadius: 25, border: 'none',
                cursor: canNext ? 'pointer' : 'default', background: canNext ? DESK.grad : '#E7E4DB',
                color: canNext ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 16, fontWeight: 700,
                boxShadow: canNext ? '0 8px 20px rgba(46,154,120,0.3)' : 'none',
              }}
            >
              {reading ? L['nav.reading'] : L['nav.continue']}
            </button>
          </>
        )}

        {/* the read-back, once */}
        {step === 2 && read && Object.keys(read.cited).length > 0 && (
          <div className="db-pop" style={{ margin: '0 0 16px' }}>
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: DESK.mute, marginBottom: 7 }}>{L['read.prefix']}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {job && read.cited.jobType && <Chip on label={DESIGN_JOBS.find((j) => j.id === job)?.label ?? ''} onClick={() => setStep(1)} />}
              {eventDate && read.cited.eventDate && <Chip on label={`Event: ${fmtDay(eventDate)}`} onClick={() => setStep(5)} />}
              {offer && read.cited.offer && <Chip on label={offer} onClick={() => setStep(3)} />}
              {read.ownPhotos && read.cited.ownPhotos && <Chip on label={L['read.ownphotos']} onClick={() => setStep(4)} />}
            </div>
            {(read.unplaced?.length ?? 0) > 0 && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
                {fill(L['read.unplaced'], { list: read.unplaced!.join(' or ') })}
              </div>
            )}
          </div>
        )}

        {/* ── 2. where is it going: your artwork, cut to every size ── */}
        {step === 2 && (
          <>
            <StepHead n={2} title={T.where} sub={S.where} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
              {DESTINATIONS.map((d) => (
                <DestFrame
                  key={d.id} d={d} on={dests.includes(d.id)}
                  amount={requestMode ? null : destAmount(d.id)} photoUrl={boardPhoto} headline={headline}
                  onClick={() => setDests((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))}
                />
              ))}
            </div>
            {printPicked && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 6 }}>{L['print.qty']}</div>
                <div style={{ display: 'grid', gridTemplateColumns: printDestSpecs.length > 1 ? '1fr 1fr' : '1fr', gap: 8 }}>
                  {printDestSpecs.map((d) => (
                    <div key={d.id}>
                      <div style={{ fontSize: 11.5, color: DESK.mute, fontWeight: 600, marginBottom: 4 }}>{d.label}</div>
                      <input
                        inputMode="numeric" value={printQtys[d.id] ?? ''} aria-label={`${d.label} copies`}
                        onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPrintQtys((prev) => { const next = { ...prev }; if (n) next[d.id] = Number(n); else delete next[d.id]; return next }) }}
                        placeholder={QTY_HINT[d.id] ?? '100'}
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <Ticket on={printer === 'client'} name={L['print.client.label']} sub={L['print.client.sub']} price={requestMode ? undefined : 'Free'} onClick={() => setPrinter('client')} />
                  <Ticket on={printer === 'us'} name={L['print.us.label']} sub={L['print.us.sub']} price={requestMode ? undefined : `$${RATE_CARD.printManagement}`} onClick={() => setPrinter('us')} />
                </div>
              </div>
            )}
          </>
        )}

        {/* ── 3. what should it say: the words ink straight onto the board above ── */}
        {step === 3 && (() => {
          const headlineSugs = [...new Set([
            read?.message ? titleCase(read.message) : null,
            promoteItem,
            job ? JOB_HEADLINES[job] : null,
          ].filter((x): x is string => !!x && x !== headline))].slice(0, 3)
          const detailSugs = eventDate && details !== fmtLong(eventDate) ? [fmtLong(eventDate)] : []
          const slotInput = (v: string, set: (x: string) => void, ph: string, label: string) => (
            <input value={v} onChange={(e) => set(e.target.value)} placeholder={ph} aria-label={label} style={inputStyle} />
          )
          const slotLabel = (t: string, opt?: boolean) => (
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '14px 0 6px' }}>
              {t}{opt ? <span style={{ color: DESK.mute, fontWeight: 500, textTransform: 'none', letterSpacing: 0 }}>{' · '}{L['say.optional']}</span> : ''}
            </div>
          )
          return (
            <>
              <StepHead n={3} title={T.say} sub={S.say} />
              <div style={{ fontSize: 11, color: DESK.mute, marginTop: -8, marginBottom: 4, textAlign: 'center' }}>
                {L['say.caption']}
              </div>

              {slotLabel(L['say.headline'])}
              {slotInput(headline, setHeadline, L['say.headline.ph'], L['say.headline'])}
              {headlineSugs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {headlineSugs.map((h) => <Chip key={h} on={false} label={h} onClick={() => setHeadline(h)} />)}
                </div>
              )}

              {slotLabel(L['say.details'], true)}
              {slotInput(details, setDetails, eventDate ? fmtLong(eventDate) : L['say.details.ph'], L['say.details'])}
              {detailSugs.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                  {detailSugs.map((d) => <Chip key={d} on={false} label={d} onClick={() => setDetails(d)} />)}
                </div>
              )}

              {slotLabel(L['say.deal'], true)}
              {slotInput(offer, setOffer, L['say.deal.ph'], L['say.deal'])}

              {menu.length > 0 && (
                <>
                  {slotLabel(L['say.featuring'], true)}
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {menu.slice(0, 8).map((m) => (
                      <Chip key={m.id} on={promoteItem === m.name} label={m.name} onClick={() => setPromoteItem(promoteItem === m.name ? null : m.name)} />
                    ))}
                  </div>
                </>
              )}

              <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 14, lineHeight: 1.45 }}>
                {L['say.note']}
              </div>
            </>
          )
        })()}

        {/* ── 4. photos: the picked shot paints the board ── */}
        {step === 4 && (
          <>
            <StepHead n={4} title={T.photos} sub={S.photos} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {allAssets.map((a) => {
                const ok = passesQualityGate(a)
                const on = picked.includes(a.id)
                return (
                  <button
                    key={a.id} type="button" disabled={!ok}
                    onClick={() => { setSourcePhotos(false); setNoPhotos(false); setPicked((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id])) }}
                    style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', cursor: ok ? 'pointer' : 'default', border: `2px solid ${on ? DESK.mint : 'transparent'}`, padding: 0, background: '#E7E4DB', opacity: ok ? 1 : 0.45, boxShadow: on ? '0 4px 12px rgba(46,154,120,0.3)' : '0 1px 3px rgba(22,33,28,0.08)', transform: on ? 'translateY(-2px)' : undefined, transition: 'transform .18s ease, box-shadow .18s ease' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.label ?? 'photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {!ok && <span style={{ position: 'absolute', left: 4, bottom: 4, right: 4, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(22,33,28,0.6)', borderRadius: 6, padding: '2px 4px' }}>{L['photos.gate']}</span>}
                    {on && <span style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 99, background: DESK.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} strokeWidth={3.4} /></span>}
                  </button>
                )
              })}
              <label style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${DESK.mute}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: DESK.ink2, cursor: 'pointer', background: DESK.card }}>
                {L['photos.upload']}
                <input type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>
            {usable.length === 0 && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '10px 13px', fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
                {fill(L['photos.empty'], { price: String(RATE_CARD.photoSourcing) })}
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <Ticket on={noPhotos} name={L['photos.none.label']} sub={L['photos.none.sub']} price={requestMode ? undefined : '$0'}
                onClick={() => { setNoPhotos(!noPhotos); setSourcePhotos(false); setPicked([]) }} />
              <Ticket on={sourcePhotos} name={requestMode ? L['photos.source.label.request'] : fill(L['photos.source.label'], { price: String(RATE_CARD.photoSourcing) })} sub={L['photos.source.sub']} price={requestMode ? undefined : `$${RATE_CARD.photoSourcing}`}
                onClick={() => { setSourcePhotos(!sourcePhotos); setNoPhotos(false); setPicked([]) }} />
            </div>
          </>
        )}

        {/* ── 5. when: the date sticks onto the board as a tape tag ── */}
        {step === 5 && (
          <>
            <StepHead
              n={5}
              title={eventDate ? T['when.event'] : T.when}
              sub={eventDate ? fill(S['when.event'], { date: fmtDay(eventDate) }) : fill(S.when, { date: fmtDay(standardDelivery) })}
            />
            {read?.rushLanguage && !due && (
              <div style={{ fontSize: 12.5, color: DESK.amber, fontWeight: 600, marginBottom: 10 }}>
                {fill(L['when.rushnote'], { date: fmtDay(standardDelivery) })}
              </div>
            )}
            <WalkCalendar
              goal="more-new"
              value={due ?? undefined}
              hintMonth={eventDate ? eventDate.slice(0, 7) : read?.monthHint}
              classify={(day, t) =>
                eventDate && day > eventDate ? 'too-soon' : rushApplies(day, t, RATE_CARD.rushWindowHours) ? 'tight' : 'ok'
              }
              tagLine={eventDate ? L['when.tag.event'] : L['when.tag']}
              onChange={(day) => { setDue(day); setRushConfirmed(false) }}
            />
            {afterEvent && (
              <div style={{ background: DESK.amberWash, border: `1px solid ${DESK.amberLine}`, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
                <div style={{ fontSize: 13, color: DESK.amber, fontWeight: 600, lineHeight: 1.5 }}>
                  {fill(L['when.after'], { picked: fmtDay(due!), event: fmtDay(eventDate!) })}
                </div>
              </div>
            )}
            {suggestedDue && !due && suggestedDue > today && (
              <button
                type="button" onClick={() => { setDue(suggestedDue); setRushConfirmed(false) }}
                style={{ width: '100%', marginTop: 12, height: 44, borderRadius: 22, border: `1.5px solid ${DESK.mint}`, background: DESK.mintWash, color: DESK.mintDeep, fontFamily: DESK.body, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {fill(L['when.suggest'], { date: fmtDay(suggestedDue) })}
              </button>
            )}
            {due && rushEligible && !rushConfirmed && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 13, color: DESK.amber, fontWeight: 600, lineHeight: 1.5, marginBottom: 8 }}>
                  {fill(L['when.rush.q'], { date: fmtDay(due), days: String(Math.round(RATE_CARD.rushWindowHours / 24)) })}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <Ticket
                    name={requestMode ? fill(L['when.rush.label.request'], { date: fmtDay(due) }) : fill(L['when.rush.label'], { date: fmtDay(due), delta: String(rushDelta) })}
                    sub={requestMode ? L['when.rush.sub.request'] : fill(L['when.rush.sub'], { total: String(quote.total + rushDelta) })}
                    price={requestMode ? undefined : `+$${rushDelta}`}
                    onClick={() => setRushConfirmed(true)}
                  />
                  <Ticket
                    name={L['when.norush.label']}
                    sub={requestMode ? fill(L['when.norush.sub.request'], { date: fmtDay(standardDelivery) }) : fill(L['when.norush.sub'], { date: fmtDay(standardDelivery), total: String(quote.total) })}
                    price={requestMode ? undefined : '$0'}
                    onClick={() => { setDue(standardDelivery); setRushConfirmed(false) }}
                  />
                </div>
              </div>
            )}
            {due && rushEligible && rushConfirmed && (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DESK.amberWash, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', marginTop: 12 }}>
                <span style={{ fontSize: 12.5, color: DESK.amber, fontWeight: 600 }}>{fill(L['when.rushon'], { date: fmtDay(due) })}</span>
                <button type="button" onClick={() => { setDue(standardDelivery); setRushConfirmed(false) }}
                  style={{ border: 'none', background: 'none', color: DESK.amber, fontFamily: DESK.body, fontSize: 12.5, fontWeight: 700, textDecoration: 'underline', cursor: 'pointer', padding: 0 }}>
                  Undo
                </button>
              </div>
            )}
          </>
        )}

        {/* ── 6. review: the brief under the board, sealed by hand ── */}
        {step === 6 && (
          <>
            <StepHead n={6} title={T.review} sub={S.review} />
            <div className="db-pop" style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '14px 16px', fontSize: 13.5, color: DESK.ink, lineHeight: 1.6, boxShadow: '0 2px 8px rgba(22,33,28,0.05)' }}>
              {(() => { const n = job && job !== 'other' ? `${DESIGN_JOBS.find((j) => j.id === job)?.label.toLowerCase()} design` : 'design'; return `${/^[aeiou]/.test(n) ? 'An' : 'A'} ${n}` })()}
              {promoteItem ? ` featuring ${promoteItem}` : ''} saying &ldquo;{saidText}&rdquo; for{' '}
              {dests.map((d) => DESTINATIONS.find((x) => x.id === d)?.label.toLowerCase()).join(', ')}
              {printPicked && allQtysIn ? ` (${printDestSpecs.map((d) => `${printQtys[d.id]} x ${d.label.toLowerCase()}`).join(', ')}, ${printer === 'us' ? 'we print' : 'your shop prints'})` : ''}
              {noPhotos ? ', text and brand only' : usingOwn ? ', using your photos' : ', with sourced photos'}
              {due ? `, in hand by ${fmtDay(due)}` : ''}
              {eventDate ? ` for your ${fmtDay(eventDate)} event` : ''}.
            </div>
            <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 10, lineHeight: 1.5 }}>
              {fill(L['review.revisions'], { n: String(RATE_CARD.includedRevisions), next: String(RATE_CARD.includedRevisions + 1) })}
            </div>
            <div style={{ margin: '14px 0 4px' }}>
              <ReceiptFrame>
                {requestMode ? (
                  <>
                    <ReceiptRow label={L['receipt.request.label']} amount="$0" />
                    <ReceiptRule />
                    <div style={{ fontSize: 12.5, color: DESK.ink2, lineHeight: 1.5 }}>{L['receipt.request.note']}</div>
                  </>
                ) : (
                  <>
                    {quote.lines.map((l) => <ReceiptRow key={l.id} label={l.label} amount={l.amount === 0 ? '$0' : `$${l.amount}`} you={l.amount === 0} />)}
                    <ReceiptRule />
                    <ReceiptTotal label={L['panel.total']} big={`$${quote.total}`} />
                  </>
                )}
              </ReceiptFrame>
            </div>
            {sendError && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.45 }}>
                {sendError}
              </div>
            )}
            <SealButton
              label={sending ? 'Sending...' : requestMode ? L['seal.label.request'] : L['seal.label']}
              disabled={sending}
              onSealed={() => { if (requestMode) { void sendAsRequest() } else { setSubmitted(true) } }}
            />
            <div style={{ height: 18 }} />
          </>
        )}

        {/* back / next */}
        {step > 1 && step < 6 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            <button type="button" onClick={() => setStep(step - 1)}
              style={{ flexShrink: 0, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink, fontFamily: DESK.body, fontSize: 14.5, fontWeight: 600 }}>
              {L['nav.back']}
            </button>
            <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}
              style={{ flex: 1, height: 50, borderRadius: 25, border: 'none', cursor: canNext ? 'pointer' : 'default', background: canNext ? DESK.grad : '#E7E4DB', color: canNext ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, boxShadow: canNext ? '0 8px 20px rgba(46,154,120,0.3)' : 'none' }}>
              {L['nav.next']}
            </button>
          </div>
        )}
      </div>

      {/* ── the running receipt: pinned, cited, live (order mode only; a request has no
            numbers to run) ── */}
      {!requestMode && step > 1 && step < 6 && (
        <div style={{ position: 'sticky', bottom: 0, margin: '0 -16px 0', zIndex: 3 }}>
          {panelOpen ? (
            <div onClick={() => setPanelOpen(false)} style={{ cursor: 'pointer', padding: '0 10px' }}>
              <ReceiptFrame style={{ boxShadow: '0 -8px 28px rgba(22,33,28,0.12)' }}>
                {quote.lines.map((l) => (
                  <div key={l.id}>
                    <ReceiptRow label={l.label} amount={l.amount === 0 ? '$0' : `$${l.amount}`} you={l.amount === 0} />
                    <div style={{ fontSize: 10.5, color: DESK.mute, marginTop: -3, paddingBottom: 4 }}>{l.why}</div>
                  </div>
                ))}
                {quote.passThroughNote && <div style={{ fontSize: 11, color: DESK.mute, paddingTop: 4 }}>{quote.passThroughNote}</div>}
                <ReceiptRule />
                <ReceiptTotal label={L['panel.total']} big={`$${quote.total}`} />
                <div style={{ fontSize: 10.5, color: DESK.mute, marginTop: 2 }}>{fill(L['panel.revisions'], { n: String(quote.includedRevisions) })}</div>
              </ReceiptFrame>
            </div>
          ) : (
            <button type="button" onClick={() => setPanelOpen(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DESK.card, border: 'none', borderTop: `1px solid ${DESK.line}`, borderRadius: '16px 16px 0 0', padding: '13px 20px', cursor: 'pointer', boxShadow: '0 -6px 20px rgba(22,33,28,0.08)', fontFamily: DESK.body }}>
              <span style={{ fontFamily: DESK.mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute }}>{L['panel.sofar']}</span>
              <span style={{ fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, color: DESK.mintDeep, fontVariantNumeric: 'tabular-nums' }}>${quote.total}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
