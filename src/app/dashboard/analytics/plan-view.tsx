'use client'

/**
 * Collaborative Plan calendar (v5 design, feed-driven).
 *
 * Renders the unified, viewer-centric feed (owner plans + shoots + agency
 * content) as a Timeline and a Calendar. Owner plans are editable and can
 * be shared (participants, visibility) and annotated (notes, private or
 * sent to a strategist). Shoots and agency items are read-only detail.
 *
 * Data comes from getPlanFeed(); mutations go through the plan-actions
 * server actions, after which we refresh the route.
 */

import { useEffect, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import type { PlanFeed, PlanFeedItem } from '@/lib/dashboard/get-plan-feed'
import type { AssignablePerson } from '@/lib/dashboard/get-plan-feed'
import {
  createPlan, updatePlan, deletePlan,
  addParticipant, removeParticipant, setPlanVisibility,
  addNote, deleteNote, getPlanNotes, type PlanNote,
} from './plan-actions'
import type { PlanKind, PlanStatus } from '@/lib/dashboard/get-plans'

export interface Opportunity { when: string; title: string; hint: string; cta: string; icon: string; href?: string }
interface Props {
  feed: PlanFeed
  opportunities: Opportunity[]
  people: AssignablePerson[]
  activeClientId: string | null
  isAdmin: boolean
}

/* ── icons ── */
const ICONS: Record<string, string> = {
  chevronLeft: '<path d="m15 18-6-6 6-6"/>', chevronRight: '<path d="m9 18 6-6-6-6"/>', chevronDown: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M5 12h14"/><path d="M12 5v14"/>', x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  megaphone: '<path d="m3 11 18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  calendarDays: '<path d="M8 2v4"/><path d="M16 2v4"/><rect width="18" height="18" x="3" y="4" rx="2"/><path d="M3 10h18"/>',
  star: '<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13"/><path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8"/><path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8"/>',
  bell: '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>',
  send: '<path d="m22 2-7 20-4-9-9-4z"/><path d="M22 2 11 13"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  checkCircle: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m22 4-10 10.01-3-3"/>',
  calendarPlus: '<path d="M8 2v4"/><path d="M16 2v4"/><path d="M21 13V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h7"/><path d="M3 10h18"/><path d="M16 19h6"/><path d="M19 16v6"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  trash: '<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  trendDown: '<path d="M16 17h6v-6"/><path d="m22 17-8.5-8.5-5 5L2 7"/>',
  image: '<rect width="18" height="18" x="3" y="3" rx="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21"/>',
  sparkles: '<path d="m12 3 1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden dangerouslySetInnerHTML={{ __html: ICONS[name] ?? '' }} />
  )
}

/* ── kind / visual meta ── */
type Visual = { icon: string; fg: string; bg: string }
const KIND: Record<string, Visual & { label: string }> = {
  promotion: { icon: 'megaphone', fg: 'var(--p-green-fg)', bg: 'var(--p-green-bg)', label: 'Promo' },
  event: { icon: 'calendarDays', fg: 'var(--p-blue-fg)', bg: 'var(--p-blue-bg)', label: 'Event' },
  special: { icon: 'star', fg: 'var(--p-amber-fg)', bg: 'var(--p-amber-bg)', label: 'Special' },
  content: { icon: 'camera', fg: 'var(--p-violet-fg)', bg: 'var(--p-violet-bg)', label: 'Social post' },
  holiday: { icon: 'gift', fg: 'var(--p-rose-fg)', bg: 'var(--p-rose-bg)', label: 'Holiday' },
  reminder: { icon: 'bell', fg: 'var(--p-slate-fg)', bg: 'var(--p-slate-bg)', label: 'To-do' },
}
const KIND_ORDER: PlanKind[] = ['promotion', 'event', 'special', 'content', 'holiday', 'reminder']
const STATUS_ORDER: PlanStatus[] = ['idea', 'planned', 'done']
const SM: Record<string, string> = { idea: 'Idea', planned: 'Planned', done: 'Done' }
const AGENCY_ICON: Record<string, string> = { post: 'send', email: 'mail', shoot: 'camera', content: 'fileText', task: 'checkCircle' }
const DOT_COLOR: Record<string, string> = {
  promotion: '#3aae8c', event: '#2f6da0', special: '#b07814', content: '#6a4cba', holiday: '#c0443c', reminder: '#586273',
}

function visual(item: PlanFeedItem): Visual {
  if (item.source === 'owner') return KIND[item.kind] ?? KIND.event
  if (item.source === 'shoot') return { icon: 'camera', fg: 'var(--p-slate-fg)', bg: 'var(--p-slate-bg)' }
  return { icon: AGENCY_ICON[item.kind] ?? 'fileText', fg: 'var(--p-slate-fg)', bg: 'var(--p-slate-bg)' }
}
function dotColor(item: PlanFeedItem): string {
  return item.source === 'owner' ? (DOT_COLOR[item.kind] ?? '#586273') : '#586273'
}
function uniqueDots(items: PlanFeedItem[]): string[] {
  const seen = new Set<string>(); const out: string[] = []
  for (const it of items) { const c = dotColor(it); if (!seen.has(c)) { seen.add(c); out.push(c) } if (out.length >= 3) break }
  return out
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/); return ((p[0]?.[0] ?? '') + (p[1]?.[0] ?? '')).toUpperCase() || '?'
}
const OPP_KIND: Record<string, PlanKind> = { gift: 'holiday', calendar: 'event', calendarDays: 'event', trenddown: 'special', trendDown: 'special', image: 'content', camera: 'content' }
function normOppIcon(n: string): string {
  const map: Record<string, string> = { gift: 'gift', calendar: 'calendarDays', calendarDays: 'calendarDays', calplus: 'calendarPlus', trenddown: 'trendDown', trendDown: 'trendDown', image: 'image', clock: 'clock', star: 'star', megaphone: 'megaphone' }
  return map[n] ?? 'sparkles'
}

/* ── date helpers ── */
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const parseYmd = (s: string) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d) }
const addDays = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
const firstOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1)
function monthMatrix(c: Date) { const f = firstOfMonth(c); const g = addDays(f, -f.getDay()); return Array.from({ length: 42 }, (_, i) => addDays(g, i)) }
function fmtTime(t: string | null) { if (!t) return null; const [h, m] = t.split(':').map(Number); const ap = h >= 12 ? 'PM' : 'AM'; const h12 = h % 12 === 0 ? 12 : h % 12; return `${h12}:${pad(m)} ${ap}` }
const fmtDH = (s: string) => parseYmd(s).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
const fmtLong = (s: string) => parseYmd(s).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
const fmtMD = (s: string) => parseYmd(s).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })

export default function PlanView({ feed, opportunities, people, activeClientId }: Props) {
  const router = useRouter()
  const todayStr = ymd(new Date())
  const diff = (s: string) => Math.round((parseYmd(s).getTime() - parseYmd(todayStr).getTime()) / 86_400_000)
  const fmtRel = (s: string) => { const n = diff(s); if (n === 0) return 'Today'; if (n === 1) return 'Tomorrow'; if (n > 1 && n < 7) return parseYmd(s).toLocaleDateString('en-US', { weekday: 'long' }); return fmtDH(s) }

  const [view, setView] = useState<'timeline' | 'calendar'>('timeline')
  const [cursor, setCursor] = useState(() => firstOfMonth(new Date()))
  const [selected, setSelected] = useState(todayStr)
  const [editing, setEditing] = useState<PlanFeedItem | null>(null)
  const [creating, setCreating] = useState<{ date: string; prefill?: Partial<FormState> } | null>(null)
  const showSheet = editing !== null || creating !== null
  const multiClient = feed.clients.length > 1

  const dayMap = useMemo(() => {
    const m = new Map<string, PlanFeedItem[]>()
    const push = (k: string, it: PlanFeedItem) => { const a = m.get(k) ?? []; a.push(it); m.set(k, a) }
    for (const it of feed.items) {
      if (it.source === 'owner' && it.endDate && it.endDate !== it.startDate) {
        let d = parseYmd(it.startDate); const end = parseYmd(it.endDate)
        for (let i = 0; i < 90 && d <= end; i++) { push(ymd(d), it); d = addDays(d, 1) }
      } else push(it.startDate, it)
    }
    return m
  }, [feed.items])

  const upcoming = useMemo(() => {
    const fut = feed.items.filter(it => (it.endDate || it.startDate) >= todayStr)
    const byDate = new Map<string, PlanFeedItem[]>()
    for (const it of fut) {
      const anchor = it.startDate < todayStr ? todayStr : it.startDate
      const a = byDate.get(anchor) ?? []; a.push(it); byDate.set(anchor, a)
    }
    return [...byDate.keys()].sort().map(date => ({
      date,
      items: byDate.get(date)!.sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? '')),
    }))
  }, [feed.items, todayStr])

  const weekCount = useMemo(() => {
    let own = 0, team = 0
    for (let i = 0; i < 7; i++) {
      const k = ymd(addDays(new Date(), i))
      for (const it of dayMap.get(k) ?? []) (it.source === 'owner') ? own++ : team++
    }
    return { own, team, total: own + team }
  }, [dayMap])

  function refresh() { router.refresh() }
  function switchClient(id: string) {
    const url = new URL(window.location.href); url.searchParams.set('clientId', id); router.push(url.pathname + url.search)
  }

  function Avatars({ list }: { list: PlanFeedItem['participants'] }) {
    if (!list.length) return null
    return (
      <span className="ppl">
        {list.slice(0, 3).map(p => (
          <span key={p.id} className="av" title={p.name}>{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}</span>
        ))}
        {list.length > 3 && <span className="av more">+{list.length - 3}</span>}
      </span>
    )
  }

  function Card({ item }: { item: PlanFeedItem }) {
    const v = visual(item)
    const time = item.allDay ? null : fmtTime(item.startTime)
    const range = item.source === 'owner' && item.endDate && item.endDate !== item.startDate
      ? `${fmtMD(item.startDate)}–${fmtMD(item.endDate)}` : null
    const sub = [range, item.detail].filter(Boolean).join(' · ') || (item.source === 'owner' ? KIND[item.kind]?.label : null)
    return (
      <button className={`card${item.status === 'done' ? ' done' : ''}`} onClick={() => setEditing(item)} aria-label={item.title}>
        <span className="card-ic" style={{ background: v.bg, color: v.fg }}><Icon name={v.icon} /></span>
        <span className="card-m">
          <span className="card-top">
            <span className="card-t">{item.title}</span>
            {time && <span className="card-time">{time}</span>}
          </span>
          {sub && <span className="card-s">{sub}</span>}
          <span className="card-foot">
            {item.source !== 'owner' && <span className="tag apnosh">Apnosh</span>}
            {item.source === 'owner' && item.status !== 'planned' && <span className={`tag ${item.status}`}>{SM[item.status]}</span>}
            {item.source === 'owner' && item.participants.length > 0 && <span className="tag shared">Shared</span>}
            <Avatars list={item.participants} />
          </span>
        </span>
      </button>
    )
  }

  function Timeline() {
    const line = weekCount.total === 0 ? 'Your week is open' : weekCount.total === 1 ? '1 thing on this week' : `${weekCount.total} things on this week`
    const sub = weekCount.team > 0 ? `${weekCount.own} you planned · ${weekCount.team} from your Apnosh team` : `${weekCount.own} planned`
    return (
      <>
        <div className="hero">
          <div className="hero-eyebrow">This week</div>
          <p className="hero-line">{line}</p>
          <p className="hero-sub">{sub}</p>
          <div className="hw">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(new Date(), i); const k = ymd(d); const dots = uniqueDots(dayMap.get(k) ?? [])
              return (
                <button key={k} className={`hw-d${k === todayStr ? ' today' : ''}`} onClick={() => { setSelected(k); setCursor(firstOfMonth(d)); setView('calendar') }} aria-label={fmtLong(k)}>
                  <span className="hw-w">{['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'][d.getDay()]}</span>
                  <span className="hw-n">{d.getDate()}</span>
                  <span className="hw-dots">{dots.map((c, j) => <span key={j} className="hw-dot" style={{ background: c }} />)}</span>
                </button>
              )
            })}
          </div>
        </div>

        {opportunities.length > 0 && (
          <>
            <div className="sec"><div className="sec-h"><span className="sec-t">Worth planning</span></div></div>
            <div className="mi">
              {opportunities.map((o, i) => (
                <button key={i} className="mi-card" onClick={() => setCreating({ date: selected, prefill: { title: o.title, kind: OPP_KIND[o.icon] ?? 'promotion' } })}>
                  <div className="mi-top"><span className="mi-ic"><Icon name={normOppIcon(o.icon)} /></span>
                    <div><div className="mi-when">{o.when}</div><div className="mi-title">{o.title}</div></div>
                  </div>
                  <p className="mi-hint">{o.hint}</p>
                  <span className="mi-cta"><Icon name="plus" size={14} /> {o.cta || 'Plan it'}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className="sec"><div className="sec-h"><span className="sec-t">Upcoming</span></div>
          {upcoming.length === 0 ? (
            <div className="empty"><span className="card-ic"><Icon name="calendarPlus" /></span><p>Nothing scheduled yet. Tap + to plan your first thing.</p></div>
          ) : (
            <div className="tl">
              {upcoming.map(g => {
                const rel = fmtRel(g.date); const full = fmtDH(g.date)
                return (
                  <div key={g.date} className={`tl-group${g.date === todayStr ? ' now' : ''}`}>
                    <span className="tl-node" style={{ background: g.date === todayStr ? 'var(--brand)' : '#cfcfca' }} />
                    <div className="tl-date">{rel}{rel !== full && <span className="sub">{full}</span>}</div>
                    <div className="tl-cards">{g.items.map(it => <Card key={it.id} item={it} />)}</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </>
    )
  }

  function Calendar() {
    const cells = monthMatrix(cursor)
    const selItems = (dayMap.get(selected) ?? []).slice().sort((a, b) => (a.startTime ?? '').localeCompare(b.startTime ?? ''))
    const nextDay = [...dayMap.keys()].filter(k => k > selected).sort()[0]
    return (
      <>
        <div className="cal">
          <div className="cal-head">
            <span className="m">{cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</span>
            <button className="navbtn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))} aria-label="Previous month"><Icon name="chevronLeft" /></button>
            <button className="navbtn" onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))} aria-label="Next month"><Icon name="chevronRight" /></button>
            <button className="today-btn" onClick={() => { const t = new Date(); setCursor(firstOfMonth(t)); setSelected(ymd(t)) }}>Today</button>
          </div>
          <div className="cal-wd">{['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className="cal-grid">
            {cells.map(d => {
              const k = ymd(d); const inMo = d.getMonth() === cursor.getMonth(); const dots = uniqueDots(dayMap.get(k) ?? [])
              return (
                <button key={k} className={`cal-cell${inMo ? '' : ' out'}${k === todayStr ? ' today' : ''}${k === selected ? ' sel' : ''}`} onClick={() => { setSelected(k); if (d.getMonth() !== cursor.getMonth()) setCursor(firstOfMonth(d)) }} aria-label={fmtLong(k)}>
                  <span className="cal-d">{d.getDate()}</span>
                  <span className="cal-dots">{dots.map((c, j) => <span key={j} className="cal-dot" style={{ background: c }} />)}</span>
                </button>
              )
            })}
          </div>
        </div>
        <div className="cal-day">
          <div className="cal-day-h">
            <span className="cal-day-t">{selected === todayStr ? 'Today' : fmtDH(selected)}{selItems.length ? ` · ${selItems.length}` : ''}</span>
            <button className="cal-day-add" onClick={() => setCreating({ date: selected })}><Icon name="plus" size={15} /> Add</button>
          </div>
          {selItems.length ? (
            <div className="tl-cards">{selItems.map(it => <Card key={it.id} item={it} />)}</div>
          ) : (
            <div className="empty"><span className="card-ic"><Icon name="calendarPlus" /></span>
              <div><p>Nothing planned for this day.</p>
                {nextDay && <button className="cal-next" onClick={() => setSelected(nextDay)}>Next up {fmtRel(nextDay)} <Icon name="chevronRight" size={14} /></button>}
              </div>
            </div>
          )}
        </div>
      </>
    )
  }

  return (
    <div className="m-plan pb-tabbar">
      <div className="hd">
        <h1 className="hd-title">Plan</h1>
        <div className="hd-r">
          <span className="seg" role="tablist">
            <button className={view === 'timeline' ? 'on' : ''} onClick={() => setView('timeline')}>Timeline</button>
            <button className={view === 'calendar' ? 'on' : ''} onClick={() => setView('calendar')}>Calendar</button>
          </span>
          <button className="add" onClick={() => setCreating({ date: selected })} aria-label="Add plan"><Icon name="plus" /></button>
        </div>
      </div>

      {multiClient && (
        <div className="clbar">
          {feed.clients.map(c => (
            <button key={c.id} className={`clpill${c.id === activeClientId ? ' on' : ''}`} onClick={() => switchClient(c.id)}>{c.name ?? 'Restaurant'}</button>
          ))}
        </div>
      )}

      {feed.approvals > 0 && (
        <button className="approve" onClick={() => router.push('/dashboard/inbox?filter=approval')}>
          <span className="approve-ic"><Icon name="checkCircle" /></span>
          <span><span className="approve-t" style={{ display: 'block' }}>{feed.approvals} need{feed.approvals === 1 ? 's' : ''} your approval</span><span className="approve-s">Review what your team prepared</span></span>
          <span className="chev"><Icon name="chevronRight" /></span>
        </button>
      )}

      {view === 'timeline' ? <Timeline /> : <Calendar />}

      {showSheet && (
        <PlanSheet
          editing={editing}
          defaultDate={creating?.date ?? selected}
          prefill={creating?.prefill}
          activeClientId={activeClientId}
          people={people}
          hasStrategist={feed.hasStrategist}
          onClose={() => { setEditing(null); setCreating(null) }}
          onChanged={refresh}
        />
      )}
    </div>
  )
}

/* ════════════════════════════ Sheet ════════════════════════════ */
interface FormState {
  title: string; kind: PlanKind; startDate: string; endDate: string
  allDay: boolean; startTime: string; status: PlanStatus; notes: string
}
function PlanSheet({
  editing, defaultDate, prefill, activeClientId, people, hasStrategist, onClose, onChanged,
}: {
  editing: PlanFeedItem | null
  defaultDate: string
  prefill?: Partial<FormState>
  activeClientId: string | null
  people: AssignablePerson[]
  hasStrategist: boolean
  onClose: () => void
  onChanged: () => void
}) {
  const editable = editing === null || editing.editable
  const planId = editing && editing.source === 'owner' ? editing.id : null
  const readOnly = editing !== null && !editable

  const [form, setForm] = useState<FormState>(() => ({
    title: editing?.title ?? prefill?.title ?? '',
    kind: (editing && editing.source === 'owner' ? (editing.kind as PlanKind) : prefill?.kind) ?? 'promotion',
    startDate: editing?.startDate ?? defaultDate,
    endDate: editing?.endDate ?? '',
    allDay: editing ? editing.allDay : true,
    startTime: editing?.startTime ?? '',
    status: (editing && editing.source === 'owner' ? (editing.status as PlanStatus) : undefined) ?? 'planned',
    notes: '',
  }))
  const [advanced, setAdvanced] = useState(false)
  const [err, setErr] = useState('')
  const [pending, start] = useTransition()

  const [notes, setNotes] = useState<PlanNote[]>([])
  const [noteText, setNoteText] = useState('')
  const [noteVis, setNoteVis] = useState<'private' | 'shared' | 'strategist'>('private')
  useEffect(() => { if (planId) getPlanNotes(planId).then(setNotes).catch(() => {}) }, [planId])

  const update = (p: Partial<FormState>) => setForm(f => ({ ...f, ...p }))

  function save() {
    if (!form.title.trim()) { setErr('Give it a title'); return }
    if (form.endDate && form.endDate < form.startDate) { setErr('End date is before the start date'); return }
    setErr('')
    const input = {
      title: form.title.trim(), kind: form.kind, notes: null,
      startDate: form.startDate, endDate: form.endDate || null,
      allDay: form.allDay, startTime: form.allDay ? null : (form.startTime || null),
      status: form.status, clientId: editing?.clientId ?? activeClientId ?? undefined,
    }
    start(async () => {
      const res = planId ? await updatePlan(planId, input) : await createPlan(input)
      if (!res.ok) { setErr(res.error); return }
      onChanged(); onClose()
    })
  }
  function remove() {
    if (!planId) return
    start(async () => { const res = await deletePlan(planId, editing?.clientId); if (res.ok) { onChanged(); onClose() } else setErr(res.error) })
  }
  function addPerson(p: AssignablePerson) {
    if (!planId) return
    start(async () => { const res = await addParticipant(planId, p.id, p.role ?? undefined); if (res.ok) onChanged() })
  }
  function dropPerson(personId: string) {
    if (!planId) return
    start(async () => { const res = await removeParticipant(planId, personId); if (res.ok) onChanged() })
  }
  function toggleVisibility() {
    if (!planId || !editing) return
    const next = editing.visibility === 'private' ? 'team' : 'private'
    start(async () => { const res = await setPlanVisibility(planId, next); if (res.ok) onChanged() })
  }
  function submitNote() {
    if (!planId || !noteText.trim()) return
    start(async () => { const res = await addNote(planId, noteText, noteVis); if (res.ok) { setNoteText(''); setNotes(await getPlanNotes(planId)) } })
  }
  function dropNote(id: string) {
    start(async () => { const res = await deleteNote(id); if (res.ok && planId) setNotes(await getPlanNotes(planId)) })
  }

  const partIds = new Set((editing?.participants ?? []).map(p => p.id))
  const candidates = people.filter(p => !partIds.has(p.id))

  return (
    <>
      <button className="m-plan-veil" onClick={onClose} aria-label="Close" />
      <div className="m-plan-sheet" role="dialog" aria-modal>
        <div className="grab" />
        <div className="sh-h">
          <h2 className="sh-t">{readOnly ? (editing?.title ?? 'Detail') : editing ? 'Edit plan' : 'New plan'}</h2>
          <button className="xbtn" onClick={onClose} aria-label="Close"><Icon name="x" size={17} /></button>
        </div>

        {readOnly ? (
          <ReadOnlyDetail item={editing!} />
        ) : (
          <>
            {err && <p className="err">{err}</p>}
            <div className="field"><input className="inp title" placeholder="What are you planning?" value={form.title} onChange={e => update({ title: e.target.value })} aria-label="Title" /></div>
            <div className="field"><span className="lbl">Type</span><div className="chips">
              {KIND_ORDER.map(k => {
                const m = KIND[k]; const on = k === form.kind
                return <button key={k} className={`chip${on ? ' on' : ''}`} style={on ? { background: m.bg, color: m.fg } : undefined} onClick={() => update({ kind: k })}><Icon name={m.icon} size={15} /> {m.label}</button>
              })}
            </div></div>
            <div className="field"><span className="lbl">Date</span><input className="inp" type="date" value={form.startDate} onChange={e => update({ startDate: e.target.value })} aria-label="Date" /></div>

            <button className="more-toggle" onClick={() => setAdvanced(a => !a)}>{advanced ? 'Fewer options' : 'More options'} <Icon name="chevronDown" size={15} /></button>
            {advanced && (
              <>
                <div className="field"><span className="lbl">Ends (optional)</span><input className="inp" type="date" value={form.endDate} min={form.startDate} onChange={e => update({ endDate: e.target.value })} aria-label="End date" /></div>
                <div className="field"><div className="tgl"><span className="lbl" style={{ margin: 0 }}>All day</span><button className={`sw${form.allDay ? ' on' : ''}`} onClick={() => update({ allDay: !form.allDay })} aria-pressed={form.allDay} aria-label="All day" /></div>
                  {!form.allDay && <div style={{ marginTop: 10 }}><input className="inp" type="time" value={form.startTime} onChange={e => update({ startTime: e.target.value })} aria-label="Time" /></div>}
                </div>
                <div className="field"><span className="lbl">Stage</span><div className="chips">
                  {STATUS_ORDER.map(s => <button key={s} className={`chip${s === form.status ? ' on' : ''}`} style={s === form.status ? { background: 'var(--brand-t)', color: 'var(--brand-d)' } : undefined} onClick={() => update({ status: s })}><Icon name={s === 'done' ? 'checkCircle' : s === 'idea' ? 'clock' : 'calendarDays'} size={15} /> {SM[s]}</button>)}
                </div></div>
              </>
            )}

            {planId && (
              <>
                <div className="field"><span className="lbl">Who can see this</span><div className="chips">
                  <button className={`chip${editing?.visibility === 'team' ? ' on' : ''}`} style={editing?.visibility === 'team' ? { background: 'var(--brand-t)', color: 'var(--brand-d)' } : undefined} onClick={toggleVisibility}><Icon name="users" size={15} /> Your team</button>
                  <button className={`chip${editing?.visibility === 'private' ? ' on' : ''}`} style={editing?.visibility === 'private' ? { background: 'var(--brand-t)', color: 'var(--brand-d)' } : undefined} onClick={toggleVisibility}>Private</button>
                </div></div>

                <div className="field"><span className="lbl">People on this</span>
                  {(editing?.participants ?? []).map(p => (
                    <div key={p.id} className="person">
                      <span className="pav">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}</span>
                      <span className="person-m"><span className="person-n" style={{ display: 'block' }}>{p.name}</span>{p.role && <span className="person-r">{p.role}</span>}</span>
                      <button className="person-x" onClick={() => dropPerson(p.id)}>Remove</button>
                    </div>
                  ))}
                  {candidates.map(p => (
                    <button key={p.id} className="person" onClick={() => addPerson(p)}>
                      <span className="pav">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}</span>
                      <span className="person-m"><span className="person-n" style={{ display: 'block' }}>{p.name}</span>{p.role && <span className="person-r">{p.role}</span>}</span>
                      <span className="person-x"><Icon name="plus" size={14} /></span>
                    </button>
                  ))}
                  {candidates.length === 0 && (editing?.participants ?? []).length === 0 && <p className="person-r" style={{ padding: '4px 2px' }}>No one to add yet.</p>}
                </div>

                <div className="field"><span className="lbl">Notes</span>
                  {notes.map(n => (
                    <div key={n.id} className="note">
                      <div className="note-h"><span className="note-who">{n.mine ? 'You' : n.authorName}</span><span className="note-v">{n.visibility}</span>{n.mine && <button className="note-del" onClick={() => dropNote(n.id)}>delete</button>}</div>
                      <div className="note-b">{n.body}</div>
                    </div>
                  ))}
                  <textarea className="ta" placeholder="Add a note…" value={noteText} onChange={e => setNoteText(e.target.value)} aria-label="New note" />
                  <div className="chips" style={{ marginTop: 8 }}>
                    {(['private', 'shared', ...(hasStrategist ? (['strategist'] as const) : [])] as Array<'private' | 'shared' | 'strategist'>).map(v => (
                      <button key={v} className={`chip${noteVis === v ? ' on' : ''}`} style={noteVis === v ? { background: 'var(--brand-t)', color: 'var(--brand-d)' } : undefined} onClick={() => setNoteVis(v)}>
                        {v === 'private' ? 'Private' : v === 'shared' ? 'Shared' : 'Send to strategist'}
                      </button>
                    ))}
                    <button className="chip" onClick={submitNote} disabled={!noteText.trim()} style={{ background: 'var(--brand)', color: '#fff', borderColor: 'transparent' }}>Add note</button>
                  </div>
                </div>
              </>
            )}

            <button className="save" onClick={save} disabled={pending}>{editing ? 'Save changes' : 'Add to calendar'}</button>
            {planId && <button className="del" onClick={remove} disabled={pending}><Icon name="trash" size={15} /> Delete plan</button>}
          </>
        )}
      </div>
    </>
  )
}

function ReadOnlyDetail({ item }: { item: PlanFeedItem }) {
  const v = visual(item)
  return (
    <div style={{ paddingBottom: 8 }}>
      <div className="person" style={{ cursor: 'default' }}>
        <span className="pav" style={{ background: v.bg, color: v.fg }}><Icon name={v.icon} size={16} /></span>
        <span className="person-m"><span className="person-n" style={{ display: 'block' }}>{item.clientName ?? ''}</span><span className="person-r">{item.source === 'shoot' ? 'Shoot' : 'Scheduled by Apnosh'}</span></span>
      </div>
      <p className="note-b" style={{ marginTop: 10 }}>{fmtLong(item.startDate)}{!item.allDay && item.startTime ? ` · ${fmtTime(item.startTime)}` : ''}</p>
      {item.detail && <p className="note-b" style={{ marginTop: 6, color: 'var(--ink-3)' }}>{item.detail}</p>}
      {item.participants.length > 0 && (
        <div style={{ marginTop: 12 }}><span className="lbl">People on this</span>
          {item.participants.map(p => (
            <div key={p.id} className="person" style={{ cursor: 'default' }}>
              <span className="pav">{p.avatarUrl ? <img src={p.avatarUrl} alt="" /> : initials(p.name)}</span>
              <span className="person-m"><span className="person-n" style={{ display: 'block' }}>{p.name}</span>{p.role && <span className="person-r">{p.role}</span>}</span>
            </div>
          ))}
        </div>
      )}
      {item.href && <a className="save" style={{ display: 'block', textAlign: 'center', textDecoration: 'none', marginTop: 14 }} href={item.href}>Open</a>}
    </div>
  )
}
