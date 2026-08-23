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
import { CalendarDays, Check, Image as ImageIcon, Layers, Send, User } from 'lucide-react'
import WalkCalendar from '@/components/campaigns/monthly/walk-calendar'
import { DESK, paperGround, DeskKeyframes, Ticket, Stamp, ReceiptFrame, ReceiptRow, ReceiptRule, ReceiptTotal, ConfirmButton } from '@/components/campaigns/desk/ui'
import { DESTINATIONS, PRINT_AVAILABLE, PRINT_OFF_MESSAGE, type DestinationId, type DestinationSpec } from '@/lib/design/destinations'
import { RATE_CARD } from '@/lib/design/rate-card'
import { priceDesignOrder, productionBufferDays, rushApplies, type DesignOrderAnswers, type DesignFact } from '@/lib/design/design-pricing'
import { DESIGN_JOBS, type DesignJobId, type DesignRead } from '@/lib/design/design-read'
import { JOB_GROUP_META, JOB_SHELF, jobSpec } from '@/lib/design/job-registry'
import { BoardArt } from './board-art'
import { JobTile } from '@/components/design/job-tile'
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
/* Photo quality, three honest bands on the SHORTER side:
 *   >= 1000px  Sharp - good anywhere, print included
 *   640-999px  OK on screens - fine for social, soft in print (selectable, tagged)
 *   < 640px    genuinely too small - blocked
 * Unmeasured photos (width 0, dimensions still loading) are NOT judged. */
export const passesQualityGate = (a: { width: number; height: number }) => Math.min(a.width, a.height) >= 1000
export const usableOnScreens = (a: { width: number; height: number }) => Math.min(a.width, a.height) >= 640
const measuredYet = (a: { width: number; height: number }) => a.width > 0 && a.height > 0

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
/* headline seeds live in the registry now — one record per type */
const JOB_HEADLINES: Partial<Record<DesignJobId, string>> = Object.fromEntries(
  JOB_SHELF.flatMap((g) => g.jobs.filter((j) => j.headline).map((j) => [j.id, j.headline as string])),
)

/* the visual job shelf renders straight from the registry (one source of truth) */
const JOB_GROUPS = JOB_SHELF
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
function StepHead({ n, title, sub, total = 6, accent = DESK.mint, aside }: { n: number; title: string; sub?: string; total?: number; accent?: string; aside?: React.ReactNode }) {
  return (
    <div className="db-pop" style={{ marginBottom: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', color: DESK.mute, whiteSpace: 'nowrap' }}>
          {n}{' / '}{total}
        </span>
        <span aria-hidden style={{ flex: 1, display: 'flex', gap: 4 }}>
          {Array.from({ length: total }).map((_, i) => (
            <span key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i < n ? accent : 'rgba(22,33,28,0.09)', transition: 'background .25s ease' }} />
          ))}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
        <h2 style={{ fontFamily: DESK.disp, fontSize: 25, fontWeight: 700, color: DESK.ink, lineHeight: 1.12, margin: sub ? '0 0 5px' : 0, letterSpacing: '-0.02em' }}>{title}</h2>
        {aside}
      </div>
      {sub ? <p style={{ fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink2, lineHeight: 1.5, margin: 0, maxWidth: '36ch' }}>{sub}</p> : null}
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
function Artboard({ jobLabel, jobId, dot = DESK.mint, headline, details, offer, photoUrl, businessName, tag, rush, stamped, compact }: {
  jobLabel?: string | null
  /** the type behind the board: its illustration ghosts behind the words */
  jobId?: DesignJobId | null
  /** the type's group color, threading the board into the browse language */
  dot?: string
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
  /* no photo yet: the board is frosted glass in the type's color, like the
   * browse wall; a photo flips it to the dark proof so white type reads */
  const lite = !photoUrl
  const mark = lite ? `${dot}88` : '#fff'
  const cropMark = (pos: React.CSSProperties): React.CSSProperties => ({
    position: 'absolute', width: 10, height: 10, zIndex: 2, opacity: lite ? 0.9 : 0.4, ...pos,
  })
  return (
    <div style={{ position: 'relative', padding: '10px 4px 2px', marginBottom: 14 }}>
      {/* the pin */}
      <span aria-hidden style={{ position: 'absolute', top: 2, left: '50%', transform: 'translateX(-50%)', width: 11, height: 11, borderRadius: '50%', background: DESK.grad, boxShadow: '0 2px 5px rgba(22,33,28,0.35), inset 0 1px 2px rgba(255,255,255,0.5)', zIndex: 4 }} />
      <div style={{
        position: 'relative', transform: 'rotate(-1.1deg)', borderRadius: 8, overflow: 'hidden',
        background: photoUrl ? '#16211C' : `linear-gradient(165deg, ${dot}16, rgba(255,255,255,0.05) 55%), rgba(255,255,255,0.6)`,
        backdropFilter: lite ? 'blur(10px) saturate(1.3)' : undefined,
        WebkitBackdropFilter: lite ? 'blur(10px) saturate(1.3)' : undefined,
        border: lite ? '1px solid rgba(255,255,255,0.88)' : undefined,
        minHeight: compact ? 122 : 168,
        boxShadow: lite
          ? 'inset 0 1px 0 rgba(255,255,255,0.95), 0 14px 30px rgba(22,33,28,0.13)'
          : '0 14px 30px rgba(22,33,28,0.18), 0 2px 6px rgba(22,33,28,0.12)',
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
          <>
            <span aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(115deg, transparent 42%, rgba(255,255,255,0.5) 50%, transparent 58%)' }} />
            {jobId && (
              <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -52%)', width: '52%', opacity: 0.13, zIndex: 1 }}>
                <BoardArt id={jobId} dot={dot} />
              </span>
            )}
          </>
        )}
        {/* crop marks: this is a proof on the drafting table */}
        <span aria-hidden style={{ ...cropMark({ top: 7, left: 7 }), borderTop: `1.5px solid ${mark}`, borderLeft: `1.5px solid ${mark}` }} />
        <span aria-hidden style={{ ...cropMark({ top: 7, right: 7 }), borderTop: `1.5px solid ${mark}`, borderRight: `1.5px solid ${mark}` }} />
        <span aria-hidden style={{ ...cropMark({ bottom: 7, left: 7 }), borderBottom: `1.5px solid ${mark}`, borderLeft: `1.5px solid ${mark}` }} />
        <span aria-hidden style={{ ...cropMark({ bottom: 7, right: 7 }), borderBottom: `1.5px solid ${mark}`, borderRight: `1.5px solid ${mark}` }} />
        <div style={{ position: 'relative', zIndex: 2, width: '100%' }}>
          {jobLabel && (
            <div className="db-pop" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: compact ? 7 : 10 }}>
              <span aria-hidden style={{ height: 1, width: 22, background: lite ? `${dot}55` : 'rgba(255,255,255,0.3)' }} />
              <span style={{ fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: lite ? `${dot}DD` : 'rgba(255,255,255,0.68)', whiteSpace: 'nowrap' }}>{jobLabel}</span>
              <span aria-hidden style={{ height: 1, width: 22, background: lite ? `${dot}55` : 'rgba(255,255,255,0.3)' }} />
            </div>
          )}
          {hasWords ? (
            <>
              {headline && (
                <div key={headline} className="db-pop" style={{ fontFamily: DESK.disp, fontSize: compact ? 21 : 27, fontWeight: 700, color: lite ? DESK.ink : '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, overflowWrap: 'break-word', textShadow: lite ? 'none' : '0 1px 10px rgba(0,0,0,0.35)', textWrap: 'balance' as never }}>
                  {headline}
                </div>
              )}
              {headline && (details || offer) && (
                <span aria-hidden className="db-pop" style={{ display: 'block', width: 26, height: 2.5, borderRadius: 2, background: DESK.grad, margin: `${compact ? 7 : 9}px auto 0`, boxShadow: '0 1px 6px rgba(46,154,120,0.5)' }} />
              )}
              {details && (
                <div key={details} className="db-pop" style={{ fontFamily: DESK.body, fontSize: 12.5, fontWeight: 500, color: lite ? DESK.ink2 : 'rgba(255,255,255,0.85)', marginTop: 7, letterSpacing: '0.01em' }}>
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
            <div style={{ fontFamily: DESK.body, fontSize: 12.5, color: lite ? DESK.mute : 'rgba(255,255,255,0.4)', border: lite ? `1.5px dashed ${dot}55` : '1.5px dashed rgba(255,255,255,0.25)', background: lite ? 'rgba(255,255,255,0.4)' : undefined, borderRadius: 10, padding: '14px 16px', display: 'inline-block' }}>
              {L['board.empty']}
            </div>
          )}
          {businessName && (
            <div style={{ marginTop: compact ? 10 : 14 }}>
              <span aria-hidden style={{ display: 'block', height: 1, width: '38%', margin: '0 auto 6px', background: lite ? DESK.line : 'rgba(255,255,255,0.22)' }} />
              <div style={{ fontFamily: DESK.mono, fontSize: 8.5, letterSpacing: '0.3em', textTransform: 'uppercase', color: lite ? DESK.mute : 'rgba(255,255,255,0.55)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
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
  border: '1px solid #EAE7DE', borderRadius: 13,
  background: 'rgba(255,255,255,0.66)',
  backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
  boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 2px 8px rgba(22,33,28,0.06)',
  outline: 'none', fontFamily: DESK.body, fontSize: 14.5, color: DESK.ink,
}

function Chip({ on, label, onClick }: { on: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      style={{
        cursor: 'pointer', background: on ? DESK.mintWash : 'rgba(255,255,255,0.6)',
        backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)',
        border: `1px solid ${on ? DESK.mint : 'rgba(255,255,255,0.9)'}`, borderRadius: 99,
        padding: '8px 13px', fontSize: 12.5, fontWeight: 600, color: on ? DESK.mintDeep : DESK.ink,
        fontFamily: DESK.body, boxShadow: on ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 6px rgba(22,33,28,0.05)',
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
export interface DesignSeed { draftId?: string; described?: string; referenceUrl?: string | null; eventDateISO?: string; job?: DesignJobId }

export default function DesignOrderFlow({ menu, assets, businessName, seed, express }: { menu: { id: string; name: string }[]; assets: DesignAsset[]; businessName?: string | null; seed?: DesignSeed | null; express?: boolean }) {
  /* Client-side back to the store keeps the app shell mounted (owner ask 2026-08-18). */
  const router = useRouter()
  const today = todayISO()

  const [step, setStep] = useState(seed?.job ? 2 : 1)
  /* EXPRESS (?express=1, owner test): one screen, defaults visible, wizard
   * steps become tap-to-change editors reached from the order rows */
  const [expressHome, setExpressHome] = useState(!!express)
  /* express is two moments: tell the story, then see the order built from it */
  const [xpPhase, setXpPhase] = useState<'say' | 'order'>('say')
  /* arrived from a type tile: the intro screen is skipped, so the sheet is 5
   * screens and every number shifts down one */
  const [seededFlow, setSeededFlow] = useState(!!seed?.job)
  const [described, setDescribed] = useState(seed?.described ?? '')
  const [reading, setReading] = useState(false)
  const [read, setRead] = useState<DesignRead | null>(null)
  /* the figure-it-out assist (owner ask 2026-08-21): a half-formed idea gets three
   * concrete directions instead of empty promo slots */
  const [ideas, setIdeas] = useState<{ angle: string; headline: string; subline: string; feature: string }[] | null>(null)
  const [ideaBusy, setIdeaBusy] = useState(false)
  const [ideaError, setIdeaError] = useState<string | null>(null)
  const [job, setJob] = useState<DesignJobId | null>(seed?.job ?? null)
  /* Apple-simple step 1 (owner call 2026-08-21): one question, one input, six
   * favorites; the full shelf is one tap away, and a chosen type collapses
   * everything to a single pill. */
  const [shelfOpen, setShelfOpen] = useState(false)
  /* carousel only: total slide count (first included, extras priced per slide) */
  const [slides, setSlides] = useState(5)
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
  const [action, setAction] = useState('')
  /* the interview's answers, keyed by job + angle + index so a swap starts clean */
  const [qa, setQa] = useState<Record<string, string>>({})
  /* words mode: by default WE write the final copy from their answers; the
   * advanced lane lets them write the exact words themselves */
  const [wordsMode, setWordsMode] = useState<'draft' | 'exact'>('draft')
  const [focusedQ, setFocusedQ] = useState<string | null>(null)
  const [exactCopy, setExactCopy] = useState('')
  /* which of the type's stories they chose to tell; a type swap forgets it */
  const [angle, setAngle] = useState<string | null>(null)
  /* the owner picks the format AFTER the content; the type's registry format
   * is only the recommended default */
  const [pickedFormat, setPickedFormat] = useState<'single' | 'carousel' | null>(null)
  /* written renditions picked on the build step (About section, GBP description) */
  const [written, setWritten] = useState<string[]>([])
  useEffect(() => {
    setAngle(null); setPickedFormat(null)
    /* the objective decides the distribution: preselect where this should
     * live; the owner prunes or adds on the build step */
    const places = job ? jobSpec(job)?.places : null
    setDests(places && places.length ? [...places] : [])
    setWritten([])
    setChosenMaker(null)
  }, [job])
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
  /* MULTI-PIECE CART (owner call 2026-08-21): "several different graphics this
   * week" is a cart loop, never a multi-select — each piece keeps its own full
   * brief and its own type tag. Held pieces are finished payload snapshots. */
  const [heldPieces, setHeldPieces] = useState<{ key: string; label: string; total: number; body: Record<string, unknown> }[]>([])
  const [holding, setHolding] = useState(false)
  /* the server's own total, echoed on the placed screen */
  const [orderAmount, setOrderAmount] = useState<number | null>(null)
  /* the placed request's id, so the placed screen can collect the rest of the
   * answers into the order's own thread (the we-need-from-you pattern) */
  const [placedRequestId, setPlacedRequestId] = useState<string | null>(null)
  const [followUpBusy, setFollowUpBusy] = useState(false)
  const [followUpSent, setFollowUpSent] = useState(false)
  /* the creator marketplace as makers: live ratings, honest No-ratings-yet */
  const [makers, setMakers] = useState<{ vendorId: string; slug: string; name: string; ratingLabel: string; rating: { avg: number; count: number } | null }[]>([])
  const [chosenMaker, setChosenMaker] = useState<{ vendorId: string; name: string } | null>(null)
  useEffect(() => {
    let cancelled = false
    fetch('/api/design/makers')
      .then((r) => r.json())
      .then((j) => { if (!cancelled && Array.isArray(j.makers)) setMakers(j.makers) })
      .catch(() => { /* the order offers the house tiers either way */ })
    return () => { cancelled = true }
  }, [])
  const [panelOpen, setPanelOpen] = useState(false)
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  /* Three directions for a half-formed idea; tapping one inks the board. */
  const getIdeas = async () => {
    if (ideaBusy) return
    setIdeaBusy(true); setIdeaError(null)
    try {
      const brief = [
        described.trim().length >= 4 ? described.trim() : null,
        jobLabel ? `graphic type: ${jobLabel}` : null,
        activeAngle ? `the story: ${activeAngle.label}` : null,
        ...qaPairs.map((p) => `${p.label} ${p.text}`),
        details.trim() || null,
      ].filter(Boolean).join('. ') || 'a post for a local business'
      const r = await fetch('/api/design/ideate', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief }),
      })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !Array.isArray(d.directions)) throw new Error(typeof d.error === 'string' ? d.error : 'no directions')
      setIdeas(d.directions)
    } catch {
      setIdeaError(L['say.ideas.error'])
    }
    setIdeaBusy(false)
  }

  /* The AI pathway: the whole brief the owner just wrote feeds the free draft
   * (same route the occasion cards use), and the piece lands in approvals. */
  const aiDraft = async () => {
    setAiBusy(true); setSendError(null)
    try {
      const brief = described.trim().length >= 8
        ? described.trim()
        : [jobLabel ?? 'a graphic', headline ? `headline: ${headline}` : null, ...qaPairs.map((p) => `${p.label} ${p.text}`), details ? `details: ${details}` : null, offer ? `deal: ${offer}` : null, action ? `how to respond: ${action}` : null]
            .filter(Boolean).join('; ')
      const r = await fetch('/api/design/draft', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ brief, type: job ?? undefined }),
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
  const qualityRank = (a: { width: number; height: number }) =>
    !measuredYet(a) ? 1 : passesQualityGate(a) ? 2 : usableOnScreens(a) ? 1 : 0
  const rankedAssets = [...allAssets].sort(
    (a, b) => qualityRank(b) - qualityRank(a) || b.width * b.height - a.width * a.height,
  )
  const usable = allAssets.filter((a) => !measuredYet(a) || usableOnScreens(a))
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
  /* Each type's first question is its OWN essential: the story for subject
   * types, the question for polls, the headline otherwise. */
  const primaryAsk: 'question' | 'subject' | 'headline' = (() => {
    const a = job ? jobSpec(job)?.asks ?? [] : []
    return a.includes('question') ? 'question' : a.includes('subject') ? 'subject' : 'headline'
  })()
  const stepNo = (n: number) => (seededFlow ? n - 1 : n)
  const stepTotal = seededFlow ? 5 : 6
  /* the picked type's group color threads the whole sheet */
  const jobGroup = job ? jobSpec(job)?.group : null
  const dot = jobGroup ? JOB_GROUP_META[jobGroup].dot : DESK.mint
  /* the recommended format comes from the type; the owner can override on the
   * build step. Everything downstream follows the CHOSEN format. */
  const jobFormat = job !== null ? jobSpec(job)?.format ?? 'single' : 'single'
  const recFormat: 'single' | 'carousel' = jobFormat === 'carousel' ? 'carousel' : 'single'
  const isCarousel = (pickedFormat ?? recFormat) === 'carousel'
  /* the type's interview: angle types pick a story first, each with its own
   * questions; plain interview types go straight to theirs */
  const jobAngles = job ? jobSpec(job)?.voice?.angles ?? [] : []
  const activeAngle = jobAngles.find((a) => a.id === angle) ?? null
  const jobQs = jobAngles.length > 0
    ? (activeAngle?.questions ?? [])
    : (job ? jobSpec(job)?.voice?.questions ?? [] : [])
  const qaKey = (i: number) => `${job}-${angle ?? 'base'}-${i}`
  const qaPairs = jobQs
    .map((q, i) => ({ label: q.label, text: (qa[qaKey(i)] ?? '').trim() }))
    .filter((x) => x.text.length > 0)
  /* menu chips only make sense where food can star */
  const MENU_JOBS = ['new-menu', 'new-item', 'weekly-special', 'happy-hour', 'catering', 'carousel']
  const menuRelevant = job === null || job === 'other' || MENU_JOBS.includes(job)

  /* A sensible head start before a known event; offered as one tap, never silently applied. */
  const suggestedDue = eventDate ? addDays(eventDate, -3) : null
  const afterEvent = due != null && eventDate != null && due > eventDate

  const answers: DesignOrderAnswers = {
    jobType: { value: job ?? 'other', source: src('jobType'), citedWords: read?.cited.jobType },
    ...(isCarousel ? { slides } : {}),
    ...(written.length ? { written } : {}),
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
  const saidText = wordsMode === 'exact' && exactCopy.trim()
    ? exactCopy.trim()
    : [
        headline.trim(),
        ...qaPairs.map((p) => `${p.label} ${p.text}`),
        details.trim(),
        offer.trim(),
      ].filter(Boolean).join('. ')
  /* the live board previews the first real line as its supporting text */
  const boardDetails = wordsMode === 'exact' && exactCopy.trim()
    ? exactCopy.trim().split('\n')[0]
    : details.trim() || qaPairs[0]?.text || ''
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
    : step === 2 ? (jobQs.length > 0 ? (wordsMode === 'exact' ? exactCopy.trim().length > 0 : qaPairs.length > 0 || (jobAngles.length === 0 && headline.trim().length > 0)) : primaryAsk === 'subject' ? details.trim().length > 0 || headline.trim().length > 0 : headline.trim().length > 0)
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
  /* The current piece's finished POST body, exactly as the single-piece order
   * sent it — snapshotted for the cart so held pieces survive a state reset. */
  const buildOrderBody = async (): Promise<Record<string, unknown>> => {
    const attachments = await attachmentsForRequest()
    const days = due ? Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000) : null
    const when = days == null ? 'No rush' : days <= 7 ? 'This week' : days <= 14 ? 'In 2 weeks' : days <= 31 ? 'This month' : 'No rush'
    const noteBits = [
      isCarousel ? `CAROUSEL POST: ${slides} slides total. Slide 1 is the hook; one beat per slide; end on the call to action or the today note` : '',
      isCarousel && dests.some((d) => d !== 'instagram-post')
        ? 'Instagram carries the carousel; every other placement gets a single adapted from the strongest slide'
        : '',
      written.length ? `WRITTEN VERSIONS: also write ${written.join(' and ')} from the same answers` : '',
      seed?.draftId ? 'START FROM THE CLIENT\'S EXISTING DRAFT — polish it, do not start over' : '',
      printPicked && allQtysIn ? printDestSpecs.map((d) => `${printQtys[d.id]} x ${d.label}`).join(', ') : '',
      /* print runs are off: any picked print size is a print ready FILE handoff */
      printPicked && !PRINT_AVAILABLE ? 'Print ready files only; they handle the printing' :
      printer === 'us' ? 'We print and deliver' : printer === 'client' ? 'Their shop prints' : '',
      destOtherFinal ? `CUSTOM SPOT (not on our format list): "${destOtherFinal}". Size it with them and quote it on its own` : '',
      express && picked.length === 0 && photoMode == null ? 'PHOTOS: designer picks the best from the client library' :
      photoMode === 'none' ? 'No photos: custom artwork on their brand'
        : photoMode === 'shoot' ? 'Wants a PHOTO SHOOT at their place. Set the shoot date with them before design starts'
        : photoMode === 'source' ? 'Find photos for them'
        : photoMode === 'other' ? `Photos, in their own words: "${photoOther.trim()}"`
        : usingOwn ? 'Using their photos' : '',
      eventDate ? `Event on ${fmtDay(eventDate)}` : '',
      activeAngle ? `The story they chose: ${activeAngle.label}` : '',
      jobQs.length > 0 ? (wordsMode === 'exact'
        ? 'EXACT COPY: use their words verbatim'
        : 'WRITE THE COPY: their answers are raw material. Polish the wording, keep every fact') : '',
      action.trim() ? `How people respond: "${action.trim()}"` : '',
      !headline.trim() && (details.trim() || qaPairs.length > 0) ? 'No title given. Write one from their words' : '',
      allAssets.some((a) => picked.includes(a.id) && measuredYet(a) && !passesQualityGate(a))
        ? 'Some picked photos are below print sharpness. Use them at social sizes or small in layout, never full-bleed print'
        : '',
      described.trim() ? `In their own words: "${described.trim()}"` : '',
      due ? `In hand by ${fmtDay(due)}` : '',
      rushConfirmed ? 'Rush agreed' : '',
    ].filter(Boolean).join('. ')
    return {
      type: 'graphic',
          answers: {
            what: `${jobLabel ?? 'A graphic'}${promoteItems.length ? ` featuring ${sayList(promoteItems)}` : ''}`,
            designType: job ?? undefined,
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
        ...(isCarousel ? { slides } : {}),
        ...(written.length ? { written } : {}),
        ...(chosenMaker ? { makerVendorId: chosenMaker.vendorId, makerName: chosenMaker.name } : {}),
        photos: photoMode === 'other' ? undefined : photoMode ?? (usingOwn ? 'own' : undefined),
        dueDateISO: due ?? undefined,
        rushConfirmed,
      },
    }
  }

  /* Reset the piece-shaped state for "+ Add another graphic" — the cart holds
   * the finished snapshots; a fresh piece starts clean at step 1. */
  const resetPiece = () => {
    setJob(null); setDescribed(''); setRead(null); setIdeas(null); setIdeaError(null)
    setHeadline(''); setDetails(''); setOffer(''); setAction(''); setQa({}); setAngle(null); setWordsMode('draft'); setExactCopy(''); setPromoteItems([])
    setMenuOpen(false); setFeatureOtherOn(false); setFeatureOtherText('')
    setDests([]); setDestOther(''); setDestOtherOn(false); setCustomW(''); setCustomH('')
    setPrintQtys({}); setPrinter(null)
    setPhotoMode(null); setPhotoOther(''); setPicked([])
    setEventDate(null); setDue(null); setRushConfirmed(false)
    setTier(2); setMethod('designer'); setSlides(5)
    setSendError(null); setCart(false); setStep(1); setSeededFlow(false)
  }

  const holdAndAddAnother = async () => {
    if (holding || sending) return
    setHolding(true); setSendError(null)
    try {
      const body = await buildOrderBody()
      setHeldPieces((prev) => [...prev, {
        key: `${Date.now()}-${prev.length}`,
        label: `${jobLabel ?? 'A graphic'}${headline ? ` · "${headline}"` : ''}`.slice(0, 70),
        total: orderTotal,
        body,
      }])
      resetPiece()
    } catch {
      setSendError(L['send.error'])
    }
    setHolding(false)
  }

  const placeOrder = async () => {
    if (sending) return
    setSending(true)
    setSendError(null)
    try {
      const currentBody = await buildOrderBody()
      const queue = [...heldPieces.map((p) => ({ label: p.label, body: p.body })), { label: 'current', body: currentBody }]
      let placedCents = 0
      for (let i = 0; i < queue.length; i++) {
        const r = await fetch('/api/requests', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(queue[i].body),
        })
        const j = (await r.json().catch(() => ({}))) as { error?: string; order?: { amount_cents?: number } }
        if (!r.ok) {
          /* held pieces that made it through are DONE — drop them so a retry
           * never double-orders; the failed one stays visible with the error */
          setHeldPieces((prev) => prev.slice(i))
          throw new Error(typeof j.error === 'string' ? j.error : L['send.error'])
        }
        placedCents += typeof j.order?.amount_cents === 'number' ? j.order.amount_cents : quote.total * 100
        const reqId = (j as { request?: { id?: string } }).request?.id
        if (i === queue.length - 1 && typeof reqId === 'string') setPlacedRequestId(reqId)
      }
      setHeldPieces([])
      setOrderAmount(Math.round(placedCents / 100))
      setSubmitted(true)
    } catch (e) {
      setSendError(e instanceof Error ? e.message : L['send.error'])
    }
    setSending(false)
  }

  const ground = { ...paperGround, background: '#fff', backgroundImage: 'none', minHeight: '100%', padding: '16px 16px 0', fontFamily: DESK.body, boxSizing: 'border-box' as const, display: 'flex', flexDirection: 'column' as const }

  if (submitted) {
    return (
      <div style={{ ...ground, padding: '44px 22px', textAlign: 'center' }}>
        <DeskKeyframes />
        <BoardKeyframes />
        <div style={{ maxWidth: 300, margin: '0 auto', width: '100%' }}>
          <Artboard jobLabel={jobLabel} jobId={job} dot={dot} headline={headline} details={boardDetails} offer={offer} photoUrl={boardPhoto} businessName={businessName} tag={boardTag} stamped />
        </div>
        <div style={{ fontFamily: DESK.disp, fontSize: 23, fontWeight: 700, color: DESK.ink, letterSpacing: '-0.02em', marginTop: 10 }}>{L['done.title.order']}</div>
        <div style={{ fontSize: 13.5, color: DESK.ink2, marginTop: 8, maxWidth: '36ch', marginLeft: 'auto', marginRight: 'auto', lineHeight: 1.55 }}>
          {L['done.sub.order']}
        </div>
        {orderAmount != null && (
          <div style={{ fontFamily: DESK.mono, fontSize: 14, fontWeight: 700, color: DESK.mintDeep, marginTop: 12 }}>{`$${orderAmount}`} · {chosenMaker ? chosenMaker.name : L['sum.assigned.who']}</div>
        )}
        {(() => {
          /* the we-need-from-you moment: any question they skipped is worth a
           * minute now, and the answers land in the order's own thread */
          const missing = jobQs.map((q, i) => ({ q, i })).filter(({ i }) => !(qa[qaKey(i)] ?? '').trim())
          if (!placedRequestId || missing.length === 0 || followUpSent) {
            return followUpSent ? (
              <div style={{ marginTop: 20, fontSize: 13, fontWeight: 600, color: DESK.mintDeep }}>{L['fu.sent']}</div>
            ) : null
          }
          const sendFollowUp = async () => {
            if (followUpBusy) return
            setFollowUpBusy(true)
            const lines = jobQs
              .map((q, i) => ({ label: q.label, text: (qa[qaKey(i)] ?? '').trim() }))
              .filter((x) => x.text)
              .map((x) => `${x.label} ${x.text}`)
            try {
              const r = await fetch(`/api/requests/${placedRequestId}/notes`, {
                method: 'POST', headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ body: `${L['fu.notehead']}\n${lines.join('\n')}`.slice(0, 2000) }),
              })
              if (r.ok) setFollowUpSent(true)
            } catch { /* the thread stays open in the order hub either way */ }
            setFollowUpBusy(false)
          }
          const answeredAny = missing.some(({ i }) => (qa[qaKey(i)] ?? '').trim())
          return (
            <div style={{ marginTop: 24, textAlign: 'left', maxWidth: 440, marginLeft: 'auto', marginRight: 'auto' }}>
              <div style={{ fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, color: DESK.ink }}>{L['fu.title']}</div>
              <div style={{ fontSize: 12.5, color: DESK.ink2, marginTop: 3, lineHeight: 1.5 }}>{L['fu.sub']}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
                {missing.map(({ q, i }) => (
                  <div key={qaKey(i)} style={{ borderRadius: 12, border: `1.5px solid ${DESK.line}`, overflow: 'hidden', background: `linear-gradient(165deg, ${dot}0A, rgba(255,255,255,0.02) 55%), #fff` }}>
                    <div style={{ padding: '9px 12px 0', fontFamily: DESK.body, fontSize: 12.5, fontWeight: 700, color: DESK.ink }}>{q.label}</div>
                    <textarea
                      value={qa[qaKey(i)] ?? ''}
                      onChange={(e) => { setQa((prev) => ({ ...prev, [qaKey(i)]: e.target.value })); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
                      placeholder={q.ph} rows={2} aria-label={q.label}
                      style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', padding: '5px 12px 10px', resize: 'none', overflow: 'hidden', minHeight: 52, fontFamily: DESK.body, fontSize: 13.5, color: DESK.ink, lineHeight: 1.5 }}
                    />
                  </div>
                ))}
              </div>
              <button
                type="button" disabled={followUpBusy || !answeredAny} onClick={() => void sendFollowUp()}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 10, padding: '10px 18px', borderRadius: 22, border: 'none', cursor: answeredAny ? 'pointer' : 'default', background: answeredAny ? DESK.grad : '#E7E4DB', color: answeredAny ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 13.5, fontWeight: 700 }}
              >
                <Send size={13} /> {followUpBusy ? L['fu.sending'] : L['fu.send']}
              </button>
            </div>
          )
        })()}
      </div>
    )
  }

  /* ── THE CART: one item, one honest total, one tap to confirm ─────────────────────── */
  /* ── EXPRESS: say it, see the order, send it ─────────────────────────── */
  if (express && expressHome && !submitted && !cart) {
    const wordsReady = jobQs.length > 0
      ? (wordsMode === 'exact' ? exactCopy.trim().length > 0 : qaPairs.length > 0)
      : headline.trim().length > 0 || details.trim().length > 0
    const openEditor = (n: number) => { setExpressHome(false); setStep(n) }
    const leadQ = jobQs[0]
    const row = (icon: React.ReactNode, label: string, value: string, n: number) => (
      <button
        key={label} type="button" onClick={() => openEditor(n)}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '13px 14px', background: 'transparent', border: 'none', borderBottom: `1px solid ${DESK.line}55`, cursor: 'pointer', fontFamily: DESK.body }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12, color: DESK.mute, flexShrink: 0 }}>
          <span aria-hidden style={{ display: 'inline-flex', color: dot, opacity: 0.85 }}>{icon}</span>
          {label}
        </span>
        <span style={{ fontSize: 13, fontWeight: 600, color: DESK.ink, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value} <span style={{ color: DESK.mute }}>{'›'}</span></span>
      </button>
    )
    const tierName = { 1: L['tier.basic.label'], 2: L['tier.custom.label'], 3: L['tier.works.label'] }[tier]
    const photoValue = picked.length > 0 ? `${picked.length} picked`
      : photoMode === 'shoot' ? L['photos.shoot.label']
      : photoMode === 'source' ? 'We find photos'
      : photoMode === 'none' ? 'Custom artwork'
      : 'Designer picks from your library'
    return (
      <div style={ground}>
        <DeskKeyframes />
        <BoardKeyframes />
        <button
          type="button" onClick={() => router.push('/dashboard/design/browse')}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', padding: '2px 0', marginBottom: 8, cursor: 'pointer', fontFamily: DESK.body, fontSize: 14, fontWeight: 600, color: DESK.ink2 }}
        >
          {'‹'} Store
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {job !== null && (
            <span aria-hidden style={{ flexShrink: 0, width: 58, borderRadius: 12, padding: '7px 5px', background: `linear-gradient(165deg, ${dot}14, rgba(255,255,255,0.04) 55%), rgba(255,255,255,0.6)`, border: '1px solid #EAE7DE', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 3px 10px rgba(22,33,28,0.06)' }}>
              <BoardArt id={job} dot={dot} />
            </span>
          )}
          <h2 style={{ fontFamily: DESK.disp, fontSize: 25, fontWeight: 700, color: DESK.ink, lineHeight: 1.12, margin: 0, letterSpacing: '-0.02em' }}>{jobLabel ?? T.job}</h2>
        </div>

        {xpPhase === 'say' ? (
          <>
            {/* moment one: just the story. Nothing else on screen. */}
            {jobAngles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 12 }}>
                {jobAngles.map((a) => <Chip key={a.id} on={angle === a.id} label={a.label} onClick={() => setAngle(a.id)} />)}
              </div>
            )}
            {(jobAngles.length === 0 || activeAngle) && leadQ && (
              <div style={{ marginTop: 12, borderRadius: 14, border: `1.5px solid ${DESK.line}`, overflow: 'hidden', background: `linear-gradient(165deg, ${dot}0A, rgba(255,255,255,0.02) 55%), #fff` }}>
                <div style={{ padding: '11px 13px 0', fontFamily: DESK.body, fontSize: 13.5, fontWeight: 700, color: DESK.ink }}>{leadQ.label}</div>
                <div style={{ padding: '3px 13px 0', fontSize: 11.5, color: DESK.mute, fontStyle: 'italic' }}>{L['say.like']}: {'\u201C'}{leadQ.ph}{'\u201D'}</div>
                <textarea
                  value={qa[qaKey(0)] ?? ''}
                  onChange={(e) => { setQa((prev) => ({ ...prev, [qaKey(0)]: e.target.value })); e.target.style.height = 'auto'; e.target.style.height = `${e.target.scrollHeight}px` }}
                  placeholder={L['say.answer.ph']} rows={3} aria-label={leadQ.label}
                  style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', padding: '8px 13px 12px', resize: 'none', overflow: 'hidden', minHeight: 88, fontFamily: DESK.body, fontSize: 14, color: DESK.ink, lineHeight: 1.5 }}
                />
              </div>
            )}
            {jobAngles.length > 0 && !activeAngle && (
              <div style={{ marginTop: 10, fontSize: 12, color: DESK.mute }}>{L['say.whichstory']}</div>
            )}
            {jobQs.length === 0 && (
              <input
                value={headline} onChange={(e) => setHeadline(e.target.value)}
                placeholder={(job !== null ? jobSpec(job)?.voice?.headlinePh : undefined) ?? L['say.headline.ph']} aria-label={L['say.headline']}
                style={{ ...inputStyle, marginTop: 12 }}
              />
            )}
            {(jobAngles.length === 0 || activeAngle) && jobQs.length > 1 && (
              <button type="button" onClick={() => openEditor(2)}
                style={{ marginTop: 8, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DESK.body, fontSize: 12, fontWeight: 600, color: DESK.mintDeep, textDecoration: 'underline', textUnderlineOffset: 3 }}>
                {fill(L['xp.morequestions'], { n: String(jobQs.length - 1) })}
              </button>
            )}
            <button
              type="button" disabled={!wordsReady}
              onClick={() => {
                /* the order derives from the story: one page per answered beat,
                 * plus a cover and a close */
                if (isCarousel) setSlides(Math.min(10, Math.max(3, qaPairs.length + 2)))
                setXpPhase('order')
              }}
              style={{ width: '100%', height: 52, marginTop: 16, marginBottom: 24, borderRadius: 26, border: 'none', cursor: wordsReady ? 'pointer' : 'default', background: wordsReady ? DESK.grad : '#E7E4DB', color: wordsReady ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, boxShadow: wordsReady ? '0 8px 20px rgba(46,154,120,0.3)' : 'none' }}
            >
              {L['xp.tosorder']}
            </button>
            {!wordsReady && (
              <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: -14, marginBottom: 24, textAlign: 'center' }}>{L['xp.needwords']}</div>
            )}
          </>
        ) : (
          <>
            {/* moment two: the order, built from the story above it */}
            <button type="button" onClick={() => setXpPhase('say')}
              style={{ marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DESK.body, fontSize: 12.5, fontWeight: 600, color: DESK.ink2 }}>
              {'‹'} {L['xp.editstory']}
            </button>
            {qaPairs[0] && (
              <div style={{ marginTop: 8, padding: '10px 13px', borderRadius: 12, background: `linear-gradient(165deg, ${dot}0C, rgba(255,255,255,0.02) 60%), #fff`, border: `1px solid ${DESK.line}` }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', fontWeight: 700, color: dot }}>{activeAngle?.label ?? jobLabel}</div>
                <div style={{ fontSize: 12.5, color: DESK.ink2, fontStyle: 'italic', marginTop: 3, lineHeight: 1.5 }}>{'\u201C'}{qaPairs[0].text.slice(0, 120)}{qaPairs[0].text.length > 120 ? '…' : ''}{'\u201D'}</div>
              </div>
            )}
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '18px 0 2px' }}>
              {L['xp.order']}
            </div>
            <div style={{ fontSize: 11.5, color: DESK.mute, marginBottom: 6, lineHeight: 1.45 }}>{L['xp.order.sub']}</div>
            <div style={{ borderRadius: 16, border: '1.5px solid #EAE7DE', overflow: 'hidden', background: `linear-gradient(165deg, ${dot}08, rgba(255,255,255,0.02) 60%), #fff`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 6px 18px rgba(22,33,28,0.07)' }}>
              {row(<Layers size={14} />, L['xp.row.build'], isCarousel ? `${L['fmt.chip.carousel']} · ${slides} ${L['xp.pages']}` : L['fmt.chip.single'], 5)}
              {(() => {
                const digital = dests.filter((d) => DESTINATIONS.find((x) => x.id === d)?.kind === 'digital')
                const print = dests.filter((d) => DESTINATIONS.find((x) => x.id === d)?.kind === 'print')
                const names = (ids: DestinationId[]) => `${ids.slice(0, 2).map((d) => DESTINATIONS.find((x) => x.id === d)?.label).filter(Boolean).join(', ')}${ids.length > 2 ? ` +${ids.length - 2}` : ''}`
                return (
                  <>
                    {row(<Send size={14} />, L['xp.row.where'], digital.length ? names(digital) : L['xp.none'], 5)}
                    {row(<Layers size={14} />, L['xp.row.print'], print.length ? names(print) : L['xp.print.none'], 5)}
                  </>
                )
              })()}
              {row(<ImageIcon size={14} />, L['xp.row.photos'], photoValue, 3)}
              {row(<CalendarDays size={14} />, L['xp.row.when'], due ? fmtDay(due) : `${fmtDay(standardDelivery)} · ${L['xp.standard']}`, 4)}
              {row(<User size={14} />, L['xp.row.maker'], `${chosenMaker ? chosenMaker.name : tierName} · $${RATE_CARD.tierBase[tier]}`, 6)}
            </div>
            <button
              type="button" disabled={!wordsReady} onClick={() => openEditor(6)}
              style={{ width: '100%', height: 52, marginTop: 16, marginBottom: 24, borderRadius: 26, border: 'none', cursor: wordsReady ? 'pointer' : 'default', background: wordsReady ? DESK.grad : '#E7E4DB', color: wordsReady ? '#fff' : DESK.mute, fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, boxShadow: wordsReady ? '0 8px 20px rgba(46,154,120,0.3)' : 'none' }}
            >
              {fill(L['xp.review'], { total: String(quote.total) })}
            </button>
          </>
        )}
      </div>
    )
  }

  if (cart) {
    const grandTotal = heldPieces.reduce((n, h) => n + h.total, 0) + orderTotal
    return (
      <div style={{ ...ground, padding: '24px 18px 40px' }}>
        <DeskKeyframes />
        <BoardKeyframes />
        <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: DESK.mute, marginBottom: 10 }}>{L['cart.title']}</div>
        {heldPieces.length > 0 && (
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 6 }}>{L['cart.held']}</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {heldPieces.map((h) => (
                <div key={h.key} style={{ display: 'flex', alignItems: 'center', gap: 10, background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 12, padding: '10px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: DESK.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.label}</div>
                  <div style={{ fontFamily: DESK.mono, fontSize: 12.5, fontWeight: 700, color: DESK.mintDeep, flexShrink: 0 }}>{`$${h.total}`}</div>
                  <button type="button" onClick={() => setHeldPieces((prev) => prev.filter((x) => x.key !== h.key))}
                    style={{ flexShrink: 0, background: 'none', border: 'none', padding: 2, cursor: 'pointer', fontSize: 11, fontWeight: 600, color: DESK.mute, fontFamily: DESK.body }}>
                    {L['cart.remove']}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        <div style={{ maxWidth: 300, margin: '0 auto', width: '100%' }}>
          <Artboard jobLabel={jobLabel} jobId={job} dot={dot} headline={headline} details={boardDetails} offer={offer} photoUrl={boardPhoto} businessName={businessName} tag={boardTag} compact />
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
          <div style={{ fontSize: 14, fontWeight: 700, color: DESK.ink }}>{chosenMaker ? chosenMaker.name : L['sum.assigned.who']}</div>
          <div style={{ fontSize: 12, color: DESK.ink2, marginTop: 3, lineHeight: 1.45 }}>{L['sum.assigned.sub']}</div>
        </div>
        {sendError && (
          <div style={{ background: DESK.amberWash, color: DESK.amber, border: `1px solid ${DESK.amberLine}`, borderRadius: 12, padding: '9px 13px', fontSize: 12.5, fontWeight: 600, marginBottom: 12, lineHeight: 1.45 }}>
            {sendError}
          </div>
        )}
        <ConfirmButton
          label={sending ? 'Placing your order...' : `${L['cart.confirm']} · $${grandTotal}${heldPieces.length > 0 ? ` (${heldPieces.length + 1} ${L['cart.pieces']})` : ''}`}
          sub={L['cart.confirm.sub']}
          disabled={sending || holding}
          onClick={() => { void placeOrder() }}
        />
        <div style={{ fontSize: 11.5, color: DESK.mute, margin: '8px 2px 0', lineHeight: 1.5, textAlign: 'center' }}>{L['cart.valve']}</div>
        <div style={{ height: 10 }} />
        <ConfirmButton
          label={holding ? 'Saving this one…' : `+ ${L['cart.another']}`}
          tone="paper" disabled={sending || holding}
          onClick={() => { void holdAndAddAnother() }}
        />
        <div style={{ height: 10 }} />
        <ConfirmButton label={L['cart.change']} tone="paper" disabled={sending || holding} onClick={() => setCart(false)} />
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
      {(step === 1 || (seededFlow && step === 2)) && (
        <button
          type="button"
          onClick={() => router.push(seededFlow ? '/dashboard/design/browse' : '/dashboard/campaigns/new?lens=creatives')}
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

      {/* the proof appears at the END: the review step shows everything the
       * order collected, laid out on the glass board (owner call 2026-08-21:
       * no preview riding along while questions are being answered) */}
      {step === 6 && (
        <div style={{ maxWidth: 460, margin: '0 auto', width: '100%' }}>
          <Artboard
            jobLabel={jobLabel}
            jobId={job} dot={dot}
            headline={headline} details={boardDetails} offer={offer}
            photoUrl={boardPhoto} businessName={businessName} tag={boardTag} rush={quote.rush}
          />
        </div>
      )}

      <div style={{ flex: 1 }}>

        {/* ── 1. what do you need ── */}
        {step === 1 && (
          <>
            <StepHead
              n={1} total={stepTotal} accent={dot}
              title={job !== null ? (jobLabel ?? T.job) : T.job}
              sub={job !== null ? (jobSpec(job)?.voice?.blurb ?? S.job) : S.job}
            />
            {job === null && (
              <textarea
                value={described} onChange={(e) => setDescribed(e.target.value)}
                placeholder="A flyer and an Instagram post for our event on the 15th, 20% off that night…"
                rows={3}
                style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: 1.5, borderRadius: 14 }}
              />
            )}
            {job !== null ? (
              /* the Making pill is itself the swap control: tap to open the
               * shelf below with the current pick lit, tap another to swap */
              <button
                type="button" onClick={() => setShelfOpen((o) => !o)} aria-expanded={shelfOpen}
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, background: `linear-gradient(165deg, ${dot}16, rgba(255,255,255,0.05) 60%), rgba(255,255,255,0.6)`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.9)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 4px 12px rgba(22,33,28,0.07)', borderRadius: 14, padding: '10px 14px', cursor: 'pointer', textAlign: 'left', fontFamily: DESK.body }}
              >
                <span aria-hidden style={{ fontSize: 20 }}>{jobSpec(job)?.emoji ?? '✨'}</span>
                <span style={{ flex: 1, minWidth: 0, display: 'block' }}>
                  <span style={{ display: 'block', fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mintDeep }}>{L['job.making']}</span>
                  <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: DESK.ink }}>{jobLabel}</span>
                </span>
                <span style={{ flexShrink: 0, fontSize: 12, fontWeight: 700, color: DESK.mintDeep }}>
                  {L['job.swap']} {shelfOpen ? '‹' : '›'}
                </span>
              </button>
            ) : (
              <>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '16px 0 8px' }}>
                  {L['job.popular']}
                </div>
                {!shelfOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                    {(['weekly-special', 'new-item', 'story-behind', 'carousel', 'hiring', 'announcement'] as const).map((id) => {
                      const sp = jobSpec(id)
                      return sp ? <Chip key={id} on={false} label={`${sp.emoji} ${DESIGN_JOBS.find((x) => x.id === id)?.label ?? id}`} onClick={() => setJob(id)} /> : null
                    })}
                    <Chip on={false} label={`${L['job.alltypes']} ›`} onClick={() => setShelfOpen(true)} />
                  </div>
                )}
              </>
            )}
            {shelfOpen && (
              <div style={{ marginTop: job !== null ? 12 : 0 }}>
                {JOB_GROUPS.map((g) => (
                  <div key={g.name} style={{ marginBottom: 14 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: 99, background: g.dot, display: 'inline-block' }} />
                      {g.name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                      {g.jobs.map((j) => (
                        <JobTile key={j.id} job={j} tint={g.tint} on={j.id === job} onClick={() => { setJob(j.id); setShelfOpen(false) }} />
                      ))}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => setShelfOpen(false)}
                  style={{ background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: DESK.body, fontSize: 12.5, fontWeight: 600, color: DESK.ink2 }}>
                  {L['job.less']}
                </button>
              </div>
            )}
            {job !== null && (
              <textarea
                value={described} onChange={(e) => setDescribed(e.target.value)}
                placeholder={L['job.describe.opt']}
                rows={2}
                style={{ ...inputStyle, height: 'auto', padding: '11px 14px', resize: 'none', lineHeight: 1.5, borderRadius: 14, marginTop: 12 }}
              />
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
            <StepHead n={stepNo(5)} total={stepTotal} accent={dot} title={T.where} sub={S.where} />
            {job !== null && (jobSpec(job)?.places?.length ?? 0) > 0 && (
              <div style={{ background: DESK.mintWash, border: `1px solid ${DESK.mint}44`, borderRadius: 12, padding: '9px 13px', fontSize: 12, fontWeight: 600, color: DESK.mintDeep, marginBottom: 12, lineHeight: 1.45 }}>
                {L['dest.rec']}
              </div>
            )}
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '0 0 8px' }}>
              {L['fmt.how']}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 6 }}>
              {(['single', 'carousel'] as const).map((f) => {
                const on = (pickedFormat ?? recFormat) === f
                return (
                  <button
                    key={f} type="button" aria-pressed={on} onClick={() => setPickedFormat(f)}
                    style={{
                      position: 'relative', textAlign: 'left', cursor: 'pointer', padding: '11px 12px', borderRadius: 13,
                      border: `1.5px solid ${on ? DESK.mint : DESK.line}`,
                      background: on ? DESK.mintWash : '#fff',
                      boxShadow: '0 2px 8px rgba(22,33,28,0.05)', fontFamily: DESK.body,
                      WebkitTapHighlightColor: 'transparent', transition: 'border-color .15s ease, background .15s ease',
                    }}
                  >
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink }}>
                      {f === 'single' ? L['fmt.single.name'] : L['fmt.multi.name']}
                    </span>
                    <span style={{ display: 'block', fontSize: 11.5, color: DESK.ink2, marginTop: 2, lineHeight: 1.4 }}>
                      {f === 'single' ? L['fmt.single.sub'] : L['fmt.multi.sub']}
                    </span>
                    {recFormat === f && jobFormat !== 'either' && (
                      <span style={{ position: 'absolute', top: 8, right: 9, fontFamily: DESK.mono, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mintDeep }}>
                        {L['fmt.rec']}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
              {isCarousel && (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 7 }}>
                  {L['job.slides.title']}
                </div>
                {/* one slider, one number — no preset-vs-other split (owner call 2026-08-20) */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <input
                    type="range" min={2} max={10} step={1} value={slides} aria-label="Slide count"
                    onChange={(e) => setSlides(Number(e.target.value))}
                    style={{ flex: 1, accentColor: DESK.mint, height: 32, cursor: 'pointer' }}
                  />
                  <input
                    inputMode="numeric" value={String(slides)} aria-label="Slide count number"
                    onChange={(e) => {
                      const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                      const n = Number(v)
                      if (n >= 2 && n <= 10) setSlides(n)
                    }}
                    style={{ ...inputStyle, width: 58, height: 40, textAlign: 'center', fontFamily: DESK.disp, fontSize: 16, fontWeight: 700, color: DESK.mintDeep }}
                  />
                </div>
                <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 6, lineHeight: 1.45 }}>{L['job.slides.sub']}</div>
              </div>
            )}
            {job !== null && ((jobSpec(job)?.written?.length ?? 0) > 0) && (
              <div style={{ margin: '14px 0 4px' }}>
                <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 4 }}>
                  {L['written.title']}
                </div>
                <div style={{ fontSize: 11.5, color: DESK.mute, marginBottom: 8, lineHeight: 1.45 }}>{L['written.sub']}</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {(jobSpec(job)?.written ?? []).map((w) => {
                    const on = written.includes(w)
                    return (
                      <button
                        key={w} type="button" aria-pressed={on}
                        onClick={() => setWritten((prev) => (prev.includes(w) ? prev.filter((x) => x !== w) : [...prev, w]))}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                          textAlign: 'left', cursor: 'pointer', padding: '11px 13px', borderRadius: 12,
                          border: `1.5px solid ${on ? DESK.mint : DESK.line}`, background: on ? DESK.mintWash : '#fff',
                          fontFamily: DESK.body, WebkitTapHighlightColor: 'transparent',
                          transition: 'border-color .15s ease, background .15s ease',
                        }}
                      >
                        <span style={{ fontSize: 13, fontWeight: 600, color: on ? DESK.mintDeep : DESK.ink }}>{w}</span>
                        <span style={{ flexShrink: 0, fontFamily: DESK.mono, fontSize: 12.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.mute }}>{`$${RATE_CARD.writtenVersion}`}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

              {!(jobAngles.length > 0 && !activeAngle) && (jobQs.length === 0 || wordsMode === 'exact') && (
                <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 14, lineHeight: 1.45 }}>
                  {L['say.note']}
                </div>
              )}

            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '14px 0 8px' }}>
              {L['dest.where']}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
              {DESTINATIONS.filter((d) => d.kind === 'digital').map((d) => (
                <DestFrame
                  key={d.id} d={d} on={dests.includes(d.id)}
                  amount={requestMode ? null : destAmount(d.id)} photoUrl={boardPhoto} headline={headline}
                  onClick={() => setDests((prev) => (prev.includes(d.id) ? prev.filter((x) => x !== d.id) : [...prev, d.id]))}
                />
              ))}
            </div>
            <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '16px 0 2px' }}>
              {L['dest.print']}
            </div>
            <div style={{ fontSize: 11.5, color: DESK.mute, marginBottom: 8, lineHeight: 1.45 }}>{L['dest.print.sub']}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'flex-end' }}>
              {DESTINATIONS.filter((d) => d.kind === 'print').map((d) => (
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
          /* the type's own voice reshapes this step: its question leads, its
           * labels and examples fill the blanks, and only its slots show */
          const jspec2 = job ? jobSpec(job) : null
          const jv = jspec2?.voice ?? null
          const isQuestion = jspec2?.asks.includes('question') ?? false
          const wantsOffer = !job || job === 'other' || (jspec2?.asks.includes('offer') ?? false)
          const wantsDate = jspec2?.asks.includes('eventDate') ?? false
          const headlineSugs = [...new Set([
            read?.message ? titleCase(read.message) : null,
            promoteItems[0] ?? null,
            job ? JOB_HEADLINES[job] : null,
            ...(jv?.headlines ?? []),
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
              <StepHead
                n={stepNo(2)} total={stepTotal} accent={dot}
                title={job !== null
                  ? (activeAngle ? activeAngle.label : jobLabel ?? T.say)
                  : (isQuestion ? L['say.question.title'] : T.say)}
                sub={jobAngles.length > 0 ? undefined : jv?.ask ?? S.say}
                aside={job !== null && !activeAngle ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ padding: '4px 9px', borderRadius: 99, background: `${dot}14`, border: `1px solid ${dot}44`, fontFamily: DESK.mono, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700, color: dot, whiteSpace: 'nowrap' }}>
                    {jobFormat === 'carousel' ? L['fmt.chip.carousel'] : jobFormat === 'either' ? L['fmt.chip.either'] : L['fmt.chip.single']}
                  </span>
                  <button
                    type="button" onClick={() => setShelfOpen((o) => !o)} aria-expanded={shelfOpen}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 7, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', border: '1px solid rgba(255,255,255,0.9)', background: `linear-gradient(165deg, ${dot}18, rgba(255,255,255,0.05) 60%), rgba(255,255,255,0.6)`, backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.95), 0 3px 10px rgba(22,33,28,0.07)', fontFamily: DESK.body, fontSize: 12, fontWeight: 700, color: DESK.mintDeep }}
                  >
                    {L['job.swap']} {shelfOpen ? '‹' : '›'}
                  </button>
                  </span>
                ) : undefined}
              />

              {shelfOpen && job !== null && (
                <div style={{ marginBottom: 12 }}>
                  {JOB_GROUPS.map((g) => (
                    <div key={g.name} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: 99, background: g.dot, display: 'inline-block' }} />
                        {g.name}
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                        {g.jobs.map((j) => (
                          <JobTile key={j.id} job={j} tint={g.tint} on={j.id === job} onClick={() => { setJob(j.id); setShelfOpen(false) }} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}


              {/* the figure-it-out assist: for the owner who has not planned the post
               * yet. Angle types skip it: their story cards ARE the default options. */}
              {jobAngles.length > 0 ? null : ideas === null ? (
                <button
                  type="button" onClick={() => void getIdeas()} disabled={ideaBusy}
                  style={{ width: '100%', marginTop: 8, padding: '11px 14px', borderRadius: 13, cursor: 'pointer', border: `1.5px dashed ${DESK.mint}AA`, background: 'linear-gradient(165deg, rgba(46,154,120,0.10), rgba(255,255,255,0.05) 60%), rgba(255,255,255,0.55)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9)', color: DESK.mintDeep, fontFamily: DESK.body, fontSize: 13, fontWeight: 700 }}
                >
                  {ideaBusy ? `${L['say.ideas.busy']}…` : `✨ ${L['say.ideas.btn']}`}
                </button>
              ) : (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, marginBottom: 7 }}>
                    {L['say.ideas.title']}
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {ideas.map((d) => {
                      const on = headline === d.headline
                      return (
                        <button
                          key={d.angle + d.headline} type="button"
                          onClick={() => { setHeadline(d.headline); setDetails(d.subline) }}
                          style={{ textAlign: 'left', padding: '11px 13px', borderRadius: 12, cursor: 'pointer', border: `1.5px solid ${on ? DESK.mint : DESK.line}`, background: on ? DESK.mintWash : DESK.card, fontFamily: DESK.body }}
                        >
                          <div style={{ fontFamily: DESK.mono, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mintDeep }}>{d.angle}</div>
                          <div style={{ fontSize: 14.5, fontWeight: 700, color: DESK.ink, marginTop: 3 }}>{d.headline}</div>
                          <div style={{ fontSize: 12, color: DESK.ink2, marginTop: 2, lineHeight: 1.45 }}>{d.subline}</div>
                          {d.feature && <div style={{ fontSize: 11, color: DESK.mute, marginTop: 4, lineHeight: 1.4 }}>{L['say.ideas.feature']}: {d.feature}</div>}
                        </button>
                      )
                    })}
                  </div>
                  <button type="button" onClick={() => void getIdeas()} disabled={ideaBusy}
                    style={{ marginTop: 8, padding: '6px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink2, fontFamily: DESK.body, fontSize: 11.5, fontWeight: 600 }}>
                    {ideaBusy ? `${L['say.ideas.busy']}…` : '↻ 3 more'}
                  </button>
                </div>
              )}
              {ideaError && <div style={{ fontSize: 11.5, color: DESK.amber, marginTop: 6 }}>{ideaError}</div>}

              {(() => {
                const titleSlot = (opt: boolean) => (
                  <>
                    {slotLabel(isQuestion ? L['say.question'] : opt ? L['say.title'] : L['say.headline'], opt)}
                    {slotInput(headline, setHeadline, jv?.headlinePh ?? L['say.headline.ph'], isQuestion ? L['say.question'] : L['say.headline'])}
                    {headlineSugs.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                        {headlineSugs.map((h) => <Chip key={h} on={false} label={h} onClick={() => setHeadline(h)} />)}
                      </div>
                    )}
                    {opt && !headline.trim() && (
                      <div style={{ fontSize: 11, color: DESK.mute, marginTop: 6 }}>{L['say.title.blank']}</div>
                    )}
                  </>
                )
                const subjectSlot = (asPrimary: boolean) => (
                  <>
                    {slotLabel(jv?.subject ?? L['say.details'], !asPrimary)}
                    {asPrimary ? (
                      <textarea
                        value={details} onChange={(e) => setDetails(e.target.value)}
                        placeholder={jv?.subjectPh ?? L['say.details.ph']} rows={3}
                        aria-label={jv?.subject ?? L['say.details']}
                        style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: 1.5, borderRadius: 14 }}
                      />
                    ) : (
                      slotInput(details, setDetails, eventDate ? fmtLong(eventDate) : jv?.subjectPh ?? L['say.details.ph'], jv?.subject ?? L['say.details'])
                    )}
                    {detailSugs.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                        {detailSugs.map((d) => <Chip key={d} on={false} label={d} onClick={() => setDetails(d)} />)}
                      </div>
                    )}
                  </>
                )
                /* an interview type asks ITS questions and nothing else; the
                 * title trails, optional. Other types keep their shapes. */
                const modeLink = (
                  <button
                    type="button"
                    onClick={() => setWordsMode(wordsMode === 'exact' ? 'draft' : 'exact')}
                    style={{ marginTop: 12, background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontFamily: DESK.body, fontSize: 12, fontWeight: 600, color: DESK.ink2, textDecoration: 'underline', textUnderlineOffset: 3 }}
                  >
                    {wordsMode === 'exact' ? L['say.mode.guided'] : L['say.mode.advanced']}
                  </button>
                )
                const interview = wordsMode === 'exact' ? (
                  <>
                    {slotLabel(L['say.exact'])}
                    <textarea
                      value={exactCopy} onChange={(e) => setExactCopy(e.target.value)}
                      placeholder={L['say.exact.ph']} rows={7} aria-label={L['say.exact']}
                      style={{ ...inputStyle, height: 'auto', padding: '12px 14px', resize: 'none', lineHeight: 1.55, borderRadius: 14 }}
                    />
                    {modeLink}
                  </>
                ) : (
                  <>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {jobQs.map((q, i) => {
                        const k = qaKey(i)
                        const answered = (qa[k] ?? '').trim().length > 0
                        const focused = focusedQ === k
                        return (
                          <div
                            key={k}
                            onClick={(e) => (e.currentTarget.querySelector('textarea') as HTMLTextAreaElement | null)?.focus()}
                            style={{
                              borderRadius: 14, overflow: 'hidden', cursor: 'text',
                              border: `1.5px solid ${focused ? DESK.mint : DESK.line}`,
                              background: `linear-gradient(165deg, ${dot}0A, rgba(255,255,255,0.02) 55%), #fff`,
                              boxShadow: focused ? '0 4px 14px rgba(46,154,120,0.14)' : '0 2px 8px rgba(22,33,28,0.05)',
                              transition: 'border-color .15s ease, box-shadow .15s ease',
                            }}
                          >
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 13px 0' }}>
                              <span aria-hidden style={{ flexShrink: 0, width: 20, height: 20, borderRadius: 99, background: answered ? DESK.mint : `${dot}22`, color: answered ? '#fff' : dot, fontFamily: DESK.mono, fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'background .2s ease, color .2s ease' }}>
                                {answered ? '✓' : i + 1}
                              </span>
                              <span style={{ fontFamily: DESK.body, fontSize: 13.5, fontWeight: 700, color: DESK.ink }}>
                                {q.label}{i > 0 ? <span style={{ fontWeight: 500, color: DESK.mute }}>{' · '}{L['say.optional']}</span> : null}
                              </span>
                            </div>
                            {/* the example never disappears while they type */}
                            <div style={{ padding: '3px 13px 0 41px', fontSize: 11.5, color: DESK.mute, fontStyle: 'italic', lineHeight: 1.4 }}>
                              {L['say.like']}: {'\u201C'}{q.ph}{'\u201D'}
                            </div>
                            {/* box size signals expected answer length: story
                             * questions get room, factual ones stay one line */}
                            <textarea
                              value={qa[k] ?? ''}
                              onChange={(e) => {
                                setQa((prev) => ({ ...prev, [k]: e.target.value }))
                                e.target.style.height = 'auto'
                                e.target.style.height = `${e.target.scrollHeight}px`
                              }}
                              onFocus={() => setFocusedQ(k)}
                              onBlur={() => setFocusedQ((cur) => (cur === k ? null : cur))}
                              placeholder={L['say.answer.ph']}
                              rows={(q.long ?? jobAngles.length > 0) ? (i === 0 ? 4 : 2) : 1}
                              aria-label={q.label}
                              style={{ width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', background: 'transparent', padding: '6px 13px 12px 41px', resize: 'none', overflow: 'hidden', minHeight: (q.long ?? jobAngles.length > 0) ? (i === 0 ? 110 : 64) : 40, fontFamily: DESK.body, fontSize: 14, color: DESK.ink, lineHeight: 1.5 }}
                            />
                          </div>
                        )
                      })}
                    </div>
                    <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 10, lineHeight: 1.5 }}>{L['say.wewrite']}</div>
                    {modeLink}
                  </>
                )
                if (jobAngles.length > 0) {
                  if (activeAngle) return interview
                  return (
                    <>
                      {slotLabel(L['say.whichstory'])}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 8 }}>
                        {jobAngles.map((a) => {
                          const on = angle === a.id
                          return (
                            <button
                              key={a.id} type="button" aria-pressed={on} onClick={() => setAngle(a.id)}
                              style={{
                                position: 'relative', overflow: 'hidden', cursor: 'pointer', textAlign: 'left',
                                padding: '13px 15px', borderRadius: 13, minHeight: 92,
                                display: 'flex', flexDirection: 'column', justifyContent: 'center',
                                background: on
                                  ? DESK.mintWash
                                  : `linear-gradient(165deg, ${dot}0E, rgba(255,255,255,0.04) 55%), rgba(255,255,255,0.6)`,
                                backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)',
                                border: `1.5px solid ${on ? DESK.mint : DESK.line}`,
                                boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.9), 0 2px 8px rgba(22,33,28,0.05)',
                                fontFamily: DESK.body, WebkitTapHighlightColor: 'transparent',
                                transition: 'border-color .15s ease, background .15s ease',
                              }}
                            >
                              <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink }}>{a.label}</span>
                              <span style={{ display: 'block', fontSize: 12, color: DESK.ink2, marginTop: 3, lineHeight: 1.5 }}>{a.sub}</span>
                            </button>
                          )
                        })}
                      </div>
                    </>
                  )
                }
                if (jobQs.length > 0) return interview
                return primaryAsk === 'subject'
                  ? <>{subjectSlot(true)}{titleSlot(true)}</>
                  : <>{titleSlot(false)}{subjectSlot(false)}</>
              })()}

              {wantsDate && (
                <>
                  {slotLabel(job === 'recap' ? L['say.date.past'] : L['say.date'])}
                  <input
                    type="date" value={eventDate ?? ''}
                    onChange={(e) => setEventDate(e.target.value || null)}
                    aria-label={job === 'recap' ? L['say.date.past'] : L['say.date']}
                    style={inputStyle}
                  />
                </>
              )}

              {(wantsOffer || offer.trim().length > 0) && (
                <>
                  {slotLabel(L['say.deal'], true)}
                  {slotInput(offer, setOffer, jv?.offerPh ?? L['say.deal.ph'], L['say.deal'])}
                </>
              )}

              {jspec2?.asks.includes('action') && jv?.actionLabel && (
                <>
                  {slotLabel(jv.actionLabel)}
                  {slotInput(action, setAction, jv.actionPh ?? '', jv.actionLabel)}
                </>
              )}

              {menu.length > 0 && menuRelevant && (() => {
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

            </>
          )
        })()}

        {/* ── 4. photos: real library ranked sharpest first, or hand it to us ── */}
        {step === 3 && (
          <>
            <StepHead n={stepNo(3)} total={stepTotal} accent={dot} title={T.photos} sub={S.photos} />
            {job !== null && jobSpec(job)?.voice?.photoHint && (
              <div style={{ fontSize: 12, fontWeight: 600, color: DESK.mintDeep, background: DESK.mintWash, border: `1px solid ${DESK.mint}55`, borderRadius: 10, padding: '8px 12px', margin: '-4px 0 10px', lineHeight: 1.45 }}>
                {jobSpec(job)?.voice?.photoHint}
              </div>
            )}
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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
              {(() => {
                if (photosOpen) {
                  const q = photoQ.trim().toLowerCase()
                  return q ? rankedAssets.filter((a) => (a.label ?? '').toLowerCase().includes(q)) : rankedAssets
                }
                /* collapsed: sharpest 8, but a picked photo never disappears from view */
                const top = rankedAssets.slice(0, 8)
                return [...top, ...rankedAssets.filter((a) => picked.includes(a.id) && !top.some((t) => t.id === a.id))]
              })().map((a, i) => {
                const ok = !measuredYet(a) || usableOnScreens(a)
                const soft = measuredYet(a) && usableOnScreens(a) && !passesQualityGate(a)
                const on = picked.includes(a.id)
                /* honest quality tags: the sharpest few say so; a dish photo names its dish */
                const tag = !measuredYet(a) ? null
                  : !ok ? L['photos.gate']
                  : soft ? L['photos.soft']
                  : a.kind === 'menu' && a.label ? a.label
                  : i === 0 && usable.length > 1 ? L['photos.sharp'] : null
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
              n={stepNo(4)} total={stepTotal} accent={dot}
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
              <StepHead n={stepNo(6)} total={stepTotal} accent={dot} title={T.review} sub={S.review} />
              {/* HOW IT'S MADE — asked LAST (owner call 2026-08-20): the brief is written,
                  so the maker choice prices the whole thing right here, AI included. */}
              <div style={{ fontFamily: DESK.mono, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700, color: DESK.mute, margin: '4px 0 8px' }}>
                {L['tier.title']}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 14 }}>
                {/* three simple doors: AI, Apnosh, or a marketplace creator.
                 * Each opens its own details only when picked. */}
                {(() => {
                  const makerDoor = chosenMaker ? 'creator' : method === 'ai' ? 'ai' : 'apnosh'
                  const door = (on: boolean, title: React.ReactNode, sub: string, price: string, onClick: () => void, body?: React.ReactNode) => (
                    <div key={String(title)} style={{ borderRadius: 14, border: `1.5px solid ${on ? DESK.mint : DESK.line}`, background: on ? DESK.mintWash : '#fff', overflow: 'hidden', transition: 'border-color .15s ease, background .15s ease' }}>
                      <button
                        type="button" aria-pressed={on} onClick={onClick}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '13px 14px', background: 'none', border: 'none', cursor: 'pointer', fontFamily: DESK.body, WebkitTapHighlightColor: 'transparent' }}
                      >
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontSize: 14.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink }}>{title}</span>
                          <span style={{ display: 'block', fontSize: 12, color: DESK.ink2, marginTop: 2, lineHeight: 1.45 }}>{sub}</span>
                        </span>
                        <span style={{ flexShrink: 0, fontFamily: DESK.mono, fontSize: 13, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink2 }}>{price}</span>
                      </button>
                      {on && body ? <div style={{ padding: '0 14px 13px' }}>{body}</div> : null}
                    </div>
                  )
                  return (
                    <>
                      {job !== 'carousel' && !isCarousel && door(
                        makerDoor === 'ai',
                        L['mk.ai'], L['mk.ai.sub'], 'Free',
                        () => { setMethod('ai'); setChosenMaker(null) },
                      )}
                      {door(
                        makerDoor === 'apnosh',
                        L['mk.apnosh'], L['mk.apnosh.sub'], `$${RATE_CARD.tierBase[tier]}`,
                        () => { setMethod('designer'); setChosenMaker(null) },
                        <div style={{ display: 'flex', gap: 6 }}>
                          {([1, 2, 3] as const).map((t) => (
                            <button
                              key={t} type="button" aria-pressed={tier === t}
                              onClick={(e) => { e.stopPropagation(); setTier(t) }}
                              style={{ flex: 1, padding: '8px 6px', borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${tier === t ? DESK.mint : DESK.line}`, background: tier === t ? '#fff' : 'transparent', fontFamily: DESK.body, fontSize: 11.5, fontWeight: 700, color: tier === t ? DESK.mintDeep : DESK.ink2, WebkitTapHighlightColor: 'transparent' }}
                            >
                              {{ 1: L['tier.basic.label'], 2: L['tier.custom.label'], 3: L['tier.works.label'] }[t]}
                              <span style={{ display: 'block', fontFamily: DESK.mono, fontSize: 10.5, fontWeight: 700, marginTop: 2 }}>{`$${RATE_CARD.tierBase[t]}`}</span>
                            </button>
                          ))}
                        </div>,
                      )}
                      {makers.length > 0 && door(
                        makerDoor === 'creator',
                        L['mk.creator'], L['mk.creator.sub'], `$${RATE_CARD.tierBase[tier]}`,
                        () => { setMethod('designer'); if (!chosenMaker) setChosenMaker({ vendorId: makers[0].vendorId, name: makers[0].name }) },
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {makers.map((m) => {
                            const on = chosenMaker?.vendorId === m.vendorId
                            return (
                              <button
                                key={m.vendorId} type="button" aria-pressed={on}
                                onClick={(e) => { e.stopPropagation(); setChosenMaker({ vendorId: m.vendorId, name: m.name }) }}
                                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 11, border: `1.5px solid ${on ? DESK.mint : DESK.line}`, background: on ? '#fff' : 'transparent', cursor: 'pointer', fontFamily: DESK.body, WebkitTapHighlightColor: 'transparent' }}
                              >
                                <span style={{ minWidth: 0 }}>
                                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: on ? DESK.mintDeep : DESK.ink }}>{m.name}</span>
                                  <span style={{ display: 'block', fontSize: 11, color: DESK.ink2, marginTop: 1 }}>
                                    {m.rating ? <><span style={{ color: '#D9A21B' }}>{'★'}</span> {m.ratingLabel}</> : m.ratingLabel}
                                  </span>
                                </span>
                                <span
                                  role="link" tabIndex={0}
                                  onClick={(e) => { e.stopPropagation(); window.open(`/marketplace/${m.slug}`, '_blank') }}
                                  onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); window.open(`/marketplace/${m.slug}`, '_blank') } }}
                                  style={{ flexShrink: 0, fontSize: 11, fontWeight: 600, color: DESK.mintDeep, textDecoration: 'underline', textUnderlineOffset: 2, cursor: 'pointer' }}
                                >
                                  {L['maker.view']}
                                </span>
                              </button>
                            )
                          })}
                          <button
                            type="button" onClick={(e) => { e.stopPropagation(); router.push('/dashboard/marketplace') }}
                            style={{ background: 'none', border: 'none', padding: '2px 0', cursor: 'pointer', fontFamily: DESK.body, fontSize: 12, fontWeight: 600, color: DESK.mintDeep, textAlign: 'left' }}
                          >
                            {L['maker.browse']} {'›'}
                          </button>
                        </div>,
                      )}
                    </>
                  )
                })()}
              </div>
              <div className="db-pop" style={{ background: DESK.card, border: `1px solid ${DESK.line}`, borderRadius: 14, padding: '4px 16px 2px', boxShadow: '0 2px 8px rgba(22,33,28,0.05)' }}>
                {sumRow(L['sum.job'], [isCarousel ? `${jobLabel} · ${slides} slides` : jobLabel ?? 'A design'])}
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
        {express && step > 1 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            <button type="button" onClick={() => setExpressHome(true)}
              style={{ flex: 1, height: 50, borderRadius: 25, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink, fontFamily: DESK.body, fontSize: 14.5, fontWeight: 600 }}>
              {L['xp.done']}
            </button>
          </div>
        )}
        {!express && step > 1 && (
          <div style={{ display: 'flex', gap: 10, marginTop: 16, marginBottom: 24 }}>
            {/* a seeded flow's first screen has nowhere back to go; from the
             * questions screen, Back returns to the story list first */}
            {(step > (seededFlow ? 2 : 1) || (step === 2 && activeAngle !== null)) && (
              <button type="button" onClick={() => { if (step === 2 && activeAngle) setAngle(null); else setStep(step - 1) }}
                style={{ flexShrink: 0, flex: step === 6 ? 1 : undefined, height: 50, padding: '0 18px', borderRadius: 25, cursor: 'pointer', border: `1px solid ${DESK.line}`, background: DESK.card, color: DESK.ink, fontFamily: DESK.body, fontSize: 14.5, fontWeight: 600 }}>
                {L['nav.back']}
              </button>
            )}
            {step < 6 && !(step === 2 && jobAngles.length > 0 && !activeAngle) && (
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
