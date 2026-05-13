'use client'

/**
 * Calendar view — month grid first, agenda as alternate.
 *
 * Layout:
 *   [pulse band]   compact narrative + 3 KPI tiles, all clickable
 *   [filter rail | main canvas]
 *      ^^ desktop only; mobile uses chip row above the canvas
 *   Main canvas: Month (default) or Agenda
 *   Subscribe button top-right; opens an .ics dialog
 *
 * Color = 3 categories (Publishing / Production / Tasks). Kind icons
 * disambiguate inside that.
 *
 * Interactions:
 *   - Click a chip      -> event detail sheet (right-slide)
 *   - Click a day cell  -> day detail sheet listing every event that day
 *   - +N more link      -> same day detail sheet
 *   - Click KPI tile    -> jumps to the relevant view + filter
 *
 * Onboarding playbook ghosts appear on the relevant days during the
 * first 14 days of a client's tenure, as dashed chips on cells where
 * nothing real is scheduled.
 */

import { useMemo, useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import {
  Calendar as CalendarIcon, ChevronLeft, ChevronRight, X,
  Send, Mail, Camera, Sparkles, ListTodo, ExternalLink,
  Link2, Check, Copy, Rss,
} from 'lucide-react'
import type {
  CalendarEvent, CalendarCategory, CalendarEventKind, CalendarTone,
} from '@/lib/dashboard/get-calendar'

type ViewMode = 'month' | 'agenda'

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

const CATEGORY_COLOR: Record<CalendarCategory, {
  bg: string; ring: string; text: string; dot: string; soft: string; bar: string;
}> = {
  publishing: { bg: 'bg-sky-50',    ring: 'ring-sky-200',    text: 'text-sky-700',    dot: 'bg-sky-500',    soft: 'bg-sky-100/60',    bar: 'border-l-sky-500' },
  production: { bg: 'bg-amber-50',  ring: 'ring-amber-200',  text: 'text-amber-700',  dot: 'bg-amber-500',  soft: 'bg-amber-100/60',  bar: 'border-l-amber-500' },
  task:       { bg: 'bg-rose-50',   ring: 'ring-rose-200',   text: 'text-rose-700',   dot: 'bg-rose-500',   soft: 'bg-rose-100/60',   bar: 'border-l-rose-500' },
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

interface CalendarViewProps {
  events: CalendarEvent[]
  clientCreatedAt?: string | null
  subscribePath?: string
  /** Set when an admin is viewing a specific client's calendar */
  viewingAs?: { id: string; name: string } | null
  /** Items the owner still has to sign off on (deliverables + content_drafts). */
  pendingApprovals?: number
  /** ISO timestamp of the oldest pending approval — used to show "oldest Xh". */
  oldestApprovalIso?: string | null
}

export default function CalendarView({
  events,
  clientCreatedAt = null,
  subscribePath,
  viewingAs = null,
  pendingApprovals = 0,
  oldestApprovalIso = null,
}: CalendarViewProps) {
  const [view, setView] = useState<ViewMode>('month')
  const [cursor, setCursor] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [enabled, setEnabled] = useState<Record<CalendarCategory, boolean>>({
    publishing: true, production: true, task: true,
  })
  const [selected, setSelected] = useState<CalendarEvent | null>(null)
  const [dayPanel, setDayPanel] = useState<Date | null>(null)
  const [showSubscribe, setShowSubscribe] = useState(false)

  const filtered = useMemo(
    () => events.filter(e => enabled[e.category]),
    [events, enabled],
  )

  const counts = useMemo(() => {
    const c: Record<CalendarCategory, number> = { publishing: 0, production: 0, task: 0 }
    for (const e of events) c[e.category]++
    return c
  }, [events])

  // Onboarding playbook keyed by dayKey. We show ghosts in two cases:
  //   1. The client is in the first 14 days of tenure (the natural
  //      onboarding window), counting forward from creation.
  //   2. There are zero real events on the calendar at all. In that
  //      case we pin the playbook to "now" so the grid still shows
  //      something useful even for older accounts that haven't been
  //      activated yet.
  const playbookByDay = useMemo(() => {
    const m = new Map<string, PlaybookMilestone[]>()
    const hasNoEvents = events.length === 0
    let anchor: Date | null = null
    if (clientCreatedAt) {
      const start = startOfDay(new Date(clientCreatedAt))
      const ageDays = Math.floor((Date.now() - start.getTime()) / 86_400_000)
      if (ageDays <= 14) anchor = start
      else if (hasNoEvents) anchor = startOfDay(new Date())
    } else if (hasNoEvents) {
      anchor = startOfDay(new Date())
    }
    if (!anchor) return m
    for (const ms of ONBOARDING_PLAYBOOK) {
      const date = addDays(anchor, ms.daysFromStart)
      const k = dayKey(date)
      const arr = m.get(k) ?? []
      arr.push(ms)
      m.set(k, arr)
    }
    return m
  }, [clientCreatedAt, events.length])

  function handleKpiClick(target: 'thisWeek' | 'nextWeek' | 'actionNeeded') {
    if (target === 'thisWeek') {
      setView('month')
      const today = new Date()
      setCursor(new Date(today.getFullYear(), today.getMonth(), 1))
      setEnabled({ publishing: true, production: true, task: true })
    } else if (target === 'nextWeek') {
      setView('agenda')
      setEnabled({ publishing: true, production: true, task: true })
    } else {
      setView('agenda')
      setEnabled({ publishing: false, production: false, task: true })
    }
  }

  return (
    <>
      <div className="max-w-7xl mx-auto py-8 px-4 lg:px-6">
        {/* Hero */}
        <header className="mb-7">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-emerald-50 text-emerald-700 ring-1 ring-emerald-100">
                <CalendarIcon className="w-4.5 h-4.5" strokeWidth={2.25} />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-3 leading-none">
                  Calendar
                </p>
                <p className="text-[11px] text-ink-4 mt-1 leading-none">
                  {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {viewingAs && (
                <Link
                  href="/dashboard/calendar"
                  className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-full pl-2.5 pr-1 py-1 transition-colors"
                  title="Switch client"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span>Viewing as <span className="font-semibold">{viewingAs.name}</span></span>
                  <span className="text-[10px] text-emerald-600 group-hover:text-emerald-800 bg-white/60 rounded-full px-1.5 py-0.5 ml-1">
                    Switch
                  </span>
                </Link>
              )}
              {subscribePath && (
                <button
                  onClick={() => setShowSubscribe(true)}
                  className="group inline-flex items-center gap-1.5 text-[12px] font-medium text-ink-2 hover:text-ink bg-white border border-ink-6 hover:border-ink-4 hover:shadow-sm rounded-full px-3 py-1.5 transition-all"
                >
                  <Rss className="w-3 h-3 text-emerald-600 group-hover:text-emerald-700" />
                  Subscribe
                </button>
              )}
            </div>
          </div>
          <h1 className="text-[32px] sm:text-[34px] leading-[1.05] font-bold text-ink tracking-tight">
            What&rsquo;s coming up
          </h1>
          <p className="text-[14px] text-ink-2 mt-2 leading-relaxed max-w-2xl">
            {composeNarrative(events)}
          </p>

          <PulseStrip events={events} onClick={handleKpiClick} />
        </header>

        {/* Approval banner — most-urgent thing the owner can act on right now.
           This is the only attention-grabbing strip on the page; cadence
           accountability deferred until strategists can set per-client targets. */}
        {pendingApprovals > 0 && (
          <ApprovalBanner count={pendingApprovals} oldestIso={oldestApprovalIso} />
        )}

        {/* Two-col layout */}
        <div className="grid grid-cols-1 lg:grid-cols-[200px_1fr] gap-6 lg:gap-8">
          <aside className="hidden lg:block">
            <FilterRail counts={counts} enabled={enabled} onToggle={(cat) =>
              setEnabled(e => ({ ...e, [cat]: !e[cat] }))
            } />
          </aside>

          <main className="min-w-0">
            <div className="flex items-center justify-between mb-3 gap-3">
              {/* Mobile filter chips */}
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
              <div className="hidden lg:block" />

              <ViewToggle view={view} onChange={setView} />
            </div>

            {events.length === 0 && (
              <div
                className="rounded-2xl bg-gradient-to-br from-amber-50/80 via-white to-white border px-4 py-3.5 mb-4 flex items-start gap-3"
                style={{ borderColor: 'var(--db-border, #f0e6d6)' }}
              >
                <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-amber-100 text-amber-700 flex-shrink-0 ring-1 ring-amber-200/60">
                  <Sparkles className="w-4 h-4" strokeWidth={2.25} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-ink leading-tight">
                    Nothing scheduled yet
                  </p>
                  <p className="text-[12px] text-ink-2 mt-1 leading-relaxed">
                    Your strategist starts queuing posts, shoots, and tasks within a day or two
                    of kickoff. The dashed items below show what to expect on the way.
                  </p>
                </div>
              </div>
            )}
            {view === 'month' ? (
              <MonthView
                events={filtered}
                cursor={cursor}
                setCursor={setCursor}
                onSelectEvent={setSelected}
                onSelectDay={setDayPanel}
                playbookByDay={playbookByDay}
                enabled={enabled}
              />
            ) : filtered.length === 0 ? (
              <AgendaEmpty />
            ) : (
              <AgendaView events={filtered} onSelect={setSelected} />
            )}
          </main>
        </div>
      </div>

      {selected && <DetailSheet event={selected} onClose={() => setSelected(null)} />}
      {dayPanel && (
        <DaySheet
          date={dayPanel}
          events={filtered.filter(e => dayKey(new Date(e.startIso)) === dayKey(dayPanel))}
          playbook={playbookByDay.get(dayKey(dayPanel)) ?? []}
          onClose={() => setDayPanel(null)}
          onSelectEvent={(e) => { setDayPanel(null); setSelected(e) }}
        />
      )}
      {showSubscribe && subscribePath && (
        <SubscribeDialog path={subscribePath} onClose={() => setShowSubscribe(false)} />
      )}
    </>
  )
}

/* ─────────────────────────────── Pulse strip ─────────────────────────────── */

function PulseStrip({
  events, onClick,
}: {
  events: CalendarEvent[]
  onClick: (target: 'thisWeek' | 'nextWeek' | 'actionNeeded') => void
}) {
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

  return (
    <div
      className="mt-5 grid grid-cols-3 max-w-xl rounded-2xl bg-white border overflow-hidden divide-x"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <PulseTile label="This week" value={stats.thisWeek} onClick={() => onClick('thisWeek')} />
      <PulseTile label="Week after" value={stats.next7to14} onClick={() => onClick('nextWeek')} />
      <PulseTile
        label="On you"
        value={stats.actionNeeded}
        tone={stats.actionNeeded > 0 ? 'rose' : 'neutral'}
        onClick={() => onClick('actionNeeded')}
      />
    </div>
  )
}

function PulseTile({
  label, value, tone = 'neutral', onClick,
}: {
  label: string; value: number; tone?: 'neutral' | 'rose'; onClick?: () => void
}) {
  return (
    <button
      onClick={onClick}
      className="group text-left px-4 py-3 hover:bg-bg-2/40 transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-emerald-300"
      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-ink-4 leading-none mb-1.5 group-hover:text-ink-3 transition-colors">
        {label}
      </p>
      <p className={`text-[22px] font-bold tabular-nums leading-none tracking-tight ${
        tone === 'rose' && value > 0 ? 'text-rose-700' : 'text-ink'
      }`}>
        {value}
      </p>
    </button>
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
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-ink-4 mb-3">
        Filter
      </p>
      <ul className="space-y-0.5">
        {CATEGORY_ORDER.map(cat => {
          const c = CATEGORY_COLOR[cat]
          const on = enabled[cat]
          return (
            <li key={cat}>
              <button
                onClick={() => onToggle(cat)}
                className={`w-full flex items-center gap-3 px-2 py-2 rounded-lg text-left transition-all ${
                  on ? 'hover:bg-bg-2' : 'opacity-45 hover:opacity-80'
                }`}
              >
                <span className={`w-3.5 h-3.5 rounded-[5px] flex items-center justify-center transition-all ${
                  on ? `${c.dot} shadow-sm` : 'bg-white border border-ink-5'
                }`}>
                  {on && (
                    <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 12 12" fill="none" strokeWidth="3" stroke="currentColor">
                      <path d="M2 6.5l2.5 2.5L10 3.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="text-[13px] font-semibold text-ink block leading-tight">
                    {CATEGORY_LABEL[cat]}
                  </span>
                  <span className="text-[11px] text-ink-3 block leading-tight mt-0.5">
                    {CATEGORY_BLURB[cat]}
                  </span>
                </span>
                <span className={`text-[11px] tabular-nums font-medium ${
                  counts[cat] > 0 ? 'text-ink-2' : 'text-ink-4'
                }`}>
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
    { v: 'month',  label: 'Month'  },
    { v: 'agenda', label: 'Agenda' },
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

/* ────────────────────────────── Month ────────────────────────────── */

function MonthView({
  events, cursor, setCursor, onSelectEvent, onSelectDay, playbookByDay, enabled,
}: {
  events: CalendarEvent[]
  cursor: Date
  setCursor: (d: Date) => void
  onSelectEvent: (e: CalendarEvent) => void
  onSelectDay: (d: Date) => void
  playbookByDay: Map<string, PlaybookMilestone[]>
  enabled: Record<CalendarCategory, boolean>
}) {
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
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[22px] sm:text-[24px] font-bold text-ink tracking-tight leading-none">
          {cursor.toLocaleDateString('en-US', { month: 'long' })}
          <span className="text-ink-3 font-medium ml-2">
            {cursor.getFullYear()}
          </span>
        </h2>
        <div className="flex items-center gap-1 bg-white border rounded-full p-0.5"
          style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}
            aria-label="Previous month"
            className="p-1.5 rounded-full hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            onClick={() => setCursor(new Date(new Date().getFullYear(), new Date().getMonth(), 1))}
            className="text-[11px] font-semibold uppercase tracking-wider text-ink-2 hover:text-ink px-2.5 transition-colors"
          >
            Today
          </button>
          <button
            onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}
            aria-label="Next month"
            className="p-1.5 rounded-full hover:bg-bg-2 text-ink-3 hover:text-ink transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div
        className="rounded-3xl border bg-white overflow-hidden shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_24px_-12px_rgba(0,0,0,0.08)]"
        style={{ borderColor: 'var(--db-border, #ececec)' }}
      >
        {/* Weekday headers */}
        <div
          className="grid grid-cols-7 border-b bg-bg-2/30"
          style={{ borderColor: 'var(--db-border, #ececec)' }}
        >
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d, i) => (
            <div
              key={d}
              className={`text-[10px] font-semibold uppercase tracking-[0.15em] text-center py-3 ${
                i === 0 || i === 6 ? 'text-ink-4' : 'text-ink-3'
              }`}
            >
              {d}
            </div>
          ))}
        </div>
        {/* Grid */}
        <div className="grid grid-cols-7">
          {cells.map((c, idx) => {
            const k = dayKey(c.date)
            const dayEvents = byDay.get(k) ?? []
            const isToday = k === todayKey
            const isPast = k < todayKey
            const isWeekend = c.date.getDay() === 0 || c.date.getDay() === 6
            const isFirst = c.date.getDate() === 1
            const playbook = (playbookByDay.get(k) ?? []).filter(p => enabled[p.category])
            const playbookGhosts = dayEvents.length === 0 ? playbook : []
            const visible = dayEvents.slice(0, 4)
            const hidden = Math.max(0, dayEvents.length - 4)
            const isLastRow = idx >= cells.length - 7
            const isLastCol = idx % 7 === 6
            return (
              <div
                key={idx}
                onClick={() => onSelectDay(c.date)}
                className={`group relative min-h-[124px] sm:min-h-[144px] p-2 cursor-pointer transition-colors ${
                  !isLastCol ? 'border-r' : ''
                } ${!isLastRow ? 'border-b' : ''} ${
                  !c.inMonth
                    ? 'bg-bg-2/40 hover:bg-bg-2/60'
                    : isToday
                      ? 'bg-emerald-50/40 hover:bg-emerald-50/70'
                      : isWeekend
                        ? 'bg-bg-2/20 hover:bg-bg-2/50'
                        : 'hover:bg-bg-2/40'
                } ${isPast && !isToday ? 'opacity-65' : ''}`}
                style={{ borderColor: 'var(--db-border, #ececec)' }}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-baseline gap-1.5">
                    <span className={`text-[13px] font-semibold tabular-nums ${
                      isToday
                        ? 'inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-600 text-white shadow-sm'
                        : c.inMonth ? 'text-ink' : 'text-ink-5'
                    }`}>
                      {c.date.getDate()}
                    </span>
                    {isFirst && c.inMonth && !isToday && (
                      <span className="text-[10px] font-medium uppercase tracking-wider text-ink-4">
                        {c.date.toLocaleDateString('en-US', { month: 'short' })}
                      </span>
                    )}
                  </div>
                  {hidden > 0 && (
                    <span className="text-[10px] font-semibold text-ink-3 tabular-nums bg-bg-2 px-1.5 py-0.5 rounded-full">
                      +{hidden}
                    </span>
                  )}
                </div>
                <div className="space-y-1">
                  {visible.map(ev => (
                    <MonthChip
                      key={ev.id}
                      event={ev}
                      onClick={(e) => { e.stopPropagation(); onSelectEvent(ev) }}
                    />
                  ))}
                  {playbookGhosts.slice(0, 2).map((p, i) => (
                    <PlaybookGhost key={`gh-${i}`} milestone={p} />
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

function MonthChip({
  event, onClick,
}: {
  event: CalendarEvent
  onClick: (e: React.MouseEvent) => void
}) {
  const c = CATEGORY_COLOR[event.category]
  const Icon = KIND_ICON[event.kind]
  /* Three states a busy owner cares about, communicated visually:
       - needs attention (draft / awaiting approval / missed) → red dot
       - done (live / posted) → 60% opacity so it visually recedes
       - scheduled (the default) → no extra cue
     No text codes, no decoder ring required. */
  const s = (event.status || '').toLowerCase()
  const needsAttention = /draft|approv|miss|fail|revis/.test(s)
  const isDone = /post|publish|sent|live/.test(s)
  return (
    <button
      onClick={onClick}
      title={`${event.title}${event.status ? ' · ' + event.status : ''}`}
      className={`relative w-full flex items-center gap-1.5 text-left rounded-md px-1.5 py-1 ${c.bg} ${c.text} ring-1 ring-inset ring-transparent hover:ring-current/30 hover:shadow-sm transition-all ${isDone ? 'opacity-60' : ''}`}
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0" />
      {!event.allDay && (
        <span className="text-[10px] font-semibold tabular-nums flex-shrink-0">
          {formatTimeShort(event.startIso)}
        </span>
      )}
      <span className="text-[11px] font-medium truncate leading-tight flex-1 min-w-0">
        {event.title}
      </span>
      {needsAttention && (
        <span
          aria-label="needs your attention"
          className="w-1.5 h-1.5 rounded-full bg-rose-500 flex-shrink-0 ring-2 ring-white"
        />
      )}
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

/* ───────────────────────────── Day sheet ───────────────────────────── */

function DaySheet({
  date, events, playbook, onClose, onSelectEvent,
}: {
  date: Date
  events: CalendarEvent[]
  playbook: PlaybookMilestone[]
  onClose: () => void
  onSelectEvent: (e: CalendarEvent) => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isToday = dayKey(date) === dayKey(new Date())

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="absolute top-0 right-0 h-full w-full max-w-[440px] bg-white shadow-xl overflow-y-auto animate-in slide-in-from-right duration-200">
        <div className="sticky top-0 bg-white border-b px-5 py-4 flex items-center justify-between" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-3 leading-none">
              {date.toLocaleDateString('en-US', { weekday: 'long' })}
              {isToday && (
                <span className="ml-2 bg-ink text-white px-1.5 py-0.5 rounded text-[9px]">Today</span>
              )}
            </p>
            <h2 className="text-[18px] font-bold text-ink mt-1 leading-none">
              {date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
            </h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-3">
          {events.length === 0 && playbook.length === 0 && (
            <p className="text-[13px] text-ink-3 leading-relaxed">
              Nothing scheduled for this day. As work gets queued, it&rsquo;ll show up here.
            </p>
          )}

          {events.length > 0 && (
            <ul className="space-y-2">
              {events.map(ev => (
                <AgendaRow key={ev.id} event={ev} onClick={() => onSelectEvent(ev)} />
              ))}
            </ul>
          )}

          {playbook.length > 0 && events.length === 0 && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 mb-2">
                Expected
              </p>
              <ul className="space-y-2">
                {playbook.map((p, i) => {
                  const Icon = KIND_ICON[p.kind]
                  return (
                    <li
                      key={i}
                      className="flex items-start gap-3 rounded-xl border border-dashed p-3.5"
                      style={{ borderColor: 'var(--db-border, #e5e5e5)' }}
                    >
                      <div className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 bg-bg-2 text-ink-3">
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium text-ink italic">{p.title}</p>
                        <p className="text-[12px] text-ink-3 mt-0.5">{p.detail}</p>
                      </div>
                    </li>
                  )
                })}
              </ul>
              <p className="text-[11px] text-ink-4 mt-3 italic">
                Estimated from your onboarding plan. Replaced as real work gets scheduled.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Event detail sheet ───────────────────────────── */

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

/* ───────────────────────────── Playbook ───────────────────────────── */

interface PlaybookMilestone {
  daysFromStart: number
  category: CalendarCategory
  kind: CalendarEventKind
  title: string
  detail: string
}

const ONBOARDING_PLAYBOOK: PlaybookMilestone[] = [
  { daysFromStart: 1,  category: 'task',       kind: 'task',    title: 'Kickoff call',           detail: 'Strategist intro and goals review' },
  { daysFromStart: 3,  category: 'production', kind: 'content', title: 'Brand discovery',         detail: 'Logo, voice, and references collected' },
  { daysFromStart: 7,  category: 'production', kind: 'shoot',   title: 'First photo / video day', detail: 'On-site shoot to build content library' },
  { daysFromStart: 10, category: 'production', kind: 'content', title: 'First content batch',     detail: 'Draft posts ready for your review' },
  { daysFromStart: 14, category: 'publishing', kind: 'post',    title: 'First posts go live',     detail: 'Initial cadence begins' },
]

function PlaybookGhost({ milestone }: { milestone: PlaybookMilestone }) {
  const Icon = KIND_ICON[milestone.kind]
  return (
    <div
      title={`${milestone.title} — ${milestone.detail} (planned)`}
      className="flex items-center gap-1 rounded px-1.5 py-1 border border-dashed border-ink-5 text-ink-4 bg-white/40"
    >
      <Icon className="w-2.5 h-2.5 flex-shrink-0 opacity-60" />
      <span className="text-[10px] italic truncate leading-tight">
        {milestone.title}
      </span>
    </div>
  )
}

/* ───────────────────────────── Subscribe dialog ───────────────────────────── */

function SubscribeDialog({ path, onClose }: { path: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const fullUrl = useMemo(() => {
    if (typeof window === 'undefined') return path
    return `${window.location.origin}${path}`
  }, [path])

  const webcalUrl = useMemo(() => {
    if (typeof window === 'undefined') return path
    return `webcal://${window.location.host}${path}`
  }, [path])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  async function copy() {
    try {
      await navigator.clipboard.writeText(fullUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      inputRef.current?.select()
    }
  }

  const googleAddUrl = `https://calendar.google.com/calendar/u/0/r/settings/addbyurl?cid=${encodeURIComponent(fullUrl)}`

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        <div className="px-5 py-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
          <div className="flex items-center gap-2">
            <Rss className="w-4 h-4 text-ink-3" />
            <h2 className="text-[15px] font-semibold text-ink">Subscribe to your calendar</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md hover:bg-bg-2 text-ink-3" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          <p className="text-[13px] text-ink-2 leading-relaxed">
            Add this feed to Google Calendar, Apple Calendar, or Outlook to see your posts,
            shoots, and tasks alongside everything else on your calendar. Updates roughly
            every 15 minutes.
          </p>

          <div>
            <label className="text-[10px] font-semibold uppercase tracking-widest text-ink-4 block mb-1.5">
              Calendar URL
            </label>
            <div className="flex items-stretch gap-2">
              <input
                ref={inputRef}
                readOnly
                value={fullUrl}
                onClick={(e) => e.currentTarget.select()}
                className="flex-1 min-w-0 text-[12px] font-mono bg-bg-2 border border-ink-6 rounded-md px-2.5 py-2 text-ink-2"
              />
              <button
                onClick={copy}
                className="inline-flex items-center gap-1.5 text-[12px] font-medium px-3 rounded-md border border-ink-6 hover:border-ink-5 bg-white text-ink-2 hover:text-ink transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <a
              href={googleAddUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-ink-6 hover:border-ink-5 hover:bg-bg-2 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink leading-tight">Add to Google Calendar</p>
                <p className="text-[10px] text-ink-4 leading-tight mt-0.5">Opens settings page</p>
              </div>
            </a>
            <a
              href={webcalUrl}
              className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-ink-6 hover:border-ink-5 hover:bg-bg-2 transition-colors"
            >
              <Link2 className="w-3.5 h-3.5 text-ink-3 flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-[12px] font-medium text-ink leading-tight">Add to Apple Calendar</p>
                <p className="text-[10px] text-ink-4 leading-tight mt-0.5">Opens native subscribe</p>
              </div>
            </a>
          </div>

          <p className="text-[11px] text-ink-4 leading-relaxed">
            Keep this URL private. Anyone with the link can read your calendar.
          </p>
        </div>
      </div>
    </div>
  )
}

/* ───────────────────────────── Empty state ───────────────────────────── */

function AgendaEmpty() {
  return (
    <div className="rounded-2xl border bg-white p-8 text-center" style={{ borderColor: 'var(--db-border, #e5e5e5)' }}>
      <p className="text-sm text-ink-3 max-w-md mx-auto leading-relaxed">
        Nothing matches the current filter. Toggle a category on the left to see more,
        or switch to Month to see the full grid.
      </p>
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

/* ─────────────────────────────── Approval banner ─────────────────────────────── */

function ApprovalBanner({ count, oldestIso }: { count: number; oldestIso: string | null }) {
  const oldestLabel = oldestIso ? relAge(oldestIso) : null
  return (
    <Link
      href="/dashboard/approvals"
      className="mb-4 flex items-center gap-3 rounded-2xl bg-rose-50 border border-rose-200 px-4 py-3 hover:bg-rose-100 transition-colors group"
    >
      <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0" />
      <span className="text-[13px] text-rose-900 font-medium">
        {count} awaiting your approval
        {oldestLabel && <span className="text-rose-700 font-normal"> · oldest {oldestLabel}</span>}
      </span>
      <span className="flex-1" />
      <span className="text-[12px] font-semibold text-rose-900 group-hover:text-rose-950 inline-flex items-center gap-1">
        Review
        <ChevronRight className="w-3.5 h-3.5" />
      </span>
    </Link>
  )
}

function relAge(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const h = Math.floor(ms / 3_600_000)
  if (h < 1) return 'just now'
  if (h < 24) return `${h}h`
  const d = Math.floor(h / 24)
  if (d === 1) return '1d'
  return `${d}d`
}

