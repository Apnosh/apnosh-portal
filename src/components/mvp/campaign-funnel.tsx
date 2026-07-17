'use client'

/**
 * CampaignFunnel — an owner-facing "how did this promo perform" results view,
 * built to match the Oyster & Wine Night design mock: each funnel stage is a
 * glowing MAGNET that pulls a swarm of little people toward it, shrinking as
 * the funnel narrows (reach -> clicked -> reserved -> turned up -> would
 * return). Conversion rates sit between the magnets, and the biggest leak gets
 * a red-flag callout, so the owner sees exactly where people slipped away.
 *
 * Skinned in the portal design system (brand green, amber for the leak, Cal
 * Sans display). Self-contained: HTML header/stats + a canvas magnet field on
 * requestAnimationFrame. All data via props with the Oyster Night promo as the
 * mock default. Honors prefers-reduced-motion (static swarm, no orbiting).
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Wine, Plus, Check, X } from 'lucide-react'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenInk: '#1c6b52', greenSoft: '#eaf7f3',
  amber: '#c99a3e', amberDk: '#a9822f', amberInk: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7',
}
const HEAD_TOP = '#12503a'
const HEAD_BOT = '#1e6f54'
const DISPLAY = "'Cal Sans','Inter',sans-serif"

export interface FunnelStage {
  key: string
  label: string
  /** small line under the number, e.g. "reach" */
  sub?: string
  count: number
  tone?: 'green' | 'amber'
  /** conversion caption to the NEXT stage, e.g. "29% clicked" */
  conv?: string
  /** the leak callout that replaces the plain conversion pill after this stage */
  warn?: { title: string; note: string }
}

export interface CampaignFunnelProps {
  campaignName?: string
  kicker?: string
  intro?: string
  /** template for the stages (labels/tones/keys); counts + conversions are
      computed live from the chosen marketing pieces */
  stages?: FunnelStage[]
  /** the marketing plays available on each stage (keyed by stage key). Defaults
      to the Oyster Night mock catalog; pass real catalog plays to ground it. */
  pieces?: Record<string, Piece[]>
  /** which plays start selected per stage (defaults to the mock selection). */
  initialSelected?: Record<string, string[]>
  /** fired whenever the selection changes (skips the first mount) — the caller
      persists it (e.g. onto a real campaign's line items). */
  onChange?: (selected: Record<string, string[]>) => void
  /** money symbol for revenue + ROI (mock is £; real US campaigns pass $). */
  currency?: string
  /** read-only: the funnel still explains, but plays can't be toggled (a shipped
      campaign's plan is locked). */
  readOnly?: boolean
  /** the reach that fills the funnel to its default size. The funnel scales
      ABSOLUTELY off this — above it the funnel grows, below it it shrinks — so
      adding plays (more reach / conversion) visibly enlarges the whole thing. */
  refReach?: number
  height?: number
  /** How the numbers are framed:
      'projected' (default) — the demo/mock: computed counts + Revenue + ROI show plainly;
      'example'   — a real pre-purchase campaign: projections show, labeled an example;
      'gathering' — a SHIPPED real campaign: NO computed counts/Revenue/ROI (they would be
      fabricated); the header says "Still gathering" until real numbers exist. */
  moneyMode?: 'projected' | 'example' | 'gathering'
  /** The owner's real average spend per visit (from Insights), used for projected
      revenue when known; null falls back to the generic example figure. */
  spendPerHead?: number | null
}

const DEFAULT_STAGES: FunnelStage[] = [
  { key: 'saw', label: 'Saw the promo', sub: 'reach', count: 1800, tone: 'green', conv: '29% clicked' },
  { key: 'clicked', label: 'Clicked through', sub: 'read the details', count: 520, tone: 'amber', warn: { title: 'Only 18% reserved', note: '424 read the details but didn’t book' } },
  { key: 'reserved', label: 'Reserved', sub: 'booked a table', count: 96, tone: 'green', conv: '77% turned up' },
  { key: 'turnedup', label: 'Turned up', sub: 'on the night', count: 74, tone: 'green', conv: '59% would return' },
  { key: 'return', label: 'Would return', sub: 'rebooked', count: 44, tone: 'green' },
]

/* The marketing "pieces" you can add to each stage — the builder concept:
   tap a magnet, add the plays that drive that step of the funnel. */
const BUILDER_Q: Record<string, string> = {
  saw: 'What puts you in front of people?',
  clicked: 'What makes them look closer?',
  reserved: 'What gets them to book?',
  turnedup: 'What makes sure they show?',
  return: 'What brings them back?',
}
/* Each piece carries its effect: `reach` (top-of-funnel people, for awareness
   pieces) or `lift` (added conversion into that stage), plus a `cost`. Toggling
   pieces recomputes the whole funnel + revenue + ROI. */
export interface Piece { id: string; name: string; reach?: number; lift?: number; cost: number; cadence?: 'one-time' | 'monthly' | 'per-unit'; extras?: { amount: number; per: 'mo' | 'ea' }[] }
const PIECES: Record<string, Piece[]> = {
  saw: [
    { id: 'gbp', name: 'Google Business post', reach: 500, cost: 0 },
    { id: 'ig', name: 'Instagram + TikTok post', reach: 700, cost: 0 },
    { id: 'boost', name: 'Paid local boost', reach: 600, cost: 60 },
    { id: 'flyer', name: 'Flyer + QR in the window', reach: 250, cost: 15 },
    { id: 'influencer', name: 'Local food influencer', reach: 900, cost: 80 },
  ],
  clicked: [
    { id: 'photos', name: 'Great event photos', lift: 0.10, cost: 35 },
    { id: 'page', name: 'Event landing page', lift: 0.06, cost: 25 },
    { id: 'menu', name: 'Oyster menu highlight', lift: 0.05, cost: 20 },
    { id: 'story', name: 'Behind-the-scenes story', lift: 0.04, cost: 15 },
  ],
  reserved: [
    { id: 'offer', name: 'Limited-seats offer', lift: 0.08, cost: 20 },
    { id: 'reserve', name: 'One-tap reserve link', lift: 0.05, cost: 15 },
    { id: 'deposit', name: 'Small deposit to hold', lift: 0.03, cost: 10 },
    { id: 'urgency', name: '“Almost full” nudge', lift: 0.03, cost: 10 },
  ],
  turnedup: [
    { id: 'remind', name: 'Day-before reminder text', lift: 0.27, cost: 12 },
    { id: 'email', name: 'Morning-of email', lift: 0.12, cost: 10 },
    { id: 'waitlist', name: 'Fill from the waitlist', lift: 0.08, cost: 8 },
  ],
  return: [
    { id: 'thanks', name: 'Thank-you + review ask', lift: 0.24, cost: 8 },
    { id: 'loyalty', name: 'Loyalty perk', lift: 0.18, cost: 20 },
    { id: 'invite', name: 'Invite to the next one', lift: 0.10, cost: 12 },
    { id: 'winback', name: 'Win-back in 3 weeks', lift: 0.10, cost: 15 },
  ],
}
const DEFAULT_SELECTED: Record<string, string[]> = {
  saw: ['gbp', 'ig', 'boost'],
  clicked: ['photos', 'page'],
  reserved: ['offer', 'reserve'],
  turnedup: ['remind'],
  return: ['thanks'],
}

/* Base conversion into each stage (before pieces) + a ceiling, and spend/head.
   Tuned so the default selection reproduces the ~1,800 → 44, £2.8k, 15× mock. */
const BASE: Record<string, number> = { clicked: 0.13, reserved: 0.05, turnedup: 0.50, return: 0.35 }
const CAP: Record<string, number> = { clicked: 0.85, reserved: 0.6, turnedup: 0.95, return: 0.9 }
const SPEND_PER_HEAD = 38

/* Recompute the whole funnel from the chosen pieces. */
function computeLive(template: FunnelStage[], selected: Record<string, string[]>, pieces: Record<string, Piece[]>, currency: string, moneyMode: 'projected' | 'example' | 'gathering' = 'projected', spendPerHead?: number | null) {
  const sel = (k: string) => selected[k] ?? []
  const piece = (k: string, id: string) => (pieces[k] ?? []).find((p) => p.id === id)
  const rate = (k: string) => {
    const lift = sel(k).reduce((s, id) => s + (piece(k, id)?.lift ?? 0), 0)
    return Math.max(0.02, Math.min(CAP[k] ?? 0.9, (BASE[k] ?? 0) + lift))
  }
  const c0 = Math.max(80, Math.round(sel('saw').reduce((s, id) => s + (piece('saw', id)?.reach ?? 0), 0)))
  const c1 = Math.round(c0 * rate('clicked'))
  const c2 = Math.round(c1 * rate('reserved'))
  const c3 = Math.round(c2 * rate('turnedup'))
  const c4 = Math.round(c3 * rate('return'))
  const counts = [c0, c1, c2, c3, c4]
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0)

  const stages: FunnelStage[] = template.map((s, i) => {
    const st: FunnelStage = { ...s, count: counts[i], conv: undefined, warn: undefined }
    if (s.key === 'saw') st.conv = `${pct(c1, c0)}% clicked`
    else if (s.key === 'clicked') st.warn = { title: `Only ${pct(c2, c1)}% reserved`, note: `${(c1 - c2).toLocaleString()} read the details but didn’t book` }
    else if (s.key === 'reserved') st.conv = `${pct(c3, c2)}% turned up`
    else if (s.key === 'turnedup') st.conv = `${pct(c4, c3)}% would return`
    return st
  })

  let cost = 0
  for (const k of Object.keys(pieces)) for (const id of sel(k)) { const p = piece(k, id); cost += (p?.cost ?? 0) + (p?.extras?.reduce((s, e) => s + e.amount, 0) ?? 0) }

  // A SHIPPED real campaign shows NO computed counts or money — they would be fabricated.
  // The header says "Still gathering"; the canvas draws the plan's shape without numbers.
  if (moneyMode === 'gathering') {
    return {
      stages: stages.map((st) => ({ ...st, conv: undefined, warn: undefined })),
      stats: [] as { value: string; label: string }[],
      roi: null as string | null,
      hideNumbers: true,
    }
  }

  const perHead = spendPerHead && spendPerHead > 0 ? spendPerHead : SPEND_PER_HEAD
  const revenue = c3 * perHead
  const money = (n: number) => currency + (n >= 1000 ? (n / 1000).toFixed(1) + 'k' : String(n))
  const stats = [
    { value: c0.toLocaleString(), label: 'Reached' },
    { value: c2.toLocaleString(), label: 'Reserved' },
    { value: c3.toLocaleString(), label: 'Turned up' },
    { value: money(revenue), label: 'Revenue' },
  ]
  const roi: string | null = cost > 0 ? `${Math.round(revenue / cost)}×` : 'free'
  return { stages, stats, roi, hideNumbers: false }
}

/* A person flowing DOWN the funnel. `lane` is a fixed horizontal position in
   [-1,1]; multiplied by the funnel's width at the current depth, it converges
   toward the centre as the funnel narrows. At each stage boundary a traveler
   either continues or, per the real conversion rate, peels off ("leak"). */
interface Traveler { lane: number; y: number; vy: number; phase: number; boundary: number; state: 'flow' | 'leak'; leakX: number; leakVx: number; alpha: number }

export default function CampaignFunnel({
  campaignName = 'Oyster & Wine Night',
  kicker = 'Event promo · Fri 14 Mar',
  intro = 'Each stage is a magnet. Build the plays that drive it and watch the funnel respond, live.',
  stages: template = DEFAULT_STAGES,
  pieces = PIECES,
  initialSelected,
  onChange,
  currency = '£',
  readOnly = false,
  refReach = 1800,
  height = 620,
  moneyMode = 'projected',
  spendPerHead = null,
}: CampaignFunnelProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const particlesRef = useRef<Traveler[]>([])
  const rDispRef = useRef<number[]>([])
  const tRef = useRef(0)
  const [reduced, setReduced] = useState(false)
  /* builder: which stage's editor is open, and the pieces chosen per stage */
  const [openStage, setOpenStage] = useState<number | null>(null)
  const [selected, setSelected] = useState<Record<string, string[]>>(() => ({ ...(initialSelected ?? DEFAULT_SELECTED) }))
  const selectedRef = useRef(selected)
  selectedRef.current = selected

  /* tell the caller when the selection changes so it can persist — but never on
     first mount (that's just the loaded state, nothing to save) */
  const firstRun = useRef(true)
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return }
    onChange?.(selected)
    // onChange identity is caller-stable; depend only on the selection
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  /* the funnel counts, conversions, revenue + ROI all derive from the chosen
     pieces, so building a stage visibly moves the whole funnel */
  const { stages, stats, roi, hideNumbers } = useMemo(() => computeLive(template, selected, pieces, currency, moneyMode, spendPerHead), [template, selected, pieces, currency, moneyMode, spendPerHead])

  const geom = useRef({ W: 400 })

  /* Per-stage layout that doesn't depend on width: y position + orb radius.
     Radius is scaled ABSOLUTELY off `refReach` (not normalized to the current
     top), so a stage of `refReach` people is rMax and every stage measures off
     that same yardstick — adding plays grows the whole funnel, removing them
     shrinks it. Capped at 1.5× so a big reach can't overflow the card, floored
     at rMin so a tiny count stays visible. */
  const layout = useMemo(() => {
    const n = stages.length
    const yTop = 104, yBot = height - 58 // room above the first circle for an open mouth
    // bigger mouth (rMax up) = a stronger funnel: the top dominates and the gap
    // to the next circle widens (more disparity); a low stage still shrinks
    // honestly and gets flagged in a concern colour.
    const rMin = 15, rMax = 70
    const rOf = (count: number) => rMin + (rMax - rMin) * Math.min(1.5, Math.sqrt(count / Math.max(1, refReach)))
    return stages.map((s, i) => ({
      y: yTop + (n > 1 ? (i * (yBot - yTop)) / (n - 1) : 0),
      r: rOf(s.count),
      side: 1, // number/label always live in the right-hand ledger now
      dx: 0, // circles + river run straight down the left spine
      dots: Math.max(5, Math.min(30, Math.round(s.count / 55))),
    }))
  }, [stages, height, refReach])

  /* smoothly-eased display radius per stage — the orb (and the vessel + stream
     that hug it) GROW toward the new size when you toggle plays, so you watch
     the funnel respond instead of it snapping. Falls back to the target radius
     until the frame loop has populated it (and in reduced-motion). */
  const rAt = useCallback((i: number) => rDispRef.current[i] ?? layout[i].r, [layout])
  /* horizontal offset of the funnel's centre-line at depth y — interpolates the
     per-stage zig-zag so the vessel + stream weave with the orbs */
  const centerXAt = useCallback((y: number) => {
    const n = layout.length
    if (y <= layout[0].y) return layout[0].dx
    for (let i = 0; i < n - 1; i++) {
      if (y <= layout[i + 1].y) {
        const f = (y - layout[i].y) / Math.max(1, layout[i + 1].y - layout[i].y)
        return layout[i].dx + (layout[i + 1].dx - layout[i].dx) * f
      }
    }
    return layout[n - 1].dx
  }, [layout])

  /* fraction of each stage that survives to the next — drives the drop-off */
  const survival = useMemo(
    () => stages.map((s, i) => (i < stages.length - 1 ? Math.min(1, stages[i + 1].count / Math.max(1, s.count)) : 0)),
    [stages],
  )
  const flowTop = useMemo(() => (layout[0]?.y ?? 74) - (layout[0]?.r ?? 40) - 8, [layout])
  const flowBot = useMemo(() => { const L = layout[layout.length - 1]; return (L?.y ?? height - 58) + (L?.r ?? 20) + 12 }, [layout, height])

  /* Half-width of the funnel at depth y — interpolates the orb radii, so the
     cone of people hugs the magnets and narrows in step with them. */
  const spreadAt = useCallback((y: number) => {
    const n = layout.length
    if (y <= layout[0].y) return rAt(0) * 1.12
    for (let i = 0; i < n - 1; i++) {
      if (y <= layout[i + 1].y) {
        const f = (y - layout[i].y) / Math.max(1, layout[i + 1].y - layout[i].y)
        return rAt(i) + (rAt(i + 1) - rAt(i)) * f
      }
    }
    return rAt(n - 1)
  }, [layout, rAt])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const on = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  const draw = useCallback((ctx: CanvasRenderingContext2D, t: number) => {
    const { W } = geom.current
    const cx = Math.round(W * 0.22)     // the river's left-anchored spine
    const labelX = Math.round(W * 0.44) // the right-hand ledger column (wider now)
    const n = stages.length
    ctx.clearRect(0, 0, W, height)
    if (!layout.length) return

    // the single weakest step — the stage reached by the worst conversion (below
    // 25%) — gets a concern colour, so an honestly-small count reads as a flag.
    const CONCERN = '#c2410c'
    let concernStage = -1, worstRate = 0.25
    for (let i = 0; i < stages.length - 1; i++) {
      const a = stages[i].count, b = stages[i + 1].count
      if (a > 0 && b / a < worstRate) { worstRate = b / a; concernStage = i + 1 }
    }

    /* ── the funnel VESSEL: a soft tapering glass shape traced through the orb
       edges, flared into a mouth at the top and a narrow spout at the bottom, so
       the whole silhouette reads as one funnel that pinches from wide to narrow ── */
    const cxi = (i: number) => cx + layout[i].dx
    const topY = 8 // open the mouth right up to the top of the canvas
    const botY = layout[n - 1].y + rAt(n - 1) + 16
    // a WIDE, OPEN funnel mouth: at least as wide as the top circle (so it never
    // pinches shut), flaring out as far as safely fits before the ledger / edge.
    const mouthW = Math.max(rAt(0), Math.min(rAt(0) * 1.4, cxi(0) - 8, labelX - cxi(0) - 12))
    // the river's nodes: the open mouth, each circle (half-width = its radius, so
    // the banks hug the circle), then a thin outflow
    const nodes = [
      { x: cxi(0), y: topY, w: mouthW },
      ...layout.map((L, i) => ({ x: cxi(i), y: L.y, w: rAt(i) })),
      { x: cxi(n - 1), y: botY, w: Math.max(7, rAt(n - 1) * 0.5) },
    ]
    const leftPts = nodes.map((p) => [p.x - p.w, p.y])
    const rightPts = nodes.map((p) => [p.x + p.w, p.y])
    // Catmull-Rom → bezier: a smooth flowing curve through the bank points
    const flow = (pts: number[][], moveToFirst: boolean) => {
      if (moveToFirst) ctx.moveTo(pts[0][0], pts[0][1]); else ctx.lineTo(pts[0][0], pts[0][1])
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] ?? pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] ?? p2
        ctx.bezierCurveTo(p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6, p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6, p2[0], p2[1])
      }
    }
    const vg = ctx.createLinearGradient(0, topY, 0, botY)
    vg.addColorStop(0, 'rgba(74,189,152,.12)')
    vg.addColorStop(0.6, 'rgba(74,189,152,.05)')
    vg.addColorStop(1, 'rgba(74,189,152,.02)')
    ctx.beginPath(); flow(leftPts, true); flow([...rightPts].reverse(), false); ctx.closePath()
    ctx.fillStyle = vg; ctx.fill()
    // soft banks
    ctx.lineWidth = 1.3
    ctx.lineJoin = 'round'
    ctx.strokeStyle = 'rgba(74,189,152,.24)'
    ctx.beginPath(); flow(leftPts, true); ctx.stroke()
    ctx.beginPath(); flow(rightPts, true); ctx.stroke()

    /* ── the crowd: a soft stream of translucent beads pouring down the vessel,
       converging as it narrows; drop-offs peel off amber and fade out ── */
    for (const tr of particlesRef.current) {
      const leak = tr.state === 'leak'
      const x = leak ? tr.leakX : cx + centerXAt(tr.y) + tr.lane * spreadAt(tr.y) + Math.sin(t * 1.4 + tr.phase) * 1.6
      const y = tr.y
      const a = leak ? Math.max(0, tr.alpha) * 0.7 : 0.5
      ctx.globalAlpha = a
      ctx.fillStyle = leak ? C.amber : C.green
      ctx.beginPath(); ctx.arc(x, y, leak ? 1.9 : 2.2, 0, 7); ctx.fill()
      ctx.globalAlpha = a * 0.65
      ctx.fillStyle = leak ? '#f2ddb0' : '#c4f0e3'
      ctx.beginPath(); ctx.arc(x - 0.5, y - 0.7, 0.95, 0, 7); ctx.fill()
    }
    ctx.globalAlpha = 1

    /* ── the magnets: soft tinted beads with a colored drop shadow for depth
       (no white glow) ── */
    stages.forEach((s, i) => {
      const L = layout[i]
      const ox = cx + L.dx, oy = L.y, r = rAt(i)
      const amber = s.tone === 'amber'
      const rgb = amber ? '201,154,62' : '74,189,152'

      // soft tinted body + a colored drop shadow (depth without any white)
      ctx.save()
      ctx.shadowColor = amber ? 'rgba(169,130,47,.24)' : 'rgba(46,154,120,.28)'
      ctx.shadowBlur = 13
      ctx.shadowOffsetY = 4
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7)
      ctx.fillStyle = amber ? C.amberBg : C.greenSoft
      ctx.fill()
      ctx.restore()

      // a whisper of same-hue edge shading, so it still reads round (no white)
      const g = ctx.createRadialGradient(ox, oy, r * 0.35, ox, oy, r)
      g.addColorStop(0, `rgba(${rgb},0)`)
      g.addColorStop(1, `rgba(${rgb},.15)`)
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.fillStyle = g; ctx.fill()

      // ring
      ctx.lineWidth = 1.4
      ctx.strokeStyle = `rgba(${rgb},.5)`
      if (amber) ctx.setLineDash([4, 4])
      ctx.beginPath(); ctx.arc(ox, oy, r, 0, 7); ctx.stroke()
      ctx.setLineDash([])

      // core dot
      ctx.fillStyle = amber ? C.amberDk : C.greenDk
      ctx.beginPath(); ctx.arc(ox, oy, 2.3, 0, 7); ctx.fill()

      // how many builder plays are on this stage — a tappable count badge
      const nSel = selectedRef.current[s.key]?.length ?? 0
      const bx = ox + r * 0.72, by = oy - r * 0.72
      ctx.save()
      ctx.shadowColor = 'rgba(0,0,0,.14)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1
      ctx.fillStyle = nSel > 0 ? (amber ? C.amberDk : C.greenDk) : '#ffffff'
      ctx.beginPath(); ctx.arc(bx, by, 8.5, 0, 7); ctx.fill()
      ctx.restore()
      if (nSel === 0) { ctx.strokeStyle = C.line; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(bx, by, 8.5, 0, 7); ctx.stroke() }
      ctx.fillStyle = nSel > 0 ? '#fff' : C.faint
      ctx.font = '700 10px Inter, sans-serif'; ctx.textAlign = 'center'
      ctx.fillText(nSel > 0 ? String(nSel) : '+', bx, by + 3.4); ctx.textAlign = 'left'

      // right-hand ledger row: name → big number → sub, left-aligned
      ctx.textAlign = 'left'
      ctx.fillStyle = C.ink
      ctx.font = '600 12px Inter, sans-serif'
      ctx.fillText(fit(ctx, s.label, W - labelX - 14), labelX, oy - 14)
      ctx.fillStyle = i === concernStage ? CONCERN : amber ? C.amberInk : C.greenInk
      ctx.font = `600 30px ${DISPLAY}`
      // A shipped campaign draws NO invented counts — the shape is the plan, the numbers wait.
      ctx.fillText(hideNumbers ? '—' : s.count.toLocaleString(), labelX, oy + 11)
      if (s.sub) {
        ctx.fillStyle = C.faint
        ctx.font = '500 10px Inter, sans-serif'
        ctx.fillText(s.sub, labelX, oy + 26)
      }
    })

    /* ── between-stage transitions, in the ledger column: the conversion + how
       many slipped away, or the amber leak callout for the biggest drop-off ── */
    for (let i = 0; i < stages.length - 1; i++) {
      const s = stages[i]
      const midY = (layout[i].y + rAt(i) + (layout[i + 1].y - rAt(i + 1))) / 2
      ctx.textAlign = 'left'
      if (s.warn) {
        ctx.fillStyle = C.amberInk
        ctx.font = '700 11px Inter, sans-serif'
        ctx.fillText('⚠  ' + s.warn.title, labelX, midY - 1)
        ctx.fillStyle = C.amberDk
        ctx.font = '500 10px Inter, sans-serif'
        ctx.fillText(fit(ctx, s.warn.note, W - labelX - 14), labelX, midY + 12)
      } else if (s.conv) {
        ctx.fillStyle = s.tone === 'amber' ? C.amberDk : C.greenInk
        ctx.font = '600 10.5px Inter, sans-serif'
        ctx.fillText('↓ ' + s.conv, labelX, midY - 1)
        const lost = s.count - stages[i + 1].count
        if (lost > 0) {
          const worst = i + 1 === concernStage
          ctx.font = `${worst ? 600 : 500} 9.5px Inter, sans-serif`
          ctx.fillStyle = worst ? CONCERN : '#b1554e'
          ctx.fillText((worst ? '⚠ ' : '') + lost.toLocaleString() + ' slipped away', labelX, midY + 12)
        }
      }
    }
  }, [layout, stages, height, spreadAt, rAt, centerXAt, hideNumbers])

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

  /* Seed the funnel with travelers spread down the descent (biased to the top,
     so it already reads as a funnel), each in a fixed horizontal lane so the
     stream converges as the walls narrow. */
  useEffect(() => {
    const n = layout.length
    const midY = (i: number) => (layout[i].y + layout[i + 1].y) / 2
    const boundaryFor = (y: number) => { let b = 0; while (b < n - 1 && y >= midY(b)) b++; return b }
    // more reach → a denser crowd, so "bigger" is felt in the stream too
    const N = Math.max(45, Math.min(150, Math.round((stages[0]?.count ?? refReach) / 18)))
    const ts: Traveler[] = []
    for (let k = 0; k < N; k++) {
      const y = flowTop + (flowBot - flowTop) * Math.pow(Math.random(), 1.7)
      ts.push({ lane: Math.random() * 2 - 1, y, vy: 34 + Math.random() * 18, phase: Math.random() * 6, boundary: boundaryFor(y), state: 'flow', leakX: 0, leakVx: 0, alpha: 1 })
    }
    particlesRef.current = ts
  }, [layout, flowTop, flowBot, stages, refReach])

  useEffect(() => {
    const cv = canvasRef.current
    const ctx = cv?.getContext('2d')
    if (!cv || !ctx) return
    resize()
    const ro = new ResizeObserver(() => { resize(); if (reduced) draw(ctx, 0) })
    if (wrapRef.current) ro.observe(wrapRef.current)

    if (reduced) { draw(ctx, 0); return () => ro.disconnect() }

    let raf = 0
    let last = performance.now()
    const frame = (now: number) => {
      const dt = Math.min((now - last) / 1000, 0.05)
      last = now
      tRef.current += dt
      const cx = Math.round(geom.current.W * 0.22)
      const n = layout.length
      const midY = (i: number) => (layout[i].y + layout[i + 1].y) / 2
      const respawn = (tr: Traveler) => {
        tr.lane = Math.random() * 2 - 1
        tr.y = flowTop - Math.random() * 26
        tr.vy = 34 + Math.random() * 18
        tr.phase = Math.random() * 6
        tr.boundary = 0; tr.state = 'flow'; tr.alpha = 1
      }
      for (const tr of particlesRef.current) {
        if (tr.state === 'leak') {
          tr.y += tr.vy * 0.4 * dt
          tr.leakX += tr.leakVx * dt
          tr.alpha -= dt * 1.3
          if (tr.alpha <= 0) respawn(tr)
          continue
        }
        /* slow down as they pass through a magnet, so a gentle cluster forms */
        let slow = 1
        for (let i = 0; i < n; i++) { if (Math.abs(tr.y - layout[i].y) < layout[i].r * 0.8) { slow = 0.5; break } }
        tr.y += tr.vy * slow * dt
        let guard = 0
        while (tr.boundary < n - 1 && tr.y >= midY(tr.boundary) && guard++ < 6) {
          if (Math.random() < survival[tr.boundary]) tr.boundary++
          else {
            tr.state = 'leak'
            tr.leakX = cx + centerXAt(tr.y) + tr.lane * spreadAt(tr.y)
            tr.leakVx = (tr.lane >= 0 ? 1 : -1) * (16 + Math.random() * 22)
            break
          }
        }
        if (tr.state === 'flow' && tr.y > flowBot) respawn(tr)
      }
      // ease each orb toward its target size so the funnel visibly grows/shrinks
      // as plays are toggled, instead of snapping to the new size
      for (let i = 0; i < layout.length; i++) {
        const cur = rDispRef.current[i]
        rDispRef.current[i] = cur == null ? layout[i].r : cur + (layout[i].r - cur) * Math.min(1, dt * 7)
      }
      draw(ctx, tRef.current)
      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [reduced, draw, resize, layout, survival, spreadAt, centerXAt, flowTop, flowBot])

  /* keep the orb badges fresh when toggling pieces in reduced-motion mode */
  useEffect(() => {
    if (!reduced) return
    const ctx = canvasRef.current?.getContext('2d')
    if (ctx) draw(ctx, 0)
  }, [selected, reduced, draw])

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const cv = canvasRef.current
    if (!cv) return
    const rect = cv.getBoundingClientRect()
    const mx = e.clientX - rect.left, my = e.clientY - rect.top
    const cx = Math.round(geom.current.W * 0.22)
    for (let i = 0; i < stages.length; i++) {
      const ddx = mx - (cx + layout[i].dx), dy = my - layout[i].y
      if (ddx * ddx + dy * dy <= (layout[i].r + 12) ** 2) { setOpenStage(i); return }
    }
  }

  return (
    <div ref={wrapRef} style={{ position: 'relative', background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 20, overflow: 'hidden', fontFamily: "'Inter',system-ui,sans-serif", color: C.ink, boxShadow: '0 24px 60px -24px rgba(18,80,58,.30), 0 6px 18px -6px rgba(0,0,0,.06)' }}>
      {/* header — dark green, with the ROI badge */}
      <div style={{ background: `linear-gradient(160deg, ${HEAD_BOT}, ${HEAD_TOP})`, color: '#fff', padding: '16px 16px 14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 10, background: 'rgba(201,154,62,.9)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><Wine size={18} color="#3a2a06" /></div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, lineHeight: 1.1 }}>{campaignName}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.72)', marginTop: 2 }}>{kicker}</div>
          </div>
          {roi != null && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 21, lineHeight: 1, color: '#f0c977' }}>{roi}</div>
              <div style={{ fontSize: 8.5, letterSpacing: '.14em', color: 'rgba(255,255,255,.6)', marginTop: 2 }}>{moneyMode === 'example' ? 'ROI · EXAMPLE' : 'ROI'}</div>
            </div>
          )}
        </div>
        {stats.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: `repeat(${stats.length},1fr)`, marginTop: 15, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, overflow: 'hidden', backdropFilter: 'blur(6px)' }}>
            {stats.map((s, i) => (
              <div key={s.label} style={{ padding: '9px 6px', textAlign: 'center', borderLeft: i ? '1px solid rgba(255,255,255,.12)' : 'none' }}>
                <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, lineHeight: 1 }}>{s.value}</div>
                <div style={{ fontSize: 8.5, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.6)', marginTop: 4 }}>{s.label}</div>
              </div>
            ))}
          </div>
        )}
        {moneyMode === 'example' && (
          <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,.78)', lineHeight: 1.4 }}>
            These numbers are an example, not your numbers.{spendPerHead && spendPerHead > 0 ? ` Revenue uses your average check ($${spendPerHead}).` : ''}
          </div>
        )}
        {moneyMode === 'gathering' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 15, background: 'rgba(255,255,255,.09)', border: '1px solid rgba(255,255,255,.14)', borderRadius: 12, padding: '10px 12px' }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 14 }}>Still gathering</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.72)' }}>Real numbers show here once they come in. Nothing here is made up.</div>
          </div>
        )}
      </div>

      <div style={{ padding: '12px 18px 0', fontSize: 12.5, color: C.mute, lineHeight: 1.5 }}>{intro}</div>
      <div style={{ padding: '4px 18px 2px', fontSize: 11.5, fontWeight: 600, color: C.greenDk }}>{readOnly ? 'Tap any stage to see what drove it →' : 'Tap any stage to build what drives it →'}</div>

      <canvas
        ref={canvasRef}
        onClick={onCanvasClick}
        style={{ display: 'block', width: '100%', height, cursor: 'pointer' }}
        aria-label="A vertical funnel where each stage is a glowing magnet pulling a swarm of people toward it: saw the promo, clicked through, reserved, turned up, would return, with the conversion rate and biggest drop-off between them. Tap a stage to edit the marketing pieces driving it."
      />

      {openStage != null && (
        <StageBuilder
          stage={stages[openStage]}
          pieces={pieces[stages[openStage].key] ?? []}
          selected={selected[stages[openStage].key] ?? []}
          readOnly={readOnly}
          currency={currency}
          hideCount={hideNumbers}
          onToggle={(id) => setSelected((prev) => {
            const key = stages[openStage].key
            const cur = prev[key] ?? []
            return { ...prev, [key]: cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id] }
          })}
          onClose={() => setOpenStage(null)}
        />
      )}
    </div>
  )
}

/* The builder sheet for one funnel stage — add/remove the marketing pieces
   that drive it, the same "pick your plays" concept as the campaign builder.
   Plays + prices come from the real catalog; read-only when the plan is locked. */
function StageBuilder({ stage, pieces, selected, onToggle, onClose, readOnly = false, currency = '£', hideCount = false }: { stage: FunnelStage; pieces: Piece[]; selected: string[]; onToggle: (id: string) => void; onClose: () => void; readOnly?: boolean; currency?: string; hideCount?: boolean }) {
  const list = readOnly ? pieces.filter((p) => selected.includes(p.id)) : pieces
  const amber = stage.tone === 'amber'
  /* honest price label: "/mo" for a subscription, "/ea" for a per-unit charge,
     and every extra price point surfaced ("$625 + $75/mo") so nothing hides */
  const price = (p: Piece) => {
    if (!(p.cost > 0) && !(p.extras?.length)) return 'Free'
    const suf = p.cadence === 'monthly' ? '/mo' : p.cadence === 'per-unit' ? '/ea' : ''
    let s = p.cost > 0 ? `${currency}${p.cost}${suf}` : ''
    for (const e of p.extras ?? []) s += `${s ? ' + ' : ''}${currency}${e.amount}/${e.per}`
    return s
  }
  return (
    <>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(18,28,23,.36)', zIndex: 5 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 6, background: '#fff', borderTopLeftRadius: 18, borderTopRightRadius: 18, boxShadow: '0 -10px 34px rgba(0,0,0,.16)', maxHeight: '82%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '13px 16px 11px', borderBottom: `0.5px solid ${C.line}`, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: amber ? C.amberDk : C.greenDk }}>{hideCount ? stage.label : `${stage.label} · ${stage.count.toLocaleString()}`}</div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16, marginTop: 3 }}>{readOnly ? 'What drove this stage' : BUILDER_Q[stage.key]}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 30, height: 30, borderRadius: 99, border: 'none', background: C.bg, color: C.mute, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><X size={16} /></button>
        </div>
        <div style={{ overflowY: 'auto', padding: '10px 14px 4px' }}>
          {list.length === 0 && (
            <div style={{ padding: '18px 6px 22px', textAlign: 'center', fontSize: 12.5, color: C.mute }}>No plays here yet.</div>
          )}
          {list.map((p) => {
            const on = selected.includes(p.id)
            return (
              <button key={p.id} onClick={readOnly ? undefined : () => onToggle(p.id)} aria-pressed={on} disabled={readOnly} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', textAlign: 'left', background: on ? C.greenSoft : '#fff', border: `1px solid ${on ? 'rgba(74,189,152,.4)' : C.line}`, borderRadius: 12, padding: '11px 12px', marginBottom: 8, cursor: readOnly ? 'default' : 'pointer' }}>
                <span style={{ width: 24, height: 24, borderRadius: 99, background: on ? C.green : '#eef0f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on ? <Check size={14} color="#fff" /> : <Plus size={14} color={C.mute} />}</span>
                <span style={{ flex: 1, fontSize: 13, fontWeight: 500, color: C.ink }}>{p.name}</span>
                <span style={{ fontSize: 12, fontWeight: 600, color: p.cost > 0 || p.extras?.length ? C.mute : C.greenDk, flexShrink: 0 }}>{price(p)}</span>
              </button>
            )
          })}
        </div>
        <div style={{ padding: '8px 14px 14px' }}>
          <button onClick={onClose} style={{ width: '100%', background: C.greenDk, color: '#fff', border: 'none', borderRadius: 12, padding: '12px', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Done · {selected.length} {selected.length === 1 ? 'play' : 'plays'} in this stage</button>
        </div>
      </div>
    </>
  )
}

/* truncate text with an ellipsis to fit maxW at the ctx's current font */
function fit(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text
  let t = text
  while (t.length > 1 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1)
  return t + '…'
}

