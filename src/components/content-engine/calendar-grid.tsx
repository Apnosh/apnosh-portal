'use client'

import { useState } from 'react'
import { Camera, Video, Globe, MessageCircle, ChevronLeft, ChevronRight } from 'lucide-react'

interface ContentPlanItem { id: string; [key: string]: unknown }

const s = (val: unknown): string => (val as string) ?? ''

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const TYPE_COLORS: Record<string, string> = {
  reel: 'bg-indigo-100 text-indigo-800', feed_post: 'bg-cyan-100 text-cyan-800',
  carousel: 'bg-pink-100 text-pink-800', story: 'bg-amber-100 text-amber-800',
  static_post: 'bg-cyan-100 text-cyan-800', video: 'bg-indigo-100 text-indigo-800',
}

const PLATFORM_ICONS: Record<string, typeof Camera> = {
  instagram: Camera, tiktok: Video, facebook: Globe, linkedin: MessageCircle,
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
  ready: 'bg-emerald-400', in_progress: 'bg-amber-400', blocked: 'bg-red-400', not_started: 'bg-ink-5',
}

// ---------------------------------------------------------------------------
// Calendar Grid
// ---------------------------------------------------------------------------

interface CalendarGridProps {
  weeks: Array<Array<{ date: Date; dateStr: string; inMonth: boolean; isToday: boolean }>>
  byDate: Map<string, ContentPlanItem[]>
  milestones: Map<string, Array<{ type: string; label: string }>>
  conflicts: { itemConflicts: Set<string>; dayConflicts: Set<string> }
  selectedItemId: string | null
  onItemClick: (id: string) => void
  onDropItem: (itemId: string, dateStr: string) => void
}

export function CalendarGrid({ weeks, byDate, milestones, conflicts, selectedItemId, onItemClick, onDropItem }: CalendarGridProps) {
  const [dragOverDate, setDragOverDate] = useState<string | null>(null)

  const handleDragOver = (e: React.DragEvent, dateStr: string, inMonth: boolean) => {
    if (!inMonth) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setDragOverDate(dateStr)
  }

  const handleDrop = (e: React.DragEvent, dateStr: string) => {
    e.preventDefault()
    setDragOverDate(null)
    const itemId = e.dataTransfer.getData('text/plain')
    if (itemId) onDropItem(itemId, dateStr)
  }

  return (
    <div className="border border-ink-6 rounded-xl overflow-hidden bg-white">
      <div className="grid grid-cols-7 bg-bg-2 border-b border-ink-6">
        {DAY_NAMES.map((d) => (
          <div key={d} className="text-center text-[10px] font-semibold text-ink-3 uppercase tracking-wider py-2">{d}</div>
        ))}
      </div>
      {weeks.map((week, wi) => (
        <div key={wi} className="grid grid-cols-7 border-b border-ink-6 last:border-0">
          {week.map((day) => {
            const dayItems = byDate.get(day.dateStr) ?? []
            const dayMilestones = milestones.get(day.dateStr) ?? []
            const isHeavy = conflicts.dayConflicts.has(day.dateStr)
            const isDragOver = dragOverDate === day.dateStr
            const maxVisible = 3
            const overflow = dayItems.length > maxVisible
            return (
              <div
                key={day.dateStr}
                onDragOver={(e) => handleDragOver(e, day.dateStr, day.inMonth)}
                onDragLeave={() => setDragOverDate(null)}
                onDrop={(e) => handleDrop(e, day.dateStr)}
                className={`min-h-[100px] p-1.5 border-r border-ink-6 last:border-r-0 transition-colors ${
                  !day.inMonth ? 'bg-ink-6/20' : isDragOver ? 'bg-brand-tint' : 'bg-white'
                } ${day.isToday ? 'ring-2 ring-inset ring-brand/30' : ''} ${isHeavy ? 'ring-1 ring-inset ring-amber-300' : ''}`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span className={`text-xs font-medium leading-none ${
                    day.isToday
                      ? 'w-6 h-6 flex items-center justify-center rounded-full bg-brand text-white text-[11px]'
                      : !day.inMonth ? 'text-ink-5' : 'text-ink-3'
                  }`}>
                    {day.date.getDate()}
                  </span>
                  {isHeavy && <span className="text-[8px] text-amber-600" title="Heavy day: 4+ posts">⚠️</span>}
                </div>

                {dayMilestones.map((m, mi) => (
                  <div key={mi} className="flex items-center gap-1 px-1 py-0.5 mb-0.5 rounded bg-orange-50 border border-orange-200 text-[8px] font-medium text-orange-700">
                    🎥 {m.label}
                  </div>
                ))}

                <div className="space-y-0.5">
                  {dayItems.slice(0, maxVisible).map((item) => {
                    const status = getProductionStatus(item)
                    const PIcon = PLATFORM_ICONS[s(item.platform)] ?? Globe
                    const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
                    const time = s(item.scheduled_time)
                    const isSelected = selectedItemId === item.id
                    const hasConflict = conflicts.itemConflicts.has(item.id)
                    return (
                      <button
                        key={item.id}
                        draggable
                        onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move' }}
                        onClick={(e) => { e.stopPropagation(); onItemClick(item.id) }}
                        className={`w-full flex items-center gap-1 px-1.5 py-1 rounded-md border bg-white cursor-pointer transition-all text-left ${
                          isSelected ? 'border-brand ring-1 ring-brand/30 shadow-sm'
                          : hasConflict ? 'border-red-300 ring-1 ring-red-200'
                          : 'border-ink-6/60 hover:border-ink-5 hover:shadow-sm'
                        }`}
                      >
                        <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_DOT[status]}`} />
                        <span className={`text-[8px] font-bold px-1 py-0 rounded flex-shrink-0 ${tc}`}>
                          {s(item.content_type).replace(/_/g, ' ').charAt(0).toUpperCase()}
                        </span>
                        <PIcon className="w-2.5 h-2.5 text-ink-4 flex-shrink-0" />
                        <span className="text-[9px] font-medium text-ink truncate flex-1">
                          {s(item.concept_title).slice(0, 30)}
                        </span>
                        {time && <span className="text-[8px] text-ink-4 flex-shrink-0">{time.slice(0, 5)}</span>}
                      </button>
                    )
                  })}
                  {overflow && (
                    <span className="text-[9px] text-ink-4 font-medium px-1.5">+{dayItems.length - maxVisible} more</span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      ))}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Unscheduled Items Dock
// ---------------------------------------------------------------------------

interface UnscheduledDockProps {
  items: ContentPlanItem[]
  onItemClick: (id: string) => void
}

export function UnscheduledDock({ items, onItemClick }: UnscheduledDockProps) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-amber-700"
      >
        <span>{items.length} unscheduled item{items.length !== 1 ? 's' : ''} — drag onto calendar to schedule</span>
        {expanded
          ? <ChevronLeft className="w-3.5 h-3.5 rotate-90" />
          : <ChevronRight className="w-3.5 h-3.5 rotate-90" />
        }
      </button>
      {expanded && (
        <div className="flex flex-wrap gap-2 px-4 pb-3">
          {items.map((item) => {
            const tc = TYPE_COLORS[s(item.content_type)] ?? 'bg-ink-6 text-ink-3'
            const PIcon = PLATFORM_ICONS[s(item.platform)] ?? Globe
            return (
              <button
                key={item.id}
                draggable
                onDragStart={(e) => { e.dataTransfer.setData('text/plain', item.id); e.dataTransfer.effectAllowed = 'move' }}
                onClick={() => onItemClick(item.id)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg hover:shadow-sm transition-all text-left cursor-grab active:cursor-grabbing"
              >
                <span className={`text-[8px] font-bold px-1 py-0 rounded ${tc}`}>
                  {s(item.content_type).replace(/_/g, ' ').charAt(0).toUpperCase()}
                </span>
                <PIcon className="w-3 h-3 text-ink-4" />
                <span className="text-[10px] font-medium text-ink truncate max-w-[120px]">{s(item.concept_title)}</span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
