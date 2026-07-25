'use client'

/**
 * THE CROWD — the reckoning as a current of people, narrowing left to right.
 *
 * The first horizontal pass drew four stations with figures milling inside them, and it did not
 * read as flow at all: at any given moment one or two people were walking and the other sixty
 * were standing still. Four bus stops, not a river.
 *
 * So this is a genuine stream. People enter continuously at the left and are carried right at a
 * steady pace. At each gate a share of them is turned away — they break off, fall out of the
 * current and fade — and the survivors get squeezed toward the centre line as the walls close.
 * Nobody stands still, so the density of each stretch IS the drop. You can see the crowd thin.
 *
 * Population per stretch settles proportional to cumulative survival, which falls out of the
 * physics rather than being posed: with a constant intake and equal transit times, how many
 * people are in a stretch is exactly how many got that far.
 *
 * Still not used anywhere in the plan builder. Before a campaign runs this is a forecast, and
 * animating a forecast is a lie dressed as a simulation. After it runs every figure stands for
 * people who actually did something we counted.
 */

import React, { useEffect, useRef } from 'react'
import type { Tokens } from './kit'

export interface CrowdStep { label: string; n: number; measured: boolean }

interface Drop {
  x: number; lane: number          // lane is -1..1 across the channel, before squeezing
  y: number; vy: number
  gate: number                     // next gate this person has yet to face
  out: boolean; a: number
  ph: number; sz: number; wob: number
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function Crowd({ C, steps, leak, goal, height = 260 }: {
  C: Tokens; steps: CrowdStep[]; leak: number
  /** What the campaign was aiming at, so the last gate has a denominator. */
  goal?: number
  height?: number
}) {
  const cv = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = cv.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, raf = 0, spawnAcc = 0
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* fine */ }

    /* Survival per gate, compressed for legibility. The real fall from 2,720 to 92 is 97%, and
       at true ratio the rest of the funnel would hold nobody at all — the drawing would say
       "everything failed" when three of the four stages worked. The printed numbers stay real
       and the off-scale note says which one is which. */
    const raw = steps.map((s) => Math.max(0, s.n))
    const pass: number[] = []
    for (let i = 0; i < raw.length - 1; i++) {
      const r = raw[i] > 0 ? raw[i + 1] / raw[i] : 0
      pass.push(Math.min(0.92, Math.max(0.16, Math.pow(r, 0.34))))
    }

    let gateX: number[] = []
    let cy = 0, maxH = 0, x0 = 0, x1 = 0
    const drops: Drop[] = []

    function measure() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas!.getBoundingClientRect()
      W = r.width; H = r.height
      canvas!.width = Math.round(W * dpr)
      canvas!.height = Math.round(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)
      const padL = 46, padR = 46
      x0 = padL; x1 = Math.max(padL + 60, W - padR)
      cy = H * 0.44
      maxH = Math.min(H * 0.33, 72)
      const n = steps.length
      gateX = steps.map((_, i) => x0 + (x1 - x0) * (n > 1 ? i / (n - 1) : 0))
    }

    /** Half-height of the channel at x — the funnel wall, and what squeezes the current. */
    function halfAt(x: number) {
      const f = Math.min(1, Math.max(0, (x - x0) / Math.max(1, x1 - x0)))
      return maxH * (1 - 0.68 * f)
    }

    measure()
    const ro = new ResizeObserver(() => { measure() })
    ro.observe(canvas)

    const SPEED = 64          // px per second — a crossing takes about four seconds
    const RATE = 7            // people entering per second

    function spawn() {
      const x = x0 - rnd(4, 26), lane = rnd(-0.95, 0.95)
      drops.push({
        x, lane,
        y: cy + lane * halfAt(x) * 0.86,   // enter already across the channel, not on its spine
        vy: 0, gate: 0, out: false, a: 1,
        ph: rnd(0, 6.28), sz: rnd(0.82, 1.18), wob: rnd(0.5, 1.5),
      })
    }
    for (let k = 0; k < 44; k++) {            // prime it so it opens mid-flow, never empty
      spawn()
      const d = drops[drops.length - 1]
      d.x = rnd(x0 - 20, x1)
      d.y = cy + d.lane * halfAt(d.x) * 0.86
      for (let g = 0; g < gateX.length; g++) {
        if (d.x > gateX[g]) d.gate = g + 1
      }
    }

    function figure(x: number, y: number, u: number, col: string, a: number) {
      if (a <= 0.02) return
      ctx!.globalAlpha = a
      ctx!.fillStyle = col
      ctx!.beginPath(); ctx!.arc(x, y - u * 1.05, u * 0.6, 0, 6.2832); ctx!.fill()
      ctx!.beginPath()
      ctx!.moveTo(x - u * 0.8, y + u * 0.95)
      ctx!.quadraticCurveTo(x - u * 0.78, y - u * 0.2, x, y - u * 0.2)
      ctx!.quadraticCurveTo(x + u * 0.78, y - u * 0.2, x + u * 0.8, y + u * 0.95)
      ctx!.closePath(); ctx!.fill()
      ctx!.globalAlpha = 1
    }

    let last = 0
    function frame(ts: number) {
      const dt = last ? Math.min((ts - last) / 1000, 0.05) : 0.016
      last = ts
      const t = ts / 1000
      ctx!.clearRect(0, 0, W, H)

      // ── the channel ────────────────────────────────────────────────────────
      ctx!.beginPath()
      ctx!.moveTo(x0 - 22, cy - halfAt(x0))
      for (let x = x0; x <= x1; x += 6) ctx!.lineTo(x, cy - halfAt(x))
      ctx!.lineTo(x1 + 18, cy - halfAt(x1))
      ctx!.lineTo(x1 + 18, cy + halfAt(x1))
      for (let x = x1; x >= x0; x -= 6) ctx!.lineTo(x, cy + halfAt(x))
      ctx!.lineTo(x0 - 22, cy + halfAt(x0))
      ctx!.closePath()
      ctx!.fillStyle = C.forest; ctx!.globalAlpha = 0.055; ctx!.fill()
      ctx!.globalAlpha = 0.45; ctx!.strokeStyle = C.line; ctx!.lineWidth = 1; ctx!.stroke()
      ctx!.globalAlpha = 1

      // ── move everyone ──────────────────────────────────────────────────────
      spawnAcc += dt * RATE
      while (spawnAcc >= 1) { spawn(); spawnAcc -= 1 }

      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]

        if (d.out) {
          // turned away: dropped out of the current, hard and quick, and gone.
          d.x += SPEED * 0.18 * dt
          d.vy += 150 * dt
          d.y += d.vy * dt
          d.a -= dt * 1.5
          if (d.a <= 0 || d.y > H + 10) { drops.splice(i, 1); continue }
        } else {
          // carried along, and pulled harder as the walls close in
          const squeeze = 1 + (1 - halfAt(d.x) / maxH) * 0.7
          d.x += SPEED * squeeze * dt
          const h = halfAt(d.x)
          const wob = reduce ? 0 : Math.sin(t * d.wob + d.ph) * h * 0.08
          d.y += ((cy + d.lane * h * 0.86 + wob) - d.y) * Math.min(1, dt * 6)

          // face the next gate exactly once
          if (d.gate < gateX.length && d.x >= gateX[d.gate]) {
            const g = d.gate
            d.gate += 1
            if (g > 0 && Math.random() > pass[g - 1]) {
              d.out = true
              // pushed out through the nearest wall, so leaving reads as leaving
              d.vy = (d.lane >= 0 ? 1 : -1) * rnd(46, 84)
            }
          }
          if (d.x > x1 + 26) { drops.splice(i, 1); continue }
        }

        const col = d.out ? C.ember
          : d.gate >= steps.length ? C.brass
          : C.forest
        figure(d.x, d.y, 3.4 * d.sz, col, d.a)
      }

      // ── gates, numbers, labels ─────────────────────────────────────────────
      steps.forEach((s, i) => {
        const gx = gateX[i], h = halfAt(gx)
        ctx!.beginPath()
        ctx!.moveTo(gx, cy - h); ctx!.lineTo(gx, cy + h)
        ctx!.strokeStyle = i === leak ? C.ember : C.line
        ctx!.lineWidth = i === leak ? 1.6 : 1
        ctx!.setLineDash(s.measured ? [] : [4, 4])   // unmeasured is drawn broken, always
        ctx!.globalAlpha = 0.85; ctx!.stroke()
        ctx!.setLineDash([]); ctx!.globalAlpha = 1

        const first = i === 0, endS = i === steps.length - 1
        ctx!.textAlign = first ? 'left' : endS ? 'right' : 'center'
        const tx = first ? gx - 22 : endS ? gx + 18 : gx

        ctx!.fillStyle = i === leak ? C.ember : C.ink
        ctx!.font = `500 ${endS ? 24 : 21}px ${DISPLAY_FF}`
        ctx!.fillText(endS && goal ? `${s.n} of ${goal}` : s.n.toLocaleString(), tx, cy - maxH - 14)

        ctx!.fillStyle = C.ink3
        ctx!.font = `600 10.5px ${UI_FF}`
        ctx!.fillText(s.label, tx, cy + maxH + 24)
        if (!s.measured) {
          ctx!.fillStyle = C.brass
          ctx!.font = `700 9px ${UI_FF}`
          ctx!.fillText('YOUR COUNT', tx, cy + maxH + 38)
        }
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [C, steps, leak, goal])

  return <canvas ref={cv} style={{ display: 'block', width: '100%', height }}
    aria-label="A current of people narrowing from reach through interest and action to the goal" />
}

/* Canvas cannot read a CSS variable, so the two faces are named directly. They match kit.tsx. */
const DISPLAY_FF = "'Playfair Display', Georgia, serif"
const UI_FF = "'DM Sans', ui-sans-serif, -apple-system, sans-serif"
