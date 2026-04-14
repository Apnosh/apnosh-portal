'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Loader2, ChevronLeft, ChevronRight, Sparkles, CalendarDays, BarChart3,
  Camera, Video, Globe, MessageCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateContentPlan } from '@/lib/content-engine/generate-content-plan'
import { updateCalendarItem } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import CalendarDetailPanel from '@/components/content-engine/calendar-detail-panel'
import { CalendarGrid, UnscheduledDock } from '@/components/content-engine/calendar-grid'
import { useToast } from '@/components/ui/toast'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ContentPlanItem { id: string; [key: string]: unknown }

type ViewMode = 'calendar' | 'timeline'

interface ContentPlanViewProps {
  clientId: string
  cycleId: string | null
  context: ClientContext | null
  strategyNotes: string
  targetMonth: string
  onMonthChange: (month: string) => void
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800',
  feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800',
  story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800',
  video: 'bg-indigo-100 text-indigo-800',
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const s = (val: unknown): string => (val as string) ?? ''
const toDateStr = (d: Date): string => d.toISOString().split('T')[0]

function isToday(d: Date): boolean {
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

function getProductionStatus(item: ContentPlanItem): 'ready' | 'in_progress' | 'blocked' | 'not_started' {
  const stages = ['concept_status', 'script_status', 'filming_status', 'editing_status', 'design_status', 'caption_status']
  const applicable = stages.filter((st) => s(item[st]) !== 'not_applicable')
  if (applicable.length === 0) return 'not_started'
  if (applicable.some((st) => s(item[st]) === 'blocked')) return 'blocked'
  if (applicable.every((st) => ['approved', 'filmed', 'draft_ready', 'published'].includes(s(item[st])))) return 'ready'
  if (applicable.some((st) => !['draft', 'not_started', 'not_applicable'].includes(s(item[st])))) return 'in_progress'
  return 'not_started'
}

const STATUS_DOT: Record<string, string> = {
  ready: 'bg-emerald-400',
  in_progress: 'bg-amber-400',
  blocked: 'bg-red-400',
  not_started: 'bg-ink-5',
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export default function ContentPlanView({
  clientId, cycleId, context, strategyNotes, targetMonth,
  onMonthChange, onCycleCreated, onStatusChange,
}: ContentPlanViewProps) {
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

  useEffect(() => { setMonth(new Date(targetMonth + 'T12:00:00')) }, [targetMonth])

  const loadItems = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('scheduled_time')
    setItems((data ?? []) as ContentPlanItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  // Month navigation
  const prevMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() - 1); onMonthChange(toDateStr(d)) }
  const nextMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() + 1); onMonthChange(toDateStr(d)) }
  const goToday = () => { const d = new Date(); onMonthChange(new Date(d.getFullYear(), d.getMonth(), 1).toISOString().split('T')[0]) }

  const monthLabel = month.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Build calendar grid
  const weeks = useMemo(() => {
    const year = month.getFullYear()
    const m = month.getMonth()
    const firstDay = new Date(year, m, 1)
    const lastDay = new Date(year, m + 1, 0)

    const start = new Date(firstDay)
    const dow = start.getDay()
    start.setDate(start.getDate() - (dow === 0 ? 6 : dow - 1))

    const result: Array<Array<{ date: Date; dateStr: string; inMonth: boolean; isToday: boolean }>> = []
    const cursor = new Date(start)

    while (cursor <= lastDay || result.length < 5) {
      const week: typeof result[0] = []
      for (let d = 0; d < 7; d++) {
        week.push({
          date: new Date(cursor),
          dateStr: toDateStr(cursor),
          inMonth: cursor.getMonth() === m,
          isToday: isToday(cursor),
        })
        cursor.setDate(cursor.getDate() + 1)
      }
      result.push(week)
      if (result.length >= 6) break
    }
    return result
  }, [month])

  // Group items by scheduled_date
  const byDate = useMemo(() => {
    const map = new Map<string, ContentPlanItem[]>()
    for (const item of items) {
      const d = s(item.scheduled_date)
      if (!d) continue
      if (!map.has(d)) map.set(d, [])
      map.get(d)!.push(item)
    }
    return map
  }, [items])

  // Quick stats
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    items.forEach((i) => { const t = s(i.content_type); counts[t] = (counts[t] ?? 0) + 1 })
    return counts
  }, [items])

  const statusCounts = useMemo(() => {
    const counts = { ready: 0, in_progress: 0, blocked: 0, not_started: 0 }
    items.forEach((i) => { counts[getProductionStatus(i)]++ })
    return counts
  }, [items])

  // Generate handler
  const handleGenerate = async () => {
    if (!context) return
    setGenerating(true); setError(null); setGenPhase('Creating calendar + briefs...')
    let cId = cycleId
    if (!cId) {
      const { data } = await supabase.from('content_cycles').insert({
        client_id: clientId, month: targetMonth, status: 'context_ready',
        deliverables: context.deliverables, context_snapshot: context, strategy_notes: strategyNotes || null,
      }).select().single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }
    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }
    const result = await generateContentPlan(cId, clientId, context, strategyNotes, targetMonth)
    if (result.success) { onStatusChange('briefs_draft'); await loadItems(); toast(`${result.calendarCount} items generated`, 'success') }
    else setError(result.error ?? 'Generation failed')
    setGenerating(false); setGenPhase('')
  }

  // Selected item + detail panel handlers
  const selectedItem = selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null

  const handleSaveDate = async (id: string, field: string, value: string) => {
    await updateCalendarItem(id, { [field]: value })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: value } : i))
    toast('Updated', 'success')
  }

  const handleMarkPublished = async (id: string) => {
    await updateCalendarItem(id, { status: 'published', concept_status: 'approved', caption_status: 'approved' })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: 'published', concept_status: 'approved', caption_status: 'approved' } : i))
    toast('Marked as published', 'success')
  }

  // Unscheduled items
  const unscheduledItems = items.filter((i) => !s(i.scheduled_date))

  // Drop handler for drag-and-drop scheduling
  const handleDropItem = async (itemId: string, dateStr: string) => {
    await updateCalendarItem(itemId, { scheduled_date: dateStr })
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, scheduled_date: dateStr } : i))
    toast('Scheduled', 'success')
  }

  // Production milestones (filming dates grouped by date)
  const milestones = useMemo(() => {
    const map = new Map<string, Array<{ type: string; label: string }>>()
    for (const item of items) {
      const shootDate = s(item.shoot_date)
      if (shootDate) {
        if (!map.has(shootDate)) map.set(shootDate, [])
        map.get(shootDate)!.push({ type: 'filming', label: s(item.concept_title) })
      }
    }
    // Group filming milestones
    const result = new Map<string, Array<{ type: string; label: string }>>()
    for (const [date, ms] of map) {
      const count = ms.filter((m) => m.type === 'filming').length
      result.set(date, [{ type: 'filming', label: count > 1 ? `Filming: ${count} videos` : `Filming: ${ms[0].label}` }])
    }
    return result
  }, [items])

  // Conflict detection
  const conflicts = useMemo(() => {
    const itemConflicts = new Set<string>()
    const dayConflicts = new Set<string>() // dates with issues
    const slots = new Map<string, string[]>()

    for (const item of items) {
      const date = s(item.scheduled_date)
      if (!date) continue
      const time = s(item.scheduled_time)
      const platform = s(item.platform)
      if (time && platform) {
        const key = `${date}|${time}|${platform}`
        if (!slots.has(key)) slots.set(key, [])
        slots.get(key)!.push(item.id)
      }
    }
    // Same time + platform conflicts
    for (const [, ids] of slots) {
      if (ids.length > 1) ids.forEach((id) => itemConflicts.add(id))
    }

    // Heavy days (>3 posts) and gaps
    const dateItemCounts = new Map<string, number>()
    for (const item of items) {
      const d = s(item.scheduled_date)
      if (d) dateItemCounts.set(d, (dateItemCounts.get(d) ?? 0) + 1)
    }
    for (const [date, count] of dateItemCounts) {
      if (count > 3) dayConflicts.add(date)
    }

    return { itemConflicts, dayConflicts }
  }, [items])

  // Loading
  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  // Generating
  if (generating) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" />
        <h2 className="text-base font-bold text-ink mb-1">{genPhase || 'Generating...'}</h2>
        <p className="text-sm text-ink-3">This takes 30-60 seconds</p>
      </div>
    )
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center gap-3 mb-8">
          <button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-base font-bold text-ink min-w-[160px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="text-center py-16">
          <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink mb-2">No content plan for {monthLabel}</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">Generate a complete content plan with calendar scheduling and briefs.</p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button onClick={handleGenerate} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            <Sparkles className="w-4 h-4" /> Generate {monthLabel} Plan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Left: month nav + today */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2"><ChevronLeft className="w-4 h-4" /></button>
          <h2 className="text-sm font-bold text-ink min-w-[140px] text-center">{monthLabel}</h2>
          <button onClick={nextMonth} className="p-1.5 text-ink-4 hover:text-ink rounded-lg hover:bg-bg-2"><ChevronRight className="w-4 h-4" /></button>
          <button onClick={goToday} className="text-[10px] font-semibold text-brand px-2 py-1 rounded-lg hover:bg-brand-tint">Today</button>
        </div>

        {/* Right: stats + view toggle */}
        <div className="flex items-center gap-4">
          {/* Quick stats */}
          <div className="hidden md:flex items-center gap-2 text-[10px] text-ink-3">
            <span className="font-bold text-ink">{items.length} posts</span>
            {Object.entries(typeCounts).slice(0, 4).map(([t, c]) => (
              <span key={t} className="flex items-center gap-1">
                <span className={`w-1.5 h-1.5 rounded-full ${TYPE_COLORS[t]?.split(' ')[0] ?? 'bg-ink-5'}`} />
                {c} {t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
          {/* Status summary */}
          <div className="hidden lg:flex items-center gap-2 text-[10px]">
            {statusCounts.ready > 0 && <span className="text-emerald-600">{statusCounts.ready} ready</span>}
            {statusCounts.in_progress > 0 && <span className="text-amber-600">{statusCounts.in_progress} in progress</span>}
            {statusCounts.blocked > 0 && <span className="text-red-600">{statusCounts.blocked} blocked</span>}
          </div>
          {/* View toggle */}
          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setViewMode('calendar')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium ${viewMode === 'calendar' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <CalendarDays className="w-3.5 h-3.5" /> Calendar
            </button>
            <button onClick={() => setViewMode('timeline')} className={`flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium ${viewMode === 'timeline' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <BarChart3 className="w-3.5 h-3.5" /> Timeline
            </button>
          </div>
        </div>
      </div>

      {/* ── Unscheduled items dock ── */}
      {unscheduledItems.length > 0 && (
        <UnscheduledDock items={unscheduledItems} onItemClick={setSelectedItemId} />
      )}

      {/* ── Calendar + Detail Panel layout ── */}
      <div className="flex gap-4" style={{ minHeight: '540px' }}>
        {/* Calendar grid */}
        <div className={`transition-all ${selectedItem ? 'flex-1 min-w-0' : 'w-full'}`}>
          {viewMode === 'calendar' && (
            <CalendarGrid
              weeks={weeks}
              byDate={byDate}
              milestones={milestones}
              conflicts={conflicts}
              selectedItemId={selectedItemId}
              onItemClick={setSelectedItemId}
              onDropItem={handleDropItem}
            />
          )}

          {viewMode === 'timeline' && (
            <div className="bg-white rounded-xl border border-ink-6 p-12 text-center h-full flex flex-col items-center justify-center">
              <BarChart3 className="w-10 h-10 text-ink-4 mx-auto mb-3" />
              <p className="text-sm text-ink-3">Timeline view coming soon.</p>
            </div>
          )}
        </div>

        {/* Detail panel (slide-over) */}
        {selectedItem && (
          <div className="w-[380px] flex-shrink-0">
            <CalendarDetailPanel
              item={selectedItem}
              onClose={() => setSelectedItemId(null)}
              onSaveDate={handleSaveDate}
              onMarkPublished={handleMarkPublished}
              turnaroundDays={{ editing: 3, clientReview: 2, design: 2 }}
            />
          </div>
        )}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4 text-[10px] text-ink-3">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400" /> Ready</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400" /> In progress</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-400" /> Blocked</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-ink-5" /> Not started</span>
        </div>
        <div className="flex items-center gap-3 text-[10px] text-ink-3">
          {[
            { label: 'Reel', color: 'bg-indigo-400' },
            { label: 'Feed', color: 'bg-cyan-400' },
            { label: 'Carousel', color: 'bg-pink-400' },
            { label: 'Story', color: 'bg-amber-400' },
          ].map((l) => (
            <span key={l.label} className="flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full ${l.color}`} /> {l.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  )
}
