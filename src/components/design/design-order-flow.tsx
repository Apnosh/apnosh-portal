/**
 * THE DESIGN ORDER FLOW — a configurator, not a form (DESIGN-ORDERING spec, Phase B).
 *
 * Six steps in the walk's own language: describe + job chips, destinations, exact copy,
 * assets, the date, review. The price panel rides the bottom the whole way, every line citing
 * the answer that created it, and reprices live on every change (the pure engine).
 *
 * THE PLACEHOLDER GATE: while RATE_CARD.approved is false, an amber banner marks every price
 * as a test number. This surface must not be linked for clients until the reviewed rate card
 * lands and flips the flag.
 *
 * Built from the campaign walk's parts on purpose: the Apple-clean plate, the describe-read
 * (shared evidence laws via /api/design/describe), WalkCalendar with a rush classifier,
 * read-back chips. No parallel implementations.
 */
'use client'

import { useState } from 'react'
import { Check, ArrowRight } from 'lucide-react'
import WalkCalendar from '@/components/campaigns/monthly/walk-calendar'
import { DESTINATIONS, type DestinationId } from '@/lib/design/destinations'
import { RATE_CARD } from '@/lib/design/rate-card'
import { priceDesignOrder, productionBufferDays, rushApplies, type DesignOrderAnswers, type DesignFact } from '@/lib/design/design-pricing'
import { DESIGN_JOBS, type DesignJobId, type DesignRead } from '@/lib/design/design-read'

const APPLE = "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', system-ui, sans-serif"
const INK = '#1D1D1F'
const MUTE = '#6E6E73'
const FAINT = '#86868B'
const MINT = '#4ABD98'
const MINT_DK = '#2E9A78'
const MINT_SOFT = '#F0FAF6'
const HAIR = 'rgba(0,0,0,0.08)'
const AMBER = '#B77A1E'
const AMBER_SOFT = '#FBF3E4'

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
const todayISO = () => new Date().toISOString().slice(0, 10)
const addDays = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

function Plate({ n, title, sub, children }: { n: number; title: string; sub: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 34 }}>
      <div style={{ fontFamily: APPLE, fontSize: 11, fontWeight: 600, letterSpacing: '.09em', color: '#AEAEB2', marginBottom: 8 }}>{n} OF 6</div>
      <h2 style={{ fontFamily: APPLE, fontSize: 25, fontWeight: 700, color: INK, lineHeight: 1.15, margin: '0 0 6px', letterSpacing: '-0.022em' }}>{title}</h2>
      <p style={{ fontFamily: APPLE, fontSize: 14, color: MUTE, lineHeight: 1.5, margin: '0 0 20px', maxWidth: '34ch' }}>{sub}</p>
      {children}
    </section>
  )
}

function Chip({ on, label, onClick, dashed }: { on: boolean; label: string; onClick: () => void; dashed?: boolean }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        cursor: 'pointer', background: on ? MINT_SOFT : '#fff',
        border: `1.5px ${dashed ? 'dashed' : 'solid'} ${on ? MINT : HAIR}`, borderRadius: 99,
        padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: on ? MINT_DK : INK, fontFamily: APPLE,
      }}
    >
      {label}
    </button>
  )
}

function CardBtn({ on, label, sub, onClick }: { on: boolean; label: string; sub?: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        position: 'relative', width: '100%', textAlign: 'left', cursor: 'pointer',
        border: `1.5px solid ${on ? MINT : 'rgba(0,0,0,0.07)'}`, background: on ? MINT_SOFT : '#fff',
        borderRadius: 16, padding: '12px 13px', fontFamily: APPLE, boxShadow: on ? 'none' : '0 1px 2px rgba(0,0,0,0.03)',
      }}
    >
      <span style={{ display: 'block', fontSize: 13.5, fontWeight: on ? 700 : 600, color: on ? MINT_DK : INK }}>{label}</span>
      {sub && <span style={{ display: 'block', fontSize: 11.5, color: on ? MINT_DK : MUTE, marginTop: 3, lineHeight: 1.4 }}>{sub}</span>}
      {on && (
        <span style={{ position: 'absolute', top: 11, right: 11, width: 18, height: 18, borderRadius: 99, background: MINT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Check size={11} strokeWidth={3.4} />
        </span>
      )}
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
  const [printQty, setPrintQty] = useState<number | null>(null)
  const [printer, setPrinter] = useState<'client' | 'us' | null>(null)
  const [message, setMessage] = useState('')
  const [offer, setOffer] = useState('')
  const [promoteItem, setPromoteItem] = useState<string | null>(null)
  const [exactText, setExactText] = useState('')
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

  const src = (k: keyof DesignRead['cited']): DesignFact<never>['source'] => (read?.cited[k] ? 'read' : 'asked')
  const allAssets = [...assets, ...uploaded]
  const usable = allAssets.filter(passesQualityGate)
  const usingOwn = picked.length > 0 && !sourcePhotos && !noPhotos
  const printPicked = dests.some((d) => DESTINATIONS.find((x) => x.id === d)?.kind === 'print')
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
    ...(printQty != null ? { printQty: { value: printQty, source: 'asked' as const } } : {}),
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
        if (rd.message) { setMessage(rd.message); setExactText(rd.message + (rd.offer ? `. ${rd.offer}` : '')) }
        if (rd.offer) setOffer(rd.offer)
        if (rd.eventDateISO) setEventDate(rd.eventDateISO)
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
    : step === 2 ? dests.length > 0 && (!printPicked || (printQty != null && printer != null))
    : step === 3 ? exactText.trim().length > 0
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

  if (submitted) {
    return (
      <div style={{ background: '#F5F5F7', minHeight: '100%', padding: '48px 18px', fontFamily: APPLE, textAlign: 'center' }}>
        <div style={{ width: 52, height: 52, borderRadius: 99, background: MINT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Check size={26} strokeWidth={3} />
        </div>
        <div style={{ fontSize: 22, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>Order recorded</div>
        <div style={{ fontSize: 13.5, color: MUTE, marginTop: 8, maxWidth: '36ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.5 }}>
          This exact order becomes the brief your designer works from. Nothing gets re-interpreted.
        </div>
        <div style={{ fontSize: 12, color: FAINT, marginTop: 14 }}>Test mode: no payment was taken.</div>
      </div>
    )
  }

  return (
    <div style={{ background: '#F5F5F7', minHeight: '100%', padding: '18px 14px 0', fontFamily: APPLE, boxSizing: 'border-box', display: 'flex', flexDirection: 'column' }}>
      {!RATE_CARD.approved && (
        <div style={{ background: AMBER_SOFT, color: AMBER, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginBottom: 14, lineHeight: 1.4 }}>
          Test prices. The real rate card is not set yet, so these numbers are placeholders.
        </div>
      )}
      <div style={{ flex: 1 }}>

        {/* ── 1. what do you need ── */}
        {step === 1 && (
          <Plate n={1} title="What do you need made?" sub="Say it your way, or tap a job. We work out the rest.">
            <textarea
              value={described} onChange={(e) => setDescribed(e.target.value)}
              placeholder="A flyer and an Instagram post for our live music night on the 15th, 20% off pitchers…"
              rows={3}
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', resize: 'none', border: '1.5px solid rgba(0,0,0,0.10)', borderRadius: 14, background: '#fff', outline: 'none', fontFamily: APPLE, fontSize: 14.5, color: INK, lineHeight: 1.5 }}
            />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
              {DESIGN_JOBS.map((j) => (
                <Chip key={j.id} on={job === j.id} label={j.label} onClick={() => setJob(job === j.id ? null : j.id)} />
              ))}
            </div>
            <button
              type="button" disabled={!canNext || reading} onClick={() => (described.trim().length >= 8 ? describe() : setStep(2))}
              style={{ width: '100%', height: 50, marginTop: 16, borderRadius: 25, border: 'none', cursor: canNext ? 'pointer' : 'default', background: canNext ? MINT : '#E8E8ED', color: canNext ? '#fff' : '#AEAEB2', fontFamily: APPLE, fontSize: 16, fontWeight: 600 }}
            >
              {reading ? 'Reading…' : 'Continue'}
            </button>
          </Plate>
        )}

        {/* the read-back, once */}
        {step === 2 && read && Object.keys(read.cited).length > 0 && (
          <div style={{ margin: '0 0 18px' }}>
            <div style={{ fontSize: 12, color: FAINT, marginBottom: 7 }}>From what you wrote:</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {job && read.cited.jobType && <Chip on label={DESIGN_JOBS.find((j) => j.id === job)?.label ?? ''} onClick={() => setStep(1)} />}
              {eventDate && read.cited.eventDate && <Chip on label={`Event: ${fmtDay(eventDate)}`} onClick={() => setStep(5)} />}
              {offer && read.cited.offer && <Chip on label={offer} onClick={() => setStep(3)} />}
              {read.ownPhotos && read.cited.ownPhotos && <Chip on label="Your own photos" onClick={() => setStep(4)} />}
            </div>
            {(read.unplaced?.length ?? 0) > 0 && (
              <div style={{ background: AMBER_SOFT, color: AMBER, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
                We cannot make {read.unplaced!.join(' or ')} here yet, so it is not in this order. Message us and we will sort it out.
              </div>
            )}
          </div>
        )}

        {/* ── 2. where is it going ── */}
        {step === 2 && (
          <Plate n={2} title="Where is it going?" sub="Each place gets its own correctly sized version.">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {DESTINATIONS.map((d) => (
                <Chip key={d.id} on={dests.includes(d.id)} label={d.label}
                  onClick={() => setDests((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))} />
              ))}
            </div>
            {printPicked && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTE, marginBottom: 6 }}>How many copies?</div>
                <input
                  inputMode="numeric" value={printQty ?? ''} aria-label="How many copies"
                  onChange={(e) => { const n = e.target.value.replace(/[^0-9]/g, ''); setPrintQty(n ? Number(n) : null) }}
                  placeholder="200"
                  style={{ width: '100%', boxSizing: 'border-box', height: 46, padding: '0 13px', border: '1.5px solid rgba(0,0,0,0.10)', borderRadius: 13, background: '#fff', outline: 'none', fontFamily: APPLE, fontSize: 15, color: INK }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                  <CardBtn on={printer === 'client'} label="My print shop prints it" sub="We hand you print-ready files" onClick={() => setPrinter('client')} />
                  <CardBtn on={printer === 'us'} label="Handle the printing for me" sub="We run the job. Printing is billed at cost, and you see the receipt." onClick={() => setPrinter('us')} />
                </div>
              </div>
            )}
          </Plate>
        )}

        {/* ── 3. what should it say ── */}
        {step === 3 && (
          <Plate n={3} title="What should it say?" sub="We design what you approve here.">
            {menu.length > 0 && (
              <>
                <div style={{ fontSize: 12, fontWeight: 600, color: MUTE, marginBottom: 6 }}>Featuring, from your menu. Optional.</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 12 }}>
                  {menu.slice(0, 8).map((m) => (
                    <Chip key={m.id} on={promoteItem === m.name} label={m.name} onClick={() => setPromoteItem(promoteItem === m.name ? null : m.name)} />
                  ))}
                </div>
              </>
            )}
            <div style={{ fontSize: 12, fontWeight: 600, color: MUTE, marginBottom: 6 }}>The exact text</div>
            <textarea
              value={exactText} onChange={(e) => setExactText(e.target.value)} rows={3} aria-label="The exact text"
              placeholder="Live Music Friday. 20% off pitchers, 8pm till late."
              style={{ width: '100%', boxSizing: 'border-box', padding: '12px 14px', resize: 'none', border: '1.5px solid rgba(0,0,0,0.10)', borderRadius: 14, background: '#fff', outline: 'none', fontFamily: APPLE, fontSize: 14.5, color: INK, lineHeight: 1.5 }}
            />
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 7, lineHeight: 1.45 }}>
              Text changes after design starts count as a revision.
            </div>
          </Plate>
        )}

        {/* ── 4. photos ── */}
        {step === 4 && (
          <Plate n={4} title="Which photos?" sub="Yours are free. Tap to use them.">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {allAssets.map((a) => {
                const ok = passesQualityGate(a)
                const on = picked.includes(a.id)
                return (
                  <button
                    key={a.id} type="button" disabled={!ok}
                    onClick={() => { setSourcePhotos(false); setNoPhotos(false); setPicked((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id])) }}
                    style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', cursor: ok ? 'pointer' : 'default', border: `2px solid ${on ? MINT : 'transparent'}`, padding: 0, background: '#E8E8ED', opacity: ok ? 1 : 0.45 }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.label ?? 'photo'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {!ok && <span style={{ position: 'absolute', left: 4, bottom: 4, right: 4, fontSize: 9, fontWeight: 700, color: '#fff', background: 'rgba(0,0,0,0.55)', borderRadius: 6, padding: '2px 4px' }}>Too small to look sharp</span>}
                    {on && <span style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 99, background: MINT, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} strokeWidth={3.4} /></span>}
                  </button>
                )
              })}
              <label style={{ aspectRatio: '1', borderRadius: 12, border: '1.5px dashed rgba(0,0,0,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: MUTE, cursor: 'pointer', background: '#fff' }}>
                Upload
                <input type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>
            {usable.length === 0 && (
              <div style={{ background: AMBER_SOFT, color: AMBER, borderRadius: 12, padding: '10px 13px', fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
                Nothing here is sharp enough to design with. We can source photos for ${RATE_CARD.photoSourcing}.
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              <CardBtn
                on={noPhotos}
                label="No photos needed. $0"
                sub="Text and your brand only"
                onClick={() => { setNoPhotos(!noPhotos); setSourcePhotos(false); setPicked([]) }}
              />
              <CardBtn
                on={sourcePhotos}
                label={`Source photos for me. $${RATE_CARD.photoSourcing}`}
                sub="We find or license the shots"
                onClick={() => { setSourcePhotos(!sourcePhotos); setNoPhotos(false); setPicked([]) }}
              />
            </div>
          </Plate>
        )}

        {/* ── 5. when ── */}
        {step === 5 && (
          <Plate
            n={5}
            title={eventDate ? 'When do you need it in hand?' : 'When do you need it?'}
            sub={eventDate ? `Your event is ${fmtDay(eventDate)}. The design should be working before that.` : `Standard turnaround delivers by ${fmtDay(standardDelivery)}.`}
          >
            {read?.rushLanguage && !due && (
              <div style={{ fontSize: 12.5, color: AMBER, fontWeight: 600, marginBottom: 10 }}>
                You mentioned needing this fast. The first day without a rush charge is {fmtDay(standardDelivery)}.
              </div>
            )}
            <WalkCalendar
              goal="more-new"
              value={due ?? undefined}
              hintMonth={eventDate ? eventDate.slice(0, 7) : read?.monthHint}
              classify={(day, t) =>
                eventDate && day > eventDate ? 'too-soon' : rushApplies(day, t, RATE_CARD.rushWindowHours) ? 'tight' : 'ok'
              }
              tagLine={eventDate ? 'Amber days are a rush. Days after your event are off.' : 'Amber days are a rush. Standard days cost nothing extra.'}
              onChange={(day) => { setDue(day); setRushConfirmed(false) }}
            />
            {afterEvent && (
              <div style={{ background: AMBER_SOFT, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
                <div style={{ fontSize: 13, color: AMBER, fontWeight: 600, lineHeight: 1.5 }}>
                  {fmtDay(due!)} is after your {fmtDay(eventDate!)} event. The design would arrive too late to work. Pick a day before it.
                </div>
              </div>
            )}
            {suggestedDue && !due && suggestedDue > today && (
              <button
                type="button" onClick={() => { setDue(suggestedDue); setRushConfirmed(false) }}
                style={{ width: '100%', marginTop: 12, height: 44, borderRadius: 22, border: `1.5px solid ${MINT}`, background: MINT_SOFT, color: MINT_DK, fontFamily: APPLE, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}
              >
                {fmtDay(suggestedDue)}, three days before your event
              </button>
            )}
            {due && rushEligible && !rushConfirmed && (
              <div style={{ background: AMBER_SOFT, borderRadius: 14, padding: '12px 14px', marginTop: 12 }}>
                <div style={{ fontSize: 13, color: AMBER, fontWeight: 600, lineHeight: 1.5 }}>
                  Standard turnaround would deliver {fmtDay(standardDelivery)}. Okay, or is {fmtDay(due)} firm?
                </div>
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <button type="button" onClick={() => { setDue(standardDelivery); setRushConfirmed(false) }}
                    style={{ flex: 1, height: 40, borderRadius: 20, border: '1px solid rgba(0,0,0,0.10)', background: '#fff', fontFamily: APPLE, fontSize: 13, fontWeight: 600, color: INK, cursor: 'pointer' }}>
                    {fmtDay(standardDelivery)} works
                  </button>
                  <button type="button" onClick={() => setRushConfirmed(true)}
                    style={{ flex: 1, height: 40, borderRadius: 20, border: 'none', background: AMBER, color: '#fff', fontFamily: APPLE, fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    {fmtDay(due)} is firm
                  </button>
                </div>
              </div>
            )}
          </Plate>
        )}

        {/* ── 6. review ── */}
        {step === 6 && (
          <Plate n={6} title="Look right?" sub="This exact order becomes the designer's brief.">
            <div style={{ background: '#fff', border: `0.5px solid ${HAIR}`, borderRadius: 16, padding: '14px 16px', fontSize: 13.5, color: INK, lineHeight: 1.6 }}>
              {(() => { const n = job && job !== 'other' ? `${DESIGN_JOBS.find((j) => j.id === job)?.label.toLowerCase()} design` : 'design'; return `${/^[aeiou]/.test(n) ? 'An' : 'A'} ${n}` })()}
              {promoteItem ? ` featuring ${promoteItem}` : ''} saying &ldquo;{exactText.trim()}&rdquo; for{' '}
              {dests.map((d) => DESTINATIONS.find((x) => x.id === d)?.label.toLowerCase()).join(', ')}
              {printPicked && printQty ? ` (${printQty} copies, ${printer === 'us' ? 'we print' : 'your shop prints'})` : ''}
              {noPhotos ? ', text and brand only' : usingOwn ? ', using your photos' : ', with sourced photos'}
              {due ? `, in hand by ${fmtDay(due)}` : ''}
              {eventDate ? ` for your ${fmtDay(eventDate)} event` : ''}.
            </div>
            <div style={{ fontSize: 11.5, color: FAINT, marginTop: 10, lineHeight: 1.5 }}>
              {RATE_CARD.includedRevisions} revision rounds included. Round {RATE_CARD.includedRevisions + 1}+ is billed. A change to the message, offer, or destinations is a new order, not a revision.
            </div>
            <button
              type="button" onClick={() => setSubmitted(true)}
              style={{ width: '100%', height: 50, marginTop: 16, borderRadius: 25, border: 'none', cursor: 'pointer', background: MINT, color: '#fff', fontFamily: APPLE, fontSize: 16, fontWeight: 600 }}
            >
              Submit order · ${quote.total}
            </button>
          </Plate>
        )}

        {/* back / next */}
        {step > 1 && step < 6 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 4, marginBottom: 24 }}>
            <button type="button" onClick={() => setStep(step - 1)}
              style={{ flexShrink: 0, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer', border: '1px solid rgba(0,0,0,0.10)', background: '#fff', color: INK, fontFamily: APPLE, fontSize: 14.5, fontWeight: 600 }}>
              Back
            </button>
            <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}
              style={{ flex: 1, height: 50, borderRadius: 25, border: 'none', cursor: canNext ? 'pointer' : 'default', background: canNext ? MINT : '#E8E8ED', color: canNext ? '#fff' : '#AEAEB2', fontFamily: APPLE, fontSize: 16, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
              Next <ArrowRight size={17} />
            </button>
          </div>
        )}
      </div>

      {/* ── the price panel: pinned, cited, live ── */}
      {step > 1 && (
        <div style={{ position: 'sticky', bottom: 0, margin: '0 -14px 0', zIndex: 3 }}>
          {panelOpen ? (
            <div onClick={() => setPanelOpen(false)} style={{ cursor: 'pointer', background: '#fff', borderTop: `0.5px solid ${HAIR}`, borderRadius: '16px 16px 0 0', padding: '14px 20px 16px', boxShadow: '0 -4px 16px rgba(0,0,0,0.05)' }}>
              {quote.lines.map((l) => (
                <div key={l.id} style={{ padding: '7px 0', borderBottom: `0.5px solid ${HAIR}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: INK }}>{l.label}</span>
                    <span style={{ fontSize: 13, fontWeight: 700, color: l.amount === 0 ? MINT_DK : INK, fontVariantNumeric: 'tabular-nums' }}>{l.amount === 0 ? '$0' : `$${l.amount}`}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUTE, marginTop: 1 }}>{l.why}</div>
                </div>
              ))}
              {quote.passThroughNote && <div style={{ fontSize: 11, color: FAINT, paddingTop: 8 }}>{quote.passThroughNote}</div>}
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 10 }}>
                <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>Total</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, color: INK, fontVariantNumeric: 'tabular-nums' }}>${quote.total}</span>
              </div>
              <div style={{ fontSize: 10.5, color: FAINT, marginTop: 2 }}>Includes {quote.includedRevisions} revision rounds.</div>
            </div>
          ) : (
            <button type="button" onClick={() => setPanelOpen(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', border: 'none', borderTop: `0.5px solid ${HAIR}`, borderRadius: '16px 16px 0 0', padding: '13px 20px', cursor: 'pointer', boxShadow: '0 -4px 16px rgba(0,0,0,0.05)', fontFamily: APPLE }}>
              <span style={{ fontSize: 12.5, fontWeight: 600, color: MUTE }}>Your price so far</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: MINT_DK, fontVariantNumeric: 'tabular-nums' }}>${quote.total}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
