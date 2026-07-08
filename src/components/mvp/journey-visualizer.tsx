'use client'

/**
 * JourneyVisualizer — the full customer journey, stranger -> regular, told
 * through behavior instead of an abstract funnel. A street runs along the top
 * with a walking crowd; the owner's restaurant sits at the bottom. Toggling a
 * service on unlocks the next real behavioral step:
 *
 *   street (oblivious) -> glance (notices) -> curious (leaves the street to
 *   look) -> decide (walks to the door with purpose) -> enter (steps inside,
 *   the window warms) -> and, with loyalty on, regulars loop back in amber.
 *
 * Rules ported from the approved prototype (apnosh-journey-merged.html):
 *   - Chain dependency: a later service does nothing while an earlier one is
 *     off (emergent from the state machine — each transition gates on its own
 *     service).
 *   - Probabilistic drop-off: at every gated step where the next service is
 *     off, a person waits briefly, then drifts back to the street and exits —
 *     a lost near-customer. The crowd thins toward the door.
 *   - Empty state: nothing on = everyone walks past, door count stays 0.
 *   - Goal selector re-weights the return loop (visits vs loyalty).
 *
 * Skinned in the portal's own design system (the mvp `C` tokens + Cal Sans),
 * NOT the prototype's Playfair/gold palette. All numbers are illustrative.
 * Self-contained: canvas + requestAnimationFrame, all data via props with
 * mock defaults, honors prefers-reduced-motion (static scene, no animation).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

/* Mirrors the mvp design tokens (mvp-home.tsx `C`) so the component stands
   alone; every color is overridable via the `colors` prop. */
const TOKENS = {
  brand: '#4abd98',
  brandDark: '#2e9a78',
  brandSoft: '#eaf7f3',
  brandLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f',
  mute: '#6e6e73',
  faint: '#aeaeb2',
  line: '#e6e6ea',
  bg: '#f5f5f7',
  /* Regulars are amber, from the portal amber family (not the prototype gold). */
  regular: '#bd7e16',
  regularSoft: '#fbf3e4',
  regularLine: '#eed9b3',
  /* Scene */
  stranger: '#aeaeb2',
  glance: '#7fceb1',
  committed: '#2e9a78',
  street: '#f0f0f3',
  labelOff: '#c2c2c7',
}
export type JourneyColors = typeof TOKENS

const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface JourneyService {
  /** Step label, e.g. "1 · They notice you" */
  stage: string
  /** Service name, e.g. "Show up on Google" */
  name: string
  /** What flips on, in plain words */
  does: string
}

/** Per-second transition chances (multiplied by dt), matching the prototype. */
export interface JourneyProbabilities {
  /** street -> glance while in the visible stretch */
  glance: number
  /** glance -> curious (leaves the street) */
  curious: number
  /** curious -> decide (heads for the door) */
  decide: number
  /** regulars move through the chain this much faster */
  regularBoost: number
  /** chance an entering person returns as a regular — "more visits" goal */
  returnVisits: number
  /** same, with the "more loyalty" goal selected */
  returnLoyalty: number
}

export interface JourneyVisualizerProps {
  businessName?: string
  title?: string
  intro?: string
  /** Exactly five steps: notice, curious, decide, enter, return. */
  services?: JourneyService[]
  /** How many people are on the street at once. */
  spawnCount?: number
  /** Canvas height in CSS px. */
  height?: number
  colors?: Partial<JourneyColors>
  probabilities?: Partial<JourneyProbabilities>
  /** Which services start on (default: all off — the empty state). */
  initialActive?: boolean[]
}

const DEFAULT_SERVICES: JourneyService[] = [
  { stage: '1 · They notice you', name: 'Show up on Google', does: 'you appear when people search nearby' },
  { stage: '2 · They get curious', name: 'Great photos & profile', does: 'your profile makes them look closer' },
  { stage: '3 · They decide', name: 'An offer worth coming for', does: 'a reason good enough to come in' },
  { stage: '4 · They come in', name: 'Easy to walk in & book', does: 'simple to book, or just drop by' },
  { stage: '5 · They come back', name: 'A loyalty program', does: 'regulars return, and bring friends' },
]

const DEFAULT_PROBS: JourneyProbabilities = {
  glance: 1.5, curious: 1.4, decide: 1.3, regularBoost: 1.7, returnVisits: 0.4, returnLoyalty: 0.7,
}

type PersonState = 'street' | 'glance' | 'curious' | 'decide' | 'enter' | 'leave'
interface Person {
  state: PersonState
  x: number
  y: number
  ph: number
  t: number
  tx?: number
  regular: boolean
  alpha: number
  jx: number
}

export default function JourneyVisualizer({
  businessName = 'Anchovies & Salt',
  title = 'The whole journey',
  intro = 'Switch a service on to unlock the next step, from a stranger on the street to a regular at your table.',
  services = DEFAULT_SERVICES,
  spawnCount = 22,
  height = 406,
  colors,
  probabilities,
  initialActive,
}: JourneyVisualizerProps) {
  /* Stable identities: without these, every 250ms counter update re-creates
     the draw callbacks and restarts the animation effect. */
  const colKey = JSON.stringify(colors ?? {})
  const probsKey = JSON.stringify(probabilities ?? {})
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const col = useMemo(() => ({ ...TOKENS, ...colors }), [colKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const probs = useMemo(() => ({ ...DEFAULT_PROBS, ...probabilities }), [probsKey])

  const [active, setActive] = useState<boolean[]>(() =>
    services.map((_, i) => initialActive?.[i] ?? false))
  const [goalLoyalty, setGoalLoyalty] = useState(false)
  const [passing, setPassing] = useState<number | null>(null)
  const [door, setDoor] = useState(0)
  const [reduced, setReduced] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  /* The sim lives in refs so the rAF loop never fights React renders. */
  const activeRef = useRef(active)
  const goalRef = useRef(goalLoyalty)
  const peopleRef = useRef<Person[]>([])
  const doorEmaRef = useRef(0)
  /* Cumulative count of everyone who has walked in this session — a number that
     climbs and stays, so building the funnel visibly pays off. */
  const enteredRef = useRef(0)
  const seatedRef = useRef(0)
  /* Warm light motes near the doorway, and a running clock for flowing dashes. */
  const particlesRef = useRef<{ x: number; y: number; vy: number; vx: number; life: number; max: number; r: number }[]>([])
  const tRef = useRef(0)
  activeRef.current = active
  goalRef.current = goalLoyalty

  /* Layout rows (CSS px), scaled off the default 406 height so a custom
     height keeps the same proportions. */
  const k = height / 406
  const geom = useRef({ W: 400, streetY: 48 * k, curiousY: 145 * k, decideY: 201 * k, doorTopY: 280 * k, rwY: 300 * k })
  geom.current = { ...geom.current, streetY: 48 * k, curiousY: 145 * k, decideY: 201 * k, doorTopY: 280 * k, rwY: 300 * k }

  const fresh = useCallback((regular: boolean): Person => ({
    state: 'street', x: -10 - Math.random() * geom.current.W, y: geom.current.streetY,
    ph: Math.random() * 6, t: 0, regular, alpha: 1, jx: Math.random() * 22 - 11,
  }), [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  /* ── The scene (shared by the live loop and the reduced-motion still) ── */
  const drawScene = useCallback((ctx: CanvasRenderingContext2D, seated: number, t: number) => {
    const { W, streetY, doorTopY } = geom.current
    const H = height
    const doorX = 0.5 * W
    const a = activeRef.current
    const warm = Math.min(1, seated / 4)
    /* How lit the doorway feels — some welcome even before the first guest. */
    const glow = Math.max(warm, a[3] ? 0.3 : 0)

    /* sky — cool over the street, warming toward the door */
    const sky = ctx.createLinearGradient(0, 0, 0, H)
    sky.addColorStop(0, '#fbfcfd')
    sky.addColorStop(0.55, '#f6f8f8')
    sky.addColorStop(1, glow > 0 ? '#f7f2ea' : '#f3f5f4')
    ctx.fillStyle = sky
    ctx.fillRect(0, 0, W, H)

    /* warm welcome light pooling up from the doorway */
    if (glow > 0) {
      const lp = ctx.createRadialGradient(doorX, doorTopY - 4, 6, doorX, doorTopY - 4, 172)
      lp.addColorStop(0, `rgba(201,154,62,${0.2 * glow})`)
      lp.addColorStop(0.5, `rgba(201,154,62,${0.07 * glow})`)
      lp.addColorStop(1, 'rgba(201,154,62,0)')
      ctx.fillStyle = lp
      ctx.fillRect(0, streetY, W, H - streetY)
    }

    /* stage 1 · awareness — the moment you show up on Google, your reach
       broadcasts out from the restaurant up to the neighborhood: soft rings
       rising toward the street, so awareness reads as YOU finding THEM. */
    if (a[0]) {
      const oy = doorTopY - 6
      const span = doorTopY - streetY + 30
      for (let i = 0; i < 2; i++) {
        const ph = (t * 0.32 + i * 0.5) % 1
        const r = 14 + ph * span
        ctx.strokeStyle = `rgba(74,189,152,${(1 - ph) * 0.2})`
        ctx.lineWidth = 1.5
        ctx.beginPath(); ctx.arc(doorX, oy, r, Math.PI, 2 * Math.PI); ctx.stroke()
      }
    }

    /* the street — a sidewalk band with a soft leading edge + shadow */
    ctx.fillStyle = col.street
    ctx.fillRect(0, streetY + 11, W, 18)
    ctx.fillStyle = 'rgba(255,255,255,.55)'
    ctx.fillRect(0, streetY + 11, W, 1)
    ctx.fillStyle = 'rgba(0,0,0,.03)'
    ctx.fillRect(0, streetY + 29, W, 3)
    ctx.font = '600 9px Inter, sans-serif'; ctx.textAlign = 'right'
    ctx.fillStyle = a[0] ? col.brandDark : col.faint
    ctx.fillText(a[0] ? 'THE NEIGHBORHOOD · reaching them' : 'THE NEIGHBORHOOD · they walk past', W - 12, streetY - 12)
    ctx.textAlign = 'left'

    /* ── one path from the street to the door, with the stations marked on it;
       each node lights up as its service is switched on, and the green lane
       extends only as far as the chain actually reaches ── */
    const R = 11
    /* start the first node BELOW the street crowd so they don't overlap */
    const top = streetY + 42, bot = doorTopY - 26
    const nY = [top, top + (bot - top) / 3, top + 2 * (bot - top) / 3, bot]
    const STA = [
      { label: 'Seen', icon: 'eye' },
      { label: 'Curious', icon: 'photo' },
      { label: 'Decides', icon: 'tag' },
      { label: 'Walk in', icon: 'door' },
    ]
    let reach = 0
    while (reach < 4 && a[reach]) reach++
    ctx.lineCap = 'round'
    ctx.strokeStyle = 'rgba(0,0,0,.07)'; ctx.lineWidth = 2.5; ctx.setLineDash([1, 7])
    ctx.beginPath(); ctx.moveTo(doorX, nY[0]); ctx.lineTo(doorX, doorTopY - 4); ctx.stroke(); ctx.setLineDash([])
    if (reach >= 2) {
      ctx.strokeStyle = col.brand; ctx.lineWidth = 3
      ctx.beginPath(); ctx.moveTo(doorX, nY[0]); ctx.lineTo(doorX, nY[Math.min(reach - 1, 3)]); ctx.stroke()
    }
    const drawIcon = (key: string, cx: number, cy: number, c: string) => {
      if (key === 'eye') {
        ctx.strokeStyle = c; ctx.lineWidth = 1.4
        ctx.beginPath(); ctx.ellipse(cx, cy, 6, 3.6, 0, 0, 7); ctx.stroke()
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx, cy, 1.7, 0, 7); ctx.fill()
      } else if (key === 'photo') {
        ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.strokeRect(cx - 5.5, cy - 4, 11, 8)
        ctx.beginPath(); ctx.arc(cx, cy, 2, 0, 7); ctx.stroke()
      } else if (key === 'tag') {
        ctx.fillStyle = c; ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'center'
        ctx.fillText('%', cx, cy + 3.8); ctx.textAlign = 'left'
      } else {
        ctx.strokeStyle = c; ctx.lineWidth = 1.4; ctx.strokeRect(cx - 4, cy - 5.5, 8, 11)
        ctx.fillStyle = c; ctx.beginPath(); ctx.arc(cx + 1.6, cy, 1, 0, 7); ctx.fill()
      }
    }
    STA.forEach((s, i) => {
      const y = nY[i], lit = i < reach
      ctx.fillStyle = lit ? col.brand : '#fff'
      ctx.strokeStyle = lit ? col.brand : '#d7dade'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.arc(doorX, y, R, 0, 7); ctx.fill(); ctx.stroke()
      drawIcon(s.icon, doorX, y, lit ? '#fff' : '#b7bcc0')
      ctx.fillStyle = lit ? col.brandDark : col.labelOff
      ctx.font = '700 11px Inter, sans-serif'; ctx.textAlign = 'right'
      ctx.fillText(s.label, doorX - R - 9, y + 4); ctx.textAlign = 'left'
    })

    /* ── the restaurant — a compact storefront on a strip of pavement ── */
    const bx = doorX - 54, bw = 108, bTop = doorTopY + 2
    const bBot = bTop + 60 * (H / 406)
    /* facade, with a soft shadow tucked under the awning */
    const fac = ctx.createLinearGradient(0, bTop, 0, bBot)
    fac.addColorStop(0, '#f3f1ec')
    fac.addColorStop(0.2, '#ffffff')
    fac.addColorStop(1, '#fdfdfb')
    ctx.fillStyle = fac
    ctx.fillRect(bx, bTop, bw, bBot - bTop)
    ctx.strokeStyle = col.line
    ctx.lineWidth = 1
    ctx.strokeRect(bx, bTop, bw, bBot - bTop)

    /* window — warms and lights up as guests are seated */
    const wl = doorX - 41, wt = doorTopY + 15, ww = 33, wh = 31
    const wg = ctx.createLinearGradient(0, wt, 0, wt + wh)
    wg.addColorStop(0, warm > 0.1 ? '#fbe8c9' : '#eef3f1')
    wg.addColorStop(1, warm > 0.1 ? '#f3d99b' : '#e8efec')
    ctx.fillStyle = wg
    ctx.fillRect(wl, wt, ww, wh)
    if (warm > 0.1) {
      const wi = ctx.createRadialGradient(wl + ww / 2, wt + wh / 2, 2, wl + ww / 2, wt + wh / 2, ww)
      wi.addColorStop(0, `rgba(255,224,150,${0.5 * warm})`)
      wi.addColorStop(1, 'rgba(255,224,150,0)')
      ctx.fillStyle = wi
      ctx.fillRect(wl, wt, ww, wh)
    }
    ctx.strokeStyle = col.line
    ctx.strokeRect(wl, wt, ww, wh)
    /* mullions */
    ctx.strokeStyle = 'rgba(120,110,80,.16)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(wl + ww / 2, wt); ctx.lineTo(wl + ww / 2, wt + wh)
    ctx.moveTo(wl, wt + wh / 2); ctx.lineTo(wl + ww, wt + wh / 2)
    ctx.stroke()
    /* seated guests */
    ctx.fillStyle = '#a9822f'
    for (let s = 0; s < Math.round(seated); s++) {
      const sx = wl + 7 + s * 8
      if (sx < wl + ww - 4) { ctx.beginPath(); ctx.arc(sx, wt + wh - 9, 2.2, 0, 7); ctx.fill() }
    }

    /* door — light spills onto the pavement when it's easy to walk in */
    const dTop = doorTopY + 8, dh = bBot - 4 - dTop
    if (a[3] && glow > 0) {
      ctx.fillStyle = `rgba(255,214,130,${0.16 * glow})`
      ctx.beginPath()
      ctx.moveTo(doorX - 10, dTop); ctx.lineTo(doorX + 10, dTop)
      ctx.lineTo(doorX + 30, dTop + dh + 6); ctx.lineTo(doorX - 30, dTop + dh + 6)
      ctx.closePath(); ctx.fill()
    }
    ctx.fillStyle = warm > 0.15 ? '#f7e6bb' : '#eef0ef'
    ctx.fillRect(doorX - 11, dTop, 22, dh)
    ctx.strokeStyle = col.line
    ctx.strokeRect(doorX - 11, dTop, 22, dh)
    ctx.fillStyle = col.regular
    ctx.beginPath(); ctx.arc(doorX + 6, dTop + 26, 1.6, 0, 7); ctx.fill()

    /* awning — brand green, dimensional (top highlight + scalloped edge) */
    const aTop = doorTopY - 14
    ctx.fillStyle = col.brandDark
    ctx.beginPath()
    ctx.moveTo(doorX - 56, doorTopY + 2); ctx.lineTo(doorX + 56, doorTopY + 2)
    ctx.lineTo(doorX + 46, aTop); ctx.lineTo(doorX - 46, aTop)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.15)'
    ctx.beginPath()
    ctx.moveTo(doorX - 46, aTop); ctx.lineTo(doorX + 46, aTop); ctx.lineTo(doorX + 43, aTop + 3); ctx.lineTo(doorX - 43, aTop + 3)
    ctx.closePath(); ctx.fill()
    ctx.fillStyle = col.brand
    for (let s = -46; s < 50; s += 14) {
      ctx.beginPath()
      ctx.moveTo(doorX + s, doorTopY + 2); ctx.lineTo(doorX + s + 7, doorTopY + 2); ctx.lineTo(doorX + s + 3.5, doorTopY - 5)
      ctx.closePath(); ctx.fill()
    }
    /* (the storefront's signs now live in the station nodes on the path above) */

    /* warm light motes drifting up from the doorway */
    if (particlesRef.current.length) {
      ctx.fillStyle = '#e7c274'
      for (const pt of particlesRef.current) {
        ctx.globalAlpha = Math.max(0, Math.min(1, pt.life / pt.max)) * 0.6
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.r, 0, 7); ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    /* stage 5 · Regulars — a flowing amber ribbon looping back up the right side
       to the street, regulars riding it home as little hearts */
    if (a[4]) {
      const P0 = [doorX + 52, doorTopY + 40], C1 = [W - 10, H - 10], C2 = [W - 8, streetY + 30], P3 = [W - 60, streetY + 4]
      ctx.save()
      ctx.strokeStyle = 'rgba(201,154,62,.55)'
      ctx.lineWidth = 2
      ctx.lineCap = 'round'
      ctx.setLineDash([6, 6])
      ctx.lineDashOffset = -t * 26
      ctx.shadowColor = 'rgba(201,154,62,.4)'
      ctx.shadowBlur = 5
      ctx.beginPath()
      ctx.moveTo(P0[0], P0[1])
      ctx.bezierCurveTo(C1[0], C1[1], C2[0], C2[1], P3[0], P3[1])
      ctx.stroke()
      ctx.restore()
      const bez = (u: number, i: number) => {
        const m = 1 - u
        return m * m * m * P0[i] + 3 * m * m * u * C1[i] + 3 * m * u * u * C2[i] + u * u * u * P3[i]
      }
      ctx.fillStyle = col.regular
      for (let i = 0; i < 2; i++) {
        const u = (t * 0.16 + i * 0.5) % 1
        const hx = bez(u, 0), hy = bez(u, 1), hs = 2.6
        ctx.beginPath()
        ctx.moveTo(hx, hy + hs * 0.9)
        ctx.bezierCurveTo(hx - hs * 1.3, hy - hs * 0.5, hx - hs * 0.4, hy - hs * 1.1, hx, hy - hs * 0.3)
        ctx.bezierCurveTo(hx + hs * 0.4, hy - hs * 1.1, hx + hs * 1.3, hy - hs * 0.5, hx, hy + hs * 0.9)
        ctx.fill()
      }
      ctx.fillStyle = '#8a5a0c'; ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'right'
      ctx.fillText('REGULARS', W - 12, (streetY + doorTopY) / 2); ctx.textAlign = 'left'
    }
  }, [col, height])

  const drawPerson = useCallback((ctx: CanvasRenderingContext2D, p: Person) => {
    const { streetY, doorTopY, rwY } = geom.current
    const doorX = 0.5 * geom.current.W
    const c = p.regular ? col.regular : p.state === 'street' ? col.stranger : p.state === 'glance' ? col.glance : col.committed
    /* perspective: people grow a little as they move down toward the door */
    const prog = Math.max(0, Math.min(1, (p.y - streetY) / (doorTopY - streetY)))
    const s = 0.82 + prog * 0.5
    const moving = p.state !== 'curious'
    const bob = moving ? Math.abs(Math.sin(p.ph)) * 1.3 * s : 0
    const x = p.x, y = p.y - bob
    const committed = p.state !== 'street' && p.state !== 'glance'

    /* soft ground shadow, anchored to the true (un-bobbed) foot line */
    ctx.globalAlpha = p.alpha * 0.12
    ctx.fillStyle = '#1d1d1f'
    ctx.beginPath(); ctx.ellipse(p.x, p.y + 9.5 * s, 4.2 * s, 1.5 * s, 0, 0, 7); ctx.fill()
    ctx.globalAlpha = p.alpha

    /* a warm halo around people on their way to you (green) and regulars (amber) */
    if (committed || p.regular) {
      const gc = p.regular ? '201,154,62' : '46,154,120'
      const gl = ctx.createRadialGradient(x, y - 2 * s, 1, x, y - 2 * s, 13 * s)
      gl.addColorStop(0, `rgba(${gc},${0.18 * p.alpha})`)
      gl.addColorStop(1, `rgba(${gc},0)`)
      ctx.fillStyle = gl
      ctx.beginPath(); ctx.arc(x, y - 2 * s, 13 * s, 0, 7); ctx.fill()
    }

    const sw = moving ? Math.sin(p.ph) * 2.2 * s : 0
    ctx.lineCap = 'round'
    /* legs */
    ctx.strokeStyle = c
    ctx.lineWidth = 2 * s
    ctx.beginPath(); ctx.moveTo(x, y + 3 * s); ctx.lineTo(x - sw, y + 9 * s); ctx.moveTo(x, y + 3 * s); ctx.lineTo(x + sw, y + 9 * s); ctx.stroke()
    /* torso — a soft rounded body */
    ctx.lineWidth = 5 * s
    ctx.beginPath(); ctx.moveTo(x, y - 3.5 * s); ctx.lineTo(x, y + 3 * s); ctx.stroke()
    /* head + a tiny highlight for form */
    const aware = p.state !== 'street'
    ctx.fillStyle = c
    ctx.beginPath(); ctx.arc(x + (aware ? 0.6 : 0), y - 8 * s, 3 * s, 0, 7); ctx.fill()
    ctx.fillStyle = 'rgba(255,255,255,.26)'
    ctx.beginPath(); ctx.arc(x - 1 * s, y - 9 * s, 1 * s, 0, 7); ctx.fill()

    /* the moment your reach lands on them: a soft glance toward you, and a
       little "found you" pin pops over their head — this IS awareness. */
    if (p.state === 'glance') {
      const gy = y - 9 * s
      const grad = ctx.createLinearGradient(x, gy, doorX, rwY)
      grad.addColorStop(0, 'rgba(74,189,152,.35)')
      grad.addColorStop(1, 'rgba(74,189,152,0)')
      ctx.strokeStyle = grad
      ctx.lineWidth = 1
      ctx.setLineDash([2, 3])
      ctx.beginPath(); ctx.moveTo(x, gy); ctx.lineTo(doorX, rwY - 4); ctx.stroke()
      ctx.setLineDash([])
      const py = y - 15 * s
      ctx.fillStyle = col.brandDark
      ctx.beginPath(); ctx.arc(x, py, 2.5 * s, 0, 7); ctx.fill()
      ctx.beginPath(); ctx.moveTo(x - 1.7 * s, py + 1.5 * s); ctx.lineTo(x + 1.7 * s, py + 1.5 * s); ctx.lineTo(x, py + 4.6 * s); ctx.closePath(); ctx.fill()
      ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(x, py, 0.95 * s, 0, 7); ctx.fill()
    }
    /* stage 2 · interest — they open your gallery: a little photo card of your
       food pops up over their head, with a spark of delight. THIS is the moment
       your photos win them over and pull them off the street. */
    if (p.state === 'curious') {
      const cx = x, cy = y - 16 * s
      ctx.fillStyle = '#fff'
      ctx.fillRect(cx - 6 * s, cy - 5 * s, 12 * s, 10 * s)
      ctx.strokeStyle = col.line; ctx.lineWidth = 0.8 * s
      ctx.strokeRect(cx - 6 * s, cy - 5 * s, 12 * s, 10 * s)
      ctx.fillStyle = '#e7b98a'
      ctx.fillRect(cx - 5 * s, cy - 4 * s, 10 * s, 8 * s)
      ctx.fillStyle = 'rgba(255,255,255,.55)'
      ctx.beginPath(); ctx.arc(cx - 1 * s, cy + 0.5 * s, 2 * s, 0, 7); ctx.fill()
      /* spark of delight */
      ctx.fillStyle = col.regular
      const sx = cx + 8 * s, sy = cy - 6 * s
      ctx.beginPath()
      ctx.moveTo(sx, sy - 2.8); ctx.lineTo(sx + 0.9, sy - 0.9); ctx.lineTo(sx + 2.8, sy); ctx.lineTo(sx + 0.9, sy + 0.9)
      ctx.lineTo(sx, sy + 2.8); ctx.lineTo(sx - 0.9, sy + 0.9); ctx.lineTo(sx - 2.8, sy); ctx.lineTo(sx - 0.9, sy - 0.9)
      ctx.closePath(); ctx.fill()
    }
    ctx.globalAlpha = 1
  }, [col])

  /* ── Reduced motion: one legible still per state, no animation. People are
     placed deterministically at whichever stages are unlocked. ── */
  const drawStill = useCallback((ctx: CanvasRenderingContext2D) => {
    const { W, streetY, curiousY, decideY, doorTopY } = geom.current
    const a = activeRef.current
    const doorX = 0.5 * W
    const seated = a[3] ? 3 : 0
    drawScene(ctx, seated, 0)
    const put = (state: PersonState, x: number, y: number, regular = false) =>
      drawPerson(ctx, { state, x, y, ph: 0, t: 0, regular, alpha: 1, jx: 0 })
    for (let i = 0; i < 7; i++) put(a[0] && i % 3 === 0 ? 'glance' : 'street', 30 + i * (W - 60) / 6, streetY)
    if (a[1]) { put('curious', doorX - 46, curiousY); put('curious', doorX + 38, curiousY) }
    if (a[2]) put('decide', doorX - 12, decideY)
    if (a[3]) put('enter', doorX, doorTopY + 20)
    if (a[4]) { put('street', 66, streetY, true); put('street', W - 90, streetY, true) }
  }, [drawScene, drawPerson])

  /* ── Canvas sizing (DPR-aware) ── */
  const resize = useCallback(() => {
    const cv = canvasRef.current
    if (!cv) return
    const cssW = cv.clientWidth || 400
    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    geom.current.W = cssW
    cv.width = cssW * dpr
    cv.height = height * dpr
    cv.style.height = `${height}px`
    const ctx = cv.getContext('2d')
    if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  }, [height])

  /* ── The live simulation loop ── */
  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    resize()
    const ro = new ResizeObserver(() => { resize(); if (reduced) drawStill(ctx) })
    if (wrapRef.current) ro.observe(wrapRef.current)

    if (reduced) {
      drawStill(ctx)
      /* Static, honest numbers for the still: the crowd passes; the door only
         counts when the whole chain through step 4 is on. */
      const a = activeRef.current
      setPassing(spawnCount)
      setDoor(a[0] && a[1] && a[2] && a[3] ? 3 : 0)
      return () => ro.disconnect()
    }

    if (peopleRef.current.length !== spawnCount) {
      peopleRef.current = Array.from({ length: spawnCount }, () => {
        const p = fresh(false)
        p.x = Math.random() * geom.current.W
        return p
      })
    }

    let raf = 0
    let last = performance.now()
    let lastUi = 0
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      const { W, streetY, curiousY, decideY, doorTopY } = geom.current
      const doorX = 0.5 * W
      const a = activeRef.current
      tRef.current += dt

      /* warm light motes near the doorway once guests are inside */
      const warmNow = Math.min(1, seatedRef.current / 4)
      const parts = particlesRef.current
      for (let i = parts.length - 1; i >= 0; i--) {
        const pt = parts[i]
        pt.life -= dt; pt.y -= pt.vy * dt; pt.x += pt.vx * dt
        if (pt.life <= 0) parts.splice(i, 1)
      }
      if (warmNow > 0.2 && parts.length < 7 && Math.random() < 3.5 * dt) {
        const max = 1.6 + Math.random() * 1.2
        parts.push({ x: doorX + (Math.random() * 44 - 22), y: doorTopY + 16, vy: 6 + Math.random() * 9, vx: Math.random() * 6 - 3, life: max, max, r: 0.8 + Math.random() * 0.9 })
      }

      ctx.clearRect(0, 0, W, height)
      drawScene(ctx, seatedRef.current, tRef.current)

      let passingNow = 0
      for (const p of peopleRef.current) {
        const rm = p.regular ? probs.regularBoost : 1
        const v = 44
        if (p.state === 'street') {
          passingNow++
          p.x += v * dt; p.ph += v * dt * 0.12
          p.y += (streetY - p.y) * Math.min(1, dt * 6)
          if (a[0] && p.x > 0.1 * W && p.x < 0.9 * W && Math.random() < probs.glance * rm * dt) p.state = 'glance'
          if (p.x > W + 10) Object.assign(p, fresh(false))
        } else if (p.state === 'glance') {
          passingNow++
          p.x += v * 0.92 * dt; p.ph += v * dt * 0.12
          if (a[1] && Math.random() < probs.curious * rm * dt) { p.state = 'curious'; p.t = 0; p.tx = doorX + p.jx }
          if (p.x > W + 10) Object.assign(p, fresh(false))
        } else if (p.state === 'curious') {
          p.t += dt
          p.x += ((p.tx ?? p.x) - p.x) * Math.min(1, dt * 4)
          p.y += (curiousY - p.y) * Math.min(1, dt * 4)
          if (a[2] && Math.random() < probs.decide * rm * dt) p.state = 'decide'
          else if (p.t > 2.6) p.state = 'leave' /* nothing to decide on — drift back */
        } else if (p.state === 'decide') {
          p.ph += v * dt * 0.14
          p.x += (doorX - p.x) * Math.min(1, dt * 2.6)
          p.y += (decideY - p.y) * Math.min(1, dt * 3)
          if (Math.abs(p.x - doorX) < 5 && Math.abs(p.y - decideY) < 6) {
            if (a[3]) p.state = 'enter'
            else { p.t += dt; if (p.t > 1.6) p.state = 'leave' } /* at the door, no way in */
          }
        } else if (p.state === 'enter') {
          p.x += (doorX - p.x) * Math.min(1, dt * 5)
          p.y += (doorTopY + 20 - p.y) * Math.min(1, dt * 3)
          p.alpha -= dt * 1.6
          p.ph += v * dt * 0.14
          if (p.alpha <= 0) {
            doorEmaRef.current += 1
            enteredRef.current += 1
            const back = a[4] && Math.random() < (goalRef.current ? probs.returnLoyalty : probs.returnVisits)
            Object.assign(p, fresh(back))
          }
        } else if (p.state === 'leave') {
          p.x += v * dt
          p.y += (streetY - p.y) * Math.min(1, dt * 3)
          p.ph += v * dt * 0.12
          if (p.x > W + 10) Object.assign(p, fresh(false))
        }
        drawPerson(ctx, p)
      }

      doorEmaRef.current += (0 - doorEmaRef.current) * dt * 0.5
      seatedRef.current = Math.min(4, doorEmaRef.current * 0.9)
      /* Push the smoothed numbers into React at ~4Hz, not every frame. */
      if (now - lastUi > 250) {
        lastUi = now
        setPassing(passingNow)
        setDoor(enteredRef.current)
      }
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reduced, spawnCount, height, fresh, drawScene, drawPerson, drawStill, resize, probs.glance, probs.curious, probs.decide, probs.regularBoost, probs.returnVisits, probs.returnLoyalty])

  /* Reduced-motion stills also need to react to toggles. */
  useEffect(() => {
    if (!reduced) return
    const ctx = canvasRef.current?.getContext('2d')
    if (!ctx) return
    drawStill(ctx)
    setDoor(active[0] && active[1] && active[2] && active[3] ? 3 : 0)
  }, [reduced, active, goalLoyalty, drawStill])

  const anyOn = active.some(Boolean)
  const pill = (on: boolean): React.CSSProperties => ({
    fontSize: 12.5, fontWeight: on ? 700 : 500, color: on ? col.brandDark : col.mute,
    border: `1px solid ${on ? col.brand : col.line}`, background: on ? col.brandSoft : '#fff',
    borderRadius: 999, padding: '6px 13px', cursor: 'pointer',
  })

  return (
    <div ref={wrapRef} style={{ background: '#fff', border: `0.5px solid ${col.line}`, borderRadius: 16, overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif", color: col.ink }}>
      {/* header */}
      <div style={{ padding: '18px 18px 13px', borderBottom: `0.5px solid ${col.line}` }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.09em', textTransform: 'uppercase', color: col.brandDark, marginBottom: 6 }}>{title}</div>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, lineHeight: 1.15 }}>{businessName}</div>
        <div style={{ fontSize: 12.5, color: col.mute, marginTop: 5, lineHeight: 1.45 }}>{intro}</div>
      </div>

      {/* live readout — one headline: how many of the crowd walk in */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '11px 20px', background: col.bg, borderBottom: `0.5px solid ${col.line}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 30, lineHeight: 1, color: col.brandDark }}>{door}</span>
          <span style={{ fontSize: 13, color: col.mute, fontWeight: 500 }}>walking in</span>
        </div>
        <div style={{ fontSize: 11, color: col.faint, marginTop: 4 }}>of {passing ?? '—'} strangers passing by</div>
      </div>

      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height }}
        aria-label="A street at the top with a crowd walking past, and the restaurant at the bottom. As services turn on, people glance, then peel down to look closer, then walk with purpose toward the door, then step inside; regulars loop back."
      />

      <div aria-live="polite" style={{ textAlign: 'center', fontSize: 12.5, color: col.mute, padding: '8px 20px 0', minHeight: 20, opacity: anyOn ? 0 : 1, transition: 'opacity .3s' }}>
        Right now strangers just walk past. Switch on a service to start the journey. ↓
      </div>

      {/* goal selector — re-weights the return loop */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '13px 18px 2px', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: col.ink }}>Your goal:</span>
        <button onClick={() => setGoalLoyalty(false)} aria-pressed={!goalLoyalty} style={pill(!goalLoyalty)}>More visits</button>
        <button onClick={() => setGoalLoyalty(true)} aria-pressed={goalLoyalty} style={pill(goalLoyalty)}>More loyalty</button>
      </div>

      {/* the service chain */}
      <div style={{ padding: '12px 14px 4px' }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: col.faint, padding: '0 4px 8px' }}>Services — each unlocks the next real step</div>
        {services.map((s, i) => {
          const on = active[i]
          return (
            <button
              key={s.name}
              onClick={() => setActive((prev) => prev.map((v, j) => (j === i ? !v : v)))}
              aria-pressed={on}
              style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: on ? col.brandSoft : '#fff', border: `1px solid ${on ? col.brandLine : col.line}`, borderRadius: 13, padding: '11px 13px', marginBottom: 8, cursor: 'pointer', transition: 'background .15s, border-color .15s' }}
            >
              <span aria-hidden style={{ flexShrink: 0, width: 38, height: 22, borderRadius: 999, background: on ? col.brand : '#dfe1e4', position: 'relative', transition: 'background .2s' }}>
                <span style={{ position: 'absolute', top: 2, left: 2, width: 18, height: 18, borderRadius: '50%', background: '#fff', transition: 'transform .2s', transform: on ? 'translateX(16px)' : 'none', boxShadow: '0 1px 2px rgba(0,0,0,.12)' }} />
              </span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13.5, fontWeight: 600, color: col.ink }}>{s.name}</span>
                <span style={{ display: 'block', fontSize: 11, color: col.faint, marginTop: 2 }}>{s.does}</span>
              </span>
            </button>
          )
        })}
      </div>

      <div style={{ padding: '4px 18px 16px', fontSize: 11.5, color: col.faint, lineHeight: 1.5 }}>
        Illustrative. The numbers are examples; the real version scales to your true nearby audience.
      </div>
    </div>
  )
}
