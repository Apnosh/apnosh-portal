'use client'
/**
 * THE CROWD (owner 2026-09-21, "it feels like a dead picture"): the people on the plan's rings
 * mill and float the way Home's do, and a trickle walks the dashed path from ring to ring so the
 * month reads as movement, not a diagram. One canvas over the SVG, on the same 354×640 stage.
 * Reduced motion: one still frame.
 */
import { useEffect, useRef } from 'react'

export interface CrowdRing { cx: number; cy: number; r: number; n: number; color: string; /** the crowd that is new this month, drawn a shade lighter and arriving over the first seconds */ extra?: number }
interface P { ring: number; x: number; y: number; tx: number; ty: number; phase: number; sz: number; a: number; born: number; light: boolean }
interface T { from: number; t: number; speed: number; phase: number; sz: number }

const lighten = (h: string, amt = .35) => { const r = parseInt(h.slice(1, 3), 16), g = parseInt(h.slice(3, 5), 16), b = parseInt(h.slice(5, 7), 16); const m = (v: number) => Math.round(v + (255 - v) * amt); return `rgb(${m(r)},${m(g)},${m(b)})` }
const rand = (seed: number) => () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280 }
function person(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, color: string, alpha: number, head: string) {
  ctx.globalAlpha = alpha
  ctx.beginPath(); ctx.moveTo(x - u * .6, y + u * .92); ctx.quadraticCurveTo(x - u * .7, y + u * .02, x, y - u * .16); ctx.quadraticCurveTo(x + u * .7, y + u * .02, x + u * .6, y + u * .92); ctx.closePath(); ctx.fillStyle = color; ctx.fill()
  ctx.beginPath(); ctx.arc(x, y - u * .74, u * .46, 0, 7); ctx.fillStyle = head; ctx.fill()
}
const bez = (a: { cx: number; cy: number }, b: { cx: number; cy: number }, t: number) => { const x0 = a.cx, y0 = a.cy, x1 = b.cx, y1 = b.cy; const c1x = x0, c1y = y0 + 80, c2x = x1, c2y = y1 - 80; const u = 1 - t; return { x: u * u * u * x0 + 3 * u * u * t * c1x + 3 * u * t * t * c2x + t * t * t * x1, y: u * u * u * y0 + 3 * u * u * t * c1y + 3 * u * t * t * c2y + t * t * t * y1 } }

export default function PlanCrowd({ rings, flow = true, seed = 1, W = 430, H = 800 }: { rings: CrowdRing[]; /** the trickle along the path; off on the recap */ flow?: boolean; seed?: number; /** the stage's coordinate space, the same one the SVG uses */ W?: number; H?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const cv = ref.current; if (!cv) return
    const ctx = cv.getContext('2d'); if (!ctx) return
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const rnd = rand(seed)
    const people: P[] = []
    rings.forEach((r, i) => {
      const total = r.n + (r.extra ?? 0)
      for (let k = 0; k < total; k++) {
        const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), .6) * (r.r - 12)
        const light = k >= r.n
        people.push({ ring: i, x: r.cx + Math.cos(a) * d, y: r.cy + Math.sin(a) * d, tx: 0, ty: 0, phase: rnd() * 6, sz: .82 + rnd() * .38, a: light ? 0 : 1, born: light ? 1.2 + rnd() * 3.5 : 0, light })
      }
    })
    const spot = (p: P) => { const r = rings[p.ring]; const a = rnd() * Math.PI * 2, d = Math.pow(rnd(), .6) * (r.r - 12); p.tx = r.cx + Math.cos(a) * d; p.ty = r.cy + Math.sin(a) * d }
    people.forEach(spot)
    const trav: T[] = []
    let raf = 0, last = performance.now(), t = 0, nextSpawn = .6
    const fit = () => { const w = cv.clientWidth || W, h = cv.clientHeight || H; const dpr = Math.min(2, window.devicePixelRatio || 1); cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr); ctx.setTransform((w / W) * dpr, 0, 0, (h / H) * dpr, 0, 0) }
    fit()
    const draw = () => {
      ctx.clearRect(0, 0, W, H)
      for (const p of people) {
        if (p.a <= .01) continue
        const fx = Math.sin(t * .7 + p.phase) * 1.7, fy = Math.cos(t * .5 + p.phase * 1.4) * 1.9
        const c = rings[p.ring].color
        person(ctx, p.x + fx, p.y + fy, 5.2 * p.sz, p.light ? lighten(c, .3) : c, p.a, lighten(c, p.light ? .62 : .35))
      }
      for (const tr of trav) {
        const a = rings[tr.from], b = rings[tr.from + 1]; if (!b) continue
        const q = bez(a, b, tr.t); const fx = Math.sin(t * .9 + tr.phase) * 1.2
        const fade = Math.min(1, tr.t * 6, (1 - tr.t) * 6)
        person(ctx, q.x + fx, q.y, 5.2 * tr.sz, lighten(a.color, .2), fade * .9, lighten(a.color, .55))
      }
      ctx.globalAlpha = 1
    }
    const frame = (now: number) => {
      const dt = Math.min(.05, (now - last) / 1000); last = now; t += dt
      for (const p of people) {
        if (p.born > 0) { p.born -= dt; if (p.born <= 0) p.a = 0.01; else continue }
        if (p.a < 1) p.a = Math.min(1, p.a + dt * 1.4)
        const dx = p.tx - p.x, dy = p.ty - p.y
        p.x += dx * .35 * dt; p.y += dy * .35 * dt
        if (Math.abs(dx) + Math.abs(dy) < 1.5) spot(p)
      }
      if (flow) {
        nextSpawn -= dt
        if (nextSpawn <= 0 && rings.length > 1) { trav.push({ from: Math.floor(rnd() * (rings.length - 1)), t: 0, speed: .16 + rnd() * .08, phase: rnd() * 6, sz: .9 + rnd() * .3 }); nextSpawn = 1.1 + rnd() * 1.6 }
        for (let i = trav.length - 1; i >= 0; i--) { trav[i].t += trav[i].speed * dt; if (trav[i].t >= 1) trav.splice(i, 1) }
      }
      draw()
      raf = requestAnimationFrame(frame)
    }
    if (reduced) { people.forEach((p) => { p.a = 1; p.born = 0 }); draw(); return }
    raf = requestAnimationFrame(frame)
    const ro = new ResizeObserver(fit); ro.observe(cv)
    const vis = () => { if (document.hidden) cancelAnimationFrame(raf); else { last = performance.now(); raf = requestAnimationFrame(frame) } }
    document.addEventListener('visibilitychange', vis)
    return () => { cancelAnimationFrame(raf); ro.disconnect(); document.removeEventListener('visibilitychange', vis) }
  }, [rings, flow, seed, W, H])
  return <canvas ref={ref} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
}
