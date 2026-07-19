'use client'

/**
 * HomeFunnel — the owner's WHOLE-BUSINESS marketing funnel, in the glass-vessel
 * style of the campaign funnel, but driven by REAL Google signals instead of
 * projected plays. Five stations pinch from a wide mouth to a narrow spout:
 *
 *   Awareness (impressions) ─ MEASURED, green glass
 *   Interest (all interactions) ─ MEASURED, green glass
 *   Customer actions (directions + calls) ─ MEASURED, green glass
 *   Orders (directions × walk-in rate) ─ owner ESTIMATE, amber dashed glass
 *   Retention (repeat) ─ LOCKED until a register connects, grey glass
 *
 * Honest by construction: the measured stages come straight from Google; the
 * estimate stage is only ever the owner's own two dials (walk-in rate + average
 * spend), shown "~about"; revenue is a header stat, never a funnel orb (it's
 * money, not people); retention has no estimate — it stays locked with a number
 * only when a register connects. Tapping the estimate stage opens the dials, so
 * "set your real numbers → the funnel responds" mirrors the campaign builder.
 *
 * Skinned in the portal system (brand green, amber for estimates, grey for
 * locked, Cal Sans). Self-contained canvas on rAF; honors prefers-reduced-motion.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil, Sun, Moon } from 'lucide-react'
import { useMvpTheme } from './mvp-theme'

const DISPLAY = "'Cal Sans','Inter',sans-serif"
const SPINE_X = 0.5   // the ring/crowd path runs down the MIDDLE; the numbers alternate to either side
// per-timeline crowd caps — a LONGER window genuinely shows a BIGGER crowd (7d < 30d < 90d < 12m), so switching
// timelines visibly grows/shrinks the funnel. WITHIN a window every stage stays proportional: the busiest
// actual-people stage (usually Interest) fills `people`, the rest scale DOWN from it; Awareness = its own reach cap.
const RANGE_CAPS: Record<FunnelRange, { aware: number; people: number }> = {
  '7d': { aware: 15, people: 10 },
  '30d': { aware: 22, people: 15 },
  '90d': { aware: 30, people: 21 },
  '12m': { aware: 40, people: 27 },
}

type Zone = 'measured' | 'estimate' | 'locked'
// Only the rgb triplets are used by the canvas (ring/crowd honesty colour); they
// hold on both light + dark grounds. ink/dk are theme-neutral fallbacks.
const TONE: Record<Zone, { rgb: string; ink: string; dk: string }> = {
  measured: { rgb: '46,168,124', ink: '#1c6b52', dk: '#2e9a78' },   // #2EA87C — stays saturated at low alpha
  estimate: { rgb: '201,154,62', ink: '#8a5a0c', dk: '#a9822f' },
  locked: { rgb: '176,176,184', ink: '#5c5c66', dk: '#7c7c85' },    // #B0B0B8 — recedes (absence of data)
}

/* Owner BENCHMARK BANDS per leg — the % that converts from one stage INTO the next, keyed by the
   DESTINATION stage. Each value is the upper bound of its band; above `high` = "very high". The funnel's
   legs live on very different natural scales (impressions→interactions is a low-single-digit click-through;
   the downstream steps are far higher), so each leg is graded on its OWN bands rather than one flat cutoff.
   A stage then reads red (very low) → amber (low) → green (average / high / very high). Owner-tunable —
   just edit the numbers here. */
type HealthBand = 'veryLow' | 'low' | 'average' | 'high' | 'veryHigh'
// owner-set per-leg conversion bands (each value = the upper bound of that band; above `high` = very high).
// Keyed by the DESTINATION stage — every leg is graded on its OWN scale.
const LEG_BANDS: Record<string, { veryLow: number; low: number; average: number; high: number }> = {
  engaged: { veryLow: 0.02, low: 0.04, average: 0.06, high: 0.08 }, // Awareness → Interest: 0-2 / 2-4 / 4-6 / 6-8 / 8%+
  moved:   { veryLow: 0.03, low: 0.06, average: 0.09, high: 0.12 }, // Interest → Customer actions: 0-15%+ in 5
  camein:  { veryLow: 0.10, low: 0.20, average: 0.30, high: 0.40 }, // Customer actions → Orders: 0-50%+ in 5
  back:    { veryLow: 0.10, low: 0.20, average: 0.30, high: 0.40 }, // Orders → Retention: 0-50%+ in 5
}
const DEFAULT_BANDS = { veryLow: 0.10, low: 0.25, average: 0.45, high: 0.65 }
function bandFor(rate: number, key: string): HealthBand {
  const b = LEG_BANDS[key] ?? DEFAULT_BANDS
  return rate <= b.veryLow ? 'veryLow' : rate <= b.low ? 'low' : rate <= b.average ? 'average' : rate <= b.high ? 'high' : 'veryHigh'
}
// Funnel stage → the create page's matching shelf (its ROWS/lens ids). The store
// speaks the funnel's words, so a weak leg taps straight into what fixes it.
const STAGE_LENS: Record<string, string> = { shown: 'aware', engaged: 'interest', moved: 'actions', camein: 'orders', back: 'back' }
const HEALTH_RED: [number, number, number] = [229, 72, 77]
// the 5-band health ramp: very low → very high = red → orange-red → yellow → light green → green.
const BAND_RGB: Record<HealthBand, [number, number, number]> = {
  veryLow: HEALTH_RED,      // red
  low: [232, 110, 58],      // orange-red
  average: [222, 176, 52],  // yellow
  high: [116, 196, 122],    // light green
  veryHigh: [46, 168, 124], // green
}
// darker variants for text/marks on the LIGHT ground (the bright ramp above is for dark, and for fills/rings/crowd on dark).
const BAND_INK: Record<HealthBand, [number, number, number]> = {
  veryLow: [201, 45, 50], low: [186, 78, 28], average: [150, 112, 14], high: [40, 140, 74], veryHigh: [28, 120, 86],
}
const BAND_WORD: Record<HealthBand, string> = { veryLow: 'very low', low: 'low', average: 'average', high: 'high', veryHigh: 'very high' }
const bandVigor = (b: HealthBand | null): number => (b === 'veryHigh' ? 1 : b === 'high' ? 0.66 : 0.38) // pulse liveliness by band

// total = Google views + social reach. google/social carry the honest split so Awareness can
// be labelled truthfully; both are optional so older callers (Google-only) stay byte-identical.
export interface Views { total: number; maps: number; search: number; google?: number; social?: number }
export interface Actions { directions: number; calls: number; websiteClicks: number }
export interface FunnelYoY { awareness: number | null; interest: number | null; actions: number | null; orders: number | null }

type Emblem = 'eye' | 'spark' | 'tap' | 'door' | 'heart'
interface HStage { key: string; label: string; sub?: string; count: number | null; zone: Zone; conv?: string; tag: string; split?: string; emblem?: Emblem; deltaYoY?: number | null; insightsStage?: string }

export type FunnelRange = '7d' | '30d' | '90d' | '12m'
const RANGES: [FunnelRange, string][] = [['7d', 'Last 7 days'], ['30d', 'Last 30 days'], ['90d', 'Last 90 days'], ['12m', 'Last year']]

export interface HomeFunnelProps {
  businessName?: string
  period?: string
  views?: Views
  actions?: Actions
  /** honest per-stage headlines (Interest/Actions/Retention) from computeStages */
  counts?: StageCounts
  initialWalkInRate?: number
  initialAvgTicket?: number | null
  currency?: string
  /** persist the dials per business */
  storageKey?: string
  height?: number
  /** full-bleed hero: drop the card chrome and fill the viewport down to the nav */
  fill?: boolean
  /** target-audience label shown at the very top (left of the "as of" date) */
  audience?: string
  /** ISO date (YYYY-MM-DD) of the freshest day Google has data for (the window's end) */
  asOf?: string
  /** ISO date (YYYY-MM-DD) of the window's first day → the date range shown is windowStart–asOf */
  windowStart?: string
  /** signed year-over-year % change per stage (same window last year), null where no baseline */
  yoy?: FunnelYoY | null
  /** selected time range — the tabs replace the header and drive the data */
  range?: FunnelRange
  onRange?: (r: FunnelRange) => void
  loading?: boolean
}

/* A realistic market/cafe profile (Yellow Bee-ish) as the mock default. */
const MOCK_VIEWS: Views = { total: 13700, maps: 11645, search: 2055 }
const MOCK_ACTIONS: Actions = { directions: 1510, calls: 312, websiteClicks: 832 }

function round100(n: number): number { return Math.round(n / 100) * 100 }
function money(n: number, cur: string): string { return cur + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n)) }
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3)

/* the Oyster Night person, ported VERBATIM from the mockup: a bell torso built from
   two quadratic curves + a round head, one solid fill and no highlight. Drawn directly
   each frame (cheap), tinted per-particle. Called with u = 3.5 (≈4.5×7.4px). */
const PERSON_U = 5.2 // larger than the mockup's 3.5 so the figures read clearly
function drawPerson(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, alpha: number) {
  ctx.globalAlpha = alpha
  ctx.fillStyle = color
  ctx.beginPath()
  ctx.moveTo(x - u * 0.64, y + u * 0.92)
  ctx.quadraticCurveTo(x - u * 0.74, y - u * 0.05, x, y - u * 0.20)
  ctx.quadraticCurveTo(x + u * 0.74, y - u * 0.05, x + u * 0.64, y + u * 0.92)
  ctx.closePath(); ctx.fill()
  ctx.beginPath()
  ctx.arc(x, y - u * 0.74, u * 0.46, 0, 7) // head
  ctx.fill()
}
/* the mockup's exact people palette: wander grey-green, escape terracotta, and the
   per-orb colours. Kept exact on DARK (the mockup's ground); nudged more saturated on
   LIGHT so the small figures still read on white. */
const CROWD_COLORS = (dark: boolean) => ({
  wander: dark ? '#7fd0af' : '#4fa17c',   // a soft GREEN (not grey) → the flow reads as people/users, not transit noise
  escape: dark ? '#e3b193' : '#c98a6e',   // brighter terracotta for the drop-off
  measured: dark ? '#93e6cb' : '#2ea27f', // brighter mint for the settled crowd
  estimate: dark ? '#f0bf5f' : '#bd8a26',
  locked: dark ? '#8aa89b' : '#93a49c',
})

/* a whisper-weight line emblem of a station's meaning, centred in its glass bead —
   auto-scales + fades with the bead radius, in the same stroke language as the canvas */
function drawEmblem(ctx: CanvasRenderingContext2D, ox: number, oy: number, r: number, kind: Emblem, col: string) {
  const e = Math.max(6, Math.min(r * 0.4, 20))
  ctx.save()
  ctx.globalAlpha = r < 30 ? 0.55 : 0.8
  ctx.strokeStyle = col; ctx.fillStyle = col
  ctx.lineWidth = Math.max(1.1, r * 0.032)
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'
  if (kind === 'eye') {
    ctx.beginPath(); ctx.moveTo(ox - e, oy)
    ctx.quadraticCurveTo(ox, oy - e * 0.62, ox + e, oy)
    ctx.quadraticCurveTo(ox, oy + e * 0.62, ox - e, oy); ctx.stroke()
    ctx.beginPath(); ctx.arc(ox, oy, e * 0.28, 0, 7); ctx.stroke()
    ctx.beginPath(); ctx.arc(ox + e * 0.1, oy - e * 0.1, e * 0.09, 0, 7); ctx.fill()
  } else if (kind === 'spark') {
    // a 4-point sparkle — interest / engagement
    ctx.beginPath()
    ctx.moveTo(ox, oy - e)
    ctx.quadraticCurveTo(ox + e * 0.16, oy - e * 0.16, ox + e, oy)
    ctx.quadraticCurveTo(ox + e * 0.16, oy + e * 0.16, ox, oy + e)
    ctx.quadraticCurveTo(ox - e * 0.16, oy + e * 0.16, ox - e, oy)
    ctx.quadraticCurveTo(ox - e * 0.16, oy - e * 0.16, ox, oy - e)
    ctx.closePath(); ctx.fill()
  } else if (kind === 'tap') {
    ctx.beginPath(); ctx.arc(ox, oy - e * 0.15, e * 0.62, Math.PI * 0.15, Math.PI * 0.85, true)
    ctx.lineTo(ox, oy + e * 0.9); ctx.closePath(); ctx.stroke()
    ctx.beginPath(); ctx.arc(ox, oy - e * 0.15, e * 0.22, 0, 7); ctx.fill()
  } else if (kind === 'door') {
    const w = e * 0.8, h = e * 1.15
    ctx.beginPath(); ctx.moveTo(ox - w, oy + h * 0.5); ctx.lineTo(ox - w, oy - h * 0.2)
    ctx.quadraticCurveTo(ox, oy - h * 0.75, ox + w, oy - h * 0.2); ctx.lineTo(ox + w, oy + h * 0.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox - w * 1.15, oy + h * 0.5); ctx.lineTo(ox + w * 1.15, oy + h * 0.5); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(ox - w, oy + h * 0.5); ctx.lineTo(ox - w * 0.15, oy + h * 0.28); ctx.lineTo(ox - w * 0.15, oy - h * 0.3); ctx.stroke()
  } else if (kind === 'heart') {
    const s2 = e * 0.9
    ctx.beginPath(); ctx.moveTo(ox, oy + s2 * 0.75)
    ctx.bezierCurveTo(ox - s2 * 1.2, oy - s2 * 0.2, ox - s2 * 0.5, oy - s2 * 0.95, ox, oy - s2 * 0.35)
    ctx.bezierCurveTo(ox + s2 * 0.5, oy - s2 * 0.95, ox + s2 * 1.2, oy - s2 * 0.2, ox, oy + s2 * 0.75)
    ctx.closePath(); ctx.stroke()
  }
  ctx.restore()
}

/* Recompute the whole funnel from the real signals + the owner's two dials. */
/** The honest per-stage headlines, straight from computeStages, so the animated
 *  funnel shows the SAME numbers as the Insights page. When absent (older payload)
 *  computeHome falls back to deriving them from the raw actions. */
export interface StageCounts { interest?: number; actions?: number; retention?: number }

export function computeHome(views: Views, actions: Actions, walkInRate: number, avgTicket: number | null, cur: string, yoy: FunnelYoY | null, counts?: StageCounts) {
  const total = Math.max(0, views.total)
  // Awareness folds SOCIAL reach into the Google views (top of funnel = "people who saw you").
  // When social is 0/undefined the labels stay exactly as before (Google-only accounts see no
  // change); when social > 0 we relabel honestly and show the Google/Social split.
  const social = Math.max(0, views.social ?? 0)
  const google = Math.max(0, views.google ?? total) // fall back to total when no split was sent
  const hasSocial = social > 0
  const awareTag = hasSocial ? 'Real · Google + Social' : 'Real · Google'
  const awareSub = hasSocial ? 'times you showed up on Google and social' : 'times you showed up on Google'
  const awareSplit = hasSocial ? `Google ${google.toLocaleString()} · Social ${social.toLocaleString()}` : undefined
  const { directions, calls, websiteClicks } = actions
  // Interest + Actions come STRAIGHT from the honest Insights stage headlines
  // (counts), so the animation and the Insights page always show the same
  // numbers. Fallback (older payload with no counts): Interest = website
  // clicks, Actions = directions + calls.
  const engaged = counts?.interest ?? websiteClicks
  const acted = counts?.actions ?? (directions + calls)
  const cameIn = Math.round(directions * walkInRate)
  const revenue = avgTicket != null && avgTicket > 0 ? round100(cameIn * avgTicket) : null
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)
  const ratePct = Math.round(walkInRate * 100)
  // Retention = the Insights Retention headline (repeat guests once a register
  // connects, else new reviews this month). Falls back to 0 (a plain 0, never a
  // lock) when no count is provided.
  const retention = counts?.retention ?? 0

  const stages: HStage[] = [
    { key: 'shown', label: 'Awareness', sub: awareSub, count: total, zone: 'measured', tag: awareTag, split: awareSplit, conv: `${pct(engaged, total)} in 100 engaged`, emblem: 'eye', deltaYoY: yoy?.awareness ?? null, insightsStage: 'discovery' },
    { key: 'engaged', label: 'Interest', sub: 'website visits & clicks', count: engaged, zone: 'measured', tag: 'Real · Google', conv: `${pct(acted, engaged)}% took a step`, emblem: 'spark', deltaYoY: yoy?.interest ?? null, insightsStage: 'intent' },
    { key: 'moved', label: 'Customer actions', sub: 'directions & calls', count: acted, zone: 'measured', tag: 'Real · Google', conv: `~${ratePct}% of directions ordered`, emblem: 'tap', deltaYoY: yoy?.actions ?? null, insightsStage: 'intent' },
    { key: 'camein', label: 'Orders', sub: 'walk-in orders from Google', count: cameIn, zone: 'estimate', tag: '~ about · your math', emblem: 'door', deltaYoY: yoy?.orders ?? null, insightsStage: 'conversion' },
    { key: 'back', label: 'Retention', sub: 'came back for more', count: retention, zone: 'measured', tag: 'Repeat visits', emblem: 'heart', deltaYoY: null, insightsStage: 'retention' },
  ]
  const stats = [
    { value: total.toLocaleString(), label: 'Awareness' },
    { value: engaged.toLocaleString(), label: 'Engaged' },
    { value: '~' + cameIn.toLocaleString(), label: 'Orders' },
    { value: revenue != null ? '~' + money(revenue, cur) : '—', label: 'Revenue' },
  ]
  return { stages, stats, revenue, cameIn, ratePct, engaged, total }
}

interface Traveler {
  state: 'orbit' | 'travel' | 'leak' | 'die' // die = flowing on toward the empty final stage, fading out AT its circle
  orb: number // orbit: current ring · travel: TARGET ring · leak: the ring just left · die: the dead ring it dies into
  colorOrb: number // the stage whose COLOUR it currently wears (last stage reached); -1 = none yet (brand-new arrival)
  theta: number; omega: number; orbitR: number; orbitLife: number; orbitAge: number
  x: number; y: number; vx: number; vy: number // explicit position — used by travel + leak
  alpha: number; phase: number; sz: number // sz = per-person SIZE (0.82–1.2) → each reads as a distinct individual
}
const blankTraveler = (): Traveler => ({
  state: 'travel', orb: 0, colorOrb: -1, theta: 0, omega: 0, orbitR: 0, orbitLife: 0, orbitAge: 0,
  x: 0, y: 0, vx: 0, vy: 0, alpha: 1, phase: Math.random() * 6, sz: 0.82 + Math.random() * 0.38,
})

export default function HomeFunnel({
  businessName = 'Your marketing',
  period = 'Last 30 days',
  views = MOCK_VIEWS,
  actions = MOCK_ACTIONS,
  counts,
  initialWalkInRate = 0.5,
  initialAvgTicket = 24,
  currency = '$',
  storageKey = 'preview',
  height = 620,
  fill = false,
  audience = 'Your area',
  asOf,
  windowStart,
  yoy,
  range,
  onRange,
  loading = false,
}: HomeFunnelProps) {
  const { C, theme, toggle } = useMvpTheme() // the active skin (light / dark) — drives the whole hero
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const particlesRef = useRef<Traveler[]>([])
  const seededRef = useRef(false) // first seed = flow-IN (circles start empty, fill); later reseeds seat in place (stay full)
  const rDispRef = useRef<number[]>([])
  const numDispRef = useRef<number[]>([]) // eased ledger numbers → count-up on load, smooth cross-fade on range change
  const entranceRef = useRef(0)           // 0→~1.5s considered draw-in; gates ring fade, number count-up, crowd cascade
  const pressRef = useRef<{ i: number }>({ i: -1 }) // which stage is under the thumb (-1 = none)
  const pressAmtRef = useRef<number[]>([]) // eased per-stage press amount → the "row settle"
  const tRef = useRef(0)
  const [reduced, setReduced] = useState(false)
  const router = useRouter() // tapping a stage routes straight to its matching insights graph
  const [locRange, setLocRange] = useState<FunnelRange>('30d') // standalone/preview fallback when uncontrolled
  const curRange = range ?? locRange // controlled range wins; else the local tab — drives the per-timeline crowd caps
  const [effH, setEffH] = useState(height)
  const headerRef = useRef<HTMLDivElement>(null)
  const [headerH, setHeaderH] = useState(84) // measured height of the tabs+audience chrome now OVERLAID on the canvas

  const rateKey = `apnosh.homefunnel.rate.${storageKey}`
  const ticketKey = `apnosh.homefunnel.ticket.${storageKey}`
  const audKey = `apnosh.homefunnel.audience.${storageKey}`
  const [walkInRate, setWalkInRate] = useState(initialWalkInRate)
  const [avgTicket, setAvgTicket] = useState<number | null>(initialAvgTicket)
  const [audOverride, setAudOverride] = useState<string | null>(null) // owner-set audience, wins over the detected city
  const [editingAud, setEditingAud] = useState(false)
  useEffect(() => {
    try {
      const r = localStorage.getItem(rateKey); if (r != null && r !== '') setWalkInRate(Math.min(0.9, Math.max(0.1, Number(r) || 0.5)))
      const t = localStorage.getItem(ticketKey); if (t != null && t !== '') setAvgTicket(Number(t) || null)
      const a = localStorage.getItem(audKey); if (a != null && a !== '') setAudOverride(a)
    } catch { /* defaults stand */ }
  }, [rateKey, ticketKey, audKey])

  // fill mode: size the canvas to fill the visible screen EXACTLY — from just under the
  // range tabs down to the top of the bottom nav — so all five stages read as one
  // full-bleed hero with no scroll. Measured against the VIEWPORT + nav (both stable),
  // never the scroll container (which is min-height-based and grows with its content →
  // that would feed back into an ever-taller canvas).
  useEffect(() => {
    // the tabs + audience chrome is OVERLAID on top of the canvas now (canvas fills the whole card from the
    // top), so in non-fill mode the canvas absorbs the chrome's height to keep the total card size + the ring
    // spacing identical to before.
    if (!fill) { setEffH(height + headerH); return }
    const compute = () => {
      const cv = canvasRef.current
      if (!cv) return
      const vh = window.visualViewport?.height ?? window.innerHeight
      const nav = document.querySelector('.mvp-frame nav') ?? document.querySelector('nav')
      const navH = nav ? nav.getBoundingClientRect().height : 68
      // the canvas now starts at the very TOP of the card (the chrome floats over it); its top is fixed by the
      // account bar above the card and does NOT move when the canvas grows → measuring it here is stable + loop-free
      const cvTop = cv.getBoundingClientRect().top
      const avail = vh - navH - cvTop
      setEffH(Math.max(440, Math.round(avail))) // fill exactly to the nav; the next section stays below the fold
    }
    compute()
    window.addEventListener('resize', compute)
    window.visualViewport?.addEventListener('resize', compute)
    return () => {
      window.removeEventListener('resize', compute)
      window.visualViewport?.removeEventListener('resize', compute)
    }
  }, [fill, height, headerH])

  // measure the OVERLAID chrome (tabs + audience) so the rings can sit just below it — the canvas fills the
  // whole card from the top and this row floats over it, so its height is what the funnel offsets by.
  useEffect(() => {
    const el = headerRef.current
    if (!el) return
    const measure = () => setHeaderH(Math.round(el.getBoundingClientRect().height))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const saveAudience = (v: string) => {
    const t = v.trim()
    setAudOverride(t || null); setEditingAud(false)
    try { if (t) localStorage.setItem(audKey, t); else localStorage.removeItem(audKey) } catch { /* ignore */ }
  }

  const { stages } = useMemo(() => computeHome(views, actions, walkInRate, avgTicket, currency, yoy ?? null, counts), [views, actions, walkInRate, avgTicket, currency, yoy, counts])

  const geom = useRef({ W: 400 })

  const layout = useMemo(() => {
    const n = stages.length
    // the tabs + audience chrome floats OVER the canvas now, so start the rings headerH below the top —
    // the flow streams up behind the chrome, but the rings + big numbers clear it (no text/number collision).
    const yTop = 78 + headerH, yBot = effH - 64 // lead-in up top for the crowd; small bottom margin
    // FUNNEL-NARROWING beads: biggest at the mouth, tapering down the path like a real
    // funnel (the mockup's silhouette). Magnitude still lives in the number + the crowd;
    // the taper gives the funnel its shape. Even y-spacing means the edge-gaps WIDEN as
    // the beads shrink, which reads as the classic funnel neck.
    const spacing = n > 1 ? (yBot - yTop) / (n - 1) : yBot - yTop
    const RRATIO = [1, 0.80, 0.70, 0.64, 0.60] // Awareness biggest; the lower rings stay generously sized
    const OFFSET_BIG = 72 // a wider weave — the orbs swing further to their side (esp. Awareness↔Interest)
    const RTOP = Math.max(34, Math.min(74, (spacing - 8) / 2)) // the mouth bead — bigger orbs all round
    return stages.map((_s, i) => {
      const f = n > 1 ? i / (n - 1) : 0
      const ratio = n === 5 ? RRATIO[i] : 1 - 0.55 * f // exact mockup taper for the 5-stage funnel; linear otherwise
      // ODD stations (Interest, Orders) swing LEFT; even swing right — a bolder zig-zag. The
      // number sits on the opposite, centre-ward side so the big figures keep their room.
      const lean = i % 2 === 0 ? 1 : -1 // +1 = right, -1 = left
      return {
        y: yTop + (n > 1 ? (i * (yBot - yTop)) / (n - 1) : 0),
        r: RTOP * ratio,
        side: (i % 2 === 0 ? -1 : 1) as 1 | -1, // number opposite the lean → even left, odd right
        dx: lean * OFFSET_BIG * (i <= 1 ? 1.34 : 1), // the TOP pair (Awareness↔Interest) swings wider apart
      }
    })
  }, [stages, effH, headerH])

  const rAt = useCallback((i: number) => rDispRef.current[i] ?? layout[i].r, [layout])

  /* survival to the next stage — the fraction that CONVERTS on. 0 into a locked
     (unmeasured) stage. This drives both the honest drop-off (the rest scatter away)
     and each ring's pull. */
  const survival = useMemo(
    () => stages.map((s, i) => {
      if (i >= stages.length - 1) return 0
      const nxt = stages[i + 1].count
      if (nxt == null) return 0
      return Math.min(1, nxt / Math.max(1, s.count ?? 1))
    }),
    [stages],
  )
  const flowTop = 2 // fresh arrivals begin at the very TOP of the canvas (higher up) and flow down into the mouth
  const flowBot = useMemo(() => {
    // reveal down to the DIE-OFF tail: one ring past the deepest live stage, into the empty stage
    // (e.g. Retention 0) that the flow drifts on to and vanishes AT — so that death is on-screen.
    // If there's no empty tail (the last stage has data), stop just below the deepest live orbit.
    let bot = 0
    for (let i = 0; i < layout.length; i++) if ((stages[i].count ?? 0) > 0) bot = i
    const tail = bot + 1 < layout.length && (stages[bot + 1].count ?? 0) <= 0 ? bot + 1 : bot
    const L = layout[tail]
    return (L?.y ?? effH - 54) + (L?.r ?? 20) + 40
  }, [layout, stages, effH])

  /* how many people ORBIT each ring — PROPORTIONAL to the real number. Awareness is impressions/REACH
     (thousands — a different KIND of number, not individual people), so it's a full, capped "reach cloud".
     The actual-people stages (Interest → Customer actions → Orders → Retention) share ONE LINEAR scale, so
     they're truly proportional to each other and to ZERO: 0 → 0 every time, and e.g. Orders shows the same
     fraction of Interest's crowd as its number is of Interest's number. A 0/no-data stage holds nobody. */
  const orbTarget = useMemo(() => {
    const cap = RANGE_CAPS[curRange] ?? RANGE_CAPS['30d'] // this timeline's crowd size — bigger window → bigger cap
    const peopleCounts = stages.slice(1).map((s) => Math.max(0, s.count ?? 0)) // Interest..Retention (the real people)
    const perIcon = Math.max(1, ...peopleCounts) / cap.people // real units each dot stands for (vs the busiest people-stage)
    return stages.map((s, i) => {
      const c = s.count ?? 0
      if (c <= 0) return 0
      if (i === 0) return cap.aware // reach cloud — its magnitude is off-scale, not a literal count
      return Math.max(1, Math.round(c / perIcon)) // proportional; any nonzero stage shows at least 1
    })
  }, [stages, curRange])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const { W } = geom.current
    const cx = Math.round(W * SPINE_X)     // the ring/crowd path down the MIDDLE
    const n = stages.length
    ctx.clearRect(0, 0, W, effH)
    if (!layout.length) return

    // per-stage HEALTH — graded from each stage's INCOMING conversion against the owner's per-leg benchmark bands
    // (5 bands per leg). The mouth (Awareness) has no incoming leg → always healthy; any leg with no data on either
    // end → grey (null), so a 0/no-register retention reads as absent, not a false "very low".
    const health: (HealthBand | null)[] = stages.map((s, i) => {
      if (i === 0) return 'veryHigh'
      const a = stages[i - 1].count, b = s.count
      if (a == null || b == null || a <= 0 || b <= 0) return null
      return bandFor(b / a, s.key)
    })
    const dark = theme === 'dark'
    const bandCol = (b: HealthBand): [number, number, number] => (dark ? BAND_RGB[b] : BAND_INK[b]) // bright ramp on dark, darker ink on light so it stays readable

    // canvas letterSpacing shim (typed loosely; harmless where unsupported)
    const setLS = (v: string) => { (ctx as unknown as { letterSpacing: string }).letterSpacing = v }
    const roundRectP = (x: number, y: number, w: number, h: number, rad: number) => {
      ctx.beginPath()
      ctx.moveTo(x + rad, y)
      ctx.arcTo(x + w, y, x + w, y + h, rad)
      ctx.arcTo(x + w, y + h, x, y + h, rad)
      ctx.arcTo(x, y + h, x, y, rad)
      ctx.arcTo(x, y, x + w, y, rad)
    }

    // the considered load choreography (0→~1.5s): rings fade in top-to-bottom, the
    // numbers count up behind them, and the crowd cascades down from the top edge.
    const entrance = entranceRef.current
    const curtainY = flowTop + (flowBot - flowTop) * easeOutCubic(clamp01(entrance / 1.0))

    /* ── a soft connecting path down the funnel, drawn BEHIND the crowd so the beads
       read as one descending flow (the mockup's dotted trail) ── */
    const pathIn = easeOutCubic(clamp01(entrance / 1.0))
    if (pathIn > 0.01 && layout.length > 1) {
      ctx.save()
      ctx.beginPath()
      ctx.moveTo(cx + layout[0].dx, layout[0].y)
      for (let i = 1; i < layout.length; i++) {
        const qx = cx + layout[i].dx, qy = layout[i].y
        const px = cx + layout[i - 1].dx, py = layout[i - 1].y
        const my = (py + qy) / 2
        ctx.bezierCurveTo(px, my, qx, my, qx, qy) // a smooth S through the centres
      }
      ctx.lineWidth = 2; ctx.lineCap = 'round'
      ctx.setLineDash([1, 7])
      ctx.strokeStyle = `rgba(${C.pathRGB},${C.pathAlpha * pathIn})`
      ctx.stroke(); ctx.setLineDash([])
      ctx.restore()
    }

    /* ── each orb is LIT: a soft radial glow inside it (the mockup's beads), drawn
       BEHIND the crowd so the people read as gathered inside a lit station ── */
    stages.forEach((s, i) => {
      const L = layout[i]
      const ox = cx + L.dx, oy = L.y, r = rAt(i)
      const effZone: Zone = s.count === 0 ? 'locked' : s.zone
      const bd = s.count === 0 ? null : health[i] // the stage's health band tints the inner glow (grey when empty)
      const eIn = easeOutCubic(clamp01((entrance - i * 0.09) / 0.5))
      const rgb = bd ? bandCol(bd).join(',') : TONE[effZone].rgb
      const peak = (effZone === 'estimate' ? 0.20 : effZone === 'measured' ? 0.15 : 0.05) * (bd === 'veryLow' ? 1.2 : bd === 'low' ? 1.1 : 1)
      const g = ctx.createRadialGradient(ox, oy, r * 0.08, ox, oy, r * 1.02)
      g.addColorStop(0, `rgba(${rgb},${peak * eIn})`)
      g.addColorStop(0.7, `rgba(${rgb},${peak * 0.4 * eIn})`)
      g.addColorStop(1, `rgba(${rgb},0)`)
      ctx.beginPath(); ctx.arc(ox, oy, r * 1.02, 0, 7); ctx.fillStyle = g; ctx.fill()
    })

    /* ── PULL PULSES: an honest, stage-appropriate vitality cue.
       · the funnel's single worst MEASURED leg (below 25% — the same "Only X%" bottleneck the
         pills mark) → ONE solid red ring, no pulse. Absolute conversion rates are NOT compared
         across legs, so a healthy listing's few-percent click-through is never mistaken for a stall.
       · a MEASURED stage → a green pulse, livelier + reaching further when it's GROWING (YoY↑),
         fainter + slower when it's slipping. Unknown/flat trend = a steady medium pulse.
       · the ESTIMATE stage (Orders) → a DASHED amber pulse, clearly "~about" (the owner's own
         dial), so it never carries the same authority as a measured ring. ── */
    for (let i = 0; i < n; i++) {
      const s = stages[i]
      if (s.count == null || s.count === 0) continue // no data yet → no signal at all
      const L = layout[i], ox = cx + L.dx, oy = L.y, r = rAt(i)
      const eIn = easeOutCubic(clamp01((entrance - i * 0.09) / 0.5))

      const band = health[i]
      if (band == null) continue // no-data leg → no pulse (the ring reads grey)
      const isEst = s.zone === 'estimate'
      const rgb = bandCol(band).join(',')

      if (band === 'veryLow') {
        // very low → steady red ring + urgent red pulse
        ctx.beginPath(); ctx.arc(ox, oy, r + 3, 0, 7)
        ctx.lineWidth = 2.6; ctx.strokeStyle = `rgba(${rgb},${0.72 * eIn})`; ctx.stroke()
        const rp = ((t / 1.5) + i * 0.3) % 1 // fast, continuous → urgent
        ctx.beginPath(); ctx.arc(ox, oy, r + 3 + rp * r * 0.7, 0, 7)
        ctx.lineWidth = 2.2; ctx.strokeStyle = `rgba(${rgb},${0.6 * (1 - rp) * eIn})`; ctx.stroke()
        continue
      }

      // every other band breathes a soft ring in its OWN colour — livelier the healthier it is. The estimate
      // stage (Orders) keeps the dashed "~about" treatment on top of its band colour.
      const vigor = bandVigor(band)
      const period = isEst ? 5.5 : 2.0 + (1 - vigor) * 2.0
      const duty = isEst ? 0.85 : 0.42
      const reach = r * (0.34 + vigor * 0.34)
      const peakA = 0.5 + vigor * 0.4
      const cyc = ((t / period) + i * 0.3) % 1
      if (cyc < duty) {
        const ph = cyc / duty // 0→1 over the expansion window
        if (isEst) ctx.setLineDash([3, 5]) // dashed → echoes the "~about" estimate ring
        ctx.beginPath(); ctx.arc(ox, oy, r + ph * reach, 0, 7)
        ctx.lineWidth = 2.1
        ctx.strokeStyle = `rgba(${rgb},${peakA * (1 - ph) * eIn})`
        ctx.stroke()
        if (isEst) ctx.setLineDash([])
      }
    }

    /* ── the crowd (the Oyster Night people): orbiting a ring = its bright colour,
       travelling the path = a muted in-transit tone, scattering off = terracotta (fading) ── */
    const CC = CROWD_COLORS(theme === 'dark')
    const zoneCol = (z: Zone) => z === 'estimate' ? CC.estimate : z === 'locked' ? CC.locked : CC.measured
    // an icon wears the COLOUR of the stage it belongs to right now (that ring's health band). It keeps that
    // colour while it travels, and only recolours when it REACHES the next stage or walks out (leak = terracotta).
    const stageCol = (i: number) => {
      if (i < 0) return CC.wander
      const b = health[i]
      return b ? `rgb(${bandCol(b).join(',')})` : zoneCol(stages[i].count === 0 ? 'locked' : stages[i].zone)
    }
    for (const tr of particlesRef.current) {
      let px: number, py: number, col: string, a = 1
      if (tr.state === 'orbit') {
        // residents MILL inside a ring → that stage's colour (position is tr.x/tr.y)
        px = tr.x; py = tr.y; col = stageCol(tr.orb)
      } else if (tr.state === 'travel') {
        px = tr.x; py = tr.y; col = tr.colorOrb >= 0 ? stageCol(tr.colorOrb) : CC.wander // carry the stage it LEFT; neutral until it first reaches one
      } else if (tr.state === 'die') {
        px = tr.x; py = tr.y; col = tr.colorOrb >= 0 ? stageCol(tr.colorOrb) : CC.wander; a = Math.max(0, tr.alpha) // keeps its last stage's colour as it dies off
      } else { // leak — walked out → terracotta, fading
        px = tr.x; py = tr.y; col = CC.escape; a = Math.max(0, tr.alpha)
      }
      // a gentle FLOAT — a slow per-person bob + sway so the crowd feels like it's floating, not pinned
      const fx = Math.sin(t * 0.7 + tr.phase) * 1.7, fy = Math.cos(t * 0.5 + tr.phase * 1.4) * 1.9
      const reveal = clamp01((curtainY - py) / 44)
      a *= reveal
      if (a <= 0.01) continue
      drawPerson(ctx, px + fx, py + fy, PERSON_U * tr.sz, col, a) // per-person size + float → distinct, floating individuals
    }
    ctx.globalAlpha = 1

    /* ── the stations: open hairline rings the crowd threads through. Honesty is
       spoken ONCE — in the ring's material (solid/dashed/dotted) + the number's
       colour; no interior fill, no emblem, no tag re-stating it. ── */
    stages.forEach((s, i) => {
      const L = layout[i]
      const ox = cx + L.dx, oy = L.y, r = rAt(i)
      const band = health[i] // the stage's health band → its ring/number colour on the 5-band ramp
      const pr = pressAmtRef.current[i] ?? 0 // press "settle" amount for this row
      const effZone: Zone = s.count === 0 ? 'locked' : s.zone // a 0 reads as empty → grey it like a no-data ring
      // the ring IS its band colour (red→green); a no-data / empty ring falls back to its grey zone hue.
      const rc: number[] = band ? bandCol(band) : TONE[effZone].rgb.split(',').map(Number)
      const ringStr = `${Math.round(rc[0])},${Math.round(rc[1])},${Math.round(rc[2])}`
      const baseRowStr = TONE[effZone].rgb // the row's OWN zone hue → press tint + chevron wake
      const baseA = effZone === 'measured' ? 0.82 : effZone === 'estimate' ? 0.52 : 0.32
      const lw = effZone === 'locked' ? 1.4 : 1.6
      const dash: number[] | null = effZone === 'estimate' ? [4, 5] : null // the estimate orb is dashed (the mockup's "~about" bead)

      // entrance: each ring fades + settles in, staggered 90ms top-to-bottom
      const eIn = easeOutCubic(clamp01((entrance - i * 0.09) / 0.5))
      // a very-low (red) ring breathes slightly at rest (only its shadow) — the quiet alarm
      const shBase = band === 'veryLow' ? 0.18 + 0.06 * Math.sin(t * 2.4166) : 0.14

      // press feedback (1): a faint same-hue plate behind the touched row — drawn UNSCALED, behind everything
      if (pr > 0.002) {
        roundRectP(8, oy - (r + 4), W - 16, 2 * (r + 4), 12)
        ctx.fillStyle = `rgba(${baseRowStr},${0.05 * pr})`; ctx.fill()
      }

      // press feedback (2): the row gives 3% under the thumb — ring + ledger + chevron scale about the ring centre
      ctx.save()
      if (pr > 0.002) { const sc = 1 - 0.03 * pr; ctx.translate(ox, oy); ctx.scale(sc, sc); ctx.translate(-ox, -oy) }

      // the open hairline ring, lifted a hair off the white by one soft same-hue shadow
      ctx.save()
      ctx.shadowColor = `rgba(${ringStr},${shBase * eIn})`
      ctx.shadowBlur = 4
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7)
      ctx.lineWidth = lw; ctx.setLineDash(dash || [])
      ctx.strokeStyle = `rgba(${ringStr},${baseA * eIn})`; ctx.stroke(); ctx.setLineDash([])
      ctx.restore()

      // a bright core dot at the orb's centre (the mockup's lit bead)
      ctx.beginPath(); ctx.arc(ox, oy, effZone === 'locked' ? 1.8 : 2.6, 0, 7)
      ctx.fillStyle = `rgba(${ringStr},${(effZone === 'locked' ? 0.4 : 0.9) * eIn})`; ctx.fill()

      // the ledger — the number is pinned to the SCREEN EDGE (small padding) OPPOSITE the
      // orb, so every row spans the full width: crowd/orb on one side, the big figure on the
      // other. label above · big hero number (auto-fit) · YoY tick below.
      const side = L.side // -1 = number hugs the LEFT edge, +1 = the RIGHT edge
      const P = 32 // more breathing room from the screen edge
      const numLeft = side < 0
      ctx.textAlign = numLeft ? 'left' : 'right'
      const anchorX = numLeft ? P : W - P
      // the room = the gap between the edge and the near side of the orb
      const roomOut = Math.max(72, numLeft ? (ox - r - 14) - P : (W - P) - (ox + r + 14))

      ctx.fillStyle = C.mute
      setLS('0.2px'); ctx.font = '600 14px Inter, sans-serif'
      ctx.fillText(fit(ctx, s.label, roomOut), anchorX, oy - 28)

      const disp = numDispRef.current[i] != null ? numDispRef.current[i] : (s.count ?? 0)
      const num = s.count == null ? '—' : (s.zone === 'estimate' ? '~' : '') + Math.round(disp).toLocaleString()
      // green (healthy) numbers use the default ink (black on light / white on dark); only red/orange/yellow tint.
      ctx.fillStyle = s.count == null ? C.faint : (band === 'veryHigh' || band === 'high') ? C.ink : band ? `rgb(${bandCol(band).join(',')})` : s.zone === 'estimate' ? C.amberDk : C.ink
      // as big as the room allows, from a bold 54px down to a floor of 24px; if a very long number
      // still won't fit at the floor (tiny embed × 8 digits), maxWidth compresses it to the room as a
      // last resort so it never spills into the orb or across the centre path.
      let numPx = 54
      setLS('-0.5px'); ctx.font = `600 ${numPx}px ${DISPLAY}`
      while (numPx > 24 && ctx.measureText(num).width > roomOut) { numPx -= 2; ctx.font = `600 ${numPx}px ${DISPLAY}` }
      const numBase = oy + numPx * 0.34
      ctx.fillText(num, anchorX, numBase, roomOut)
      const drawnNumW = Math.min(ctx.measureText(num).width, roomOut) // width actually drawn (maxWidth may compress it)
      setLS('0px')

      // YoY % — sits BESIDE the number (on its inner side, toward the centre), vertically centred on the
      // row. The glyph carries direction, |percent| the magnitude: ▲ up=green, ▼ down=coral, – flat=mute.
      const dy = s.deltaYoY
      if (dy != null && s.count != null) {
        const tickIn = clamp01((entrance - (i * 0.09 + 0.5)) / 0.35) // resolves just after the count-up
        if (tickIn > 0.01) {
          const r0 = Math.round(dy)
          const glyph = r0 > 0 ? '▲' : r0 < 0 ? '▼' : ''
          const tickStr = r0 === 0 ? '– even' : glyph + Math.abs(r0) + '%'
          ctx.font = '700 13px Inter, sans-serif'
          ctx.textAlign = numLeft ? 'left' : 'right'
          const tx = numLeft ? anchorX + drawnNumW + 8 : anchorX - drawnNumW - 8
          ctx.globalAlpha = tickIn
          ctx.fillStyle = r0 > 0 ? C.greenDk : r0 < 0 ? (band === 'veryLow' ? C.faint : C.coral) : C.mute
          ctx.fillText(tickStr, tx, oy + 5)
          ctx.globalAlpha = 1
        }
      }

      // a hint chevron in the right margin — the whole row taps through to this stage's
      // full insights breakdown
      const chX = W - 12
      ctx.beginPath()
      ctx.moveTo(chX - 4, oy - 6); ctx.lineTo(chX + 2, oy); ctx.lineTo(chX - 4, oy + 6)
      ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.lineJoin = 'round'
      ctx.strokeStyle = `rgba(${baseRowStr},${(0.3 + 0.5 * pr) * eIn})`
      ctx.stroke()

      ctx.restore() // close the press push-in transform
    })

    /* ── conversion pills between the stations — the step-to-step rate (the mockup's
       "29% clicked / 77% turned up"). The single weakest leg goes amber and reads
       "Only X%", folding the concern callout into the flow instead of a separate box. ── */
    setLS('0px')
    ctx.textAlign = 'center'
    for (let i = 0; i < n - 1; i++) {
      const a = stages[i].count, b = stages[i + 1].count
      if (a == null || b == null || a <= 0 || b <= 0) continue // a 0 at the destination is no-data (grey), not a rated leg
      const pillIn = easeOutCubic(clamp01((entrance - (i * 0.09 + 0.45)) / 0.4))
      if (pillIn < 0.01) continue
      const dband = health[i + 1] // the band of the stage this leg feeds → the pill's colour + word
      if (dband == null) continue
      const weak = dband === 'veryLow' || dband === 'low'
      const cr = bandCol(dband) // theme-aware band colour for the text
      const pct = Math.round((b / a) * 100)
      const label = (pct >= 1 ? pct : '<1') + '% · ' + BAND_WORD[dband] // e.g. "4% · average", "45% · very high"
      const midY = (layout[i].y + rAt(i) + (layout[i + 1].y - rAt(i + 1))) / 2
      const px = cx + (layout[i].dx + layout[i + 1].dx) / 2
      ctx.font = weak ? '700 11px Inter, sans-serif' : '600 11px Inter, sans-serif'
      const pw = ctx.measureText(label).width + 20, ph = 18
      ctx.globalAlpha = pillIn
      roundRectP(px - pw / 2, midY - ph / 2, pw, ph, ph / 2)
      ctx.fillStyle = `rgba(${BAND_RGB[dband].join(',')},${dark ? 0.22 : 0.15})` // a soft band-tinted background
      ctx.fill()
      ctx.fillStyle = `rgb(${cr.join(',')})` // band-coloured text (bright on dark, dark ink on light)
      ctx.fillText(label, px, midY + 4)
      ctx.globalAlpha = 1
    }
    ctx.textAlign = 'left'
  }, [C, theme, layout, stages, effH, rAt, flowTop, flowBot])

  const resize = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cssW = cv.clientWidth || 400
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    geom.current.W = cssW
    cv.width = cssW * dpr
    cv.height = effH * dpr
    cv.style.height = `${effH}px`
    const ctx = cv.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [effH])

  useEffect(() => {
    const n = layout.length
    // the REAL rendered width — geom.W may still hold its 400 default until resize() runs (this
    // effect is defined before the animation effect, so it'd otherwise seed everyone off a wrong centre).
    const cvW = canvasRef.current?.clientWidth || geom.current.W
    const cxg = Math.round(cvW * SPINE_X)
    const orbXi = (i: number) => cxg + layout[i].dx
    // the deepest ring that actually holds people (has a number) — the journey's end
    let botRing = 0
    for (let i = 0; i < n; i++) if ((stages[i].count ?? 0) > 0) botRing = i
    const firstLive = orbTarget.findIndex((v) => v > 0) // first stage that actually has people — new users stream into THIS (so a 0-count Awareness shows nobody)

    const seatOrbit = (tr: Traveler, i: number, mid: boolean) => {
      tr.orb = i; tr.colorOrb = i; tr.state = 'orbit'
      const R = layout[i].r
      const a0 = Math.random() * 6.2832, r0 = R * (0.12 + 0.8 * Math.random())
      tr.x = orbXi(i) + Math.cos(a0) * r0
      tr.y = layout[i].y + Math.sin(a0) * r0
      tr.vx = 0; tr.vy = 0
      tr.orbitR = R * (0.12 + 0.8 * Math.random()) // wander target inside the ring (milling)
      tr.theta = Math.random() * 6.2832
      tr.omega = 0.75 + 0.5 * Math.random()        // per-PERSON travel speed factor
      tr.orbitLife = 1.3 + 1.9 * Math.random()     // how long it mills here before deciding what to do next
      tr.orbitAge = mid ? Math.random() * tr.orbitLife : 0
    }

    const ts: Traveler[] = []
    // ONE UNIFIED people pool: every icon is a single PERSON that arrives, mills in a circle, then either moves
    // on OR walks away. FIRST OPEN: the circles start EMPTY and FILL via the flow — seed each ring's proportional
    // crowd as INCOMING from above its own ring, staggered up the spine, so on the very first paint they're
    // streaming in and each circle fills over the first few seconds (rather than appearing pre-populated).
    const firstOpen = !seededRef.current // only the FIRST mount flows in; later reseeds (data/range/resize) stay full
    seededRef.current = true
    for (let i = 0; i <= botRing; i++) {
      for (let k = 0; k < orbTarget[i]; k++) {
        const tr = blankTraveler()
        seatOrbit(tr, i, true) // seat it in its ring, already milling (mid-dwell)
        if (firstOpen) {
          tr.state = 'travel'; tr.colorOrb = -1 // …but on first open it ARRIVES from above → circles fill via the flow
          tr.x = orbXi(i) + (Math.random() * 2 - 1) * layout[i].r * 1.9
          tr.y = layout[i].y - layout[i].r - 30 - Math.random() * 170 // staggered above its own ring → a visible flow-in
          tr.vx = 0; tr.vy = 26
        }
        ts.push(tr)
      }
    }
    // a transit buffer streaming toward the FIRST live stage from off-screen (the ongoing intake of new users).
    // Skipped entirely when nothing has data, so a 0-count funnel shows NOBODY (no ghost crowd at an empty ring).
    const INTAKE = firstLive < 0 ? 0 : Math.max(16, Math.min(32, (botRing + 1) * 7)) // a thick, continuous intake stream → always visible flow
    for (let k = 0; k < INTAKE; k++) {
      const tr = blankTraveler()
      tr.orb = firstLive; tr.state = 'travel'
      tr.omega = 0.75 + 0.5 * Math.random(); tr.orbitLife = 1.3 + 1.9 * Math.random()
      tr.x = orbXi(firstLive) + (Math.random() * 2 - 1) * layout[firstLive].r * 2.4
      tr.y = -20 - Math.random() * 190; tr.vx = 0; tr.vy = 34
      ts.push(tr)
    }
    particlesRef.current = ts
  }, [layout, stages, orbTarget, flowTop])

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    resize()
    const ro = new ResizeObserver(() => { resize(); if (reduced) draw(ctx, 0) })
    if (wrapRef.current) ro.observe(wrapRef.current)
    if (reduced) { entranceRef.current = 1.5; numDispRef.current = stages.map((s) => s.count ?? 0); draw(ctx, 0); return () => ro.disconnect() }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      tRef.current += dt
      const cx = Math.round(geom.current.W * SPINE_X)
      const n = layout.length
      const orbX = (i: number) => cx + layout[i].dx
      // the deepest ring that holds people (the journey's end) + which legs shed (drop-off).
      let botRing = 0
      for (let i = 0; i < n; i++) if ((stages[i].count ?? 0) > 0) botRing = i
      const firstLive = orbTarget.findIndex((v) => v > 0) // first stage with people — intake/respawn feed THIS (empty Awareness stays empty)
      const dieRing = botRing + 1 < n ? botRing + 1 : -1 // the empty stage past the last live one (e.g. Retention 0) — the flow drifts here and dies
      const W = geom.current.W

      // a person RE-ENTERS as a fresh NEW user, streaming in from off-screen above the FIRST live stage
      const respawn = (tr: Traveler) => {
        const dest = firstLive < 0 ? 0 : firstLive
        tr.state = 'travel'; tr.orb = dest; tr.colorOrb = -1 // a fresh user has no stage colour until it reaches one
        tr.sz = 0.82 + Math.random() * 0.38   // a different person each time
        tr.omega = 0.75 + 0.5 * Math.random() // fresh travel speed
        tr.orbitLife = 1.3 + 1.9 * Math.random()
        tr.x = orbX(dest) + (Math.random() * 2 - 1) * layout[dest].r * 2.4
        tr.y = -30 - Math.random() * 170; tr.vx = 0; tr.vy = 32; tr.alpha = 1
      }
      // a person WALKS AWAY from circle i in any direction, out into the space (then fades → re-enters)
      const startLeak = (tr: Traveler, i: number) => {
        const ang = Math.random() * 6.2832, R = layout[i].r
        tr.orb = i; tr.state = 'leak'
        tr.x = orbX(i) + Math.cos(ang) * R * 0.55
        tr.y = layout[i].y + Math.sin(ang) * R * 0.55
        const spd = 30 + Math.random() * 22
        tr.vx = Math.cos(ang) * spd; tr.vy = Math.sin(ang) * spd; tr.alpha = 1; tr.orbitAge = 0
      }
      // a person from the last live ring flows ON down the path toward the empty final stage — then dies AT it
      const startDie = (tr: Traveler) => {
        tr.orb = dieRing; tr.state = 'die'
        tr.omega = 0.7 + 0.4 * Math.random() // its own drift pace toward the dead circle
      }

      // how many people ORBIT each ring right now → a ring under its target keeps its people (they STAY),
      // a full ring lets the overflow move on. Keeps each crowd ≈ its proportional number.
      const liveOrbit = new Array(n).fill(0)
      for (const tr of particlesRef.current) if (tr.state === 'orbit') liveOrbit[tr.orb]++

      for (const tr of particlesRef.current) {
        if (tr.state === 'orbit') {
          // MILL: drift to a random spot inside the ring, pick another on arrival — an organic cloud. After a
          // spell (orbitLife) this person DECIDES what to do next: stay, move on to the next stage, or leave.
          const i = tr.orb, ox = orbX(i), oy = layout[i].y, R = layout[i].r
          const tgx = ox + tr.orbitR * Math.cos(tr.theta), tgy = oy + tr.orbitR * Math.sin(tr.theta)
          tr.vx += (tgx - tr.x) * 2.4 * dt; tr.vy += (tgy - tr.y) * 2.4 * dt // gentler drift → floatier milling
          const dp = 1 - Math.min(0.9, 2.6 * dt); tr.vx *= dp; tr.vy *= dp
          tr.x += tr.vx * dt; tr.y += tr.vy * dt
          if (Math.hypot(tr.x - tgx, tr.y - tgy) < R * 0.14) { tr.orbitR = R * (0.12 + 0.8 * Math.random()); tr.theta = Math.random() * 6.2832 }
          tr.orbitAge += dt
          if (tr.orbitAge >= tr.orbitLife) {
            liveOrbit[i]--
            const T = orbTarget[i]
            // STAY holds the crowd at its real number. But a BUSY ring (T≥5) lets a resident CIRCULATE on now and
            // then even when not quite full (floor ~T−2, refilled by inflow) → the funnel keeps FLOWING, not sitting.
            const circulate = T >= 5 && liveOrbit[i] >= T - 2 && Math.random() < 0.45
            if (liveOrbit[i] < T && !circulate) {
              liveOrbit[i]++; tr.orbitLife = 1.3 + 1.9 * Math.random(); tr.orbitAge = 0 // still needs people → STAY (a lone person in a count-1 ring never leaves)
            } else {
              // move ON: CONVERT down to the next stage that HAS people (skip any empty ring so
              // nobody mills where there's no circle), or WALK AWAY (drop-off, more likely on a weak leg).
              let nxt = -1
              for (let j = i + 1; j <= botRing; j++) if (orbTarget[j] > 0) { nxt = j; break }
              const shed = Math.random() < (nxt >= 0 ? clamp01(0.18 + 0.5 * (1 - (survival[i] ?? 0))) : 0.55)
              if (nxt >= 0 && !shed) { tr.state = 'travel'; tr.orb = nxt } // travel down to the next live stage (convert)
              else if (nxt < 0 && dieRing >= 0 && Math.random() < 0.72) startDie(tr) // last live ring → most flow ON toward the dead final stage & die there
              else startLeak(tr, i)                                        // walk away (leave / scatter)
            }
          }
          continue
        }
        if (tr.state === 'travel') {
          // a person walking toward ring `orb` — PULLED in faster as it nears — then it joins that circle.
          const R0 = layout[tr.orb].r
          const SP = 84 * (tr.omega || 1) // slightly slower travel
          const wob = Math.sin((tRef.current + tr.phase) * 1.2) * 14 // gentle lateral weave (per-person phase)
          const tx = orbX(tr.orb) + wob, ty = layout[tr.orb].y
          const dx = tx - tr.x, dy = ty - tr.y, d = Math.hypot(dx, dy) || 1
          const pull = 1 + clamp01((R0 * 2.4 - d) / (R0 * 2.4)) * 0.9 // accelerate as it nears → visibly PULLED in
          tr.vx += (dx / d * SP * pull - tr.vx) * Math.min(1, dt * 5)
          tr.vy += (dy / d * SP * pull - tr.vy) * Math.min(1, dt * 5)
          tr.x += tr.vx * dt; tr.y += tr.vy * dt
          if (d < R0 * 0.9) { // arrived → JOIN the circle (start milling) → now wears THIS stage's colour
            tr.state = 'orbit'; tr.colorOrb = tr.orb; tr.orbitR = R0 * (0.12 + 0.8 * Math.random()); tr.theta = Math.random() * 6.2832
            tr.orbitLife = 1.3 + 1.9 * Math.random(); tr.orbitAge = 0
          }
          continue
        }
        if (tr.state === 'die') {
          // flowing ON toward the empty final stage (e.g. Retention 0): drift down the path to that circle and
          // FADE OUT right at its rim → the flow visibly "dies off" there (nobody comes back). Then re-enter at the top.
          const R0 = layout[tr.orb].r
          const SP = 54 * (tr.omega || 1) // slightly slower drift toward the dead circle
          const wob = Math.sin((tRef.current + tr.phase) * 1.2) * 12
          const tx = orbX(tr.orb) + wob, ty = layout[tr.orb].y
          const dx = tx - tr.x, dy = ty - tr.y, d = Math.hypot(dx, dy) || 1
          tr.vx += (dx / d * SP - tr.vx) * Math.min(1, dt * 4)
          tr.vy += (dy / d * SP - tr.vy) * Math.min(1, dt * 4)
          tr.x += tr.vx * dt; tr.y += tr.vy * dt
          tr.alpha = clamp01((d - R0 * 0.5) / (R0 * 0.8)) // fades fully to 0 exactly AT the circle (d≈0.5R) → a clean death, no pop
          if (d < R0 * 0.5 || tr.alpha <= 0.01) respawn(tr) // reached it → dead → re-enter as a fresh user at the top
          continue
        }
        // leak — the person WALKS AWAY, gliding out + fading with distance (any direction) + an edge guard;
        // once gone it re-enters as a fresh new user from the top.
        const lo = orbX(tr.orb), lp = layout[tr.orb].y, LR = layout[tr.orb].r
        const damp = 1 - Math.min(0.9, 0.35 * dt); tr.vx *= damp; tr.vy *= damp
        tr.x += tr.vx * dt; tr.y += tr.vy * dt
        tr.orbitAge += dt
        const dOut = Math.hypot(tr.x - lo, tr.y - lp)
        const far = clamp01(1 - (dOut - LR * 0.85) / (LR * 0.95)) // full while near/leaving the circle, gone by ~1.8R out
        const edge = clamp01(Math.min(tr.x, W - tr.x) / 34)       // also fade before the screen edge
        const life = clamp01(1 - tr.orbitAge / 3.5)               // time cap: always fully gone in ~3.5s (a slow glide on the big ring can't stall visible)
        tr.alpha = Math.min(far, edge, life)
        if (tr.alpha <= 0.01 || tr.orbitAge > 11) respawn(tr) // gone → re-enter as a fresh user from the top
      }
      if (entranceRef.current < 1.5) entranceRef.current += dt
      for (let i = 0; i < layout.length; i++) {
        const cur = rDispRef.current[i]
        rDispRef.current[i] = cur == null ? layout[i].r : cur + (layout[i].r - cur) * Math.min(1, dt * 7)
        // ledger number: gated by the entrance stagger, then eased toward its target —
        // so it counts up on load and cross-fades (never snaps) on a range change
        const gate = entranceRef.current > i * 0.09
        const tgt = gate ? (stages[i].count ?? 0) : 0
        const nc = numDispRef.current[i] == null ? 0 : numDispRef.current[i]
        numDispRef.current[i] = nc + (tgt - nc) * Math.min(1, dt * 4)
        // press "settle": lift fast toward the touched row, ease slow back on release
        const ptgt = pressRef.current.i === i ? 1 : 0
        const pc = pressAmtRef.current[i] == null ? 0 : pressAmtRef.current[i]
        pressAmtRef.current[i] = pc + (ptgt - pc) * Math.min(1, dt * (ptgt > pc ? 14 : 10))
      }
      draw(ctx, tRef.current)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reduced, draw, resize, layout, survival, flowTop, flowBot, stages, orbTarget])

  useEffect(() => {
    if (!reduced) return
    const ctx = canvasRef.current?.getContext('2d')
    entranceRef.current = 1.5
    numDispRef.current = stages.map((s) => s.count ?? 0)
    if (ctx) draw(ctx, 0)
  }, [walkInRate, avgTicket, reduced, draw, stages])

  // which stage a point hits — the ring disc OR a full-width row band (so the whole row,
  // ring→number→tick→chevron, is one generous ≥44px target); nearest ring-centre wins overlaps.
  const hitStage = (mx: number, my: number) => {
    const cx = Math.round(geom.current.W * SPINE_X)
    const W = geom.current.W
    const n = stages.length
    let best = -1, bestDy = Infinity
    for (let i = 0; i < n; i++) {
      const ox = cx + layout[i].dx, oy = layout[i].y, r = layout[i].r
      const ddx = mx - ox, dyy = my - oy
      const inRing = ddx * ddx + dyy * dyy <= (r + 12) ** 2
      const bandHalf = Math.max(22, r + 12)
      const topB = i === 0 ? 0 : (layout[i - 1].y + oy) / 2
      const botB = i === n - 1 ? effH : (oy + layout[i + 1].y) / 2
      const inBand = mx >= 8 && mx <= W && my >= Math.max(topB, oy - bandHalf) && my <= Math.min(botB, oy + bandHalf)
      if (inRing || inBand) { const ay = Math.abs(dyy); if (ay < bestDy) { bestDy = ay; best = i } }
    }
    return best
  }
  const ptFrom = (e: React.MouseEvent<HTMLCanvasElement> | React.PointerEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current
    if (!cv) return null
    const rect = cv.getBoundingClientRect()
    return { mx: e.clientX - rect.left, my: e.clientY - rect.top }
  }
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const p = ptFrom(e); if (!p) return
    const i = hitStage(p.mx, p.my)
    if (i < 0) return
    const key = stages[i].key
    if (!key) return
    // ALWAYS the tapped stage's own insights — Awareness to Awareness, Interest
    // to Interest. (The old weak-leg reroute to the campaign store made taps
    // land somewhere other than the stage the owner tapped; the insights page
    // has its own paths into fixing a weak number.)
    router.push(`/dashboard/insights?stage=${key}`)
  }
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = ptFrom(e); if (p) pressRef.current.i = hitStage(p.mx, p.my)
  }
  const clearPress = () => { pressRef.current.i = -1 }

  const pickRange = onRange ?? setLocRange
  const shownAudience = audOverride ?? audience // owner override → detected city → "Your area"
  // the real window this graph covers: "‹start› – ‹asOf›" (asOf = freshest day Google has,
  // a few days behind today). Falls back to just the end date if the start is missing.
  const rangeLabel = useMemo(() => {
    if (!asOf) return null
    const e = new Date(asOf + 'T00:00:00')
    if (Number.isNaN(e.getTime())) return null
    const s = windowStart ? new Date(windowStart + 'T00:00:00') : null
    const sValid = s != null && !Number.isNaN(s.getTime())
    const sameYear = sValid ? (s as Date).getFullYear() === e.getFullYear() : true
    const opts: Intl.DateTimeFormatOptions = sameYear ? { month: 'short', day: 'numeric' } : { month: 'short', day: 'numeric', year: 'numeric' }
    const eStr = e.toLocaleDateString('en-US', opts)
    return sValid ? `${(s as Date).toLocaleDateString('en-US', opts)} – ${eStr}` : eStr
  }, [asOf, windowStart])

  return (
    <div ref={wrapRef} style={{ position: 'relative', height: effH, background: C.funnelBg, overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, ...(fill ? { border: 'none', borderRadius: 0, boxShadow: 'none' } : { border: `0.5px solid ${C.line}`, borderRadius: 20, boxShadow: '0 24px 60px -24px rgba(18,80,58,.30), 0 6px 18px -6px rgba(0,0,0,.06)' }) }}>
      {/* the tabs + audience chrome now FLOATS over the canvas (which fills the whole card from the top) so the
          flow streams in behind the text; the rings sit headerH below, clear of it. */}
      <div ref={headerRef} style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 1 }}>
      {/* time-range tabs (scrollable) at the very top + the light/dark switch pinned to the TOP-RIGHT */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 6px' }}>
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', flex: 1, minWidth: 0, WebkitOverflowScrolling: 'touch' }}>
          {RANGES.map(([k, label]) => {
            const on = curRange === k
            return (
              <button key={k} type="button" onClick={() => pickRange(k)} style={{ flexShrink: 0, whiteSpace: 'nowrap', border: `1px solid ${on ? C.green : C.line}`, background: on ? C.greenSoft : C.card, color: on ? C.greenDk : C.mute, borderRadius: 999, padding: '6px 13px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', transition: 'background .15s, border-color .15s, color .15s' }}>{label}</button>
            )
          })}
        </div>
        {/* one switch flips the whole home between the light + dark skins */}
        <button
          type="button"
          onClick={toggle}
          aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
          title={theme === 'dark' ? 'Light mode' : 'Dark mode'}
          style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 99, border: `1px solid ${C.line}`, background: C.card, color: C.mute, cursor: 'pointer', flexShrink: 0, padding: 0 }}
        >
          {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
        </button>
      </div>

      {/* WHO the funnel is for (left) + the date window (right) — directly under the tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '4px 16px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: C.faint, flexShrink: 0 }}>Target audience</span>
          {editingAud ? (
            <input
              autoFocus
              defaultValue={audOverride ?? (audience && audience !== 'Your area' ? audience : '')}
              placeholder="e.g. Seattle locals"
              onBlur={(e) => saveAudience(e.currentTarget.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') saveAudience(e.currentTarget.value); else if (e.key === 'Escape') setEditingAud(false) }}
              style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: 'inherit', border: 'none', borderBottom: `1.5px solid ${C.green}`, outline: 'none', background: 'transparent', padding: '0 0 1px', width: 160, minWidth: 0 }}
              aria-label="Target audience"
            />
          ) : (
            <button
              type="button"
              onClick={() => setEditingAud(true)}
              title="Change target audience"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, minWidth: 0, maxWidth: '100%', border: 'none', background: 'transparent', padding: 0, margin: 0, cursor: 'pointer', fontFamily: 'inherit', fontSize: 14, fontWeight: 700, color: C.ink }}
            >
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shownAudience}</span>
              <Pencil size={11} color={C.faint} style={{ flexShrink: 0 }} />
            </button>
          )}
        </div>
        {/* the real window this graph covers — pinned to the RIGHT of the audience line */}
        {rangeLabel && (
          <div style={{ fontSize: 12.5, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', flexShrink: 0 }}>As of {rangeLabel}</div>
        )}
      </div>
      </div>

      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        onPointerDown={onCanvasPointerDown}
        onPointerUp={clearPress}
        onPointerCancel={clearPress}
        onPointerLeave={clearPress}
        style={{ display: 'block', position: 'absolute', top: 0, left: 0, zIndex: 0, width: '100%', height: effH, cursor: 'pointer', opacity: loading ? 0.5 : 1, transition: 'opacity .2s' }}
        aria-label="Your marketing funnel from Google: Awareness (how many times you showed up), Interest (everyone who clicked, called, or asked directions), Customer actions (directions and calls), Orders (walk-ins who came in and bought), and Retention (customers who came back). The Awareness, Interest, and Customer-actions stages are measured from Google; the amber Orders stage is estimated from your walk-in rate; Retention is locked until a register connects."
      />
    </div>
  )
}

/**
 * HomeFunnelLive — wires HomeFunnel to the REAL business signals. Fetches the
 * same /api/dashboard/insights-detail the insights page uses, and renders the
 * funnel once real Google views + actions are in. Renders nothing until then
 * (and nothing at all if the business has no Google data yet), so Home falls
 * back gracefully to the rest of the feed.
 */
/** A computed-stage source as it arrives in the insights-detail JSON. */
interface WireStageSource { id: string; value: number | null; counted: boolean }
interface WireStage { stage: number; headline: number | null; sources: WireStageSource[] }

/** Derive the funnel's Views + Actions from the honest computed stages (Phase 2):
 *  Awareness = the CONNECTED-sum (headline), split into its Google vs Social parts
 *  from the same counted sources, and Actions from the counted GBP action sources.
 *  Returns null when Awareness has no connected source (so Home falls back / hides). */
function fromStages(stages: WireStage[] | undefined): { views: Views; actions: Actions; counts: StageCounts } | null {
  if (!stages || !stages.length) return null
  const aw = stages.find((s) => s.stage === 1)
  const it = stages.find((s) => s.stage === 2)
  const ac = stages.find((s) => s.stage === 3)
  const rt = stages.find((s) => s.stage === 5)
  if (!aw || aw.headline == null) return null
  const val = (st: WireStage | undefined, id: string): number => {
    const s = st?.sources.find((x) => x.id === id)
    return s && s.counted && s.value != null ? s.value : 0
  }
  const search = val(aw, 'gbp_impressions_search')
  const maps = val(aw, 'gbp_impressions_maps')
  const social = val(aw, 'ig_reach')
  const google = search + maps
  const views: Views = { total: aw.headline, google, social, maps, search }
  const actions: Actions = {
    directions: val(ac, 'gbp_direction_requests'),
    calls: val(ac, 'gbp_calls'),
    websiteClicks: val(it, 'gbp_website_clicks'), // moved to Interest (stage 2)
  }
  // the animated Interest / Actions / Retention counts ARE the Insights stage
  // headlines, so the two surfaces never disagree
  const counts: StageCounts = {
    interest: it?.headline ?? undefined,
    actions: ac?.headline ?? undefined,
    retention: rt?.headline ?? undefined, // null headline (empty stage) → undefined → falls back to 0
  }
  return { views, actions, counts }
}

export function HomeFunnelLive({ clientId, height, fill, onVisibility }: { clientId?: string; height?: number; fill?: boolean; onVisibility?: (v: 'shown' | 'empty') => void }) {
  const [data, setData] = useState<{ views: Views | null; actions: Actions | null; counts: StageCounts | undefined; asOf: string | null; windowStart: string | null; audience: string | null; yoy: FunnelYoY | null } | null>(null)
  const [range, setRange] = useState<FunnelRange>('30d')
  const [loading, setLoading] = useState(false)
  useEffect(() => {
    // No client, or no Google data: tell the parent, so Home can render its
    // Day-0 body in place of the funnel — never a blank screen.
    if (!clientId) { onVisibility?.('empty'); return }
    let alive = true
    setLoading(true)
    fetch(`/api/dashboard/insights-detail?clientId=${clientId}&range=${range}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!alive) return
        if (!d) { onVisibility?.('empty'); return }
        // Phase 2: the honest computed stages are the source of truth for the
        // funnel numbers (Awareness = connected-sum). Fall back to the legacy
        // views/actions only if stages are absent (older payloads).
        const derived = fromStages(d.stages)
        const views = derived?.views ?? d.views ?? null
        const actions = derived?.actions ?? d.actions ?? null
        setData({
          views, actions,
          counts: derived?.counts,
          asOf: d.asOf ?? null, windowStart: d.windowStart ?? null, audience: d.audience ?? null, yoy: d.yoy ?? null,
        })
        onVisibility?.(views && actions && views.total > 0 ? 'shown' : 'empty')
      })
      .catch(() => { if (alive) onVisibility?.('empty') /* Home stays lean if this fails */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // onVisibility identity is caller-stable; depend on the data inputs only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientId, range])
  if (!data?.views || !data?.actions || data.views.total <= 0) return null
  return <div style={fill ? undefined : { marginBottom: 14 }}><HomeFunnel views={data.views} actions={data.actions} counts={data.counts} audience={data.audience ?? undefined} asOf={data.asOf ?? undefined} windowStart={data.windowStart ?? undefined} yoy={data.yoy} storageKey={clientId ?? 'home'} height={height} fill={fill} range={range} onRange={setRange} loading={loading} /></div>
}

/* truncate text with an ellipsis to fit maxW at the ctx's current font */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

