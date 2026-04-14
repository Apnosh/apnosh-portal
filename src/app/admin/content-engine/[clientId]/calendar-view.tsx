'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Sparkles, Loader2, Trash2, RefreshCw, Check,
  LayoutList, CalendarDays, Plus,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateCalendar, refineCalendarItem } from '@/lib/content-engine/generate-calendar'
import { updateCalendarItem, deleteCalendarItem, restoreCalendarItem, approveAllCalendarItems } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import EditableField from '@/components/content-engine/editable-field'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { CalendarGenerationProgress } from '@/components/content-engine/generation-progress'
import WeekGrid from '@/components/content-engine/week-grid'
import { useToast } from '@/components/ui/toast'

interface CalendarItem {
  id: string
  scheduled_date: string
  scheduled_time: string
  platform: string
  content_type: string
  concept_title: string
  concept_description: string | null
  strategic_goal: string | null
  filming_batch: string | null
  source: string
  status: string
  sort_order: number
}

const GOAL_COLORS: Record<string, string> = {
  awareness: 'bg-blue-50 text-blue-700',
  engagement: 'bg-purple-50 text-purple-700',
  conversion: 'bg-emerald-50 text-emerald-700',
  community: 'bg-amber-50 text-amber-700',
}

const BATCH_COLORS: Record<string, string> = {
  A: 'bg-blue-100 text-blue-800', B: 'bg-emerald-100 text-emerald-800',
  C: 'bg-orange-100 text-orange-800', D: 'bg-purple-100 text-purple-800',
}

const PLATFORM_OPTIONS = [
  { value: 'instagram', label: 'Instagram' }, { value: 'facebook', label: 'Facebook' },
  { value: 'tiktok', label: 'TikTok' }, { value: 'linkedin', label: 'LinkedIn' },
]

const TYPE_OPTIONS = [
  { value: 'reel', label: 'Reel' }, { value: 'feed_post', label: 'Feed Post' },
  { value: 'carousel', label: 'Carousel' }, { value: 'story', label: 'Story' },
  { value: 'static_post', label: 'Static Post' }, { value: 'video', label: 'Video' },
]

const GOAL_OPTIONS = [
  { value: 'awareness', label: 'Awareness' }, { value: 'engagement', label: 'Engagement' },
  { value: 'conversion', label: 'Conversion' }, { value: 'community', label: 'Community' },
]

interface CalendarViewProps {
  clientId: string
  cycleId: string | null
  context: ClientContext | null
  strategyNotes: string
  onCycleCreated: (id: string) => void
  onStatusChange: (status: string) => void
}

export default function CalendarView({
  clientId, cycleId, context, strategyNotes, onCycleCreated, onStatusChange,
}: CalendarViewProps) {
  const supabase = createClient()
  const { toast } = useToast()
  const [items, setItems] = useState<CalendarItem[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<'list' | 'week'>('list')
  const [weekStart, setWeekStart] = useState(new Date())
  const [refiningId, setRefiningId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')

  // Confirm modals
  const [confirmDelete, setConfirmDelete] = useState<CalendarItem | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [confirmApprove, setConfirmApprove] = useState(false)
  const [approving, setApproving] = useState(false)

  const loadItems = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date', { ascending: true })
      .order('scheduled_time', { ascending: true })
    setItems((data ?? []) as CalendarItem[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  // Inline save handler
  const saveField = async (itemId: string, field: string, value: string) => {
    await updateCalendarItem(itemId, { [field]: value })
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: value } : i))
  }

  // Delete with undo
  const handleDelete = async () => {
    if (!confirmDelete) return
    const item = confirmDelete
    setConfirmDelete(null)
    setItems((prev) => prev.filter((i) => i.id !== item.id))
    await deleteCalendarItem(item.id)
    toast(`Deleted "${item.concept_title}"`, 'info')
  }

  // Generate
  const handleGenerate = async () => {
    if (!context) return
    setConfirmRegen(false)
    setGenerating(true)
    setError(null)

    let cId = cycleId
    if (!cId) {
      const { data } = await supabase
        .from('content_cycles')
        .insert({
          client_id: clientId,
          month: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
          status: 'context_ready',
          deliverables: context.deliverables,
          context_snapshot: context,
          strategy_notes: strategyNotes || null,
        })
        .select()
        .single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }

    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }

    // Clear existing items if regenerating
    if (items.length > 0) {
      await supabase.from('content_calendar_items').delete().eq('cycle_id', cId)
      setItems([])
    }

    const result = await generateCalendar(cId, clientId, context, strategyNotes)
    if (result.success) {
      onStatusChange('calendar_draft')
      await loadItems()
      toast(`Calendar generated: ${result.count} items`, 'success')
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
  }

  // Refine
  const handleRefine = async (itemId: string) => {
    if (!context || !refineText.trim()) return
    const result = await refineCalendarItem(itemId, refineText, context)
    if (result.success) {
      await loadItems()
      setRefineText('')
      setRefiningId(null)
      toast('Item refined', 'success')
    }
  }

  // Approve all
  const handleApprove = async () => {
    if (!cycleId) return
    setApproving(true)
    setConfirmApprove(false)
    const result = await approveAllCalendarItems(cycleId)
    if (result.success) {
      onStatusChange('calendar_approved')
      await loadItems()
      toast('Calendar approved', 'success')
    }
    setApproving(false)
  }

  // Summary
  const typeCount = new Map<string, number>()
  const batchCount = new Map<string, number>()
  for (const item of items) {
    typeCount.set(item.content_type, (typeCount.get(item.content_type) ?? 0) + 1)
    if (item.filming_batch) batchCount.set(item.filming_batch, (batchCount.get(item.filming_batch) ?? 0) + 1)
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  // Empty + generating
  if (items.length === 0 && !generating) {
    return (
      <div className="text-center py-16">
        <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate your content calendar</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          AI will create a full month of content based on the client's profile, performance data, and your strategy notes.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          <Sparkles className="w-4 h-4" /> Generate Calendar
        </button>
      </div>
    )
  }

  if (generating) {
    return <CalendarGenerationProgress total={15} completed={0} />
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="text-sm text-ink-3">
          {items.length} items &middot;{' '}
          {[...typeCount.entries()].map(([t, c]) => `${c} ${t.replace('_', ' ')}${c > 1 ? 's' : ''}`).join(', ')}
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <LayoutList className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('week')} className={`p-1.5 ${viewMode === 'week' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}>
              <CalendarDays className="w-4 h-4" />
            </button>
          </div>
          <button onClick={() => items.length > 0 ? setConfirmRegen(true) : handleGenerate()} disabled={generating} className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-ink-5 rounded-lg hover:bg-bg-2 transition-colors">
            <RefreshCw className="w-3.5 h-3.5" /> Regenerate
          </button>
        </div>
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Week view */}
      {viewMode === 'week' && (
        <WeekGrid items={items} weekStart={weekStart} onWeekChange={setWeekStart} onItemClick={() => setViewMode('list')} />
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={item.id} className="bg-white rounded-xl border border-ink-6 p-4 hover:border-ink-5 transition-colors">
              {/* Top row: date + badges */}
              <div className="flex items-center gap-2 flex-wrap mb-2">
                <EditableField value={item.scheduled_date} onSave={(v) => saveField(item.id, 'scheduled_date', v)} type="date" displayClassName="text-xs text-ink-3 font-medium" />
                <EditableField value={item.scheduled_time || ''} onSave={(v) => saveField(item.id, 'scheduled_time', v)} type="time" displayClassName="text-xs text-ink-3" placeholder="Time" />
                <EditableField value={item.platform} onSave={(v) => saveField(item.id, 'platform', v)} type="select" options={PLATFORM_OPTIONS} displayClassName="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink-6 text-ink-3 capitalize" />
                <EditableField value={item.content_type} onSave={(v) => saveField(item.id, 'content_type', v)} type="select" options={TYPE_OPTIONS} displayClassName="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-ink text-white" />
                {item.strategic_goal && (
                  <EditableField value={item.strategic_goal} onSave={(v) => saveField(item.id, 'strategic_goal', v)} type="select" options={GOAL_OPTIONS} displayClassName={`text-[10px] font-semibold px-1.5 py-0.5 rounded capitalize ${GOAL_COLORS[item.strategic_goal] ?? ''}`} />
                )}
                {item.filming_batch && (
                  <EditableField value={item.filming_batch} onSave={(v) => saveField(item.id, 'filming_batch', v)} displayClassName={`text-[10px] font-bold px-1.5 py-0.5 rounded ${BATCH_COLORS[item.filming_batch] ?? 'bg-ink-6 text-ink-3'}`} placeholder="Batch" />
                )}
              </div>

              {/* Title + description */}
              <EditableField value={item.concept_title} onSave={(v) => saveField(item.id, 'concept_title', v)} displayClassName="text-sm font-semibold text-ink" placeholder="Concept title" />
              {(item.concept_description || true) && (
                <div className="mt-1">
                  <EditableField value={item.concept_description ?? ''} onSave={(v) => saveField(item.id, 'concept_description', v)} type="textarea" displayClassName="text-xs text-ink-3" placeholder="Add a description..." rows={2} />
                </div>
              )}

              {/* Refine input */}
              {refiningId === item.id && (
                <div className="flex gap-2 mt-3">
                  <input value={refineText} onChange={(e) => setRefineText(e.target.value)} placeholder="Direction for AI refinement..." className="flex-1 text-sm border border-ink-6 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand/30" onKeyDown={(e) => e.key === 'Enter' && handleRefine(item.id)} />
                  <button onClick={() => handleRefine(item.id)} className="px-3 py-1.5 bg-brand text-white text-xs font-medium rounded-lg">Refine</button>
                  <button onClick={() => { setRefiningId(null); setRefineText('') }} className="px-3 py-1.5 text-xs text-ink-3">Cancel</button>
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-1 mt-2 pt-2 border-t border-ink-6">
                <button onClick={() => setRefiningId(refiningId === item.id ? null : item.id)} className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-medium text-brand hover:bg-brand-tint rounded transition-colors">
                  <Sparkles className="w-3 h-3" /> AI Refine
                </button>
                <div className="flex-1" />
                <button onClick={() => setConfirmDelete(item)} className="p-1.5 text-ink-4 hover:text-red-500 rounded-lg hover:bg-bg-2 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Approve bar */}
      <div className="flex items-center gap-3 pt-4 border-t border-ink-6">
        <button onClick={() => setConfirmApprove(true)} disabled={approving || items.length === 0} className="inline-flex items-center gap-2 px-6 py-2.5 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          {approving ? <><Loader2 className="w-4 h-4 animate-spin" /> Approving...</> : <><Check className="w-4 h-4" /> Approve Calendar ({items.length} items)</>}
        </button>
      </div>

      {/* Modals */}
      <ConfirmModal open={!!confirmDelete} onConfirm={handleDelete} onCancel={() => setConfirmDelete(null)} title="Delete this item?" description={`"${confirmDelete?.concept_title}" will be removed from the calendar.`} confirmLabel="Delete" variant="danger" />
      <ConfirmModal open={confirmRegen} onConfirm={handleGenerate} onCancel={() => setConfirmRegen(false)} title="Regenerate calendar?" description={`This will replace all ${items.length} items. Any manual edits will be lost.`} confirmLabel="Regenerate" variant="danger" />
      <ConfirmModal open={confirmApprove} onConfirm={handleApprove} onCancel={() => setConfirmApprove(false)} title="Approve entire calendar?" description={`${items.length} items will be marked as approved and move to the briefs phase.`} confirmLabel="Approve All" variant="primary" loading={approving} />
    </div>
  )
}
