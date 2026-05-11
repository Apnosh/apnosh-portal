'use client'

/**
 * Calendar view, redesigned around the operator (not the planner).
 *
 * Reading order:
 *   1. Pulse — one-sentence narrative + 3 KPIs ("this week / next 7d / on you")
 *   2. Filter rail (desktop) — Google-Cal-style checkboxes with color dots
 *   3. Canvas — Runway (default), Agenda, or Month
 *   4. Detail sheet — slides in from right when you tap any event
 *
 * Colors: 3 categories, 3 hues. Kind disambiguated by icon.
 *   Publishing = sky · Production = amber · Tasks = rose
 *
 * Runway = 7-day horizontal timeline, days as columns, category as rows.
 * Past days fade. Today highlights. Click any cell -> day detail.
 */

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, X,
  Send, Mail, Camera, Sparkles, ListTodo, ExternalLink,
} from 'lucide-react'
import type {
  CalendarEvent, CalendarCategory, CalendarEventKind, CalendarTone,
} from '@/lib/dashboard/get-calendar'

type ViewMode = 'runway' | 'agenda' | 'month'

const CATEGORY_ORDER: CalendarCategory[] = ['publishing', 'production', 'task']

const CATEGORY_LABEL: Record<CalendarCategory, string> = {
  publishing: 'Publishing',
  production: 'Production',
  task: 'Tasks',
}

const CATEGORY_BLURB: Record<CalendarCategory, string> = {
  publishing: 'Posts and emails',
  production: 'Shoots and content',
  task: 'On your plate',
}

const CATEGORY_COLOR: Record<CalendarCategory, { bg: string; ring: string; text: string; dot: string; soft: string }> = {
  publishing: { bg: 'bg-sky-50',    ring: 'ring-sky-200',    text: 'text-sky-700',    dot: 'bg-sky-500',    soft: 'bg-sky-100/60' },
  production: { bg: 'bg-amber-50',  ring: 'ring-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  soft: 'bg-amber-100/60' },
  task:       { bg: 'bg-rose-50',   ring: 'ring-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500',   soft: 'bg-rose-100/60' },
}

const KIND_ICON: Record<CalendarEventKind, React.ComponentType<{ className?: string }>> = {
  post: Send, email: Mail, shoot: Camera, content: Sparkles, task: ListTodo,
}

const KIND_LABEL: Record<CalendarEventKind, string> = {
  post: 'Post', email: 'Email', shoot: 'Shoot', content: 'Content', task: 'Task',
}

const TONE_CHIP: Record<CalendarTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red:   'bg-rose-50 text-rose-700',
  blue:  'bg-sky-50 text-sky-700',
  gray:  'bg-ink-7 text-ink-3',
}

/* ─────────────────────────────── Root ─────────────────────────────── */

export default function CalendarView({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<ViewMode>('runway')
  const [enabled, setEnabled] = useState<Record<CalendarCategory, boolean>>({
    publishing: true, production: true, task: true,
  })
  const [selected, setSelected] = useState<CalendarEvent | null>(null)

  const filtered = useMemo(
    () => events.filter(e => enabled[e.category]),
    [events, enabled],
  )

  const counts = useMemo(() => {
    const c: Record<CalendarCategory, number> = { publishing: 0, production: 0, task: 0 }
    for (const e of events) c[e.category]++
    return c
  }, [events])

  return (
    <>
      <div className="max-w-7xl mx-auto py-7 px-4 lg:px-6">
        {/* Pulse */}
        <Pulse events={events} />

        {/* Two-col layout: filter rail + canvas */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 lg:gap-8 mt-6">
          <aside className="hidden lg:block">
            <FilterRail counts={counts} enabled={enabled} onToggle={(cat) =>
              setEnabled(e => ({ ...e, [cat]: !e[cat] }))
            } />
          </aside>

          <main className="min-w-0">
            <div className="flex items-center justify-between mb-4 gap-3">
              <ViewToggle view={view} onChange={setView} />
              {/* Mobile category chips */}
              <div className="flex lg:hidden items-center gap-1 overflow-x-auto">
                {CATEGORY_ORDER.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setEnabled(e => ({ ...e, [cat]: !e[cat] }))}
                    className={`flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1 rounded-full border whitespace-nowrap transition-all ${
                      enabled[cat]
                        ? 'bg-white border-ink-5 text-ink'
                        : 'bg-transparent border-ink-7 text-ink-4'
                    }`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full ${CATEGORY_COLOR[cat].dot} ${!enabled[cat] && 'opacity-40'}`} />
                    {CATEGORY_LABEL[cat]}
                  </button>
                ))}
              </div>
            </div>

            {filtered.length === 0 ? (
              <EmptyState totalEvents={events.length} />
            ) : view === 'runway' ? (
              <RunwayView events={filtered} onSelect={setSelected} />
            ) : view === 'agenda' ? (
              <AgendaView events={filtered} onSelect={setSelected} />
            ) : (
              <MonthView events={filtered} onSelect={setSelected} />
            )}
          </main>
        </div>
      </div>

      {selected && <DetailSheet event={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

/* ─────────────────────────────── Pulse ─────────────────────────────── */

function Pulse({ events }: { events: CalendarEvent[] }) {
  const stats = useMemo(() => {
    const now = Date.now()
    const in7 = now + 7 * 86_400_000
    const in14 = now + 14 * 86_400_000
    let thisWeek = 0, next7to14 = 0, actionNeeded = 0
    for (const e of events) {
      const t = new Date(e.startIso).getTime()
      if (t < now) continue
      if (t < in7) thisWeek++
      else if (t < in14) next7to14++
      if (e.category === 'task' || e.statusTone === 'red') actionNeeded++
    }
    return { thisWeek, next7to14, actionNeeded }
  }, [events])

  const narrative = useMemo(() => composeNarrative(events), [events])

  return (
    <header>
      <div className="flex items-center gap-2 mb-1">
        <CalendarIcon className="w-4 h-4 text-ink-3" />
        <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
          Calendar
        </span>
      </div>
      <h1 className="text-[28px] leading-tight font-bold text-ink tracking-tight">
        What&rsquo;s coming up
      </h1>
      <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
        {narrative}
      </p>

      <div className="grid grid-cols-3 gap-3 mt-5 max-w-2xl">
        <KpiTile label="This week" value={stats.thisWeek} />
        <KpiTile label="Week after" value={stats.next7to14} />
        <KpiTile
          label="On you"
          value={stats.actionNeeded}
          tone={stats.actionNeeded > 0 ? 'rose' : 'neutral'}
        />
      </div>
    </header>
  )
}

function KpiTile({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'rose' }) {
  return (
    <div
      className="rounded-xl bg-white border px-4 py-3"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1">
        {label}
      </p>
      <p className={`text-[26px] font-bold leading-none tracking-tight ${
        tone === 'rose' && value > 0 ? 'text-rose-700' : 'text-ink'
      }`}>
        {value}
      </p>
    </div>
  )
}

/* ──────────────────────────── Filter rail ──────────────────────────── */

function FilterRail({
  counts, enabled, onToggle,
}: {
  counts: Record<CalendarCategory, number>
  enabled: Record<CalendarCategory, boolean>
  onToggle: (cat: CalendarCategory) => void
}) {
  return (
    <div className="sticky top-6">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-3">
        Filter
      </p>
      <ul className="space-y-1">
        {CATEGORY_ORDER.map(cat => {
          const c = CATEGORY_COLOR[cat]
          const on = enabled[cat]
          return (
            <li key={cat}>
              <button
                onClick={() => onToggle(cat)}
                className={`w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors ${
                  on ? 'hover:bg-bg-2' : 'opacity-50 hover:opacity-75'
                }`}
              >
                <span className={`w-3 h-3 rounded-sm flex items-center justify-center ${
                  on ? c.dot : 'bg-ink-6'
                }`}>
                  {on && <span className="text-white text-[8px] leading-none">✓</span>}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-medium text-ink block leading-tight">
                    {CATEGORY_LABEL[cat]}
                  </span>
                  <span className="text-[10px] text-ink-4 block leading-tight mt-0.5">
                    {CATEGORY_BLURB[cat]}
                  </span>
                </span>
                <span className="text-[11px] text-ink-4 tabular-nums">
                  {counts[cat]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/* ───────────────────────────── View toggle ────────────────────────────── */

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  const items: { v: ViewMode; label: string }[] = [
    { v: 'runway', label: 'Runway' },
    { v: 'agenda', label: 'Agenda' },
    { v: 'month',  label: 'Month'  },
  ]
  return (
    <div className="inline-flex bg-bg-2 rounded-lg p-0.5">
      {items.map(it => (
        <button
          key={it.v}
          onClick={() => onChange(it.v)}
          className={`text-[12px] font-medium px-3 py-1.5 rounded-md transition-all ${
            view === it.v
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

/* ────────────────────────────── Runway ────────────────────────────── */

function RunwayView({
  events, onSelect,
}: {
  events: CalendarEvent[]
  onSelect: (e: CalendarEvent) => void
}) {
  const [windowStart, setWindowStart] = useState(() => startOfDay(new Date()))

  const days = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => addDays(windowStart, i))
  }, [windowStart])

  const byDayCategory = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = `${dayKey(new Date(e.startIso))}|${e.category}`
      const arr = map.get(k) ?? []
      arr.push(e)
      map.set(k, arr)
    }
    return map
  }, [events])

  const todayKey = dayKey(new Date())
  const windowLabel = `${days[0].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${days[6].toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink">{windowLabel}</h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setWindowStart(addDays(windowStart, -7))}
            aria-label="Previous 7 days"
            className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setWindowStart(startOfDay(new Date()))}
            className="text-[11px] font-medium text-ink-3 hover:text-ink px-2"
          >
            This week
          </button>
          <button
            onClick={() => setWindowStart(addDays(windowStart, 7))}
            aria-label="Next 7 days"
            className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="rounded-xl border bg-white overflow-hidden"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        {/* Day headers */}
        <div className="grid border-b" style={{
          gridTemplateColumns: 'minmax(110px, 140px) repeat(7, minmax(0, 1fr))',
          borderColor: 'var(--db-border, #e5e5e5)',
        }}>
          <div className="" />
          {days.map(d => {
            const k = dayKey(d)
            const isToday = k === todayKey
            const isPast = k < todayKey
            return (
              <div
                key={k}
                className={`text-center py-2.5 px-1 border-l ${isPast ? 'opacity-50' : ''}`}
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              >
                <div className={`text-[10px] font-semibold uppercase tracking-wider ${isToday ? 'text-ink' : 'text-ink-4'}`}>
                  {d.toLocaleDateString('en-US', { weekday: 'short' })}
                </div>
                <div className={`text-[15px] font-semibold mt-0.5 ${
                  isToday ? 'inline-flex items-center justify-center w-7 h-7 rounded-full bg-ink text-white' : 'text-ink'
                }`}>
                  {d.getDate()}
                </div>
              </div>
            )
          })}
        </div>

        {/* Swimlanes */}
        {CATEGORY_ORDER.map((cat, rowIdx) => {
          const c = CATEGORY_COLOR[cat]
          return (
            <div
              key={cat}
              className={`grid ${rowIdx < CATEGORY_ORDER.length - 1 ? 'border-b' : ''}`}
              style={{
                gridTemplateColumns: 'minmax(110px, 140px) repeat(7, minmax(0, 1fr))',
                borderColor: 'var(--db-border, #e5e5e5)',
              }}
            >
              {/* Row label */}
              <div className="flex items-center gap-2 px-3 py-3 border-r" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
                <span className={`w-2 h-2 rounded-full ${c.dot}`} />
                <span className="text-[12px] font-medium text-ink-2">
                  {CATEGORY_LABEL[cat]}
                </span>
              </div>
              {/* Day cells */}
              {days.map(d => {
                const k = dayKey(d)
                const cellEvents = byDayCategory.get(`${k}|${cat}`) ?? []
                const isPast = k < todayKey
                const isToday = k === todayKey
                return (
                  <div
                    key={k}
                    className={`min-h-[88px] border-l p-1 ${isPast ? 'opacity-60' : ''} ${isToday ? c.soft : ''}`}
                    style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
                  >
                    <div className="space-y-1">
                      {cellEvents.slice(0, 3).map(ev => (
                        <RunwayChip key={ev.id} event={ev} onClick={() => onSelect(ev)} />
                      ))}
                      {cellEvents.length > 3 && (
                        <button
                          onClick={() => onSelect(cellEvents[3])}
                          className="text-[10px] text-ink-4 hover:text-ink-2 px-1"
                        >
                          +{cellEvents.length - 3} more
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function RunwayChip({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const Icon = KIND_ICON[event.kind]
  const c = CATEGORY_COLOR[event.category]
  return (
    <button
      onClick={onClick}
      title={event.title}
      className={`w-full flex items-center gap-1 text-left rounded px-1.5 py-1 ${c.bg} ${c.text} hover:ring-1 hover:${c.ring} transition-all`}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      {!event.allDay && (
        <span className="text-[9px] font-medium tabular-nums flex-shrink-0">
          {formatTimeShort(event.startIso)}
        </span>
      )}
      <span className="text-[10px] truncate leading-tight">
        {event.title}
      </span>
    </button>
  )
}

/* ────────────────────────────── Agenda ────────────────────────────── */

function AgendaView({
  events, onSelect,
}: {
  events: CalendarEvent[]
  onSelect: (e: CalendarEvent) => void
}) {
  const groups = useMemo(() => groupByDay(events), [events])
  const todayKey = dayKey(new Date())

  return (
    <div className="space-y-6">
      {groups.map(g => {
        const isPast = g.dayKey < todayKey
        const isToday = g.dayKey === todayKey
        return (
          <section key={g.dayKey} className={isPast ? 'opacity-60' : ''}>
            <header className="flex items-baseline gap-3 mb-2">
              <h2 className={`text-[13px] font-semibold ${isToday ? 'text-ink' : 'text-ink-2'}`}>
                {dayHeading(g.date)}
              </h2>
              <span className="text-[11px] text-ink-4">
                {g.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </span>
              {isToday && (
                <span className="text-[10px] font-semibold uppercase tracking-wider bg-ink text-white px-1.5 py-0.5 rounded">
                  Today
                </span>
              )}
            </header>
            <ul className="space-y-2">
              {g.events.map(ev => (
                <AgendaRow key={ev.id} event={ev} onClick={() => onSelect(ev)} />
              ))}
            </ul>
          </section>
        )
      })}
    </div>
  )
}

function AgendaRow({ event, onClick }: { event: CalendarEvent; onClick: () => void }) {
  const Icon = KIND_ICON[event.kind]
  const c = CATEGORY_COLOR[event.category]
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-start gap-3 rounded-xl border bg-white p-3.5 hover:shadow-sm transition-shadow text-left"
        style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
      >
        <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${c.bg} ${c.text}`}>
          <Icon className="w-4 h-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
              {KIND_LABEL[event.kind]}
            </span>
            <span className="text-[11px] text-ink-4">
              {event.allDay ? 'All day' : formatTime(event.startIso)}
            </span>
          </div>
          <p className="text-[14px] font-medium text-ink leading-snug mt-0.5 truncate">
            {event.title}
          </p>
          {event.detail && (
            <p className="text-[12px] text-ink-3 mt-0.5 leading-snug truncate">{event.detail}</p>
          )}
        </div>
        <span className={`text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded ${TONE_CHIP[event.statusTone]} flex-shrink-0 mt-0.5`}>
          {event.status}
        </span>
      </button>
    </li>
  )
}

/* ────────────────────────────── Month ────────────────────────────── */

function MonthView({
  events, onSelect,
}: {
  events: CalendarEvent[]
  onSelect: (e: CalendarEvent) => void
}) {
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>()
    for (const e of events) {
      const k = dayKey(new Date(e.startIso))
      const arr = m.get(k) ?? []
      arr.push(e)
      m.set(k, arr)
    }
    return m
  }, [events])

  const cells = useMemo(() => buildMonthCells(cursor), [cursor])
  const todayKey = dayKey(new Date())

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="text-[11px] font-medium text-ink-3 hover:text-ink px-2"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))}
            aria-label="Next month"
            className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <div className="grid grid-cols-7 border-b" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
            <div key={d} className="text-[10px] font-semibold uppercase tracking-wider text-ink-4 text-center py-2">
              {d}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {cells.map((c, idx) => {
            const k = dayKey(c.date)
            const dayEvents = byDay.get(k) ?? []
            const isToday = k === todayKey
            const isPast = k < todayKey
            return (
              <div
                key={idx}
                className={`min-h-[100px] border-r border-b p-1.5 ${
                  !c.inMonth ? 'bg-bg-2/40' : isPast ? 'opacity-60' : ''
                } ${idx % 7 === 6 ? 'border-r-0' : ''}`}
                style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-[11px] font-semibold ${
                    isToday ? 'inline-flex items-center justify-center w-5 h-5 rounded-full bg-ink text-white' :
                    c.inMonth ? 'text-ink' : 'text-ink-5'
                  }`}>
                    {c.date.getDate()}
                  </span>
                  {dayEvents.length > 3 && (
                    <span className="text-[9px] text-ink-4">+{dayEvents.length - 3}</span>
                  )}
                </div>
                <div className="space-y-0.5">
                  {dayEvents.slice(0, 3).map(ev => (
                    <button
                      key={ev.id}
                      onClick={() => onSelect(ev)}
                      className={`block w-full text-left text-[10px] leading-tight rounded px-1 py-0.5 truncate ${CATEGORY_COLOR[ev.category].bg} ${CATEGORY_COLOR[ev.category].text}`}
                      title={ev.title}
                    >
                      {ev.allDay ? '' : formatTimeShort(ev.startIso) + ' '}{ev.title}
                    </button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Detail sheet ───────────────────────────── */

function DetailSheet({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const Icon = KIND_ICON[event.kind]
  const c = CATEGORY_COLOR[event.category]

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute top-0 right-0 h-full w-full max-w-[440px] bg-white shadow-xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <div className="flex items-center gap-2.5">
            <span className={`w-8 h-8 rounded-md flex items-center justify-center ${c.bg} ${c.text}`}>
              <Icon className="w-4 h-4" />
            </span>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 leading-none">
                {KIND_LABEL[event.kind]}
              </p>
              <p className="text-[11px] text-ink-4 mt-1 leading-none">
                {CATEGORY_LABEL[event.category]}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <div>
            <h3 className="text-[18px] font-semibold text-ink leading-snug">
              {event.title}
            </h3>
            <p className="text-[13px] text-ink-3 mt-1.5">
              {formatFull(event.startIso, event.allDay)}
            </p>
          </div>

          {event.detail && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                Details
              </p>
              <p className="text-[13px] text-ink-2 leading-relaxed whitespace-pre-wrap bg-bg-2/60 rounded-lg p-3">
                {event.detail}
              </p>
            </div>
          )}

          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
              Status
            </p>
            <span className={`inline-block text-[12px] font-semibold px-2 py-0.5 rounded ${TONE_CHIP[event.statusTone]}`}>
              {event.status}
            </span>
          </div>

          {event.platforms && event.platforms.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-1.5">
                Platforms
              </p>
              <div className="flex flex-wrap gap-1.5">
                {event.platforms.map(p => (
                  <span key={p} className="text-[11px] bg-bg-2 text-ink-2 px-2 py-0.5 rounded">
                    {p}
                  </span>
                ))}
              </div>
            </div>
          )}

          {event.href && (
            <Link
              href={event.href}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-ink hover:underline"
            >
              Open full page
              <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Empty state ───────────────────────────── */

function EmptyState({ totalEvents }: { totalEvents: number }) {
  if (totalEvents === 0) {
    return (
      <div className="rounded-xl border bg-white p-10 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        <h2 className="text-base font-semibold text-ink mb-1.5">Nothing on the calendar yet</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed mb-6">
          As your strategist schedules posts, books filming days, and lines up campaigns,
          every dated item shows up here in one timeline.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 max-w-2xl mx-auto">
          {CATEGORY_ORDER.map(cat => {
            const c = CATEGORY_COLOR[cat]
            return (
              <div key={cat} className="flex items-center gap-2.5 p-2.5 rounded-lg bg-bg-2/60 text-left">
                <span className={`w-3 h-3 rounded-sm ${c.dot}`} />
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-ink leading-tight">{CATEGORY_LABEL[cat]}</p>
                  <p className="text-[10px] text-ink-3 leading-tight mt-0.5">{CATEGORY_BLURB[cat]}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <p className="text-sm text-ink-3">Nothing matches the current filter. Toggle categories on the left.</p>
    </div>
  )
}

/* ─────────────────────────────── helpers ─────────────────────────────── */

function startOfDay(d: Date): Date {
  const x = new Date(d)
  x.setHours(0, 0, 0, 0)
  return x
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d)
  x.setDate(x.getDate() + n)
  return x
}

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayHeading(date: Date): string {
  const today = new Date()
  const tomorrow = addDays(today, 1)
  if (dayKey(date) === dayKey(today)) return 'Today'
  if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function formatTimeShort(iso: string): string {
  const d = new Date(iso)
  const h = d.getHours()
  const m = d.getMinutes()
  const ampm = h >= 12 ? 'p' : 'a'
  const hh = h % 12 || 12
  return m === 0 ? `${hh}${ampm}` : `${hh}:${String(m).padStart(2, '0')}${ampm}`
}

function formatFull(iso: string, allDay: boolean): string {
  const d = new Date(iso)
  const dateStr = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
  if (allDay) return `${dateStr} · All day`
  return `${dateStr} at ${formatTime(iso)}`
}

function groupByDay(events: CalendarEvent[]) {
  const map = new Map<string, { dayKey: string; date: Date; events: CalendarEvent[] }>()
  for (const e of events) {
    const d = new Date(e.startIso)
    const k = dayKey(d)
    if (!map.has(k)) {
      map.set(k, { dayKey: k, date: new Date(d.getFullYear(), d.getMonth(), d.getDate()), events: [] })
    }
    map.get(k)!.events.push(e)
  }
  return Array.from(map.values()).sort((a, b) => a.date.getTime() - b.date.getTime())
}

function buildMonthCells(cursor: Date) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay()
  const gridStart = new Date(year, month, 1 - startDay)
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }
  while (cells.length > 35 && !cells.slice(-7).some(c => c.inMonth)) {
    cells.splice(-7, 7)
  }
  return cells
}

function composeNarrative(events: CalendarEvent[]): string {
  if (events.length === 0) {
    return 'No items on the calendar yet. Your strategist starts queuing content within a day or two of kickoff.'
  }
  const now = Date.now()
  const in7 = now + 7 * 86_400_000
  const inWindow = events.filter(e => {
    const t = new Date(e.startIso).getTime()
    return t >= now && t < in7
  })
  const byCat: Record<CalendarCategory, number> = { publishing: 0, production: 0, task: 0 }
  for (const e of inWindow) byCat[e.category]++

  const parts: string[] = []
  if (byCat.publishing) parts.push(`${byCat.publishing} going live`)
  if (byCat.production) parts.push(`${byCat.production} in production`)
  if (byCat.task) parts.push(`${byCat.task} task${byCat.task === 1 ? '' : 's'} on you`)

  if (parts.length === 0) {
    const upcoming = events.find(e => new Date(e.startIso).getTime() >= now)
    if (upcoming) {
      const days = Math.round((new Date(upcoming.startIso).getTime() - now) / 86_400_000)
      return `Quiet week. Next up: ${upcoming.title.toLowerCase()} in ${days} day${days === 1 ? '' : 's'}.`
    }
    return 'Quiet stretch ahead. Check back as your strategist queues more.'
  }
  return `This week: ${humanList(parts)}.`
}

function humanList(items: string[]): string {
  if (items.length === 0) return ''
  if (items.length === 1) return items[0]
  if (items.length === 2) return `${items[0]} and ${items[1]}`
  return items.slice(0, -1).join(', ') + ', and ' + items[items.length - 1]
}
