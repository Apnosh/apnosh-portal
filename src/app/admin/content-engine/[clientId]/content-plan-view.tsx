'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, ChevronLeft, ChevronRight, Sparkles, CalendarDays, LayoutList, Check,
  Camera, Video, Globe, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateContentPlan } from '@/lib/content-engine/generate-content-plan'
import { updateCalendarItem } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import CalendarDetailPanel from '@/components/content-engine/calendar-detail-panel'
import FilmingDayPanel from '@/components/content-engine/filming-day-panel'
import { CalendarGrid, UnscheduledDock } from '@/components/content-engine/calendar-grid'
import { useToast } from '@/components/ui/toast'

interface ContentPlanItem { id: string; [key: string]: unknown }
type ViewMode = 'calendar' | 'list'

interface ContentPlanViewProps {
  clientId: string; cycleId: string | null; context: ClientContext | null
  strategyNotes: string; targetMonth: string
  onMonthChange: (m: string) => void; onCycleCreated: (id: string) => void; onStatusChange: (s: string) => void
}

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800', video: 'bg-indigo-100 text-indigo-800',
}
const PLATFORM_ICONS: Record<string, typeof Camera> = { instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle }
const STATUS_DOT: Record<string, string> = { ready: 'bg-emerald-400', in_progress: 'bg-amber-400', blocked: 'bg-red-400', not_started: 'bg-ink-5' }

const s = (val: unknown): string => (val as string) ?? ''
const toDateStr = (d: Date): string => d.toISOString().split('T')[0]
function isToday(d: Date) { const n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate() }

function getProductionStatus(item: ContentPlanItem): 'ready' | 'in_progress' | 'blocked' | 'not_started' {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const applicable = stages.filter((st) => s(item[st]) !== 'not_applicable')
  if (applicable.length === 0) return 'not_started'
  if (applicable.some((st) => s(item[st]) === 'blocked')) return 'blocked'
  if (applicable.every((st) => ['approved', 'filmed', 'draft_ready', 'published'].includes(s(item[st])))) return 'ready'
  if (applicable.some((st) => !['draft', 'not_started', 'not_applicable'].includes(s(item[st])))) return 'in_progress'
  return 'not_started'
}

function subtractBusinessDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T12:00:00'); let r = days
  while (r > 0) { d.setDate(d.getDate() - 1); if (d.getDay() !== 0 && d.getDay() !== 6) r-- }
  return d.toISOString().split('T')[0]
}

export default function ContentPlanView({ clientId, cycleId, context, strategyNotes, targetMonth, onMonthChange, onCycleCreated, onStatusChange }: ContentPlanViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<ContentPlanItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genPhase, setGenPhase] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('calendar')
  const [month, setMonth] = useState(new Date(targetMonth + 'T12:00:00'))
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [filmingDate, setFilmingDate] = useState<string | null>(null)

  useEffect(() => { setMonth(new Date(targetMonth + 'T12:00:00')) }, [targetMonth])

  const loadItems = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase.from('content_calendar_items').select('*').eq('cycle_id', cycleId).order('scheduled_date').order('scheduled_time')
    setItems((data ?? []) as ContentPlanItem[]); setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  const prevMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() - 1); onMonthChange(toDateStr(d)) }
  const nextMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() + 1); onMonthChange(toDateStr(d)) }
  const goToday = () => { const d = new Date(); onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]) }
  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  const weeks = useMemo(() => {
    const y = month.getFullYear(), m = month.getMonth()
    const firstDay = new Date(y, m, 1), lastDay = new Date(y, m + 1, 0)
    const start = new Date(firstDay); const dow = start.getDay(); start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))
    const result: Array<Array<{ date: Date; dateStr: string; inMonth: boolean; isToday: boolean }>> = []; const cursor = new Date(start)
    while (cursor <= lastDay || result.length < 5) {
      const week: typeof result[0] = []
      for (let d = 0; d < 7; d++) { week.push({ date: new Date(cursor), dateStr: toDateStr(cursor), inMonth: cursor.getMonth() === m, isToday: isToday(cursor) }); cursor.setDate(cursor.getDate() + 1) }
      result.push(week); if (result.length >= 6) break
    }
    return result
  }, [month])

  const byDate = useMemo(() => { const map = new Map<string, ContentPlanItem[]>(); items.forEach((i) => { const d = s(i.scheduled_date); if (d) { if (!map.has(d)) map.set(d, []); map.get(d)!.push(i) } }); return map }, [items])

  const scheduledCount = items.filter((i) => !!s(i.scheduled_date)).length
  const unscheduledItems = items.filter((i) => !s(i.scheduled_date))
  const selectedItem = selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null

  // Filming items for the filming panel
  const filmingItems = filmingDate ? items.filter((i) => s(i.shoot_date) === filmingDate) : []

  const handleSaveDate = async (id: string, field: string, value: string) => {
    await updateCalendarItem(id, { [field]: value }); setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i)); toast('Updated', 'success')
  }
  const handleMarkPublished = async (id: string) => {
    await updateCalendarItem(id, { status: 'published', concept_status: 'approved', caption_status: 'approved' })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: 'published', concept_status: 'approved', caption_status: 'approved' } : i)); toast('Published', 'success')
  }
  const handleDropItem = async (itemId: string, dateStr: string) => {
    await updateCalendarItem(itemId, { scheduled_date: dateStr }); setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, scheduled_date: dateStr } : i)); toast('Scheduled', 'success')
  }
  const handleGenerate = async () => {
    if (!context) return; setGenerating(true); setError(null); setGenPhase('Creating calendar + briefs...')
    let cId = cycleId
    if (!cId) { const { data } = await supabase.from('content_cycles').insert({ client_id: clientId, month: targetMonth, status: 'context_ready', deliverables: context.deliverables, context_snapshot: context, strategy_notes: strategyNotes || null }).select().single(); if (data) { cId = data.id; onCycleCreated(data.id) } }
    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }
    const result = await generateContentPlan(cId, clientId, context, strategyNotes, targetMonth)
    if (result.success) { onStatusChange('briefs_draft'); await loadItems(); toast(`${result.calendarCount} items generated`, 'success') } else setError(result.error ?? 'Failed')
    setGenerating(false); setGenPhase('')
  }

  // Milestones: filming + editing deadlines + review deadlines
  const milestones = useMemo(() => {
    const result = new Map<string, Array<{ type: string; label: string; itemIds?: string[] }>>()
    const filmingByDate = new Map<string, string[]>()
    items.forEach((i) => { const d = s(i.shoot_date); if (d) { if (!filmingByDate.has(d)) filmingByDate.set(d, []); filmingByDate.get(d)!.push(i.id) } })
    for (const [date, ids] of filmingByDate) {
      if (!result.has(date)) result.set(date, [])
      result.get(date)!.push({ type: 'filming', label: ids.length > 1 ? `Filming: ${ids.length} videos` : `Filming: ${s(items.find((i) => i.id === ids[0])?.concept_title)}`, itemIds: ids })
    }
    // Editing deadlines
    items.forEach((i) => {
      const shootDate = s(i.shoot_date); if (!shootDate) return
      const editDue = subtractBusinessDays(s(i.scheduled_date) || shootDate, 2)
      if (editDue && editDue !== shootDate) {
        if (!result.has(editDue)) result.set(editDue, [])
        result.get(editDue)!.push({ type: 'editing', label: `Edit due: ${s(i.concept_title).slice(0, 20)}` })
      }
    })
    return result
  }, [items])

  // Conflicts: same-time, heavy days, content gaps
  const conflicts = useMemo(() => {
    const itemConflicts = new Set<string>(); const dayConflicts = new Set<string>()
    const slots = new Map<string, string[]>()
    items.forEach((i) => { const d = s(i.scheduled_date), t = s(i.scheduled_time), p = s(i.platform); if (d && t && p) { const k = `${d}|${t}|${p}`; if (!slots.has(k)) slots.set(k, []); slots.get(k)!.push(i.id) } })
    for (const [, ids] of slots) { if (ids.length > 1) ids.forEach((id) => itemConflicts.add(id)) }
    const dateCounts = new Map<string, number>()
    items.forEach((i) => { const d = s(i.scheduled_date); if (d) dateCounts.set(d, (dateCounts.get(d) ?? 0) + 1) })
    for (const [date, count] of dateCounts) { if (count > 3) dayConflicts.add(date) }
    return { itemConflicts, dayConflicts }
  }, [items])

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>
  if (generating) return <div className="text-center py-16"><Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" /><h2 className="text-base font-bold text-ink mb-1">{genPhase || 'Generating...'}</h2><p className="text-sm text-ink-3">This takes 30-60 seconds</p></div>

  if (items.length === 0) return (
    <div>
      <div className="flex items-center justify-center gap-3 mb-8"><button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-5 h-5" /></button><h2 className="text-base font-bold text-ink min-w-[160px] text-center">{monthLabel}</h2><button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-5 h-5" /></button></div>
      <div className="text-center py-16"><Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" /><h2 className="text-lg font-bold text-ink mb-2">No content plan for {monthLabel}</h2><p className="text-sm text-ink-3 max-w-md mx-auto mb-6">Generate a content plan with calendar scheduling and briefs.</p>{error && <p className="text-sm text-red-600 mb-4">{error}</p>}<button onClick={handleGenerate} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark"><Sparkles className="w-4 h-4" /> Generate {monthLabel} Plan</button></div>
    </div>
  )

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-sm font-bold text-ink min-w-[140px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-1.5 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={goToday} className="text-[10px] font-semibold text-brand px-2 py-1 rounded-lg hover:bg-brand-tint">Today</button>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[10px] font-semibold text-ink-3">{scheduledCount}/{items.length} scheduled</span>
          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setViewMode('calendar')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium ${viewMode === 'calendar' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}><CalendarDays className="w-3.5 h-3.5" /> Calendar</button>
            <button onClick={() => setViewMode('list')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium ${viewMode === 'list' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}><LayoutList className="w-3.5 h-3.5" /> List</button>
          </div>
        </div>
      </div>

      {/* Unscheduled dock */}
      {unscheduledItems.length > 0 && <UnscheduledDock items={unscheduledItems} onItemClick={setSelectedItemId} />}

      {/* Main layout */}
      <div className="flex gap-4" style={{ minHeight: '540px' }}>
        <div className={`transition-all ${(selectedItem || filmingDate) ? 'flex-1 min-w-0' : 'w-full'}`}>
          {viewMode === 'calendar' && (
            <CalendarGrid weeks={weeks} byDate={byDate} milestones={milestones} conflicts={conflicts} selectedItemId={selectedItemId}
              onItemClick={(id) => { setSelectedItemId(id); setFilmingDate(null) }}
              onDropItem={handleDropItem}
              onFilmingClick={(date) => { setFilmingDate(date); setSelectedItemId(null) }}
            />
          )}
          {viewMode === 'list' && <ListView items={items} milestones={milestones} onItemClick={(id) => { setSelectedItemId(id); setFilmingDate(null) }} onFilmingClick={(date) => { setFilmingDate(date); setSelectedItemId(null) }} />}
        </div>

        {/* Detail panel */}
        {selectedItem && !filmingDate && (
          <div className="w-[380px] flex-shrink-0">
            <CalendarDetailPanel item={selectedItem} onClose={() => setSelectedItemId(null)} onSaveDate={handleSaveDate} onMarkPublished={handleMarkPublished} turnaroundDays={{ editing: 3, clientReview: 2, design: 2 }} />
          </div>
        )}

        {/* Filming day panel */}
        {filmingDate && filmingItems.length > 0 && (
          <div className="w-[420px] flex-shrink-0">
            <FilmingDayPanel date={filmingDate} items={filmingItems} onClose={() => setFilmingDate(null)}
              onStageUpdate={(itemId, field, value) => setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i))} />
          </div>
        )}
      </div>

      {/* Completion */}
      {unscheduledItems.length === 0 && items.length > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600" /><span className="text-xs font-medium text-emerald-700">{monthLabel} content plan complete — {items.length} items scheduled</span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-between text-[10px] text-ink-3">
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Ready</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> In progress</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink-5" /> Not started</span>
        </div>
        <div className="flex items-center gap-3">
          {[{ l: 'Reel', c: 'bg-indigo-400' }, { l: 'Feed', c: 'bg-cyan-400' }, { l: 'Carousel', c: 'bg-pink-400' }, { l: 'Story', c: 'bg-amber-400' }].map((x) => (
            <span key={x.l} className="flex items-center gap-1"><span className={`w-2 h-2 rounded-full ${x.c}`} /> {x.l}</span>
          ))}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// List View
// ---------------------------------------------------------------------------

function ListView({ items, milestones, onItemClick, onFilmingClick }: {
  items: ContentPlanItem[]; milestones: Map<string, Array<{ type: string; label: string }>>; onItemClick: (id: string) => void; onFilmingClick: (date: string) => void
}) {
  const scheduled = items.filter((i) => !!s(i.scheduled_date)).sort((a, b) => s(a.scheduled_date).localeCompare(s(b.scheduled_date)))
  // Collect filming session rows
  const filmingDates = new Set<string>()
  items.forEach((i) => { const d = s(i.shoot_date); if (d) filmingDates.add(d) })
  // Merge items + filming rows, sorted by date
  type Row = { type: 'item'; item: ContentPlanItem; date: string } | { type: 'filming'; date: string; count: number }
  const rows: Row[] = []
  scheduled.forEach((i) => rows.push({ type: 'item', item: i, date: s(i.scheduled_date) }))
  filmingDates.forEach((d) => { const count = items.filter((i) => s(i.shoot_date) === d).length; rows.push({ type: 'filming', date: d, count }) })
  rows.sort((a, b) => a.date.localeCompare(b.date))

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <div className="grid grid-cols-[80px_60px_1fr_80px_60px_70px_80px] gap-2 px-4 py-2 bg-bg-2 border-b border-ink-6 text-[9px] font-semibold text-ink-3 uppercase tracking-wider">
        <span>Date</span><span>Time</span><span>Item</span><span>Type</span><span>Platform</span><span>Status</span><span>Film date</span>
      </div>
      {rows.map((row, idx) => {
        if (row.type === 'filming') {
          return (
            <button key={`film-${row.date}`} onClick={() => onFilmingClick(row.date)} className="w-full grid grid-cols-[80px_60px_1fr_80px_60px_70px_80px] gap-2 px-4 py-2.5 border-b border-ink-6 bg-orange-50 hover:bg-orange-100 transition-colors text-left">
              <span className="text-[10px] text-orange-700 font-medium">{fmtDate(row.date)}</span>
              <span />
              <span className="text-xs font-semibold text-orange-700">🎥 Filming Session &middot; {row.count} videos</span>
              <span /><span /><span /><span />
            </button>
          )
        }
        const item = row.item
        const status = getProductionStatus(item)
        const PIcon = PLATFORM_ICONS[s(item.platform)] ?? Globe
        const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
        return (
          <button key={item.id} onClick={() => onItemClick(item.id)} className="w-full grid grid-cols-[80px_60px_1fr_80px_60px_70px_80px] gap-2 px-4 py-2.5 border-b border-ink-6 last:border-0 hover:bg-bg-2 transition-colors text-left">
            <span className="text-[10px] text-ink-3 font-medium">{fmtDate(s(item.scheduled_date))}</span>
            <span className="text-[10px] text-ink-4">{s(item.scheduled_time).slice(0, 5)}</span>
            <span className="text-xs font-medium text-ink truncate">{s(item.concept_title)}</span>
            <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded self-center w-fit ${tc}`}>{s(item.content_type).replace(/_/g, ' ')}</span>
            <PIcon className="w-3 h-3 text-ink-4 self-center" />
            <span className={`w-2 h-2 rounded-full self-center ${STATUS_DOT[status]}`} />
            <span className="text-[10px] text-ink-4">{s(item.shoot_date) ? fmtDate(s(item.shoot_date)) : ''}</span>
          </button>
        )
      })}
    </div>
  )
}

function fmtDate(d: string) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '' }
