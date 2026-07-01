'use client'

/**
 * MvpCalendar — the owner's content calendar (Campaigns → Calendar view).
 * Month grid with multi-day campaign bars + holiday/recurring dots, a
 * "coming up this month" agenda, and a Week view with the always-on work and
 * this week's to-dos (approve content, plan holidays, closed days).
 *
 * Real campaigns drive the bars/agenda; holidays + recurring + closed days are
 * reference data (the app runs on mock/seeded data today). Owner-added events
 * (e.g. Restaurant Week) live in local state so edit/delete work in-session.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ChevronLeft, ChevronRight, Megaphone, Gift, Search, Film, Pencil, Trash2,
  ArrowRight, CalendarDays, Ban, Repeat,
} from 'lucide-react'
import type { SavedCampaign } from '@/lib/campaigns/view'

const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3', greenLine: 'rgba(74,189,152,0.32)',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2', line: '#e6e6ea', bg2: '#f5f5f7',
  amber: '#8a5a0c', amberBg: '#fbf3e4', amberLine: '#eed9b3',
  holi: '#a23b6b', holiSoft: '#f7ecf1', holiLine: 'rgba(162,59,107,0.28)',
  neutral: '#9aa19d', neutralBar: '#dfe3e0',
}
const DISPLAY = "'Cal Sans','Inter',sans-serif"
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/* ---------- date helpers ---------- */
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(s + 'T00:00:00')
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x }
const sameDay = (a: Date, b: Date) => iso(a) === iso(b)
const nthWeekday = (y: number, m: number, weekday: number, n: number) => {
  const first = new Date(y, m, 1)
  const offset = (weekday - first.getDay() + 7) % 7
  return new Date(y, m, 1 + offset + (n - 1) * 7)
}
const lastWeekday = (y: number, m: number, weekday: number) => {
  const last = new Date(y, m + 1, 0)
  const offset = (last.getDay() - weekday + 7) % 7
  return new Date(y, m + 1, 0 - offset)
}
const fmtMonth = (d: Date) => d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
const fmtDayLong = (d: Date) => d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const fmtShort = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
const fmtRange = (s: string, e?: string) => (!e || e === s ? fmtShort(parse(s)) : `${fmtShort(parse(s))} – ${fmtShort(parse(e))}`)

/* ---------- reference data ---------- */
function holidaysFor(year: number) {
  return [
    { date: iso(new Date(year, 0, 1)), name: "New Year's Day" },
    { date: iso(new Date(year, 1, 14)), name: "Valentine's Day" },
    { date: iso(new Date(year, 2, 17)), name: "St. Patrick's Day" },
    { date: iso(nthWeekday(year, 4, 0, 2)), name: "Mother's Day" },
    { date: iso(lastWeekday(year, 4, 1)), name: 'Memorial Day' },
    { date: iso(nthWeekday(year, 5, 0, 3)), name: "Father's Day" },
    { date: iso(new Date(year, 6, 4)), name: 'Independence Day' },
    { date: iso(nthWeekday(year, 8, 1, 1)), name: 'Labor Day' },
    { date: iso(new Date(year, 9, 31)), name: 'Halloween' },
    { date: iso(nthWeekday(year, 10, 4, 4)), name: 'Thanksgiving' },
    { date: iso(new Date(year, 11, 25)), name: 'Christmas' },
  ]
}
const RECURRING = [
  { id: 'localads', label: 'Local search ads', cadence: 'Always on', Icon: Search, weekday: null as number | null },
  { id: 'weeklyreels', label: 'Weekly Reels', cadence: 'Fridays', Icon: Film, weekday: 5 as number | null },
]
const closedFor = (year: number) => [{ date: iso(new Date(year, 6, 4)), label: 'Closed — July 4th' }]

type Kind = 'campaign' | 'owner' | 'holiday' | 'closed'
interface CalEvent { id: string; kind: Kind; title: string; start: string; end?: string; status?: string; pieces?: number; itemId?: string }

function tplItemId(s: SavedCampaign): string | undefined {
  const t = s.draft.brief?.templateId
  return t?.startsWith('builder-') ? t.slice('builder-'.length) : undefined
}
function campaignEvents(saved: SavedCampaign[]): CalEvent[] {
  return saved.filter((s) => s.draft.targetDate).map((s) => {
    const start = s.draft.targetDate as string
    const weeks = s.draft.brief?.durationWeeks ?? 0
    const span = weeks ? weeks * 7 : 4
    const end = iso(addDays(parse(start), Math.max(2, span - 1)))
    const pieces = s.draft.items.filter((i) => i.included).length
    return { id: s.draft.id, kind: 'campaign', title: s.draft.name, start, end, status: s.status, pieces, itemId: tplItemId(s) }
  })
}

/* ---------- component ---------- */
export default function MvpCalendar({ saved }: { saved: SavedCampaign[] }) {
  const today = useMemo(() => new Date(), [])
  const [tab, setTab] = useState<'month' | 'week'>('month')
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1))
  // Owner-added events (any date, no campaign needed) live in local state.
  const [owner, setOwner] = useState<CalEvent[]>([])
  const [addFor, setAddFor] = useState<Date | null>(null)

  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const campaigns = useMemo(() => campaignEvents(saved), [saved])
  const holidays = useMemo(() => [...holidaysFor(year), ...holidaysFor(year + 1)], [year])
  const closed = useMemo(() => [...closedFor(year), ...closedFor(year + 1)], [year])

  const holidayEvents: CalEvent[] = holidays.map((h) => ({ id: `h-${h.date}`, kind: 'holiday', title: h.name, start: h.date }))
  const closedEvents: CalEvent[] = closed.map((c) => ({ id: `c-${c.date}`, kind: 'closed', title: c.label, start: c.date }))
  const multiDay = [...campaigns, ...owner].filter((e) => e.end && e.end !== e.start)
  const allDots = [...holidayEvents, ...campaigns.filter((e) => !e.end || e.end === e.start), ...owner.filter((e) => !e.end || e.end === e.start)]
  const deleteOwner = (id: string) => setOwner((xs) => xs.filter((x) => x.id !== id))
  const addOwner = (title: string, startISO: string, endISO?: string) => setOwner((xs) => [...xs, { id: 'owner-' + Date.now(), kind: 'owner', title, start: startISO, end: endISO && endISO !== startISO ? endISO : undefined }])

  return (
    <div>
      <style>{`.cal-row::-webkit-scrollbar{display:none}`}</style>
      {/* Week / Month toggle */}
      <div style={{ display: 'flex', background: '#f1f3f2', borderRadius: 12, padding: 3, marginBottom: 16 }}>
        {(['week', 'month'] as const).map((k) => {
          const on = tab === k
          return (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, border: 'none', borderRadius: 8, padding: '8px 0', fontSize: 13.5, fontWeight: on ? 700 : 500, color: on ? C.ink : C.mute, background: on ? '#fff' : 'transparent', boxShadow: on ? '0 1px 3px rgba(0,0,0,.08)' : 'none', cursor: 'pointer', transition: 'all .15s', textTransform: 'capitalize' }}>{k}</button>
          )
        })}
      </div>

      {tab === 'month'
        ? <MonthView year={year} month={month} today={today} multiDay={multiDay} dots={allDots} recurring={RECURRING}
            onPrev={() => setCursor(new Date(year, month - 1, 1))} onNext={() => setCursor(new Date(year, month + 1, 1))} onToday={() => setCursor(new Date(today.getFullYear(), today.getMonth(), 1))}
            agenda={[...campaigns, ...owner, ...holidayEvents].filter((e) => withinMonth(e.start, year, month))}
            onDayClick={(d) => setAddFor(d)} onDeleteOwner={deleteOwner} />
        : <WeekView today={today} campaigns={campaigns} owner={owner} holidayEvents={holidayEvents} closedEvents={closedEvents} recurring={RECURRING} onDayClick={(d) => setAddFor(d)} />}

      {addFor && <AddEventSheet date={addFor} onClose={() => setAddFor(null)} onSave={(title, startISO, endISO) => { addOwner(title, startISO, endISO); setAddFor(null) }} />}
    </div>
  )
}

const withinMonth = (d: string, y: number, m: number) => { const x = parse(d); return x.getFullYear() === y && x.getMonth() === m }

/* ---------- Month grid ---------- */
function MonthView({ year, month, today, multiDay, dots, recurring, onPrev, onNext, onToday, agenda, onDayClick, onDeleteOwner }: {
  year: number; month: number; today: Date; multiDay: CalEvent[]; dots: CalEvent[]; recurring: typeof RECURRING
  onPrev: () => void; onNext: () => void; onToday: () => void; agenda: CalEvent[]; onDayClick: (d: Date) => void; onDeleteOwner: (id: string) => void
}) {
  const firstOfMonth = new Date(year, month, 1)
  const startPad = firstOfMonth.getDay()
  const weekCount = Math.ceil((startPad + new Date(year, month + 1, 0).getDate()) / 7)
  const reelDay = recurring.find((r) => r.id === 'weeklyreels')?.weekday ?? null

  const dotMap = new Map<string, { color: string }[]>()
  const pushDot = (key: string, color: string) => { const a = dotMap.get(key) ?? []; if (a.length < 3) a.push({ color }); dotMap.set(key, a) }
  dots.forEach((e) => pushDot(e.start, e.kind === 'holiday' ? C.holi : e.kind === 'owner' ? C.neutral : C.green))

  return (
    <div>
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 12px 12px' }}>
        {/* month header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, padding: '0 2px' }}>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 19 }}>{fmtMonth(firstOfMonth)}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={onToday} style={{ border: `1px solid ${C.line}`, background: '#fff', color: C.greenDk, borderRadius: 12, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Today</button>
            <NavBtn onClick={onPrev}><ChevronLeft size={17} /></NavBtn>
            <NavBtn onClick={onNext}><ChevronRight size={17} /></NavBtn>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', marginBottom: 2 }}>
          {DOW.map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: C.faint, paddingBottom: 4 }}>{d}</div>)}
        </div>

        {Array.from({ length: weekCount }).map((_, w) => {
          const rowSunday = addDays(firstOfMonth, -startPad + w * 7)
          const rowDates = Array.from({ length: 7 }, (_, i) => addDays(rowSunday, i))
          const weekStart = rowDates[0], weekEnd = rowDates[6]
          // multi-day bars overlapping this row
          const lanes: { startCol: number; span: number; color: string; bg: string; title: string }[] = []
          multiDay.forEach((ev) => {
            const s = parse(ev.start), e = parse(ev.end as string)
            if (e < weekStart || s > weekEnd) return
            const segS = s < weekStart ? weekStart : s
            const segE = e > weekEnd ? weekEnd : e
            const startCol = segS.getDay(), span = segE.getDay() - startCol + 1
            const isCamp = ev.kind === 'campaign'
            lanes.push({ startCol, span, title: ev.title, color: isCamp ? '#fff' : C.mute, bg: isCamp ? C.green : C.neutralBar })
          })
          const shown = lanes.slice(0, 2)
          return (
            <div key={w} style={{ marginBottom: 2 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
                {rowDates.map((d, i) => {
                  const inMonth = d.getMonth() === month
                  const isToday = sameDay(d, today)
                  return (
                    <div key={i} style={{ height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {inMonth && (
                        <button onClick={() => onDayClick(d)} aria-label={`Add event on ${fmtShort(d)}`} style={{ width: 26, height: 26, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: isToday ? 700 : 500, color: isToday ? '#fff' : C.ink, background: isToday ? C.green : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>{d.getDate()}</button>
                      )}
                    </div>
                  )
                })}
              </div>
              {/* bars */}
              {shown.map((b, li) => (
                <div key={li} style={{ position: 'relative', height: 17, marginTop: li === 0 ? 1 : 2 }}>
                  <div style={{ position: 'absolute', left: `calc(${(b.startCol / 7) * 100}% + 2px)`, width: `calc(${(b.span / 7) * 100}% - 4px)`, height: 15, background: b.bg, borderRadius: 5, display: 'flex', alignItems: 'center', paddingLeft: 6, overflow: 'hidden' }}>
                    <span style={{ fontSize: 9.5, fontWeight: 700, color: b.color, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{b.title}</span>
                  </div>
                </div>
              ))}
              {/* dots row (holidays, recurring reels, single-day campaigns) */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', height: 7, marginTop: 1 }}>
                {rowDates.map((d, i) => {
                  const ds = dotMap.get(iso(d)) ?? []
                  const reel = reelDay !== null && d.getDay() === reelDay && d.getMonth() === month
                  const all = [...ds, ...(reel ? [{ color: C.green }] : [])].slice(0, 3)
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                      {all.map((dot, j) => <span key={j} style={{ width: 4, height: 4, borderRadius: 2, background: dot.color }} />)}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* legend */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.line}` }}>
          <Legend color={C.green} label="Live" />
          <Legend color={C.holi} label="Holiday" square />
        </div>
      </div>

      {/* agenda */}
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '22px 2px 12px' }}>Coming up this month</div>
      {agenda.length === 0 ? (
        <div style={{ background: '#fff', border: `1px dashed ${C.line}`, borderRadius: 16, padding: '26px 22px', textAlign: 'center', color: C.faint, fontSize: 13.5, lineHeight: 1.5 }}>
          Nothing on the calendar yet. Tap any day to add your own event — and we&apos;ll flag the holidays worth planning for.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {[...agenda].sort((a, b) => (a.start < b.start ? -1 : 1)).map((e) => <AgendaCard key={e.id} e={e} onDelete={onDeleteOwner} />)}
        </div>
      )}
    </div>
  )
}

function AgendaCard({ e, onDelete }: { e: CalEvent; onDelete: (id: string) => void }) {
  if (e.kind === 'campaign') {
    return (
      <Link href={`/dashboard/campaigns/${e.id}`} style={{ display: 'block', textDecoration: 'none', color: 'inherit', background: '#fff', border: `1px solid ${C.greenLine}`, borderLeft: `3px solid ${C.green}`, borderRadius: 16, padding: '12px 13px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <Tile bg={C.greenSoft} fg={C.greenDk}><Megaphone size={18} /></Tile>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{e.title}</div>
            <div style={{ fontSize: 12.5, color: C.greenDk, marginTop: 1 }}>Campaign · runs {fmtRange(e.start, e.end)}{e.pieces ? ` · ${e.pieces} ${e.pieces === 1 ? 'piece' : 'pieces'}` : ''}</div>
          </div>
          <ArrowRight size={17} color={C.faint} />
        </div>
      </Link>
    )
  }
  if (e.kind === 'holiday') {
    return (
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '12px 13px', display: 'flex', alignItems: 'center', gap: 11 }}>
        <Tile bg={C.holiSoft} fg={C.holi}><Gift size={18} /></Tile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{e.title}</div>
          <div style={{ fontSize: 12.5, color: C.holi, marginTop: 1 }}>Holiday · {fmtShort(parse(e.start))} · worth planning</div>
        </div>
        <Link href="/dashboard/campaigns/new" style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: C.holi, fontWeight: 700, fontSize: 13, textDecoration: 'none', flexShrink: 0 }}>Plan <ArrowRight size={14} /></Link>
      </div>
    )
  }
  // owner event
  return (
    <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '13px 14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
        <Tile bg={C.bg2} fg={C.mute}><CalendarDays size={18} /></Tile>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15.5, color: C.ink }}>{e.title}</div>
          <div style={{ fontSize: 12.5, color: C.mute, marginTop: 1 }}>{fmtRange(e.start, e.end)}</div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <IconBtn label="Edit"><Pencil size={15} /></IconBtn>
          <IconBtn label="Delete" danger onClick={() => onDelete(e.id)}><Trash2 size={15} /></IconBtn>
        </div>
      </div>
      <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.45, marginBottom: 12 }}>Want to drive turnout? We&apos;ll make the posts + ads to promote it — you just approve.</div>
      <Link href="/dashboard/campaigns/new" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)', color: '#fff', borderRadius: 12, padding: '12px', fontFamily: 'var(--font-inter),system-ui,sans-serif', fontWeight: 700, fontSize: 15, textDecoration: 'none' }}><Megaphone size={17} /> Plan a promo for this</Link>
    </div>
  )
}

/* ---------- Week view ---------- */
function WeekView({ today, campaigns, owner, holidayEvents, closedEvents, recurring, onDayClick }: {
  today: Date; campaigns: CalEvent[]; owner: CalEvent[]; holidayEvents: CalEvent[]; closedEvents: CalEvent[]; recurring: typeof RECURRING; onDayClick: (d: Date) => void
}) {
  const mondayOf = (d: Date) => addDays(d, -((d.getDay() + 6) % 7))
  const [weekStart, setWeekStart] = useState<Date>(() => mondayOf(today))
  const weekEnd = addDays(weekStart, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))
  const DOWM = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
  const inWeek = (d: string) => { const x = parse(d); return x >= weekStart && x <= addDays(weekEnd, 0.99) }
  const clampDay = (s: string) => { const x = parse(s); return x < weekStart ? weekStart : x }
  const events = [...campaigns, ...owner].filter((e) => parse(e.start) <= weekEnd && parse(e.end ?? e.start) >= weekStart)

  const reelMeta = recurring.find((r) => r.id === 'weeklyreels')
  const items: { date: Date; node: React.ReactNode; key: string }[] = []
  if (reelMeta && reelMeta.weekday != null) {
    const fri = addDays(weekStart, ((reelMeta.weekday + 6) % 7))
    items.push({ date: fri, key: 'reel', node: (
      <Row tileBg={C.greenSoft} tileFg={C.greenDk} icon={<Film size={18} />} title="Weekly Reels reel" sub="Needs approval · part of Weekly Reels" subColor={C.amber}
        action={<Link href="/dashboard/approvals" style={actionLink(C.amber)}>Approve <ArrowRight size={14} /></Link>} />
    ) })
  }
  holidayEvents.filter((h) => inWeek(h.start)).forEach((h) => items.push({ date: parse(h.start), key: h.id, node: (
    <Row tileBg={C.holiSoft} tileFg={C.holi} icon={<Gift size={18} />} title={h.title} sub="Holiday · worth planning" subColor={C.holi}
      action={<Link href="/dashboard/campaigns/new" style={actionLink(C.holi)}>Plan <ArrowRight size={14} /></Link>} />
  ) }))
  closedEvents.filter((c) => inWeek(c.start)).forEach((c) => items.push({ date: parse(c.start), key: c.id, node: (
    <Row tileBg={C.bg2} tileFg={C.mute} icon={<Ban size={18} />} title={c.title} sub="Closed" subColor={C.faint}
      action={<ChevronRight size={17} color={C.faint} />} />
  ) }))
  events.forEach((e) => items.push({ date: clampDay(e.start), key: e.id, node: e.kind === 'campaign' ? (
    <Link href={`/dashboard/campaigns/${e.id}`} style={{ textDecoration: 'none' }}>
      <Row tileBg={C.greenSoft} tileFg={C.greenDk} icon={<Megaphone size={18} />} title={e.title} sub={`Campaign · ${fmtRange(e.start, e.end)}`} subColor={C.greenDk}
        action={<ArrowRight size={17} color={C.faint} />} />
    </Link>
  ) : (
    <Row tileBg={C.bg2} tileFg={C.mute} icon={<CalendarDays size={18} />} title={e.title} sub={fmtRange(e.start, e.end)} subColor={C.mute}
      action={<Link href="/dashboard/campaigns/new" style={actionLink(C.greenDk)}>Plan <ArrowRight size={14} /></Link>} />
  ) }))
  items.sort((a, b) => a.date.getTime() - b.date.getTime())

  const groups: { day: Date; rows: typeof items }[] = []
  items.forEach((it) => {
    const g = groups.find((x) => sameDay(x.day, it.date))
    if (g) g.rows.push(it); else groups.push({ day: it.date, rows: [it] })
  })

  const reelWeekday = reelMeta?.weekday ?? null
  const holidayThisWeek = holidayEvents.find((h) => inWeek(h.start))
  const plannedCount = (reelWeekday !== null ? 1 : 0) + events.length
  const isHoliday = (d: Date) => holidayEvents.some((h) => sameDay(parse(h.start), d))
  const hasContent = (d: Date) => (reelWeekday !== null && d.getDay() === reelWeekday) || events.some((e) => parse(e.start) <= d && parse(e.end ?? e.start) >= d)

  return (
    <div>
      {/* header + nav */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginBottom: 14 }}>
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 3 }}>This week</div>
          <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 25, lineHeight: 1, color: C.ink }}>Your week ahead</div>
          <div style={{ fontSize: 13, color: C.mute, marginTop: 6 }}>{plannedCount} planned{holidayThisWeek ? ` · ${holidayThisWeek.title} this week` : ''}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
          <button onClick={() => setWeekStart(mondayOf(today))} style={{ border: `1px solid ${C.line}`, background: '#fff', color: C.greenDk, borderRadius: 12, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>Today</button>
          <NavBtn onClick={() => setWeekStart(addDays(weekStart, -7))}><ChevronLeft size={17} /></NavBtn>
          <NavBtn onClick={() => setWeekStart(addDays(weekStart, 7))}><ChevronRight size={17} /></NavBtn>
        </div>
      </div>

      {/* week strip */}
      <div style={{ background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '14px 6px 12px', marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)' }}>
          {days.map((d, i) => {
            const t = sameDay(d, today), h = isHoliday(d)
            return (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: t ? C.greenDk : C.faint }}>{DOWM[i]}</span>
                <button onClick={() => onDayClick(d)} aria-label={`Add event on ${fmtShort(d)}`} style={{ width: 38, height: 38, borderRadius: '50%', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: t ? 700 : 600, color: t ? '#fff' : h ? C.holi : C.ink, background: t ? C.green : 'transparent', cursor: 'pointer', fontFamily: 'inherit' }}>{d.getDate()}</button>
                <span style={{ width: 5, height: 5, borderRadius: 3, background: hasContent(d) && !t ? C.ink : 'transparent' }} />
              </div>
            )
          })}
        </div>
      </div>

      {/* Recurring */}
      <div style={{ background: C.greenSoft, border: `1px solid ${C.greenLine}`, borderRadius: 16, padding: 14, marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 11 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.greenDk }}>
            <Repeat size={13} /> Recurring
          </span>
          <span style={{ fontSize: 12, color: C.mute }}>we run these</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {recurring.map((r) => (
            <div key={r.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 9, background: '#fff', border: `1px solid ${C.greenLine}`, borderRadius: 999, padding: '9px 14px', alignSelf: 'flex-start' }}>
              <r.Icon size={16} color={C.greenDk} />
              <span style={{ fontSize: 13.5, fontWeight: 700, color: C.ink }}>{r.label}</span>
              {r.cadence && <span style={{ fontSize: 12.5, color: C.faint }}>· {r.cadence}</span>}
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, margin: '0 2px 12px' }}>On the calendar this week</div>
      {groups.length === 0 ? (
        <div style={{ background: '#fff', border: `1px dashed ${C.line}`, borderRadius: 16, padding: '24px 20px', textAlign: 'center', color: C.faint, fontSize: 13.5 }}>Nothing scheduled this week.</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {groups.map((g) => (
            <div key={iso(g.day)}>
              <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: C.ink, marginBottom: 8 }}>{fmtDayLong(g.day)}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{g.rows.map((r) => <div key={r.key}>{r.node}</div>)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ---------- small atoms ---------- */
function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ width: 32, height: 32, borderRadius: 12, border: `1px solid ${C.line}`, background: '#fff', color: C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{children}</button>
}
function Legend({ color, label, square }: { color: string; label: string; square?: boolean }) {
  return <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: C.mute }}><span style={{ width: 9, height: 9, borderRadius: square ? 3 : 99, background: color }} />{label}</span>
}
function Tile({ bg, fg, children }: { bg: string; fg: string; children: React.ReactNode }) {
  return <div style={{ width: 42, height: 42, borderRadius: 12, background: bg, color: fg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{children}</div>
}
function IconBtn({ children, danger, onClick, label }: { children: React.ReactNode; danger?: boolean; onClick?: () => void; label?: string }) {
  return <button onClick={onClick} aria-label={label} style={{ width: 34, height: 34, borderRadius: 12, border: `1px solid ${danger ? 'rgba(192,57,43,0.25)' : C.line}`, background: danger ? '#fdecea' : '#fff', color: danger ? '#c0392b' : C.mute, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>{children}</button>
}
const actionLink = (color: string): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 4, color, fontWeight: 700, fontSize: 13, textDecoration: 'none', flexShrink: 0 })
function Row({ tileBg, tileFg, icon, title, sub, subColor, action }: { tileBg: string; tileFg: string; icon: React.ReactNode; title: string; sub: string; subColor: string; action: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 11, background: '#fff', border: `1px solid ${C.line}`, borderRadius: 16, padding: '11px 13px' }}>
      <Tile bg={tileBg} fg={tileFg}>{icon}</Tile>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15, color: C.ink }}>{title}</div>
        <div style={{ fontSize: 12.5, color: subColor, marginTop: 1 }}>{sub}</div>
      </div>
      {action}
    </div>
  )
}

/* Add your own dated event — no campaign required. */
function AddEventSheet({ date, onSave, onClose }: { date: Date; onSave: (title: string, startISO: string, endISO?: string) => void; onClose: () => void }) {
  const [title, setTitle] = useState('')
  const [start, setStart] = useState(iso(date))
  const [multi, setMulti] = useState(false)
  const [end, setEnd] = useState(iso(addDays(date, 1)))
  const canSave = title.trim().length > 0
  const field: React.CSSProperties = { width: '100%', border: `1px solid ${C.line}`, borderRadius: 12, padding: '11px 12px', fontSize: 14, color: C.ink, fontFamily: 'inherit', background: '#fff', boxSizing: 'border-box', outline: 'none' }
  const label: React.CSSProperties = { display: 'block', fontSize: 11, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.faint, marginBottom: 5 }
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(10,15,13,0.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '20px 20px calc(20px + env(safe-area-inset-bottom))' }}>
        <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 19, color: C.ink }}>Add an event</div>
        <div style={{ fontSize: 13, color: C.mute, margin: '2px 0 16px' }}>Your own date — no campaign needed. You can plan a promo for it later.</div>

        <label style={label}>Event</label>
        <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Restaurant Week, live music, anniversary…" style={{ ...field, marginBottom: 12 }} />

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>Starts</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} style={field} />
          </div>
          {multi && (
            <div style={{ flex: 1 }}>
              <label style={label}>Ends</label>
              <input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} style={field} />
            </div>
          )}
        </div>
        <button onClick={() => setMulti((m) => !m)} style={{ background: 'none', border: 'none', color: C.greenDk, fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: '10px 0 4px' }}>{multi ? '– Single day' : '+ Add an end date'}</button>

        <button disabled={!canSave} onClick={() => onSave(title.trim(), start, multi ? end : undefined)} style={{ width: '100%', marginTop: 8, height: 52, borderRadius: 12, border: 'none', cursor: canSave ? 'pointer' : 'default', background: canSave ? 'linear-gradient(135deg,#54c6a2 0%,#2e9a78 100%)' : '#cfe7dd', color: '#fff', fontFamily: 'var(--font-inter),system-ui,sans-serif', fontWeight: 600, fontSize: 15.5 }}>Add to calendar</button>
        <button onClick={onClose} style={{ width: '100%', height: 44, marginTop: 6, border: 'none', background: 'none', color: C.mute, fontWeight: 600, fontSize: 13.5, cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>
  )
}
