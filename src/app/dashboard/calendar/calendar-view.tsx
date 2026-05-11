'use client'

/**
 * Unified calendar view. Two display modes:
 *   - Agenda (default): chronological list grouped by day. Best for
 *     low-density and mobile. Reads like a plan rather than a grid.
 *   - Month: 7-col grid with chips per day. Best for spotting clusters
 *     and gaps across a longer horizon.
 *
 * Category filter (All / Publishing / Production / Tasks) applies to
 * both views. The agenda groups events by local-day, so an event at
 * 11 PM and one at 1 AM the next day fall in different groups.
 */

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronRight as CR,
  Send, Mail, Camera, Sparkles, ListTodo,
} from 'lucide-react'
import type {
  CalendarEvent, CalendarCategory, CalendarEventKind, CalendarTone,
} from '@/lib/dashboard/get-calendar'

type ViewMode = 'agenda' | 'month'
type CategoryFilter = 'all' | CalendarCategory

const CATEGORY_LABEL: Record<CategoryFilter, string> = {
  all: 'All',
  publishing: 'Publishing',
  production: 'Production',
  task: 'Tasks',
}

const KIND_ICON: Record<CalendarEventKind, React.ComponentType<{ className?: string }>> = {
  post: Send,
  email: Mail,
  shoot: Camera,
  content: Sparkles,
  task: ListTodo,
}

const KIND_TINT: Record<CalendarEventKind, string> = {
  post: 'bg-sky-50 text-sky-700',
  email: 'bg-violet-50 text-violet-700',
  shoot: 'bg-rose-50 text-rose-700',
  content: 'bg-amber-50 text-amber-700',
  task: 'bg-emerald-50 text-emerald-700',
}

const TONE_CHIP: Record<CalendarTone, string> = {
  green: 'bg-emerald-50 text-emerald-700',
  amber: 'bg-amber-50 text-amber-700',
  red: 'bg-rose-50 text-rose-700',
  blue: 'bg-sky-50 text-sky-700',
  gray: 'bg-ink-7 text-ink-3',
}

export default function CalendarView({ events }: { events: CalendarEvent[] }) {
  const [view, setView] = useState<ViewMode>('agenda')
  const [filter, setFilter] = useState<CategoryFilter>('all')

  const counts = useMemo(() => {
    const c: Record<CategoryFilter, number> = { all: events.length, publishing: 0, production: 0, task: 0 }
    for (const e of events) c[e.category]++
    return c
  }, [events])

  const filtered = useMemo(() => {
    if (filter === 'all') return events
    return events.filter(e => e.category === filter)
  }, [events, filter])

  return (
    <div className="max-w-5xl mx-auto py-8 px-4">
      <header className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <CalendarIcon className="w-4 h-4 text-ink-3" />
          <span className="text-[11px] font-semibold uppercase tracking-widest text-ink-3">
            Calendar
          </span>
        </div>
        <h1 className="text-2xl font-bold text-ink">What&rsquo;s coming up</h1>
        <p className="text-sm text-ink-3 mt-1">
          Posts, emails, shoots, and tasks across the next 60 days. One timeline so nothing slips.
        </p>
      </header>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 mb-5">
        {/* Category filter chips */}
        <div className="flex items-center gap-1 flex-1 min-w-0 overflow-x-auto">
          {(Object.keys(CATEGORY_LABEL) as CategoryFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-[12px] font-medium px-2.5 py-1 rounded-full whitespace-nowrap transition-colors ${
                filter === f
                  ? 'bg-ink text-white'
                  : 'bg-white border border-ink-6 text-ink-3 hover:text-ink hover:border-ink-5'
              }`}
            >
              {CATEGORY_LABEL[f]}
              <span className={`ml-1 text-[10px] ${filter === f ? 'text-white/70' : 'text-ink-4'}`}>
                {counts[f]}
              </span>
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="flex bg-white rounded-full border border-ink-6 overflow-hidden">
          <button
            onClick={() => setView('agenda')}
            className={`px-3 py-1 text-[12px] font-medium transition-colors ${
              view === 'agenda' ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'
            }`}
          >
            Agenda
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-3 py-1 text-[12px] font-medium transition-colors ${
              view === 'month' ? 'bg-ink text-white' : 'text-ink-3 hover:text-ink'
            }`}
          >
            Month
          </button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState filter={filter} />
      ) : view === 'agenda' ? (
        <AgendaView events={filtered} />
      ) : (
        <MonthView events={filtered} />
      )}
    </div>
  )
}

/* ─────────────────────────── Agenda ─────────────────────────── */

function AgendaView({ events }: { events: CalendarEvent[] }) {
  const groups = useMemo(() => groupByDay(events), [events])

  return (
    <div className="space-y-6">
      {groups.map(g => (
        <section key={g.dayKey}>
          <header className="flex items-baseline gap-3 mb-2">
            <h2 className="text-[13px] font-semibold text-ink">
              {dayHeading(g.date)}
            </h2>
            <span className="text-[11px] text-ink-4">
              {g.date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </span>
            <span className="text-[11px] text-ink-4">
              · {g.events.length} {g.events.length === 1 ? 'item' : 'items'}
            </span>
          </header>
          <ul className="space-y-2">
            {g.events.map(ev => <AgendaRow key={ev.id} event={ev} />)}
          </ul>
        </section>
      ))}
    </div>
  )
}

function AgendaRow({ event }: { event: CalendarEvent }) {
  const Icon = KIND_ICON[event.kind]
  const tint = KIND_TINT[event.kind]
  const inner = (
    <div
      className="flex items-start gap-3 rounded-xl border bg-white p-3.5 hover:shadow-sm transition-shadow"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <div className={`w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-ink-3">
            {kindLabel(event.kind)}
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
      {event.href && (
        <CR className="w-4 h-4 text-ink-4 flex-shrink-0 mt-2" />
      )}
    </div>
  )
  return (
    <li>
      {event.href ? <Link href={event.href}>{inner}</Link> : inner}
    </li>
  )
}

/* ─────────────────────────── Month ─────────────────────────── */

function MonthView({ events }: { events: CalendarEvent[] }) {
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
  const today = useMemo(() => dayKey(new Date()), [])

  const prev = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() - 1, 1))
  const next = () => setCursor(c => new Date(c.getFullYear(), c.getMonth() + 1, 1))

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[14px] font-semibold text-ink">
          {cursor.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={prev}
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
            onClick={next}
            aria-label="Next month"
            className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="rounded-xl border bg-white overflow-hidden" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
        {/* Weekday headers */}
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
            const isToday = k === today
            return (
              <div
                key={idx}
                className={`min-h-[96px] border-r border-b p-1.5 ${
                  !c.inMonth ? 'bg-bg-2/40' : ''
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
                  {dayEvents.slice(0, 3).map(ev => <MonthChip key={ev.id} event={ev} />)}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function MonthChip({ event }: { event: CalendarEvent }) {
  const tint = KIND_TINT[event.kind]
  const inner = (
    <div className={`text-[10px] leading-tight rounded px-1 py-0.5 truncate ${tint}`} title={event.title}>
      {event.allDay ? '' : formatTime(event.startIso) + ' '}{event.title}
    </div>
  )
  return event.href ? <Link href={event.href}>{inner}</Link> : inner
}

/* ─────────────────────────── Empty state ─────────────────────────── */

function EmptyState({ filter }: { filter: CategoryFilter }) {
  const copy: Record<CategoryFilter, { title: string; body: string }> = {
    all: {
      title: 'Nothing on the calendar yet',
      body: 'As your strategist schedules posts, books filming days, and lines up campaigns, every dated item shows up here in one timeline.',
    },
    publishing: {
      title: 'Nothing scheduled to publish',
      body: 'Scheduled social posts and email campaigns appear here. Your strategist queues the first batch within the first 1–2 weeks.',
    },
    production: {
      title: 'No production days yet',
      body: 'Filming, photo shoots, and content drafts in the works will show up here so you can plan your week around them.',
    },
    task: {
      title: 'No tasks with due dates',
      body: 'When your strategist asks for something specific (a logo, an hours change, an asset) with a deadline, it lands here.',
    },
  }
  const c = copy[filter]
  return (
    <div className="rounded-xl border bg-white p-8" style={{ borderColor: 'var(--db-border)' }}>
      <h2 className="text-base font-semibold text-ink mb-1.5 text-center">{c.title}</h2>
      <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed text-center mb-6">
        {c.body}
      </p>

      {filter === 'all' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-2xl mx-auto">
          <Legend kind="post" label="Scheduled posts" detail="Instagram, Facebook, TikTok, LinkedIn" />
          <Legend kind="email" label="Email campaigns" detail="When sends go out" />
          <Legend kind="shoot" label="Filming days" detail="On-site photo/video shoots" />
          <Legend kind="content" label="Planned content" detail="Concepts queued for production" />
          <Legend kind="task" label="Tasks for you" detail="Anything with a deadline" />
        </div>
      )}
    </div>
  )
}

function Legend({ kind, label, detail }: { kind: CalendarEventKind; label: string; detail: string }) {
  const Icon = KIND_ICON[kind]
  const tint = KIND_TINT[kind]
  return (
    <div className="flex items-start gap-2.5 p-2.5 rounded-lg bg-bg-2/60">
      <div className={`w-8 h-8 rounded-md flex items-center justify-center flex-shrink-0 ${tint}`}>
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-ink leading-snug">{label}</p>
        <p className="text-[11px] text-ink-3 mt-0.5 leading-snug">{detail}</p>
      </div>
    </div>
  )
}

/* ─────────────────────────── helpers ─────────────────────────── */

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

function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function dayHeading(date: Date): string {
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (dayKey(date) === dayKey(today)) return 'Today'
  if (dayKey(date) === dayKey(tomorrow)) return 'Tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'long' })
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

function kindLabel(k: CalendarEventKind): string {
  switch (k) {
    case 'post': return 'Post'
    case 'email': return 'Email'
    case 'shoot': return 'Shoot'
    case 'content': return 'Content'
    case 'task': return 'Task'
  }
}

function buildMonthCells(cursor: Date) {
  const year = cursor.getFullYear()
  const month = cursor.getMonth()
  const firstOfMonth = new Date(year, month, 1)
  const startDay = firstOfMonth.getDay() // 0 = Sun
  const gridStart = new Date(year, month, 1 - startDay)
  const cells: { date: Date; inMonth: boolean }[] = []
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart)
    d.setDate(gridStart.getDate() + i)
    cells.push({ date: d, inMonth: d.getMonth() === month })
  }
  // Trim trailing all-other-month row if it's pure overflow.
  while (cells.length > 35 && !cells.slice(-7).some(c => c.inMonth)) {
    cells.splice(-7, 7)
  }
  return cells
}
