'use client'

/**
 * THE CROWD — the reckoning, drawn as people moving left to right through a narrowing funnel.
 *
 * Same language as the portal's home dashboard: figures that mill inside a station, walk on to
 * the next, or peel away and fade in terracotta. Turned on its side, because a funnel that
 * narrows ACROSS reads as a funnel — the silhouette does the explaining, and the eye follows a
 * left-to-right story without being told to.
 *
 * It is deliberately not used anywhere in the plan builder. Before a campaign runs, people
 * moving through stages is a FORECAST, and animating a forecast is a lie dressed as a
 * simulation. After it runs, every figure stands for people who actually did something we
 * counted. Same drawing, opposite honesty, decided only by which side of the night it sits on.
 *
 * Two scales, because one would misrepresent. Reach is off-scale on purpose and labelled — 2,720
 * impressions and 12 covers cannot share an axis without one of them vanishing. The stages after
 * it share ONE linear scale, so they stay honestly proportional to each other and to zero.
 */

import React, { useEffect, useRef } from 'react'
import type { Tokens } from './kit'

export interface CrowdStep { label: string; n: number; measured: boolean }

interface Person {
  st: number
  state: 'mill' | 'walk' | 'leave'
  th: number; om: number; rad: number
  dwell: number; age: number
  x: number; y: number; vx: number; vy: number
  a: number; ph: number; sz: number; t: number
}

const rnd = (a: number, b: number) => a + Math.random() * (b - a)

export function Crowd({ C, steps, leak, goal, height = 250 }: {
  C: Tokens; steps: CrowdStep[]; leak: number
  /** The number the campaign was actually aiming at, so the last station has a denominator. */
  goal?: number
  height?: number
}) {
  const cv = useRef<HTMLCanvasElement | null>(null)
  const people = useRef<Person[]>([])
  const layout = useRef<Array<{ x: number; cy: number; h: number }>>([])

  useEffect(() => {
    const canvas = cv.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, raf = 0
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* fine */ }

    const REACH_CAP = 26, PEOPLE_CAP = 13
    const peopleCounts = steps.slice(1).map((s) => Math.max(0, s.n))
    const per = Math.max(1, ...peopleCounts) / PEOPLE_CAP
    const target = steps.map((s, i) =>
      s.n <= 0 ? 0 : i === 0 ? REACH_CAP : Math.max(1, Math.round(s.n / per)))

    function measure() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      const r = canvas!.getBoundingClientRect()
      W = r.width; H = r.height
      canvas!.width = Math.round(W * dpr)
      canvas!.height = Math.round(H * dpr)
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0)

      const n = steps.length
      const padL = 46, padR = 46
      const span = Math.max(60, W - padL - padR)
      const cy = H * 0.44
      const maxH = Math.min(H * 0.34, 74)
      layout.current = steps.map((_, i) => {
        const f = n > 1 ? i / (n - 1) : 0
        return { x: padL + span * f, cy, h: maxH * (1 - 0.66 * f) }
      })
    }

    function seed() {
      const out: Person[] = []
      target.forEach((count, st) => {
        for (let k = 0; k < count; k++) {
          const S = layout.current[st]
          const th = rnd(0, 6.28), rad = rnd(0.12, 0.95)
          out.push({
            st, state: 'mill', th, om: rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1), rad,
            dwell: rnd(1.4, 3.4), age: rnd(0, 1.4),
            x: S.x + Math.cos(th) * 22 * rad, y: S.cy + Math.sin(th) * S.h * 0.78 * rad,
            vx: 0, vy: 0, a: 1, ph: rnd(0, 6.28), sz: rnd(0.85, 1.2), t: 0,
          })
        }
      })
      people.current = out
    }

    measure(); seed()
    const ro = new ResizeObserver(() => { measure() })
    ro.observe(canvas)

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
      const L = layout.current
      if (!L.length) { raf = requestAnimationFrame(frame); return }

      /* The silhouette. This is what makes it read as a funnel rather than four groups in a
         row — the walls closing in do the explaining, so no label has to. */
      ctx!.beginPath()
      ctx!.moveTo(L[0].x - 26, L[0].cy - L[0].h)
      for (let i = 1; i < L.length; i++) {
        const p = L[i - 1], q = L[i], mx = (p.x + q.x) / 2
        ctx!.bezierCurveTo(mx, p.cy - p.h, mx, q.cy - q.h, q.x, q.cy - q.h)
      }
      const lastS = L[L.length - 1]
      ctx!.lineTo(lastS.x + 20, lastS.cy - lastS.h)
      ctx!.lineTo(lastS.x + 20, lastS.cy + lastS.h)
      for (let i = L.length - 1; i > 0; i--) {
        const q = L[i], p = L[i - 1], mx = (p.x + q.x) / 2
        ctx!.bezierCurveTo(mx, q.cy + q.h, mx, p.cy + p.h, p.x, p.cy + p.h)
      }
      ctx!.lineTo(L[0].x - 26, L[0].cy + L[0].h)
      ctx!.closePath()
      ctx!.fillStyle = C.forest; ctx!.globalAlpha = 0.05; ctx!.fill()
      ctx!.globalAlpha = 0.5; ctx!.strokeStyle = C.line; ctx!.lineWidth = 1; ctx!.stroke()
      ctx!.globalAlpha = 1

      // people
      for (const p of people.current) {
        const S = L[p.st]
        if (p.state === 'mill') {
          p.th += p.om * dt; p.age += dt
          const tx = S.x + Math.cos(p.th) * 22 * p.rad
          const ty = S.cy + Math.sin(p.th) * S.h * 0.78 * p.rad
          p.x += (tx - p.x) * Math.min(1, dt * 4.5)
          p.y += (ty - p.y) * Math.min(1, dt * 4.5)
          if (p.age >= p.dwell) {
            p.age = 0; p.dwell = rnd(1.4, 3.4)
            if (p.st >= steps.length - 1) p.state = 'leave'
            else {
              const pass = (target[p.st + 1] || 0) / Math.max(1, target[p.st])
              if (Math.random() < pass) { p.state = 'walk'; p.t = 0 }
              else p.state = 'leave'
            }
            if (p.state === 'leave') {
              // out through the floor, never backwards — leaving is a one-way door
              p.vx = rnd(-8, 16); p.vy = rnd(26, 54); p.a = 1
            }
          }
        } else if (p.state === 'walk') {
          const T = L[p.st + 1]
          p.t += dt / 0.95
          // ease-in: they drift, then get pulled through the throat
          const e = p.t < 1 ? p.t * p.t * (3 - 2 * p.t) : 1
          p.x += ((S.x + (T.x - S.x) * e) - p.x) * Math.min(1, dt * 9)
          p.y += ((S.cy + (T.cy - S.cy) * e) - p.y) * Math.min(1, dt * 7)
          if (p.t >= 1) {
            p.st += 1; p.state = 'mill'; p.th = rnd(0, 6.28); p.rad = rnd(0.12, 0.95)
          }
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 26 * dt; p.a -= dt * 0.66
          if (p.a <= 0) {
            p.st = 0; p.state = 'mill'; p.a = 1; p.age = 0
            p.th = rnd(0, 6.28); p.rad = rnd(0.12, 0.95)
            p.x = L[0].x; p.y = L[0].cy
          }
        }
        const fx = reduce ? 0 : Math.sin(t * 0.7 + p.ph) * 1.5
        const fy = reduce ? 0 : Math.cos(t * 0.5 + p.ph * 1.4) * 1.6
        const col = p.state === 'leave' ? C.ember
          : p.state === 'walk' ? C.ink3
          : p.st === steps.length - 1 ? C.brass : C.forest
        figure(p.x + fx, p.y + fy, 3.5 * p.sz, col, p.a)
      }

      // the gates + their numbers
      steps.forEach((s, i) => {
        const S = L[i]
        ctx!.beginPath()
        ctx!.ellipse(S.x, S.cy, 22, S.h, 0, 0, 6.2832)
        ctx!.strokeStyle = i === leak ? C.ember : C.line
        ctx!.lineWidth = 1
        // a stage we did not measure ourselves is drawn broken, never solid
        ctx!.setLineDash(s.measured ? [] : [4, 4])
        ctx!.stroke(); ctx!.setLineDash([])

        /* Centre-anchoring every label pushed the end station's text off the canvas — the last
           one is the widest ("12 of 40", "Actually came") and sits nearest the edge. The two
           ends anchor inward so nothing can ever be clipped, whatever the numbers say. */
        const first = i === 0, endS = i === steps.length - 1
        ctx!.textAlign = first ? 'left' : endS ? 'right' : 'center'
        const tx = first ? S.x - 24 : endS ? S.x + 20 : S.x

        ctx!.fillStyle = i === leak ? C.ember : C.ink
        ctx!.font = `500 ${endS ? 24 : 21}px ${DISPLAY_FF}`
        ctx!.fillText(endS && goal ? `${s.n} of ${goal}` : s.n.toLocaleString(),
          tx, S.cy - S.h - 16)

        ctx!.fillStyle = C.ink3
        ctx!.font = `600 10.5px ${UI_FF}`
        ctx!.fillText(s.label, tx, S.cy + S.h + 22)
        if (!s.measured) {
          ctx!.fillStyle = C.brass
          ctx!.font = `700 9px ${UI_FF}`
          ctx!.fillText('YOUR COUNT', tx, S.cy + S.h + 36)
        }
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [C, steps, leak, goal])

  return <canvas ref={cv} style={{ display: 'block', width: '100%', height }}
    aria-label="The people this campaign reached, narrowing through interest and action to the goal" />
}

/* Canvas cannot read a CSS variable, so the two faces are named directly. They match kit.tsx. */
const DISPLAY_FF = "'Playfair Display', Georgia, serif"
const UI_FF = "'DM Sans', ui-sans-serif, -apple-system, sans-serif"
