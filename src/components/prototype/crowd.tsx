'use client'

/**
 * THE CROWD — the reckoning as a flow ribbon.
 *
 * Two particle versions came before this and both failed the same way: at 390px wide with four
 * stages, each stretch is about 75 pixels, and you cannot show flow in 75 pixels. Seven figures
 * a second at three pixels each is confetti. Worse, compressing survival so the later stages
 * held anyone at all meant every stretch looked equally busy — so the one thing the drawing
 * exists to show, the DROP, was the one thing it could not show.
 *
 * A ribbon fixes that because thickness is volume, and shapes read instantly at any size.
 *
 * The geometry is exact where it can be. The baseline is flat and the top edge descends, so
 * every band that peels off the top is literally the number of people lost:
 *
 *     92 tapped  −  40 said yes  =  52 lost,  drawn 52px tall
 *     40 said yes −  12 came in  =  28 lost,  drawn 28px tall   ← the leak
 *
 * Only the mouth is off-scale, and it has to be: 2,720 impressions against 12 covers cannot
 * share an axis without one of them disappearing. It is drawn as a flare and labelled as one.
 *
 * Still never used in the plan builder. Before a campaign runs this is a forecast, and a
 * forecast drawn as a measurement is a lie. After it runs, every band is a count.
 */

import React from 'react'
import { DISPLAY, UI, type Tokens } from './kit'

export interface CrowdStep { label: string; n: number; measured: boolean }

/** Little figures riding the ribbon, so it stays the portal's language and not a bar chart. */
function Figures({ x, top, base, n, col, spread = 42 }: {
  x: number; top: number; base: number; n: number; col: string; spread?: number
}) {
  const out = []
  const band = base - top
  const rows = Math.min(n, Math.max(1, Math.floor(band / 17)))
  for (let i = 0; i < rows; i++) {
    // scatter across the stretch, not up a single column — deterministic so it never reshuffles
    const y = base - 9 - i * 17 - ((i * 7) % 3) * 3
    const dx = (((i * 53) % 100) / 100 - 0.5) * spread
    out.push(
      <g key={i} transform={`translate(${x + dx} ${y})`} opacity={0.9}>
        <circle cx="0" cy="-5.4" r="2.6" fill={col} />
        <path d="M-3.4 4.2 Q-3.3 -1 0 -1 Q3.3 -1 3.4 4.2 Z" fill={col} />
      </g>,
    )
  }
  return <>{out}</>
}

export function Crowd({ C, steps, leak, goal, height = 320 }: {
  C: Tokens; steps: CrowdStep[]; leak: number
  /** What the campaign was aiming at, so the last stage has a denominator. */
  goal?: number
  height?: number
}) {
  const W = 390, BASE = 232, TOP_CAP = 150
  const xs = [46, 156, 252, 330]

  // People stages share one linear scale: one person, one pixel. That is what makes each
  // peel-off band read as an exact count rather than an impression.
  const people = steps.slice(1).map((s) => s.n)
  const unit = Math.min(1, 96 / Math.max(1, people[0]))
  const h = steps.map((s, i) => (i === 0 ? TOP_CAP : Math.max(5, s.n * unit)))

  const top = (i: number) => BASE - h[i]
  const mid = (a: number, b: number) => (a + b) / 2

  // main ribbon
  let ribbon = `M${xs[0] - 24} ${top(0)}`
  for (let i = 1; i < xs.length; i++) {
    const m = mid(xs[i - 1], xs[i])
    ribbon += ` C ${m} ${top(i - 1)}, ${m} ${top(i)}, ${xs[i]} ${top(i)}`
  }
  ribbon += ` L ${xs[xs.length - 1] + 20} ${top(xs.length - 1)} L ${xs[xs.length - 1] + 20} ${BASE} L ${xs[0] - 24} ${BASE} Z`

  return (
    <div style={{ width: '100%' }}>
      <svg viewBox={`0 0 ${W} ${height}`} style={{ display: 'block', width: '100%', height: 'auto' }}
        aria-label="A ribbon of people narrowing from reach through interest and action to the goal">
        <defs>
          <linearGradient id="rib" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={C.forest} stopOpacity=".55" />
            <stop offset="100%" stopColor={C.forest} stopOpacity=".95" />
          </linearGradient>
          <linearGradient id="lost" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stopColor={C.ember} stopOpacity=".72" />
            <stop offset="70%" stopColor={C.ember} stopOpacity=".22" />
            <stop offset="100%" stopColor={C.ember} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* what leaves, peeling off the top. Band height IS the number of people lost. */}
        {steps.slice(0, -1).map((s, i) => {
          const lostN = s.n - steps[i + 1].n
          const x = xs[i], x2 = xs[i + 1], m = mid(x, x2)
          const isLeak = i + 1 === leak
          const ceil = Math.min(top(i), top(i + 1))     // whichever edge is higher
          const labelY = ceil - 14
          return (
            <g key={`l-${i}`}>
              <path
                d={`M${x} ${top(i)} C ${m} ${top(i)}, ${m} ${top(i + 1)}, ${x2} ${top(i + 1)}
                    L ${x2} ${labelY + 4} C ${m} ${labelY + 4}, ${m} ${ceil - 6}, ${x} ${top(i) - 3} Z`}
                fill="url(#lost)" opacity={isLeak ? 1 : 0.7}
              />
              <text x={m} y={labelY} textAnchor="middle" fontFamily={UI}
                fontSize="10" fontWeight="700" letterSpacing=".04em"
                fill={isLeak ? C.ember : C.ink3}>
                {i === 0 ? `−${lostN.toLocaleString()} scrolled past` : `−${lostN} left`}
              </text>
            </g>
          )
        })}

        {/* the ribbon itself */}
        <path d={ribbon} fill="url(#rib)" />
        {/* direction: a current running along it, left to right */}
        <path
          d={`M${xs[0] - 20} ${BASE - 6} ${xs.slice(1).map((x, i) =>
            `C ${mid(xs[i], x)} ${BASE - 6}, ${mid(xs[i], x)} ${BASE - 6}, ${x} ${BASE - 6}`).join(' ')}`}
          className="px-flow" stroke="#fff" strokeOpacity=".35" strokeWidth="2"
          strokeDasharray="3 15" strokeLinecap="round" fill="none"
        />

        {/* people riding it */}
        {steps.map((s, i) => (
          <Figures key={`f-${i}`} x={xs[i]} top={top(i)} base={BASE} n={9}
            spread={i === 0 ? 58 : i === steps.length - 1 ? 20 : 40}
            col={i === steps.length - 1 ? C.brass : '#fff'} />
        ))}

        {/* the floor */}
        <line x1={xs[0] - 24} y1={BASE} x2={xs[xs.length - 1] + 20} y2={BASE}
          stroke={C.line} strokeWidth="1" />

        {/* stage marks, numbers, labels */}
        {steps.map((s, i) => {
          const first = i === 0, endS = i === steps.length - 1
          const anchor = first ? 'start' : endS ? 'end' : 'middle'
          const tx = first ? xs[i] - 24 : endS ? xs[i] + 20 : xs[i]
          return (
            <g key={`s-${i}`}>
              <line x1={xs[i]} y1={top(i)} x2={xs[i]} y2={BASE}
                stroke={i === leak ? C.ember : '#fff'} strokeOpacity={i === leak ? 0.9 : 0.25}
                strokeWidth="1" strokeDasharray={s.measured ? undefined : '4 4'} />
              <text x={tx} y={BASE + 26} textAnchor={anchor} fontFamily={DISPLAY}
                fontSize={endS ? 23 : 20} fill={i === leak ? C.ember : C.ink}>
                {endS && goal ? `${s.n} of ${goal}` : s.n.toLocaleString()}
              </text>
              <text x={tx} y={BASE + 43} textAnchor={anchor} fontFamily={UI}
                fontSize="10.5" fontWeight="600" fill={C.ink3}>{s.label}</text>
              {!s.measured && (
                <text x={tx} y={BASE + 57} textAnchor={anchor} fontFamily={UI}
                  fontSize="9" fontWeight="700" letterSpacing=".1em" fill={C.brass}>
                  YOUR COUNT
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
