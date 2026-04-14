'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Loader2, RefreshCw, Check, ChevronDown, ChevronLeft, ChevronRight,
  CalendarDays, LayoutList, Camera, Scissors, Palette, Pen, Eye,
  BarChart3, AlertCircle,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateContentPlan } from '@/lib/content-engine/generate-content-plan'
import { refineCalendarItem } from '@/lib/content-engine/generate-calendar'
import { refineBriefField } from '@/lib/content-engine/generate-briefs'
import { updateCalendarItem, deleteCalendarItem, approveAllCalendarItems } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import type { CalendarItemData } from '@/components/content-engine/calendar-item-row'
import CalendarItemRow from '@/components/content-engine/calendar-item-row'
import MonthGrid from '@/components/content-engine/month-grid'
import UnifiedDetailPanel, { type ContentPlanItem, type RoleFilter } from '@/components/content-engine/unified-detail-panel'
import BulkActionBar from '@/components/content-engine/bulk-action-bar'
import QuickAddForm from '@/components/content-engine/quick-add-form'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import { useToast } from '@/components/ui/toast'

type ViewMode = 'month' | 'list'

const ROLE_FILTERS: Array<{ key: RoleFilter; label: string; icon: typeof Eye }> = [
  { key: 'full', label: 'Full Plan', icon: Eye },
  { key: 'videographer', label: 'Videographer', icon: Camera },
  { key: 'editor', label: 'Editor', icon: Scissors },
  { key: 'designer', label: 'Designer', icon: Palette },
  { key: 'copywriter', label: 'Copywriter', icon: Pen },
]

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
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [month, setMonth] = useState(new Date(targetMonth + 'T12:00:00'))
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('full')
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [confirmRegen, setConfirmRegen] = useState(false)

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

  const targetMonthLabel = new Date(targetMonth + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Stats
  const approvedCount = items.filter((i) => i.status === 'approved' || i.status === 'strategist_approved').length
  const totalCount = items.length
  const approvalPct = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0
  const hasBriefs = items.some((i) => i.hook || i.caption || i.script)

  // Conflicts
  const conflicts = useMemo(() => {
    const ids = new Set<string>()
    const slots = new Map<string, string[]>()
    for (const item of items) {
      const key = `${item.scheduled_date}|${item.scheduled_time}|${item.platform}`
      if (!slots.has(key)) slots.set(key, [])
      slots.get(key)!.push(item.id)
    }
    for (const [, slotIds] of slots) { if (slotIds.length > 1) slotIds.forEach((id) => ids.add(id)) }
    return ids
  }, [items])

  // Completeness
  const getCompleteness = (item: ContentPlanItem): string => {
    const isVideo = ['reel', 'video', 'short_form_video'].includes(item.content_type)
    const fields = [item.hook, item.caption]
    if (isVideo) fields.push(item.script)
    const filled = fields.filter(Boolean).length
    if (filled === fields.length) return 'complete'
    if (filled > 0) return 'partial'
    return 'empty'
  }

  const COMPLETENESS_COLORS: Record<string, string> = { complete: 'bg-brand', partial: 'bg-amber-400', empty: 'bg-ink-5' }

  // Week groups for list view
  const weekGroups = useMemo(() => {
    const groups: Array<{ label: string; items: ContentPlanItem[] }> = []
    let currentWeek = ''; let currentItems: ContentPlanItem[] = []
    for (const item of items) {
      const d = new Date(item.scheduled_date + 'T12:00:00')
      const ws = new Date(d); ws.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const we = new Date(ws); we.setDate(ws.getDate() + 6)
      const label = `${ws.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${we.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      if (label !== currentWeek) { if (currentItems.length > 0) groups.push({ label: currentWeek, items: currentItems }); currentWeek = label; currentItems = [] }
      currentItems.push(item)
    }
    if (currentItems.length > 0) groups.push({ label: currentWeek, items: currentItems })
    return groups
  }, [items])

  // Handlers
  const saveField = async (id: string, field: string, value: unknown) => {
    let parsed = value
    if (typeof value === 'string' && value.startsWith('[')) { try { parsed = JSON.parse(value) } catch { /* keep */ } }
    await updateCalendarItem(id, { [field]: parsed })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, [field]: parsed } : i))
  }

  const handleApproveItem = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = (item.status === 'approved' || item.status === 'strategist_approved') ? 'draft' : 'approved'
    await updateCalendarItem(id, { status: newStatus })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  const handleDeleteItem = async (id: string) => {
    await deleteCalendarItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    if (selectedItemId === id) setSelectedItemId(null)
    toast('Deleted', 'info')
  }

  const handleApproveAll = async () => {
    if (!cycleId) return
    await approveAllCalendarItems(cycleId)
    onStatusChange('calendar_approved')
    await loadItems()
    toast('All items approved', 'success')
  }

  const handleSelect = (id: string, selected: boolean) => { setSelectedIds((prev) => { const next = new Set(prev); selected ? next.add(id) : next.delete(id); return next }) }

  const handleRefine = async (id: string, field: string, direction: string) => {
    if (!context) return
    if (['concept_title', 'concept_description'].includes(field)) {
      await refineCalendarItem(id, direction, context)
    } else {
      await refineBriefField(id, field, direction, context)
    }
    await loadItems()
    toast('Refined', 'success')
  }

  // Generate
  const handleGenerate = async () => {
    if (!context) return
    setConfirmRegen(false)
    setGenerating(true)
    setError(null)
    setGenPhase('Creating calendar...')

    let cId = cycleId
    if (!cId) {
      const { data } = await supabase.from('content_cycles').insert({
        client_id: clientId, month: targetMonth, status: 'context_ready',
        deliverables: context.deliverables, context_snapshot: context, strategy_notes: strategyNotes || null,
      }).select().single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }
    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }

    if (items.length > 0) {
      await supabase.from('content_calendar_items').delete().eq('cycle_id', cId)
      setItems([])
    }

    setGenPhase('Generating calendar + briefs...')
    const result = await generateContentPlan(cId, clientId, context, strategyNotes, targetMonth)
    if (result.success) {
      onStatusChange('briefs_draft')
      await loadItems()
      toast(`${result.calendarCount} items with briefs generated`, 'success')
    } else {
      setError(result.error ?? 'Generation failed')
    }
    setGenerating(false)
    setGenPhase('')
  }

  // Quick add
  const handleQuickAdd = async (data: { date: string; time: string; platform: string; type: string; title: string; description: string }) => {
    if (!cycleId) return
    const { data: row } = await supabase.from('content_calendar_items').insert({
      cycle_id: cycleId, client_id: clientId, scheduled_date: data.date, scheduled_time: data.time,
      platform: data.platform, content_type: data.type, concept_title: data.title,
      concept_description: data.description || null, source: 'strategist', status: 'draft', sort_order: items.length,
    }).select().single()
    if (row) { setItems((prev) => [...prev, row as ContentPlanItem]); setQuickAddDate(null); toast('Added', 'success') }
  }

  // Bulk
  const handleBulkMove = async (date: string) => { for (const id of selectedIds) await updateCalendarItem(id, { scheduled_date: date }); setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, scheduled_date: date } : i)); setSelectedIds(new Set()); toast('Moved', 'success') }
  const handleBulkPlatform = async (p: string) => { for (const id of selectedIds) await updateCalendarItem(id, { platform: p }); setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, platform: p } : i)); setSelectedIds(new Set()); toast('Updated', 'success') }
  const handleBulkType = async (t: string) => { for (const id of selectedIds) await updateCalendarItem(id, { content_type: t }); setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, content_type: t } : i)); setSelectedIds(new Set()); toast('Updated', 'success') }
  const handleBulkDelete = async () => { for (const id of selectedIds) await deleteCalendarItem(id); setItems((prev) => prev.filter((i) => !selectedIds.has(i.id))); toast('Deleted', 'info'); setSelectedIds(new Set()) }
  const handleBulkApprove = async () => { for (const id of selectedIds) await updateCalendarItem(id, { status: 'approved' }); setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, status: 'approved' } : i)); setSelectedIds(new Set()); toast('Approved', 'success') }

  const prevMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() - 1); onMonthChange(d.toISOString().split('T')[0]) }
  const nextMonth = () => { const d = new Date(targetMonth + 'T12:00:00'); d.setMonth(d.getMonth() + 1); onMonthChange(d.toISOString().split('T')[0]) }

  const selectedItem = selectedItemId ? items.find((i) => i.id === selectedItemId) ?? null : null

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  // Generating
  if (generating) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" />
        <h2 className="text-base font-bold text-ink mb-1">{genPhase || 'Generating...'}</h2>
        <p className="text-sm text-ink-3">This takes 30-60 seconds for calendar + briefs</p>
      </div>
    )
  }

  // Empty state
  if (items.length === 0) {
    return (
      <div>
        <div className="flex items-center justify-center gap-3 mb-8">
          <button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-5 h-5" /></button>
          <h2 className="text-base font-bold text-ink min-w-[160px] text-center">{targetMonthLabel}</h2>
          <button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-5 h-5" /></button>
        </div>
        <div className="text-center py-16">
          <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
          <h2 className="text-lg font-bold text-ink mb-2">No content plan for {targetMonthLabel}</h2>
          <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">Generate a complete content plan with calendar scheduling and production briefs in one shot.</p>
          {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
          <button onClick={handleGenerate} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors">
            <Sparkles className="w-4 h-4" /> Generate {targetMonthLabel} Plan
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Month nav */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-sm font-bold text-ink min-w-[130px] text-center">{targetMonthLabel}</span>
          <button onClick={nextMonth} className="p-1 text-ink-4 hover:text-ink rounded"><ChevronRight className="w-4 h-4" /></button>
        </div>

        {/* Progress + actions */}
        <div className="flex items-center gap-3">
          <div className="w-24 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${approvalPct}%` }} />
          </div>
          <span className="text-[10px] text-ink-3">{approvedCount}/{totalCount}</span>
          {approvedCount < totalCount && (
            <button onClick={handleApproveAll} className="inline-flex items-center gap-1 px-2.5 py-1 text-[10px] font-semibold bg-brand text-white rounded-lg hover:bg-brand-dark">
              <Check className="w-3 h-3" /> Approve All
            </button>
          )}
        </div>

        {/* View + role filter + regenerate */}
        <div className="flex items-center gap-2">
          {/* Role filter */}
          <div className="flex gap-0.5 bg-bg-2 rounded-lg p-0.5">
            {ROLE_FILTERS.map((r) => (
              <button key={r.key} onClick={() => setRoleFilter(r.key)} className={`p-1.5 rounded transition-colors ${roleFilter === r.key ? 'bg-white text-ink shadow-sm' : 'text-ink-4 hover:text-ink'}`} title={r.label}>
                <r.icon className="w-3.5 h-3.5" />
              </button>
            ))}
          </div>

          {/* View toggle */}
          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setViewMode('month')} className={`p-1.5 ${viewMode === 'month' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}><CalendarDays className="w-3.5 h-3.5" /></button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 ${viewMode === 'list' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`}><LayoutList className="w-3.5 h-3.5" /></button>
          </div>

          {/* Regenerate */}
          <button onClick={() => setConfirmRegen(true)} className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[10px] font-medium border border-ink-5 rounded-lg hover:bg-bg-2">
            <RefreshCw className="w-3 h-3" /> Regenerate
          </button>
        </div>
      </div>

      {conflicts.size > 0 && (
        <div className="flex items-center gap-2 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
          <AlertCircle className="w-3 h-3" /> {conflicts.size} time conflicts
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Two-panel layout */}
      <div className="flex gap-4" style={{ minHeight: '500px' }}>
        {/* Left panel: grid or list */}
        <div className={`${selectedItem ? 'w-2/5' : 'w-full'} transition-all`}>
          {viewMode === 'month' && (
            <MonthGrid
              items={items as CalendarItemData[]}
              month={month}
              selectedDate={selectedDate}
              onSelectDate={(d) => setSelectedDate(selectedDate === d ? null : d)}
              onSelectItem={(item) => setSelectedItemId(item.id)}
              onQuickAdd={(d) => setQuickAddDate(d)}
              conflicts={conflicts}
            />
          )}
          {viewMode === 'list' && (
            <div className="space-y-3">
              {weekGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="text-[10px] font-semibold text-ink-3 uppercase tracking-wider mb-1.5">{group.label} — {group.items.length} items</h3>
                  <div className="bg-white rounded-xl border border-ink-6 divide-y divide-ink-6">
                    {group.items.map((item) => (
                      <div key={item.id} className="flex items-center gap-2 px-3 py-2 hover:bg-bg-2 cursor-pointer transition-colors" onClick={() => setSelectedItemId(item.id)}>
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${COMPLETENESS_COLORS[getCompleteness(item)]}`} />
                        <CalendarItemRow
                          item={item as CalendarItemData}
                          selected={selectedIds.has(item.id)}
                          onSelect={handleSelect}
                          onApprove={handleApproveItem}
                          onDelete={handleDeleteItem}
                          onRefine={() => {}}
                          onSave={async () => {}}
                          onExpand={() => setSelectedItemId(item.id)}
                          conflict={conflicts.has(item.id)}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right panel: unified detail */}
        {selectedItem && (
          <div className="w-3/5">
            <UnifiedDetailPanel
              item={selectedItem}
              allItems={items}
              roleFilter={roleFilter}
              onSave={saveField}
              onApprove={handleApproveItem}
              onDelete={handleDeleteItem}
              onRefine={handleRefine}
              onNavigate={setSelectedItemId}
              onClose={() => setSelectedItemId(null)}
            />
          </div>
        )}
      </div>

      {quickAddDate && <QuickAddForm date={quickAddDate} onAdd={handleQuickAdd} onCancel={() => setQuickAddDate(null)} />}

      <BulkActionBar count={selectedIds.size} onMoveToDate={handleBulkMove} onChangePlatform={handleBulkPlatform} onChangeType={handleBulkType} onDelete={handleBulkDelete} onApprove={handleBulkApprove} onClear={() => setSelectedIds(new Set())} />

      <ConfirmModal open={confirmRegen} onConfirm={handleGenerate} onCancel={() => setConfirmRegen(false)} title="Regenerate entire plan?" description={`This will replace all ${totalCount} items (calendar + briefs). This takes 30-60 seconds.`} confirmLabel="Regenerate" variant="danger" />
    </div>
  )
}
