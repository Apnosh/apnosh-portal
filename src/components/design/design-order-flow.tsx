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

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import WalkCalendar from '@/components/campaigns/monthly/walk-calendar'
import { DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule, ReceiptTotal, ConfirmButton } from '@/components/campaigns/desk/ui'
import { DESTINATIONS, PRINT_AVAILABLE, PRINT_OFF_MESSAGE, type DestinationId, type DestinationSpec } from '@/lib/design/destinations'
import { RATE_CARD } from '@/lib/design/rate-card'
import { priceDesignOrder, productionBufferDays, rushApplies, type DesignOrderAnswers, type DesignFact } from '@/lib/design/design-pricing'
import { DESIGN_JOBS, type DesignJobId, type DesignRead } from '@/lib/design/design-read'
import { TIER_SPECS, specLine, specBullets } from '@/lib/design/tier-specs'
import { DESIGN_TITLES, DESIGN_SUBS, DESIGN_LINES, fill } from '@/lib/design/design-copy'

/* Shorthands: every owner-facing string lives in the question bank (design-copy.ts), same
 * pattern and lint as the campaign walk. Nothing user-visible is authored inline here. */
const T = DESIGN_TITLES
const S = DESIGN_SUBS
const L = DESIGN_LINES

export interface DesignAsset {
  id: string
  url: string
  /** 0x0 = size unknown at read time; the flow measures it in the browser before the
   *  quality gate judges it (client-photos.ts feeds menu photos this way) */
  width: number
  height: number
  label?: string
  /** where it came from: the owner's Photos & files library, or a menu item's dish photo */
  kind?: 'library' | 'menu'
}

/** The upload quality gate: honest and simple. Small images fail loudly, never silently. */
export const passesQualityGate = (a: { width: number; height: number }) => Math.min(a.width, a.height) >= 1000

const fmtDay = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'long', day: 'numeric' })
const fmtLong = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())
/** "a" / "a and b" / "a, b and c" — how an owner would say a list out loud. */
const sayList = (xs: string[]): string =>
  xs.length <= 1 ? (xs[0] ?? '') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`

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

/* ── the artboard: the graphic, alive on the desk, changed only by answers ─────────────────
 * Composed like a real flyer proof, not a text card: corner crop marks (a proof on the
 * drafting table), an eyebrow held by side rules, the display headline over a short mint
 * rule, the offer as the one loud element, and the business name as a small-caps footer
 * under a hairline. The photo is graded (slight saturate + a bottom-weighted scrim) so
 * white type always reads; with no photo the ground is a deep ink gradient with a quiet
 * mint glow behind the words. */
function Artboard({ jobLabel, headline, details, offer, photoUrl, businessName, tag, rush, stamped, compact }: {
  jobLabel?: string | null
  headline: string
  details: string
  offer: string
  photoUrl?: string | null
  /** the small-caps footer line, like a real flyer signs itself */
  businessName?: string | null
  /** the masking-tape date tag ("In hand September 9") */
  tag?: string | null
  rush?: boolean
  /** the ORDERED stamp, after the seal */
  stamped?: boolean
  compact?: boolean
}) {
  const hasWords = !!(headline || details || offer)
  const cropMark = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 10, height: 10, zIndex: 2, opacity: 0.4, ...pos,
  })
  return (
    <div style={{ position: 'relative', padding: '10px 4px 2px', marginBottom: 14 }}>
      {/* the pin */}
      <span aria-hidden style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: DESK.grad, boxShadow: '0 2px 5px rgba(22,33,28,0.35), inset 0 1px 2px rgba(255,255,255,0.5)', zIndex: 4 }} />
      <div style={{
        position: 'relative', transform: 'rotate(-1.1deg)', borderRadius: 8, overflow: 'hidden',
        background: photoUrl ? '#16211C' : 'linear-gradient(148deg, #22312A 0%, #16211C 52%, #101A15 100%)',
        minHeight: compact ? 122 : 168,
        boxShadow: '0 14px 30px rgba(22,33,28,0.18), 0 2px 6px rgba(22,33,28,0.12)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: compact ? '18px 18px 14px' : '26px 22px 16px', textAlign: 'center',
        transition: 'min-height .25s ease',
      }}>
        {photoUrl ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photoUrl} alt="" aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(1.08) contrast(1.05)' }} />
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(22,33,28,0.22) 0%, rgba(22,33,28,0.42) 55%, rgba(22,33,28,0.74) 100%)' }} />
          </>
        ) : (
          <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(circle at 50% 32%, rgba(46,154,120,0.30), transparent 62%)' }} />
        )}
        {/* crop marks: this is a proof on the drafting table */}
        <span aria-hidden style={{ ...cropMark({ top: 7, left: 7 }), borderTop: '1.5px solid #fff', borderLeft: '1.5px solid #fff' }} />
        <span aria-hidden style={{ ...cropMark({ top: 7, right: 7 }), borderTop: '1.5px solid #fff', borderRight: '1.5px solid #fff' }} />
        <span aria-hidden style={{ ...cropMark({ bottom: 7, left: 7 }), borderBottom: '1.5px solid #fff', borderLeft: '1.5px solid #fff' }} />
        <span aria-hidden style={{ ...cropMark({ bottom: 7, right: 7 }), borderBottom: '1.5px solid #fff', borderRight: '1.5px solid #fff' }} />
        <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
          {jobLabel && (
            <div className="db-pop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: compact ? 7 : 10 }}>
              <span aria-hidden style={{ height: 1, width: 22, background: 'rgba(255,255,255,0.3)' }} />
              <span style={{ fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap' }}>{jobLabel}</span>
              <span aria-hidden style={{ height: 1, width: 22, background: 'rgba(255,255,255,0.3)' }} />
            </div>
          )}
          {hasWords ? (
            <>
              {headline && (
                <div key={headline} className="db-pop" style={{ fontFamily: DESK.disp, fontSize: compact ? 21 : 27, fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, overflowWrap: 'break-word', textShadow: '0 1px 10px rgba(0,0,0,0.35)', textWrap: 'balance' as never }}>
                  {headline}
                </div>
              )}
              {headline && (details || offer) && (
                <span aria-hidden className="db-pop" style={{ display: 'block', width: 26, height: 2.5, borderRadius: 2, background: DESK.grad, margin: `${compact ? 7 : 9}px auto 0`, boxShadow: '0 1px 6px rgba(46,154,120,0.5)' }} />
              )}
              {details && (
                <div key={details} className="db-pop" style={{ fontFamily: DESK.body, fontSize: 12.5, fontWeight: 500, color: 'rgba(255,255,255,0.85)', marginTop: 7, letterSpacing: '0.01em' }}>
                  {details}
                </div>
              )}
              {offer && (
                <div key={offer} className="db-pop" style={{ display: 'inline-block', marginTop: compact ? 9 : 12, background: DESK.grad, color: '#fff', borderRadius: 99, padding: '5px 14px', fontFamily: DESK.disp, fontSize: 12.5, fontWeight: 700, boxShadow: '0 3px 10px rgba(46,154,120,0.4)' }}>
                  {offer}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: 'rgba(255,255,255,0.4)', border: '1.5px dashed rgba(255,255,255,0.25)', borderRadius: 10, padding: '14px 16px', display: 'inline-block' }}>
              {L['board.empty']}
            </div>
          )}
          {businessName && (
            <div style={{ marginTop: compact ? 10 : 14 }}>
              <span aria-hidden style={{ display: 'block', height: 1, width: '38%', margin: '0 auto 6px', background: 'rgba(255,255,255,0.22)' }} />
              <div style={{ fontFamily: DESK.mono, fontSize: 8.5, letterSpacing: '0.3em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {businessName}
              </div>
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
      {/* the size itself, dimension-forward (owner call 2026-08-20): one design, many uses */}
      <span style={{ fontFamily: DESK.mono, fontSize: 8.5, fontWeight: 600, color: DESK.mute, lineHeight: 1 }}>
        {d.dimensions.w}×{d.dimensions.h}{d.dimensions.unit === 'px' ? '' : d.dimensions.unit}
      </span>
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

/** GD-2: the draft-to-designer bridge. When the flow opens from an existing AI
 * draft, the seed carries the draft's id, its text as the starting description,
 * and a preview image — the designer POLISHES the draft instead of starting
 * over, and the order records where it came from. */
export interface DesignSeed { draftId?: string; described?: string; referenceUrl?: string | null; eventDateISO?: string }

export default function DesignOrderFlow({ menu, assets, businessName, seed }: { menu: { id: string; name: string }[]; assets: DesignAsset[]; businessName?: string | null; seed?: DesignSeed | null }) {
  /* Client-side back to the store keeps the app shell mounted (owner ask 2026-08-18). */
  const router = useRouter()
  const today = todayISO()

  const [step, setStep] = useState(1)
  const [described, setDescribed] = useState(seed?.described ?? '')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<DesignRead | null>(null)
  const [job, setJob] = useState<DesignJobId | null>(null)
  /* carousel only: total slide count (first included, extras priced per slide) */
  const [slides, setSlides] = useState(5)
  /* the free-number box beside the preset chips (owner ask 2026-08-20): any count 2-20 */
  const [slideInput, setSlideInput] = useState('')
  /* THE TIER (persona-tested): the engine's three tiers, now the owner's own pick.
   * Custom is the default so this is never a required decision; each ticket shows its
   * own price so picking visibly changes the number (never a picker that is theater). */
  const [tier, setTier] = useState<1 | 2 | 3>(2)
  /* HOW IT'S MADE moved to the END (owner call 2026-08-20): describe the piece first,
   * then choose the maker — AI free draft or a designer tier — so the price is
   * calculated at the end, like every other flow. */
  const [method, setMethod] = useState<'designer' | 'ai'>('designer')
  const [aiBusy, setAiBusy] = useState(false)
  const [dests, setDests] = useState<DestinationId[]>([])
  /* The somewhere-else escape hatch: a place our 11 formats missed, in the owner's own
   * words. Never priced by the engine (it has no spec to cite) — it rides the request
   * and the team sizes and quotes it. */
  const [destOtherOn, setDestOtherOn] = useState(false)
  const [destOther, setDestOther] = useState('')
  /* custom dimensions (owner call 2026-08-20): a size the 11 frames missed can be
   * exact numbers, not just words */
  const [customW, setCustomW] = useState('')
  const [customH, setCustomH] = useState('')
  const [printQtys, setPrintQtys] = useState<Partial<Record<DestinationId, number>>>({})
  const [printer, setPrinter] = useState<'client' | 'us' | null>(null)
  const [headline, setHeadline] = useState('')
  const [details, setDetails] = useState('')
  const [offer, setOffer] = useState('')
  /* Featuring is MULTI: a special can star several dishes. The own-words entry rides
   * the same list (featureOtherText tracks which member is the typed one). */
  const [promoteItems, setPromoteItems] = useState<string[]>([])
  /* Featuring explores the WHOLE menu, not a taste of it: collapsed shows 8, Show-all
   * opens everything with a search box, and Something-else takes a dish we do not hold. */
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuQ, setMenuQ] = useState('')
  const [featureOtherOn, setFeatureOtherOn] = useState(false)
  const [featureOtherText, setFeatureOtherText] = useState('')
  const [picked, setPicked] = useState<string[]>([])
  const [uploaded, setUploaded] = useState<DesignAsset[]>([])
  /* The hand-it-to-us paths. Picking photos clears the mode; picking a mode clears the
   * photos. 'shoot' books a real photo shoot, 'source' is stock sourcing, 'none' is
   * custom artwork with no photo at all. */
  const [photoMode, setPhotoMode] = useState<'shoot' | 'source' | 'none' | 'other' | null>(null)
  /* 'other' carries the owner's own words about photos (like: use my Instagram shots) */
  const [photoOther, setPhotoOther] = useState('')
  /* Photos explore the WHOLE library, same pattern as Featuring: collapsed shows the
   * sharpest 8 (picked ones always stay visible), Show-all opens everything with a
   * search box past 12. */
  const [photosOpen, setPhotosOpen] = useState(false)
  const [photoQ, setPhotoQ] = useState('')
  /* Sizes the server did not know (menu photos, older uploads): measured here, once,
   * before the quality gate judges them. null = the image would not load at all. */
  const [measured, setMeasured] = useState<Record<string, { width: number; height: number } | null>>({})
  /* The event's own date, from the read. NEVER the delivery date: a flyer due the night of
   * the event promotes nothing. The need-by date (due) is always the owner's tap. */
  const [eventDate, setEventDate] = useState<string | null>(seed?.eventDateISO ?? null)
  const [due, setDue] = useState<string | null>(null)
  const [rushConfirmed, setRushConfirmed] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  /* the cart screen between Add to cart and Confirm order */
  const [cart, setCart] = useState(false)
  /* the server's own total, echoed on the placed screen */
  const [orderAmount, setOrderAmount] = useState<number | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  /* The AI pathway: the whole brief the owner just wrote feeds the free draft
   * (same route the occasion cards use), and the piece lands in approvals. */
  const aiDraft = async () => {
    setAiBusy(true); setSendError(null)
    try {
      const brief = described.trim().length >= 8
        ? described.trim()
        : [jobLabel ?? 'a graphic', headline ? `headline: ${headline}` : null, offer ? `deal: ${offer}` : null]
            .filter(Boolean).join(' — ')
      const r = await fetch('/api/design/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.id) throw new Error(typeof d.error === 'string' ? d.error : 'Could not make the draft. Try again.')
      router.push(`/dashboard/approvals/${d.id}`)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not make the draft. Try again.')
      setAiBusy(false)
    }
  }

  /* REQUEST MODE: the same flow with every number removed, until the rate card is
   * signed. The seal sends a quote request (creative_requests) instead of recording
   * an order; the day RATE_CARD.approved flips, prices return and this mode ends.
   * One flow, two moments — never two builders. */
  const requestMode = !RATE_CARD.approved

  const src = (k: keyof DesignRead['cited']): DesignFact<never>['source'] => (read?.cited[k] ? 'read' : 'asked')

  useEffect(() => {
    for (const a of assets) {
      if (a.width > 0 || measured[a.id] !== undefined) continue
      const img = new Image()
      img.onload = () => setMeasured((m) => ({ ...m, [a.id]: { width: img.naturalWidth, height: img.naturalHeight } }))
      img.onerror = () => setMeasured((m) => ({ ...m, [a.id]: null }))
      img.src = a.url
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assets])

  const allAssets = [...assets, ...uploaded].map((a) =>
    a.width > 0 ? a : measured[a.id] ? { ...a, ...measured[a.id]! } : a,
  )
  /* Best options first: everything that clears the gate, sharpest on top; too-small
   * photos sink to the end (visible but honestly disabled). */
  const rankedAssets = [...allAssets].sort(
    (a, b) =>
      (passesQualityGate(b) ? 1 : 0) - (passesQualityGate(a) ? 1 : 0) ||
      b.width * b.height - a.width * a.height,
  )
  const usable = allAssets.filter(passesQualityGate)
  const usingOwn = picked.length > 0 && photoMode == null
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
    ...(job === 'carousel' ? { slides } : {}),
    destinations: { value: dests, source: src('destinations'), citedWords: read?.cited.destinations },
    ...(printPicked && allQtysIn ? { printQtys: { value: printQtys, source: 'asked' as const } } : {}),
    ...(printer != null ? { printer: { value: printer, source: 'asked' as const } } : {}),
    /* 'other' stays OUT of the engine: free words are not a priceable photo answer, so
     * the quote keeps photos as an open question and the team answers it (law 4). */
    ...(usingOwn || (photoMode != null && photoMode !== 'other')
      ? { photos: { value: (photoMode as 'shoot' | 'source' | 'none' | null) ?? ('own' as const), source: 'asked' as const } }
      : {}),
    tier,
    ...(due ? { dueDateISO: { value: due, source: 'asked' as const } } : {}),
    todayISO: today,
    rushConfirmed,
  }
  const quote = priceDesignOrder(answers, RATE_CARD)
  /* THE SERVICE FEE (owner call: fees stay). Visible as its own line inside EVERY total
   * from the first screen a total appears on; listed total = charged total, always. */
  const svcFee = Math.round(quote.total * 0.1)
  const orderTotal = quote.total + svcFee
  const saidText = [headline, details, offer].map((t) => t.trim()).filter(Boolean).join('. ')
  /* The rush question shows real dollars: the engine's own delta, before it is agreed to. */
  const rushDelta = Math.round(quote.total * (RATE_CARD.rushMultiplier - 1))
  /* The board's photo: the first picked asset paints the artwork everywhere it appears. */
  const boardPhoto = usingOwn ? allAssets.find((a) => picked.includes(a.id))?.url ?? null : null
  /* the custom spot, words and numbers folded into one line every consumer reads */
  const destOtherFinal = [destOther.trim(), customW && customH ? `${customW}×${customH}px` : ''].filter(Boolean).join(' · ')
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
    : step === 2 ? headline.trim().length > 0
    : step === 3 ? usingOwn || (photoMode === 'other' ? photoOther.trim().length > 1 : photoMode != null)
    : step === 4 ? due != null && !afterEvent && (!rushEligible || rushConfirmed || false)
    : step === 5 ? (dests.length > 0 || destOtherFinal.length > 1) && (!printPicked || !PRINT_AVAILABLE || (allQtysIn && printer != null))
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

  /* Confirm order: the finished brief goes down the Request Desk ORDER lane at the
   * engine's price (server computes its own number and never trusts ours); the row lands
   * pre-accepted and the work order mints on the house team right away. */
  const placeOrder = async () => {
    if (sending) return
    setSending(true)
    setSendError(null)
    const attachments = await attachmentsForRequest()
    const days = due ? Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000) : null
    const when = days == null ? 'No rush' : days <= 7 ? 'This week' : days <= 14 ? 'In 2 weeks' : days <= 31 ? 'This month' : 'No rush'
    const noteBits = [
      job === 'carousel' ? `CAROUSEL POST: ${slides} slides total. Slide 1 is the hook; keep one idea per slide and end on the offer or call to action` : '',
      seed?.draftId ? 'START FROM THE CLIENT\'S EXISTING DRAFT — polish it, do not start over' : '',
      printPicked && allQtysIn ? printDestSpecs.map((d) => `${printQtys[d.id]} x ${d.label}`).join(', ') : '',
      /* print runs are off: any picked print size is a print ready FILE handoff */
      printPicked && !PRINT_AVAILABLE ? 'Print ready files only; they handle the printing' :
      printer === 'us' ? 'We print and deliver' : printer === 'client' ? 'Their shop prints' : '',
      destOtherFinal ? `CUSTOM SPOT (not on our format list): "${destOtherFinal}". Size it with them and quote it on its own` : '',
      photoMode === 'none' ? 'No photos: custom artwork on their brand'
        : photoMode === 'shoot' ? 'Wants a PHOTO SHOOT at their place. Set the shoot date with them before design starts'
        : photoMode === 'source' ? 'Find photos for them'
        : photoMode === 'other' ? `Photos, in their own words: "${photoOther.trim()}"`
        : usingOwn ? 'Using their photos' : '',
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
            what: `${jobLabel ?? 'A graphic'}${promoteItems.length ? ` featuring ${sayList(promoteItems)}` : ''}`,
            where: [...dests.map((d) => DESTINATIONS.find((x) => x.id === d)?.label).filter(Boolean), ...(destOtherFinal ? [destOtherFinal] : [])].join(', '),
            words: saidText || undefined,
            when,
            notes: noteBits || undefined,
          },
          ...(due ? { due_date: due } : {}),
          ...(attachments.length ? { attachments } : {}),
          order: true,
          design: {
            ...(seed?.draftId ? { fromDraftId: seed.draftId } : {}),
            tier,
            destinations: dests,
            photos: photoMode === 'other' ? undefined : photoMode ?? (usingOwn ? 'own' : undefined),
            dueDateISO: due ?? undefined,
            rushConfirmed,
          },
        }),
      })
      const j = (await r.json().catch(() => ({}))) as { error?: string; order?: { amount_cents?: number } }
      if (!r.ok) throw new Error(typeof j.error === 'string' ? j.error : L['send.error'])
      setOrderAmount(typeof j.order?.amount_cents === 'number' ? Math.round(j.order.amount_cents / 100) : quote.total)
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
          <Artboard jobLabel={jobLabel} headline={headline} details={details} offer={offer} photoUrl={boardPhoto} businessName={businessName} tag={boardTag} stamped />
        </div>
        <div style={{ fontFamily: DESK.disp, fontSize: 23, fontWeight: 700, color: DESK.ink, letterSpacing: '-0.02em', marginTop: 10 }}>{L['done.title.order']}</div>
        <div style={{ fontSize: 13.5, color: DESK.ink2, marginTop: 8, maxWidth: '36ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
          {L['done.sub.order']}
        </div>
        {orderAmount != null && (
          <div style={{ fontFamily: DESK.mono, fontSize: 14, fontWeight: 700, color: DESK.mintDeep, marginTop: 12 }}>{`$${orderAmount}`} · {L['sum.assigned.who']}</div>
        )}
      </div>
    )
  }

  /* ── THE CART: one item, one honest total, one tap to confirm ─────────────────────── */
  if (cart) {
    return (
      <div style={{ ...ground, padding: '24px 18px 40px' }}>
        <DeskKeyframes />
        <BoardKeyframes />
        <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DESK.mute, marginBottom: 10 }}>{L['cart.title']}</div>
        <div style={{ maxWidth: 300, margin: '0 auto', width: '100%' }}>
          <Artboard jobLabel={jobLabel} headline={headline} details={details} offer={offer} photoUrl={boardPhoto} businessName={businessName} tag={boardTag} compact />
        </div>
        <div style={{ fontSize: 13, color: DESK.ink2, margin: '2px 0 12px', lineHeight: 1.5 }}>{L['cart.sub']}</div>
        <ReceiptFrame>
          {quote.lines.map((l) => <ReceiptRow key={l.id} label={l.label} amount={l.amount === 0 ? '$0' : `$${l.amount}`} you={l.amount === 0} />)}
          <ReceiptRow label={L['receipt.fee']} amount={`$${svcFee}`} />
          <ReceiptRule />
          <ReceiptTotal label={L['panel.total']} big={`$${orderTotal}`} />
        </ReceiptFrame>
        <div style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '12px 14px', margin: '12px 0' }}>
          <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 4 }}>{L['sum.assigned']}</div>
          <div style={{ fontSize: 14, fontWeight: 700, color: DESK.ink }}>{L['sum.assigned.who']}</div>
          <div style={{ fontSize: 12, color: DESK.ink2, marginTop: 3, lineHeight: 1.45 }}>{L['sum.assigned.sub']}</div>
        </div>
        {sendError && (
          <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.45 }}>
            {sendError}
          </div>
        )}
        <ConfirmButton
          label={sending ? 'Placing your order...' : `${L['cart.confirm']} · $${orderTotal}`}
          sub={L['cart.confirm.sub']}
          disabled={sending}
          onClick={() => { void placeOrder() }}
        />
        <div style={{ fontSize: 11.5, color: DESK.mute, margin: '8px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>{L['cart.valve']}</div>
        <div style={{ height: 10 }} />
        <ConfirmButton label={L['cart.change']} tone="paper" disabled={sending} onClick={() => setCart(false)} />
      </div>
    )
  }

  return (
    <div style={ground}>
      <DeskKeyframes />
      <BoardKeyframes />
      {/* step 1's exit: back to the store where the cards live (later steps use Back) */}
      {step === 1 && seed?.draftId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 12, padding: '9px 11px', marginBottom: 10 }}>
          {seed.referenceUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={seed.referenceUrl} alt="" style={{ width: 40, height: 40, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }} />
          ) : null}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 13, color: DESK.ink }}>Starting from your draft</div>
            <div style={{ fontFamily: DESK.body, fontSize: 11.5, color: DESK.ink2, lineHeight: 1.4 }}>The designer polishes what you already have, not a blank page.</div>
          </div>
        </div>
      )}
      {step === 1 && (
        <button
          type="button"
          onClick={() => router.push('/dashboard/campaigns/new?lens=creatives')}
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
          photoUrl={boardPhoto} businessName={businessName} tag={boardTag} rush={quote.rush}
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
            {job === 'carousel' && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 7 }}>
                  {L['job.slides.title']}
                </div>
                <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexWrap: 'wrap' }}>
                  {[3, 5, 7, 10].map((n) => (
                    <Chip key={n} on={slides === n && slideInput === ''} label={`${n} slides`} onClick={() => { setSlides(n); setSlideInput('') }} />
                  ))}
                  <input
                    inputMode="numeric" value={slideInput} aria-label="Custom slide count"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                      setSlideInput(v)
                      const n = Number(v)
                      if (n >= 2 && n <= 20) setSlides(n)
                    }}
                    placeholder="Other"
                    style={{ ...inputStyle, width: 72, textAlign: 'center', height: 36, borderRadius: 99, borderColor: slideInput !== '' ? DESK.mint : undefined }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 6, lineHeight: 1.45 }}>{L['job.slides.sub']}</div>
              </div>
            )}
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
              {eventDate && read.cited.eventDate && <Chip on label={`Event: ${fmtDay(eventDate)}`} onClick={() => setStep(4)} />}
              {offer && read.cited.offer && <Chip on label={offer} onClick={() => setStep(2)} />}
              {read.ownPhotos && read.cited.ownPhotos && <Chip on label={L['read.ownphotos']} onClick={() => setStep(3)} />}
            </div>
            {(read.unplaced?.length ?? 0) > 0 && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
                {fill(L['read.unplaced'], { list: read.unplaced!.join(' or ') })}
              </div>
            )}
          </div>
        )}

        {/* ── 5. the sizes: your artwork, cut to every size (asked LAST before review,
              owner call 2026-08-20: it is really "where is it posted") ── */}
        {step === 5 && (
          <>
            <StepHead n={5} title={T.where} sub={S.where} />
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
              {DESTINATIONS.map((d) => (
                <DestFrame
                  key={d.id} d={d} on={dests.includes(d.id)}
                  amount={requestMode ? null : destAmount(d.id)} photoUrl={boardPhoto} headline={headline}
                  onClick={() => setDests((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))}
                />
              ))}
              {/* the escape hatch: a place the 11 frames missed, in the owner's words */}
              <button
                type="button" aria-pressed={destOtherOn}
                onClick={() => { if (destOtherOn) { setDestOther(''); setCustomW(''); setCustomH('') } setDestOtherOn(!destOtherOn) }}
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, background: 'none', border: 'none', padding: 4, cursor: 'pointer', WebkitTapHighlightColor: 'transparent' }}
              >
                <span style={{
                  width: 74, height: 50, borderRadius: 6, border: `2px dashed ${destOtherOn ? DESK.mint : DESK.mute}`,
                  background: destOtherOn ? DESK.mintWash : DESK.card,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontFamily: DESK.disp, fontSize: 18, fontWeight: 700, color: destOtherOn ? DESK.mintDeep : DESK.mute,
                }}>?</span>
                <span style={{ fontFamily: DESK.body, fontSize: 10.5, fontWeight: 600, color: destOtherOn ? DESK.mintDeep : DESK.ink2, lineHeight: 1.2 }}>{L['dest.other.label']}</span>
                <span style={{ minHeight: 12 }} />
              </button>
            </div>
            {destOtherOn && (
              <div style={{ marginTop: 10 }}>
                <input
                  value={destOther} onChange={(e) => setDestOther(e.target.value)}
                  placeholder={L['dest.other.ph']} aria-label={L['dest.other.label']}
                  style={inputStyle}
                />
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                  <input
                    inputMode="numeric" value={customW} aria-label={L['dest.custom.w']}
                    onChange={(e) => setCustomW(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                    placeholder={L['dest.custom.w']} style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ color: DESK.mute, fontWeight: 700 }}>×</span>
                  <input
                    inputMode="numeric" value={customH} aria-label={L['dest.custom.h']}
                    onChange={(e) => setCustomH(e.target.value.replace(/[^0-9]/g, '').slice(0, 5))}
                    placeholder={L['dest.custom.h']} style={{ ...inputStyle, flex: 1 }}
                  />
                  <span style={{ fontSize: 12, color: DESK.mute, fontWeight: 600 }}>px</span>
                </div>
                <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 6, lineHeight: 1.45 }}>{L['dest.other.note']}</div>
              </div>
            )}
            {/* print runs are off: a picked print size is DESIGNED (print ready file
                handed over), but the copy-count and who-prints questions only exist for
                a print job we cannot run, so they hide and one plain note says why */}
            {printPicked && !PRINT_AVAILABLE && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, marginTop: 14, lineHeight: 1.45 }}>
                {PRINT_OFF_MESSAGE}
              </div>
            )}
            {printPicked && PRINT_AVAILABLE && (
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
        {step === 2 && (() => {
          const headlineSugs = [...new Set([
            read?.message ? titleCase(read.message) : null,
            promoteItems[0] ?? null,
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
              <StepHead n={2} title={T.say} sub={S.say} />
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

              {menu.length > 0 && (() => {
                const q = menuQ.trim().toLowerCase()
                const shown = menuOpen
                  ? menu.filter((m) => !q || m.name.toLowerCase().includes(q))
                  : menu.slice(0, 8)
                return (
                  <>
                    {slotLabel(L['say.featuring'], true)}
                    {menuOpen && menu.length > 12 && (
                      <input
                        value={menuQ} onChange={(e) => setMenuQ(e.target.value)}
                        placeholder={L['say.menu.search.ph']} aria-label={L['say.menu.search.ph']}
                        style={{ ...inputStyle, marginBottom: 8 }}
                      />
                    )}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                      {shown.map((m) => (
                        <Chip key={m.id} on={promoteItems.includes(m.name)} label={m.name} onClick={() => setPromoteItems((prev) => (prev.includes(m.name) ? prev.filter((x) => x !== m.name) : [...prev, m.name]))} />
                      ))}
                      {!menuOpen && menu.length > 8 && (
                        <Chip on={false} label={fill(L['say.menu.all'], { n: String(menu.length) })} onClick={() => setMenuOpen(true)} />
                      )}
                      {menuOpen && (
                        <Chip on={false} label={L['say.menu.less']} onClick={() => { setMenuOpen(false); setMenuQ('') }} />
                      )}
                      <Chip
                        on={featureOtherOn}
                        label={L['say.featuring.other']}
                        onClick={() => {
                          if (featureOtherOn) {
                            const prev = featureOtherText.trim()
                            if (prev) setPromoteItems((xs) => xs.filter((x) => x !== prev))
                            setFeatureOtherText('')
                          }
                          setFeatureOtherOn(!featureOtherOn)
                        }}
                      />
                    </div>
                    {featureOtherOn && (
                      <input
                        value={featureOtherText}
                        onChange={(e) => {
                          const prev = featureOtherText.trim()
                          const next = e.target.value
                          setFeatureOtherText(next)
                          setPromoteItems((xs) => {
                            const rest = xs.filter((x) => x !== prev)
                            return next.trim() ? [...rest, next.trim()] : rest
                          })
                        }}
                        placeholder={L['say.featuring.other.ph']} aria-label={L['say.featuring.other']}
                        style={{ ...inputStyle, marginTop: 8 }}
                      />
                    )}
                  </>
                )
              })()}

              <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 14, lineHeight: 1.45 }}>
                {L['say.note']}
              </div>
            </>
          )
        })()}

        {/* ── 4. photos: real library ranked sharpest first, or hand it to us ── */}
        {step === 3 && (
          <>
            <StepHead n={3} title={T.photos} sub={S.photos} />
            {usable.length > 0 && (
              <div style={{ fontSize: 11.5, color: DESK.mute, margin: '-6px 0 10px', lineHeight: 1.45 }}>
                {L['photos.best']}
              </div>
            )}
            {photosOpen && rankedAssets.length > 12 && (
              <input
                value={photoQ} onChange={(e) => setPhotoQ(e.target.value)}
                placeholder={L['photos.search.ph']} aria-label={L['photos.search.ph']}
                style={{ ...inputStyle, marginBottom: 8 }}
              />
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {(() => {
                if (photosOpen) {
                  const q = photoQ.trim().toLowerCase()
                  return q ? rankedAssets.filter((a) => (a.label ?? '').toLowerCase().includes(q)) : rankedAssets
                }
                /* collapsed: sharpest 8, but a picked photo never disappears from view */
                const top = rankedAssets.slice(0, 8)
                return [...top, ...rankedAssets.filter((a) => picked.includes(a.id) && !top.some((t) => t.id === a.id))]
              })().map((a, i) => {
                const ok = passesQualityGate(a)
                const on = picked.includes(a.id)
                /* honest quality tags: the sharpest few say so; a dish photo names its dish */
                const tag = !ok ? L['photos.gate'] : a.kind === 'menu' && a.label ? a.label : i === 0 && usable.length > 1 ? L['photos.sharp'] : null
                return (
                  <button
                    key={a.id} type="button" disabled={!ok}
                    onClick={() => { setPhotoMode(null); setPicked((prev) => (prev.includes(a.id) ? prev.filter((x) => x !== a.id) : [...prev, a.id])) }}
                    style={{ position: 'relative', aspectRatio: '1', borderRadius: 12, overflow: 'hidden', cursor: ok ? 'pointer' : 'default', border: `2px solid ${on ? DESK.mint : 'transparent'}`, padding: 0, background: '#E7E4DB', opacity: ok ? 1 : 0.45, boxShadow: on ? '0 4px 12px rgba(46,154,120,0.3)' : '0 1px 3px rgba(22,33,28,0.08)', transform: on ? 'translateY(-2px)' : undefined, transition: 'opacity .2s ease, transform .18s ease, box-shadow .18s ease' }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={a.url} alt={a.label ?? 'photo'} loading="lazy" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    {tag && <span style={{ position: 'absolute', left: 4, bottom: 4, right: on ? 4 : undefined, maxWidth: 'calc(100% - 8px)', fontSize: 9, fontWeight: 700, color: '#fff', background: ok ? 'rgba(22,33,28,0.55)' : 'rgba(22,33,28,0.6)', borderRadius: 6, padding: '2px 5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tag}</span>}
                    {on && <span style={{ position: 'absolute', top: 5, right: 5, width: 18, height: 18, borderRadius: 99, background: DESK.mint, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Check size={11} strokeWidth={3.4} /></span>}
                  </button>
                )
              })}
              {!photosOpen && rankedAssets.length > 8 && (
                <button
                  type="button" onClick={() => setPhotosOpen(true)}
                  style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${DESK.mint}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: DESK.mintDeep, cursor: 'pointer', background: DESK.mintWash, padding: 4, textAlign: 'center' }}
                >
                  {fill(L['photos.all'], { n: String(rankedAssets.length) })}
                </button>
              )}
              {photosOpen && (
                <button
                  type="button" onClick={() => { setPhotosOpen(false); setPhotoQ('') }}
                  style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${DESK.mute}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: DESK.ink2, cursor: 'pointer', background: DESK.card, padding: 4 }}
                >
                  {L['photos.less']}
                </button>
              )}
              <label style={{ aspectRatio: '1', borderRadius: 12, border: `1.5px dashed ${DESK.mute}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: DESK.ink2, cursor: 'pointer', background: DESK.card }}>
                {L['photos.upload']}
                <input type="file" accept="image/*" multiple onChange={(e) => upload(e.target.files)} style={{ display: 'none' }} />
              </label>
            </div>
            {usable.length === 0 && allAssets.length > 0 && (
              <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '10px 13px', fontSize: 12.5, marginTop: 12, lineHeight: 1.5 }}>
                {L['photos.empty']}
              </div>
            )}
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '16px 0 8px' }}>
              {L['photos.or']}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Ticket on={photoMode === 'shoot'} name={L['photos.shoot.label']} sub={L['photos.shoot.sub']}
                onClick={() => { setPhotoMode(photoMode === 'shoot' ? null : 'shoot'); setPicked([]) }} />
              <Ticket on={photoMode === 'source'} name={requestMode ? L['photos.source.label.request'] : fill(L['photos.source.label'], { price: String(RATE_CARD.photoSourcing) })} sub={L['photos.source.sub']} price={requestMode ? undefined : `$${RATE_CARD.photoSourcing}`}
                onClick={() => { setPhotoMode(photoMode === 'source' ? null : 'source'); setPicked([]) }} />
              <Ticket on={photoMode === 'none'} name={L['photos.none.label']} sub={L['photos.none.sub']} price={requestMode ? undefined : '$0'}
                onClick={() => { setPhotoMode(photoMode === 'none' ? null : 'none'); setPicked([]) }} />
              <Ticket on={photoMode === 'other'} name={L['photos.other.label']} sub={L['photos.other.sub']}
                onClick={() => { if (photoMode === 'other') setPhotoOther(''); setPhotoMode(photoMode === 'other' ? null : 'other'); setPicked([]) }} />
            </div>
            {photoMode === 'other' && (
              <input
                value={photoOther} onChange={(e) => setPhotoOther(e.target.value)}
                placeholder={L['photos.other.ph']} aria-label={L['photos.other.label']}
                style={{ ...inputStyle, marginTop: 10 }}
              />
            )}
          </>
        )}

        {/* ── 5. when: the date sticks onto the board as a tape tag ── */}
        {step === 4 && (
          <>
            <StepHead
              n={4}
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
                    sub={requestMode ? L['when.rush.sub.request'] : fill(L['when.rush.sub'], { total: String(quote.total + rushDelta + Math.round((quote.total + rushDelta) * 0.1)) })}
                    price={requestMode ? undefined : `+$${rushDelta}`}
                    onClick={() => setRushConfirmed(true)}
                  />
                  <Ticket
                    name={L['when.norush.label']}
                    sub={requestMode ? fill(L['when.norush.sub.request'], { date: fmtDay(standardDelivery) }) : fill(L['when.norush.sub'], { date: fmtDay(standardDelivery), total: String(orderTotal) })}
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

        {/* ── 6. review: the WHOLE order, itemized, then Add to cart ── */}
        {step === 6 && (() => {
          const sumRow = (label: string, lines: (string | null | undefined)[]) => {
            const vals = lines.filter((x): x is string => !!x && x.trim().length > 0)
            if (vals.length === 0) return null
            return (
              <div style={{ padding: '10px 0', borderBottom: `1px solid ${DESK.line}` }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 3 }}>{label}</div>
                {vals.map((v, i) => (
                  <div key={i} style={{ fontSize: 13.5, color: DESK.ink, lineHeight: 1.5 }}>{v}</div>
                ))}
              </div>
            )
          }
          const whereLines = [
            ...dests.map((d) => {
              const spec = DESTINATIONS.find((x) => x.id === d)
              const amt = destAmount(d)
              return spec ? `${spec.label}${amt != null ? (amt === 0 ? ' (included)' : ` (+$${amt})`) : ''}` : null
            }),
            destOtherFinal ? `${destOtherFinal} (custom size, we check it and quote it with your team)` : null,
          ]
          const photoLine =
            photoMode === 'none' ? 'Custom artwork, no photos'
            : photoMode === 'shoot' ? 'Photo shoot at your place first (scheduled with you)'
            : photoMode === 'source' ? `We find the photos (+$${RATE_CARD.photoSourcing})`
            : photoMode === 'other' ? `Your way: “${photoOther.trim()}”`
            : usingOwn ? `Your own photos (${picked.length} picked)` : null
          return (
            <>
              <StepHead n={6} title={T.review} sub={S.review} />
              {/* HOW IT'S MADE — asked LAST (owner call 2026-08-20): the brief is written,
                  so the maker choice prices the whole thing right here, AI included. */}
              <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '4px 0 8px' }}>
                {L['tier.title']}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {job === 'carousel' ? (
                  <div style={{ fontSize: 11.5, color: DESK.mute, lineHeight: 1.45, padding: '2px 2px 0' }}>{L['tier.ai.carousel']}</div>
                ) : (
                  <Ticket on={method === 'ai'} name={L['tier.ai.label']} sub={L['tier.ai.sub']} price="Free" onClick={() => setMethod('ai')} />
                )}
                <Ticket on={method === 'designer' && tier === 1} name={L['tier.basic.label']} sub={`${L['tier.basic.sub']} · ${specLine(1)}`} price={`$${RATE_CARD.tierBase[1]}`} onClick={() => { setMethod('designer'); setTier(1) }} />
                <Ticket on={method === 'designer' && tier === 2} name={<span>{L['tier.custom.label']} <span style={{ fontFamily: DESK.mono, fontSize: 10, fontWeight: 700, color: DESK.mintDeep }}>{L['tier.most']}</span></span>} sub={`${L['tier.custom.sub']} · ${specLine(2)}`} price={`$${RATE_CARD.tierBase[2]}`} onClick={() => { setMethod('designer'); setTier(2) }} />
                <Ticket on={method === 'designer' && tier === 3} name={L['tier.works.label']} sub={`${L['tier.works.sub']} · ${specLine(3)}`} price={`$${RATE_CARD.tierBase[3]}`} onClick={() => { setMethod('designer'); setTier(3) }} />
              </div>
              <div className="db-pop" style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '4px 16px 2px', boxShadow: '0 2px 8px rgba(22,33,28,0.05)' }}>
                {sumRow(L['sum.job'], [job === 'carousel' ? `${jobLabel} · ${slides} slides` : jobLabel ?? 'A design'])}
                {sumRow(L['sum.featuring'], [promoteItems.length ? sayList(promoteItems) : null])}
                {sumRow(L['sum.words'], [headline ? `“${headline}”` : null, details || null, offer ? `Deal: ${offer}` : null])}
                {sumRow(L['sum.where'], whereLines)}
                {printPicked && !PRINT_AVAILABLE ? sumRow('Print', ['Print ready files handed to you; printing is with you or your print shop']) : null}
                {sumRow(L['sum.photos'], [photoLine])}
                {sumRow(L['sum.when'], [
                  due ? `${fmtDay(due)}${quote.rush ? ' (rush confirmed)' : ''}` : null,
                  eventDate ? `For your ${fmtDay(eventDate)} event` : null,
                ])}
                <div style={{ padding: '10px 0' }}>
                  <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 3 }}>{L['sum.assigned']}</div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: DESK.ink }}>{L['sum.assigned.who']}</div>
                  <div style={{ fontSize: 11.5, color: DESK.ink2, marginTop: 2, lineHeight: 1.45 }}>{L['sum.assigned.sub']}</div>
                </div>
              </div>
              {method === 'ai' && (
                <>
                  <div style={{ marginTop: 12, padding: '10px 12px', background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 12, fontSize: 12.5, color: DESK.ink2, lineHeight: 1.55 }}>
                    {L['tier.ai.note']}
                  </div>
                  <div style={{ margin: '14px 0 6px' }}>
                    <ConfirmButton label={aiBusy ? 'Making your draft…' : L['tier.ai.cta']} onClick={() => { if (!aiBusy) void aiDraft() }} />
                  </div>
                </>
              )}
              {method === 'designer' && (<>
              {/* THE EXCHANGE, spelled out (GD-1): the picked tier's hard spec renders
                  before money so client and designer read the same list. A snapshot of
                  this spec also rides inside the order's brief server-side. */}
              <div style={{ marginTop: 12, padding: '10px 12px', background: DESK.card, border: `1.5px solid ${DESK.line}`, borderRadius: 12 }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 6 }}>What you get</div>
                {specBullets(tier).map((line) => (
                  <div key={line} style={{ display: 'flex', gap: 7, fontSize: 12, color: DESK.ink2, lineHeight: 1.55 }}>
                    <span style={{ color: DESK.mintDeep, flexShrink: 0 }}>✓</span>
                    <span>{line}</span>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 10, lineHeight: 1.5 }}>
                {fill(L['review.revisions'], { n: String(TIER_SPECS[tier].revisionRounds), next: String(TIER_SPECS[tier].revisionRounds + 1) })}
              </div>
              <div style={{ margin: '14px 0 14px' }}>
                <ReceiptFrame>
                  {quote.lines.map((l) => <ReceiptRow key={l.id} label={l.label} amount={l.amount === 0 ? '$0' : `$${l.amount}`} you={l.amount === 0} />)}
                  <ReceiptRow label={L['receipt.fee']} amount={`$${svcFee}`} />
                  <ReceiptRule />
                  <ReceiptTotal label={L['panel.total']} big={`$${orderTotal}`} />
                </ReceiptFrame>
              </div>
              <ConfirmButton label={`${L['cart.add']} · $${orderTotal}`} onClick={() => { setSendError(null); setCart(true) }} />
              </>)}
              <div style={{ height: 6 }} />
            </>
          )
        })()}

        {/* back / next (review keeps Back too, under the seal, so a typo is one tap away) */}
        {step > 1 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            <button type="button" onClick={() => setStep(step - 1)}
              style={{ flexShrink: 0, flex: step === 6 ? 1 : undefined, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink, fontFamily: DESK.body, fontSize: 14.5, fontWeight: 600 }}>
              {L['nav.back']}
            </button>
            {step < 6 && (
              <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)}
                style={{ flex: 1, height: 50, borderRadius: 25, border: 'none', cursor: canNext ? 'pointer' : 'default', background: canNext ? DESK.grad : '#E7E4DB', color: canNext ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, boxShadow: canNext ? '0 8px 20px rgba(46,154,120,0.3)' : 'none' }}>
                {L['nav.next']}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── the running receipt: pinned, cited, live (order mode only; a request has no
            numbers to run) ── */}
      {/* Mid-flow running total RETIRED (owner call 2026-08-20): the price is
          calculated at the end, after the maker is chosen — same as every other flow. */}
      {false && !requestMode && step > 1 && step < 6 && (
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
                <ReceiptRow label={L['receipt.fee']} amount={`$${svcFee}`} />
                <ReceiptRule />
                <ReceiptTotal label={L['panel.total']} big={`$${orderTotal}`} />
                <div style={{ fontSize: 10.5, color: DESK.mute, marginTop: 2 }}>{fill(L['panel.revisions'], { n: String(quote.includedRevisions) })}</div>
              </ReceiptFrame>
            </div>
          ) : (
            <button type="button" onClick={() => setPanelOpen(true)}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: DESK.card, border: 'none', borderTop: `1px solid ${DESK.line}`, borderRadius: '16px 16px 0 0', padding: '13px 20px', cursor: 'pointer', boxShadow: '0 -6px 20px rgba(22,33,28,0.08)', fontFamily: DESK.body }}>
              <span style={{ fontFamily: DESK.mono, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute }}>{L['panel.sofar']}</span>
              <span style={{ fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, color: DESK.mintDeep, fontVariantNumeric: 'tabular-nums' }}>${orderTotal}</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}
