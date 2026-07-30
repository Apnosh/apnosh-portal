/**
 * THE WALK'S CALENDAR (design plan P3) — a date answer whose quality is visible before the tap.
 *
 * Day tints come from date-feasibility, which derives them from the picked goal's real service
 * turnarounds: gray is too soon to do the work right, amber is tight, plain is comfortable.
 * Gray days stay pickable (owner decision 3) — the warning appears right here, immediately,
 * instead of three screens later at the gate.
 */
'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { feasibilityFor, classifyDay, type DayFit } from '@/lib/campaigns/data/date-feasibility'

const MINT = '#4ABD98'
const MINT_DK = '#2E9A78'
const MINT_SOFT = '#F0FAF6'
const INK = '#1D1D1F'
const MUTE = '#6E6E73'
const GRAY = '#C7C7CC'
const AMBER = '#B77A1E'
const AMBER_SOFT = '#FBF3E4'
const LINE = 'rgba(0,0,0,0.09)'

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const fmtDay = (s: string) => new Date(s + 'T12:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

export default function WalkCalendar({
  value,
  onChange,
  goal,
}: {
  value?: string
  onChange: (dayISO: string) => void
  /** The goal whose work has to fit before the day. Tints derive from its real turnarounds. */
  goal: string
}) {
  const todayISO = iso(new Date())
  const f = feasibilityFor(goal, todayISO)
  /* Open on the month that holds the answer, else the first comfortable day, so the first
   * screenful contains good days rather than a wall of gray. */
  const anchor = value ?? f.firstComfortable
  const [ym, setYm] = useState(() => anchor.slice(0, 7))
  const [y, m] = ym.split('-').map(Number)

  const first = new Date(y, m - 1, 1)
  const startPad = (first.getDay() + 6) % 7 // Monday-first
  const daysInMonth = new Date(y, m, 0).getDate()
  const cells: (string | null)[] = [
    ...Array.from({ length: startPad }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => iso(new Date(y, m - 1, i + 1))),
  ]
  const monthLabel = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  const move = (dir: -1 | 1) => {
    const d = new Date(y, m - 1 + dir, 1)
    setYm(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }
  const fitOf = (day: string): DayFit => (day <= todayISO ? 'too-soon' : classifyDay(day, goal, todayISO))
  const pickedFit: DayFit | null = value ? fitOf(value) : null

  return (
    <div style={{ background: '#fff', border: `1px solid ${LINE}`, borderRadius: 15, padding: 13, fontFamily: "'Inter',system-ui,sans-serif" }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 9 }}>
        <button type="button" aria-label="Earlier month" onClick={() => move(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: MUTE }}><ChevronLeft size={17} /></button>
        <span style={{ fontSize: 13.5, fontWeight: 700, color: INK }}>{monthLabel}</span>
        <button type="button" aria-label="Later month" onClick={() => move(1)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: MUTE }}><ChevronRight size={17} /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <div key={i} style={{ fontSize: 9.5, color: GRAY, textAlign: 'center', paddingBottom: 3, fontWeight: 700 }}>{d}</div>
        ))}
        {cells.map((day, i) => {
          if (!day) return <div key={i} />
          const fit = fitOf(day)
          const on = day === value
          const past = day <= todayISO
          return (
            <button
              key={day} type="button" disabled={past}
              onClick={() => onChange(day)}
              aria-label={fmtDay(day) + (fit === 'too-soon' ? ', too soon' : fit === 'tight' ? ', tight' : '')}
              style={{
                aspectRatio: '1', border: 'none', borderRadius: 9, cursor: past ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontVariantNumeric: 'tabular-nums',
                fontWeight: on ? 800 : fit === 'ok' ? 600 : 500,
                background: on ? MINT : fit === 'too-soon' ? 'rgba(0,0,0,0.03)' : fit === 'tight' ? AMBER_SOFT : 'transparent',
                color: on ? '#fff' : past ? '#E5E5EA' : fit === 'too-soon' ? GRAY : fit === 'tight' ? AMBER : INK,
              }}
            >
              {Number(day.slice(8))}
            </button>
          )
        })}
      </div>
      <div style={{ fontSize: 10.5, color: MINT_DK, marginTop: 8, lineHeight: 1.45 }}>
        <span aria-hidden style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 3, background: MINT_SOFT, border: `1px solid ${MINT}`, marginRight: 5, verticalAlign: -1 }} />
        Gray is too soon for the work. {fmtDay(f.firstComfortable)} is the first comfortable day.
      </div>
      {pickedFit === 'too-soon' && (
        <div style={{ fontSize: 11.5, color: AMBER, background: AMBER_SOFT, borderRadius: 9, padding: '8px 10px', marginTop: 8, lineHeight: 1.45 }}>
          That is sooner than the work fits. We can rush it, but some pieces will land after the day. {fmtDay(f.firstComfortable)} or later runs clean.
        </div>
      )}
      {pickedFit === 'tight' && (
        <div style={{ fontSize: 11.5, color: AMBER, background: AMBER_SOFT, borderRadius: 9, padding: '8px 10px', marginTop: 8, lineHeight: 1.45 }}>
          Tight but doable. Everything must go right. {fmtDay(f.firstComfortable)} or later is comfortable.
        </div>
      )}
    </div>
  )
}
