'use client'
/**
 * The Calendar view of the Campaigns tab (owner 2026-09-04: "comprehensive, intuitive, the
 * important items — scheduled posts, shoots, meetings, launches — what needs attention and
 * what is good to know").
 *
 * One month grid on top (a dot per thing, coloured by what it is), then the two lists that
 * answer the two questions an owner has: NEEDS YOU (anything waiting on them in the next
 * month) and COMING UP (what happens, day by day, from the day they tapped). Every row
 * wears the real mark of its network or a clear icon for its kind, and taps through.
 *
 * Sources: /api/dashboard/calendar (posts, emails, shoots, content, tasks), the campaigns
 * already on the page (their launch dates), and the occasion calendar (holidays worth a
 * post). Meetings are not a data source yet — nothing here pretends to be one.
 */
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, Camera, Mail, FileText, CheckSquare, Rocket, PartyPopper, Clock } from 'lucide-react'
import type { CalendarEvent, CalendarEventKind } from '@/lib/dashboard/get-calendar'
import type { SavedCampaign } from '@/lib/campaigns/view'
import { upcomingOccasions } from '@/lib/design/occasions'
import { BrandOrMark } from './mvp-insights'
import { C } from './mvp-detail'
import { HUES, KIND_HUE, gradOf, type HueKey } from './hues'
import { Mark } from './mark'

const DISPLAY = "'Cal Sans','Inter',sans-serif"
const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)'
/* the month grid sits on the page too (owner 2026-09-04) */
const CARD: React.CSSProperties = { padding: '4px 4px 8px', marginTop: 14 }
const H2: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, letterSpacing: '.01em', color: C.mute }
/* a plain list sits on the page, no card (owner 2026-09-04); the month grid keeps its card */
const LIST: React.CSSProperties = { marginTop: 16, padding: '0 4px' }
const DAY_MS = 86400000

type Kind = CalendarEventKind | 'launch' | 'occasion'
type Item = { id: string; kind: Kind; title: string; detail?: string; day: string; time?: string; allDay: boolean; status?: string; needsYou: boolean; href?: string; platform?: string }

/* one colour per kind — the dots on the grid, the tiles in the lists (the shared hue table) */
const kh = (k: Kind): HueKey => KIND_HUE[k] ?? 'mint'
const KIND: Record<Kind, { label: string; color: string; soft: string }> = {
  post: { label: 'Post', color: HUES[kh('post')][1], soft: HUES[kh('post')][0] + '29' },
  email: { label: 'Email', color: HUES[kh('email')][1], soft: HUES[kh('email')][0] + '29' },
  shoot: { label: 'Shoot', color: HUES[kh('shoot')][1], soft: HUES[kh('shoot')][0] + '29' },
  content: { label: 'Content', color: HUES[kh('content')][1], soft: HUES[kh('content')][0] + '29' },
  task: { label: 'To-do', color: HUES[kh('task')][1], soft: HUES[kh('task')][0] + '29' },
  launch: { label: 'Launch', color: HUES[kh('launch')][1], soft: HUES[kh('launch')][0] + '29' },
  occasion: { label: 'Occasion', color: HUES[kh('occasion')][1], soft: HUES[kh('occasion')][0] + '29' },
}
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const parse = (s: string) => new Date(s.length <= 10 ? `${s}T00:00:00` : s)
const dayLabel = (day: string, today: string) => {
  if (day === today) return 'Today'
  if (day === ymd(new Date(parse(today).getTime() + DAY_MS))) return 'Tomorrow'
  return parse(day).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function KindMark({ item }: { item: Item }) {
  const k = KIND[item.kind]
  if (item.kind === 'post' && item.platform) {
    return <span style={{ width: 36, height: 36, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><BrandOrMark provider={item.platform} size={20} /></span>
  }
  const icon = item.kind === 'shoot' ? <Camera size={17} /> : item.kind === 'email' ? <Mail size={17} /> : item.kind === 'task' ? <CheckSquare size={17} /> : item.kind === 'launch' ? <Rocket size={17} /> : item.kind === 'occasion' ? <PartyPopper size={17} /> : <FileText size={17} />
  return <Mark hue={kh(item.kind)} size={40}>{icon}</Mark>
}

function Row({ item, first }: { item: Item; first: boolean }) {
  const k = KIND[item.kind]
  const inner = (
    <>
      <KindMark item={item} />
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 600, color: C.ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.title}</span>
        <span style={{ display: 'block', fontSize: 12, color: C.mute, marginTop: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {KIND[item.kind].label}{item.time ? ` · ${item.time}` : ''}{item.detail ? ` · ${item.detail}` : ''}
        </span>
      </span>
      {!item.status && <span style={{ fontSize: 11, fontWeight: 600, color: k.color, background: k.soft, borderRadius: 99, padding: '3px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>{k.label}</span>}
      {item.status && <span style={{ fontSize: 11, fontWeight: 700, color: item.needsYou ? '#a8720c' : C.mute, background: item.needsYou ? '#fbf1da' : C.bg, borderRadius: 99, padding: '3px 8px', flexShrink: 0, whiteSpace: 'nowrap' }}>{item.status}</span>}
      {item.href && <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
    </>
  )
  const style: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 12, padding: '8px 0', textDecoration: 'none', color: 'inherit' }
  return item.href ? <Link href={item.href} className="mvp-row" style={style}>{inner}</Link> : <div style={style}>{inner}</div>
}

export default function MvpCalendar({ clientId, campaigns }: { clientId?: string; campaigns: SavedCampaign[] }) {
  const today = ymd(new Date())
  const [cur, setCur] = useState(() => { const d = new Date(); return { y: d.getFullYear(), m: d.getMonth() } })
  const [sel, setSel] = useState(today)
  const [events, setEvents] = useState<CalendarEvent[]>([])
  const [loading, setLoading] = useState(true)

  // the month on screen plus a week either side, so the lists never end at a month edge
  useEffect(() => {
    if (!clientId) return
    let live = true
    const from = new Date(cur.y, cur.m, 1 - 7).toISOString(), to = new Date(cur.y, cur.m + 1, 7).toISOString()
    setLoading(true)
    fetch(`/api/dashboard/calendar?clientId=${clientId}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
      .then((r) => r.json()).then((j) => { if (live) setEvents(Array.isArray(j?.events) ? j.events : []) })
      .catch(() => { if (live) setEvents([]) }).finally(() => { if (live) setLoading(false) })
    return () => { live = false }
  }, [clientId, cur.y, cur.m])

  const items = useMemo<Item[]>(() => {
    const out: Item[] = []
    for (const e of events) {
      const d = new Date(e.startIso)
      const needsYou = e.statusTone === 'amber' || e.statusTone === 'red' || /approv|review|confirm|need|waiting|due/i.test(e.status)
      out.push({ id: e.id, kind: e.kind, title: e.title, detail: e.detail, day: ymd(d), time: e.allDay ? undefined : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), allDay: e.allDay, status: e.status, needsYou, href: e.href, platform: e.platforms?.[0] })
    }
    for (const c of campaigns) {
      const td = c.draft.targetDate
      if (!td || c.status === 'draft') continue
      const live = c.status === 'shipped'
      out.push({ id: `launch-${c.draft.id}`, kind: 'launch', title: c.draft.name, day: td, allDay: true, status: live ? 'Live' : 'Planned', needsYou: false, href: `/dashboard/campaigns/${c.draft.id}` })
    }
    for (const o of upcomingOccasions(new Date(), 75, 0, 8)) {
      out.push({ id: `occ-${o.dateISO}-${o.name}`, kind: 'occasion', title: o.name, detail: 'worth a post', day: o.dateISO, allDay: true, needsYou: false, href: '/dashboard/design/order' })
    }
    return out.sort((a, b) => a.day.localeCompare(b.day) || (a.time ?? '').localeCompare(b.time ?? ''))
  }, [events, campaigns])

  const byDay = useMemo(() => { const m = new Map<string, Item[]>(); for (const i of items) { const l = m.get(i.day) ?? []; l.push(i); m.set(i.day, l) } return m }, [items])
  const first = new Date(cur.y, cur.m, 1)
  const daysIn = new Date(cur.y, cur.m + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(first.getDay()).fill(null), ...Array.from({ length: daysIn }, (_, i) => i + 1)]
  const monthLabel = first.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  const needs = items.filter((i) => i.needsYou && i.day >= today && parse(i.day).getTime() - parse(today).getTime() <= 31 * DAY_MS)
  const fromSel = [...byDay.entries()].filter(([d]) => d >= sel && parse(d).getTime() - parse(sel).getTime() <= 14 * DAY_MS).sort(([a], [b]) => a.localeCompare(b))
  const dotsFor = (day: string) => { const l = byDay.get(day) ?? []; const kinds = [...new Set(l.map((i) => i.kind))]; return kinds.slice(0, 3) }

  return (
    <div>
      {/* the month */}
      <div style={{ ...CARD, marginTop: 0, padding: '4px 4px 10px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <button type="button" aria-label="Previous month" onClick={() => setCur((c) => ({ y: c.m === 0 ? c.y - 1 : c.y, m: c.m === 0 ? 11 : c.m - 1 }))} style={{ width: 34, height: 34, borderRadius: 99, border: 'none', background: C.bg, color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronLeft size={18} /></button>
          <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16 }}>{monthLabel}</span>
          <button type="button" aria-label="Next month" onClick={() => setCur((c) => ({ y: c.m === 11 ? c.y + 1 : c.y, m: c.m === 11 ? 0 : c.m + 1 }))} style={{ width: 34, height: 34, borderRadius: 99, border: 'none', background: C.bg, color: C.ink, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><ChevronRight size={18} /></button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2, marginBottom: 4 }}>
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10.5, fontWeight: 700, color: C.faint }}>{d}</div>)}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />
            const day = ymd(new Date(cur.y, cur.m, d))
            const isToday = day === today, isSel = day === sel
            const dots = dotsFor(day)
            return (
              <button key={i} type="button" onClick={() => setSel(day)} aria-pressed={isSel} aria-label={day} style={{ aspectRatio: '1', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3, borderRadius: 10, border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0, background: isSel ? C.greenSoft : 'transparent', boxShadow: isToday && !isSel ? `inset 0 0 0 1.5px ${C.green}` : 'none', transition: 'background .15s' }}>
                <span style={{ fontSize: 12.5, fontWeight: isToday || isSel ? 700 : 500, color: isSel || isToday ? C.greenDk : C.ink }}>{d}</span>
                <span style={{ display: 'flex', gap: 2, height: 6 }}>{dots.map((k) => <span key={k} style={{ width: 6, height: 6, borderRadius: 99, background: KIND[k].color }} />)}</span>
              </button>
            )
          })}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginTop: 12, fontSize: 11, color: C.mute }}>
          {(['post', 'shoot', 'email', 'task', 'launch', 'occasion'] as Kind[]).map((k) => <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 7, height: 7, borderRadius: 99, background: KIND[k].color }} />{KIND[k].label}</span>)}
        </div>
      </div>

      {/* needs you */}
      {needs.length > 0 && (
        <div style={LIST}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ ...H2, display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf('amber') }} />Needs you</span><span style={{ fontSize: 12.5, color: C.faint }}>next 30 days</span></div>
          {needs.slice(0, 6).map((it, i) => <Row key={it.id} item={it} first={i === 0} />)}
        </div>
      )}

      {/* coming up, from the tapped day */}
      <div style={LIST}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 6 }}><span style={{ ...H2, display: 'inline-flex', alignItems: 'center', gap: 8 }}><span style={{ width: 7, height: 7, borderRadius: 4, background: gradOf('mint') }} />Coming up</span><span style={{ fontSize: 12.5, color: C.faint }}>from {dayLabel(sel, today).toLowerCase()}, two weeks</span></div>
        {loading && items.length === 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.faint, fontSize: 13, padding: '14px 0' }}><Clock size={15} /> Getting your calendar…</div>
        ) : fromSel.length === 0 ? (
          <div style={{ fontSize: 13, color: C.mute, padding: '12px 0', lineHeight: 1.45 }}>Nothing planned in these two weeks. <Link href="/dashboard/campaigns/new" style={{ color: C.greenDk, fontWeight: 600, textDecoration: 'none' }}>Start something →</Link></div>
        ) : fromSel.map(([day, list]) => (
          <div key={day} style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12.5, fontWeight: 700, color: day === today ? C.greenDk : C.mute, padding: '6px 0 2px' }}>{dayLabel(day, today)}</div>
            {list.map((it, i) => <Row key={it.id} item={it} first={i === 0} />)}
          </div>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5, margin: '14px 4px 0', textAlign: 'center' }}>Posts, emails, shoots, to-dos, launches and occasions. Meetings are not on here yet.</div>
    </div>
  )
}
