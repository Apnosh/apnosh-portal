'use client'

/**
 * CreatorCalendar — the creator's master calendar. One month grid + a day agenda, fed by every dated
 * work item (getMyCalendar): shoots land on their day WITH a time (green), remote deliverables land on
 * their due date as a deadline (amber, no time). So a photographer-who-also-edits sees both, without
 * the editing work being forced onto shoot-style intervals.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import type { CalendarItem } from '@/lib/marketplace/creator-schedule-types'

const C = { green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg: '#f5f5f7', amber: '#8a5a0c' }
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WD = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`)
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`
function fmtTime(hhmm: string): string {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm); if (!m) return hhmm
  const h = Number(m[1]); const ap = h < 12 ? 'AM' : 'PM'; const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${m[2]} ${ap}`
}
function statusLabel(s: string): string {
  const map: Record<string, string> = { offered: 'New', accepted: 'Accepted', in_progress: 'In progress', delivered: 'Sent for review', revision: 'Changes asked' }
  return map[s] ?? s
}
const navBtn: React.CSSProperties = { width: 34, height: 34, borderRadius: 10, border: `0.5px solid ${C.line}`, background: '#fff', color: C.ink, fontSize: 18, cursor: 'pointer', lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }

export default function CreatorCalendar({ items }: { items: CalendarItem[] }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const todayISO = iso(now.getFullYear(), now.getMonth(), now.getDate())
  const [sel, setSel] = useState(todayISO)

  const byDate = useMemo(() => {
    const m = new Map<string, CalendarItem[]>()
    for (const it of items) { const a = m.get(it.date) ?? []; a.push(it); m.set(it.date, a) }
    for (const a of m.values()) a.sort((x, y) => (x.time ?? 'zz').localeCompare(y.time ?? 'zz'))
    return m
  }, [items])

  const firstWeekday = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(firstWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  while (cells.length % 7 !== 0) cells.push(null)

  const prev = () => (month === 0 ? (setYear((y) => y - 1), setMonth(11)) : setMonth((m) => m - 1))
  const next = () => (month === 11 ? (setYear((y) => y + 1), setMonth(0)) : setMonth((m) => m + 1))

  const selItems = byDate.get(sel) ?? []
  const selDate = new Date(`${sel}T00:00:00`)

  return (
    <div style={{ background: C.bg, minHeight: '100%', padding: '16px 14px 32px', boxSizing: 'border-box' }}>
      <h1 style={{ fontFamily: DISPLAY, fontSize: 23, fontWeight: 600, color: C.ink, padding: '0 2px 2px' }}>Your calendar</h1>
      <p style={{ fontSize: 12.5, color: C.mute, margin: '2px 2px 14px' }}>Shoots, deadlines, and monthly plans in one place.</p>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={prev} aria-label="Previous month" style={navBtn}>‹</button>
        <div style={{ fontFamily: DISPLAY, fontSize: 16, fontWeight: 600, color: C.ink }}>{MONTHS[month]} {year}</div>
        <button onClick={next} aria-label="Next month" style={navBtn}>›</button>
      </div>

      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, padding: '10px 8px 12px', marginBottom: 18 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 4 }}>
          {WD.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: C.faint, padding: '2px 0' }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (d === null) return <div key={i} />
            const cISO = iso(year, month, d)
            const dayItems = byDate.get(cISO) ?? []
            const hasShoot = dayItems.some((x) => x.kind === 'shoot')
            const isToday = cISO === todayISO
            const isSel = cISO === sel
            return (
              <button key={i} onClick={() => setSel(cISO)} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10, border: 'none', cursor: 'pointer', background: isSel ? C.green : isToday ? C.greenSoft : 'transparent', color: isSel ? '#fff' : C.ink }}>
                <span style={{ fontSize: 13, fontWeight: isToday || isSel ? 700 : 500 }}>{d}</span>
                <span style={{ width: 5, height: 5, borderRadius: 99, background: dayItems.length ? (isSel ? '#fff' : hasShoot ? C.green : C.amber) : 'transparent' }} />
              </button>
            )
          })}
        </div>
      </div>

      <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 2px 8px' }}>
        {selDate.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      </div>
      {selItems.length === 0 ? (
        <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: 20, textAlign: 'center', fontSize: 13, color: C.mute }}>Nothing on this day.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {selItems.map((it) => {
            const rowStyle: React.CSSProperties = { background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 14, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textDecoration: 'none', color: 'inherit' }
            const inner = (
              <>
                <div style={{ width: 54, textAlign: 'center', flexShrink: 0 }}>
                  {it.time
                    ? <span style={{ fontSize: 11.5, fontWeight: 700, color: C.greenDk, whiteSpace: 'nowrap' }}>{fmtTime(it.time)}</span>
                    : <span style={{ fontSize: 10.5, fontWeight: 700, color: C.amber, textTransform: 'uppercase' }}>Due</span>}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.title}</div>
                  <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{it.kind === 'shoot' ? 'Shoot' : 'Deliver'}{it.status ? ` · ${statusLabel(it.status)}` : ''}</div>
                </div>
                {it.bookingId && <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
              </>
            )
            return it.bookingId
              ? <Link key={it.id} href={`/creator/bookings/${it.bookingId}`} style={rowStyle}>{inner}</Link>
              : <div key={it.id} style={rowStyle}>{inner}</div>
          })}
        </div>
      )}
    </div>
  )
}
