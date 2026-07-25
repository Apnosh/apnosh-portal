'use client'

/**
 * THE CROWD — the reckoning, drawn as people.
 *
 * This is deliberately the portal's home-page language (figures that mill inside a ring, walk
 * down to the next one, or peel off and fade in terracotta), and it is deliberately NOT used
 * anywhere in the plan builder.
 *
 * The distinction is the whole point. Before a campaign runs, people moving through stages is
 * a FORECAST, and animating a forecast is a lie dressed as a simulation. After it runs, every
 * one of these figures stands for people who actually did something we counted. Same drawing,
 * opposite honesty, depending only on which side of the night you are on.
 *
 * Two scales, because one would misrepresent:
 *   Reach is off-scale on purpose — 2,720 impressions against 12 covers cannot share an axis
 *   without one of them disappearing. It is drawn as a cloud and labelled as one.
 *   The people stages share ONE linear scale, so tapped / said yes / came are honestly
 *   proportional to each other and to zero.
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

export function Crowd({ C, steps, leak, height = 430 }: {
  C: Tokens; steps: CrowdStep[]; leak: number; height?: number
}) {
  const cv = useRef<HTMLCanvasElement | null>(null)
  const people = useRef<Person[]>([])
  const layout = useRef<Array<{ x: number; y: number; r: number }>>([])

  useEffect(() => {
    const canvas = cv.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let W = 0, H = 0, raf = 0
    let reduce = false
    try { reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches } catch { /* fine */ }

    /* How many figures each stage holds. Reach gets its own cap; the rest share one linear
       scale off the busiest people-stage so they stay proportional to each other. */
    const REACH_CAP = 30
    const PEOPLE_CAP = 15
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
      const top = 44, bot = H - 40, n = steps.length
      layout.current = steps.map((_, i) => {
        const f = n > 1 ? i / (n - 1) : 0
        return { x: W * 0.34, y: top + (bot - top) * f, r: 62 - 34 * f }
      })
    }

    function seed() {
      const out: Person[] = []
      target.forEach((count, st) => {
        for (let k = 0; k < count; k++) {
          const L = layout.current[st]
          const th = rnd(0, 6.28), rad = rnd(0.15, 0.94)
          out.push({
            st, state: 'mill', th, om: rnd(0.5, 1.1) * (Math.random() < 0.5 ? -1 : 1), rad,
            dwell: rnd(1.5, 3.6), age: rnd(0, 1.5),
            x: L.x + Math.cos(th) * L.r * rad, y: L.y + Math.sin(th) * L.r * rad * 0.6,
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
      ctx!.moveTo(x - u * 0.82, y + u * 0.95)
      ctx!.quadraticCurveTo(x - u * 0.8, y - u * 0.2, x, y - u * 0.2)
      ctx!.quadraticCurveTo(x + u * 0.8, y - u * 0.2, x + u * 0.82, y + u * 0.95)
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

      // the spine
      for (let i = 0; i < L.length - 1; i++) {
        ctx!.beginPath()
        ctx!.moveTo(L[i].x, L[i].y + L[i].r * 0.6)
        ctx!.lineTo(L[i + 1].x, L[i + 1].y - L[i + 1].r * 0.6)
        ctx!.strokeStyle = i === leak - 1 ? C.ember : C.line
        ctx!.lineWidth = i === leak - 1 ? 2 : 1.2
        ctx!.globalAlpha = i === leak - 1 ? 0.5 : 0.8
        ctx!.stroke(); ctx!.globalAlpha = 1
      }

      // people
      for (const p of people.current) {
        const S = L[p.st]
        if (p.state === 'mill') {
          p.th += p.om * dt; p.age += dt
          const tx = S.x + Math.cos(p.th) * S.r * p.rad
          const ty = S.y + Math.sin(p.th) * S.r * p.rad * 0.6
          p.x += (tx - p.x) * Math.min(1, dt * 4.5)
          p.y += (ty - p.y) * Math.min(1, dt * 4.5)
          if (p.age >= p.dwell) {
            p.age = 0; p.dwell = rnd(1.5, 3.6)
            if (p.st >= steps.length - 1) { p.state = 'leave' }
            else {
              const pass = (target[p.st + 1] || 0) / Math.max(1, target[p.st])
              if (Math.random() < pass) { p.state = 'walk'; p.t = 0 }
              else p.state = 'leave'
            }
            if (p.state === 'leave') {
              const dir = p.x < S.x ? -1 : 1
              p.vx = dir * rnd(28, 58); p.vy = rnd(4, 20); p.a = 1
            }
          }
        } else if (p.state === 'walk') {
          const T = L[p.st + 1]
          p.t += dt / 1.0
          const e = p.t < 1 ? p.t * p.t * (3 - 2 * p.t) : 1
          p.x += ((S.x + (T.x - S.x) * e) - p.x) * Math.min(1, dt * 9)
          p.y += ((S.y + (T.y - S.y) * e) - p.y) * Math.min(1, dt * 9)
          if (p.t >= 1) {
            p.st += 1; p.state = 'mill'; p.th = rnd(0, 6.28); p.rad = rnd(0.15, 0.94)
          }
        } else {
          p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 22 * dt; p.a -= dt * 0.62
          if (p.a <= 0) {
            p.st = 0; p.state = 'mill'; p.a = 1; p.age = 0
            p.th = rnd(0, 6.28); p.rad = rnd(0.15, 0.94)
            p.x = L[0].x; p.y = L[0].y
          }
        }
        const fx = reduce ? 0 : Math.sin(t * 0.7 + p.ph) * 1.6
        const fy = reduce ? 0 : Math.cos(t * 0.5 + p.ph * 1.4) * 1.8
        const col = p.state === 'leave' ? C.ember
          : p.state === 'walk' ? C.ink3
          : p.st === steps.length - 1 ? C.brass : C.forest
        figure(p.x + fx, p.y + fy, 3.6 * p.sz, col, p.a)
      }

      // rings + the numbers beside them
      steps.forEach((s, i) => {
        const S = L[i]
        ctx!.beginPath()
        ctx!.ellipse(S.x, S.y, S.r, S.r * 0.6, 0, 0, 6.2832)
        ctx!.strokeStyle = C.line; ctx!.lineWidth = 1
        // a stage we did not measure ourselves is drawn as a broken ring, never a solid one
        ctx!.setLineDash(s.measured ? [] : [4, 4])
        ctx!.stroke(); ctx!.setLineDash([])

        const tx = S.x + S.r + 18
        ctx!.textAlign = 'left'
        ctx!.fillStyle = i === leak ? C.ember : C.ink
        ctx!.font = `500 27px ${DISPLAY_FF}`
        ctx!.fillText(s.n.toLocaleString(), tx, S.y + 2)
        ctx!.fillStyle = C.ink3
        ctx!.font = `600 11.5px ${UI_FF}`
        ctx!.fillText(s.label, tx, S.y + 20)
        if (!s.measured) {
          ctx!.fillStyle = C.brass
          ctx!.font = `700 10px ${UI_FF}`
          ctx!.fillText('YOUR COUNT', tx, S.y + 36)
        }
      })

      raf = requestAnimationFrame(frame)
    }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [C, steps, leak])

  return <canvas ref={cv} style={{ display: 'block', width: '100%', height }}
    aria-label="The people this campaign reached, and where they dropped out" />
}

/* Canvas cannot read a CSS variable, so the two faces are named directly here. They match
   kit.tsx; if the type system there changes, this has to change with it. */
const DISPLAY_FF = "'Playfair Display', Georgia, serif"
const UI_FF = "'DM Sans', ui-sans-serif, -apple-system, sans-serif"
