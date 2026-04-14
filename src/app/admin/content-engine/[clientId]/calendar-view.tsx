'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import {
  Sparkles, Loader2, RefreshCw, Check, ChevronDown,
  CalendarDays, LayoutList, BarChart3,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { generateCalendar, refineCalendarItem } from '@/lib/content-engine/generate-calendar'
import { updateCalendarItem, deleteCalendarItem, approveAllCalendarItems } from '@/lib/content-engine/actions'
import type { ClientContext } from '@/lib/content-engine/context'
import type { CalendarItemData } from '@/components/content-engine/calendar-item-row'
import CalendarItemRow from '@/components/content-engine/calendar-item-row'
import MonthGrid from '@/components/content-engine/month-grid'
import DayDetailPanel from '@/components/content-engine/day-detail-panel'
import BulkActionBar from '@/components/content-engine/bulk-action-bar'
import QuickAddForm from '@/components/content-engine/quick-add-form'
import ConfirmModal from '@/components/content-engine/confirm-modal'
import ItemDetailPanel from '@/components/content-engine/item-detail-panel'
import { useToast } from '@/components/ui/toast'

type ViewMode = 'month' | 'list'

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
  const [items, setItems] = useState<CalendarItemData[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [genProgress, setGenProgress] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('month')
  const [month, setMonth] = useState(new Date(new Date().getFullYear(), new Date().getMonth(), 1))
  const [selectedDate, setSelectedDate] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [detailItemId, setDetailItemId] = useState<string | null>(null)
  const [quickAddDate, setQuickAddDate] = useState<string | null>(null)
  const [refiningId, setRefiningId] = useState<string | null>(null)
  const [refineText, setRefineText] = useState('')
  const [confirmRegen, setConfirmRegen] = useState(false)
  const [regenMode, setRegenMode] = useState<'all' | 'unapproved' | 'gaps'>('all')

  const loadItems = useCallback(async () => {
    if (!cycleId) { setLoading(false); return }
    const { data } = await supabase
      .from('content_calendar_items')
      .select('*')
      .eq('cycle_id', cycleId)
      .order('scheduled_date').order('scheduled_time')
    setItems((data ?? []) as CalendarItemData[])
    setLoading(false)
  }, [cycleId, supabase])

  useEffect(() => { loadItems() }, [loadItems])

  // Approval stats
  const approvedCount = items.filter((i) => i.status === 'strategist_approved' || i.status === 'approved').length
  const totalCount = items.length
  const approvalPct = totalCount > 0 ? Math.round((approvedCount / totalCount) * 100) : 0

  // Conflict detection
  const conflicts = useMemo(() => {
    const ids = new Set<string>()
    const timeSlots = new Map<string, string[]>()
    for (const item of items) {
      const key = `${item.scheduled_date}|${item.scheduled_time}|${item.platform}`
      if (!timeSlots.has(key)) timeSlots.set(key, [])
      timeSlots.get(key)!.push(item.id)
    }
    for (const [, slotIds] of timeSlots) {
      if (slotIds.length > 1) slotIds.forEach((id) => ids.add(id))
    }
    return ids
  }, [items])

  // Items for selected date
  const selectedDateItems = selectedDate
    ? items.filter((i) => i.scheduled_date === selectedDate)
    : []

  // Group items by week for list view
  const weekGroups = useMemo(() => {
    const groups: Array<{ label: string; items: CalendarItemData[] }> = []
    let currentWeek = ''
    let currentItems: CalendarItemData[] = []
    for (const item of items) {
      const d = new Date(item.scheduled_date + 'T12:00:00')
      const weekStart = new Date(d)
      weekStart.setDate(d.getDate() - ((d.getDay() + 6) % 7))
      const weekEnd = new Date(weekStart)
      weekEnd.setDate(weekStart.getDate() + 6)
      const label = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
      if (label !== currentWeek) {
        if (currentItems.length > 0) groups.push({ label: currentWeek, items: currentItems })
        currentWeek = label
        currentItems = []
      }
      currentItems.push(item)
    }
    if (currentItems.length > 0) groups.push({ label: currentWeek, items: currentItems })
    return groups
  }, [items])

  // Handlers
  const saveField = async (itemId: string, field: string, value: string) => {
    // Handle JSON-encoded arrays (e.g., additional_platforms)
    let parsed: unknown = value
    if (value && value.startsWith('[')) {
      try { parsed = JSON.parse(value) } catch { /* keep as string */ }
    }
    await updateCalendarItem(itemId, { [field]: parsed })
    setItems((prev) => prev.map((i) => i.id === itemId ? { ...i, [field]: parsed } : i))
  }

  const handleApproveItem = async (id: string) => {
    const item = items.find((i) => i.id === id)
    if (!item) return
    const newStatus = item.status === 'strategist_approved' ? 'draft' : 'strategist_approved'
    await updateCalendarItem(id, { status: newStatus })
    setItems((prev) => prev.map((i) => i.id === id ? { ...i, status: newStatus } : i))
  }

  const handleDeleteItem = async (id: string) => {
    await deleteCalendarItem(id)
    setItems((prev) => prev.filter((i) => i.id !== id))
    toast('Item deleted', 'info')
  }

  const handleSelect = (id: string, selected: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      selected ? next.add(id) : next.delete(id)
      return next
    })
  }

  const handleExpand = (id: string) => {
    setDetailItemId(id)
  }

  // Bulk actions
  const handleBulkMove = async (date: string) => {
    for (const id of selectedIds) await updateCalendarItem(id, { scheduled_date: date })
    setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, scheduled_date: date } : i))
    setSelectedIds(new Set())
    toast(`Moved ${selectedIds.size} items`, 'success')
  }

  const handleBulkPlatform = async (platform: string) => {
    for (const id of selectedIds) await updateCalendarItem(id, { platform })
    setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, platform } : i))
    setSelectedIds(new Set())
    toast(`Updated platform`, 'success')
  }

  const handleBulkType = async (type: string) => {
    for (const id of selectedIds) await updateCalendarItem(id, { content_type: type })
    setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, content_type: type } : i))
    setSelectedIds(new Set())
    toast(`Updated type`, 'success')
  }

  const handleBulkDelete = async () => {
    for (const id of selectedIds) await deleteCalendarItem(id)
    setItems((prev) => prev.filter((i) => !selectedIds.has(i.id)))
    toast(`Deleted ${selectedIds.size} items`, 'info')
    setSelectedIds(new Set())
  }

  const handleBulkApprove = async () => {
    for (const id of selectedIds) await updateCalendarItem(id, { status: 'strategist_approved' })
    setItems((prev) => prev.map((i) => selectedIds.has(i.id) ? { ...i, status: 'strategist_approved' } : i))
    setSelectedIds(new Set())
    toast(`Approved ${selectedIds.size} items`, 'success')
  }

  // Quick add
  const handleQuickAdd = async (data: { date: string; time: string; platform: string; type: string; title: string; description: string }) => {
    if (!cycleId) return
    const { data: row } = await supabase
      .from('content_calendar_items')
      .insert({
        cycle_id: cycleId,
        client_id: clientId,
        scheduled_date: data.date,
        scheduled_time: data.time,
        platform: data.platform,
        content_type: data.type,
        concept_title: data.title,
        concept_description: data.description || null,
        source: 'strategist',
        status: 'draft',
        sort_order: items.length,
      })
      .select()
      .single()

    if (row) {
      setItems((prev) => [...prev, row as CalendarItemData])
      setQuickAddDate(null)
      toast('Item added', 'success')
    }
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
          month: month.toISOString().split('T')[0],
          status: 'context_ready',
          deliverables: context.deliverables,
          context_snapshot: context,
          strategy_notes: strategyNotes || null,
        })
        .select().single()
      if (data) { cId = data.id; onCycleCreated(data.id) }
    }
    if (!cId) { setError('Failed to create cycle'); setGenerating(false); return }

    // Smart regenerate: only clear what's needed
    if (regenMode === 'all') {
      await supabase.from('content_calendar_items').delete().eq('cycle_id', cId)
      setItems([])
    } else if (regenMode === 'unapproved') {
      await supabase.from('content_calendar_items').delete().eq('cycle_id', cId).eq('status', 'draft')
      setItems((prev) => prev.filter((i) => i.status !== 'draft'))
    }

    const result = await generateCalendar(cId, clientId, context, strategyNotes, month.toISOString().split('T')[0])
    if (result.success) {
      onStatusChange('calendar_draft')
      await loadItems()
      toast(`${result.count} items generated`, 'success')
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
      toast('Refined', 'success')
    }
  }

  // Approve remaining
  const handleApproveRemaining = async () => {
    if (!cycleId) return
    await approveAllCalendarItems(cycleId)
    onStatusChange('calendar_approved')
    await loadItems()
    toast('Calendar approved', 'success')
  }

  if (loading) return <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-ink-4" /></div>

  // Empty state
  if (items.length === 0 && !generating) {
    return (
      <div className="text-center py-16">
        <Sparkles className="w-10 h-10 text-ink-4 mx-auto mb-4" />
        <h2 className="text-lg font-bold text-ink mb-2">Generate your content calendar</h2>
        <p className="text-sm text-ink-3 max-w-md mx-auto mb-6">
          AI creates a full month based on the client's profile, performance data, and your strategy notes.
        </p>
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        <button onClick={handleGenerate} disabled={generating} className="inline-flex items-center gap-2 px-6 py-3 bg-brand text-white text-sm font-semibold rounded-xl hover:bg-brand-dark transition-colors disabled:opacity-50">
          {generating ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating...</> : <><Sparkles className="w-4 h-4" /> Generate Calendar</>}
        </button>
      </div>
    )
  }

  if (generating) {
    return (
      <div className="text-center py-16">
        <Loader2 className="w-8 h-8 animate-spin text-brand mx-auto mb-4" />
        <h2 className="text-base font-bold text-ink mb-1">Creating your calendar...</h2>
        <p className="text-sm text-ink-3">This takes 10-20 seconds</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Header bar */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        {/* Approval progress */}
        <div className="flex items-center gap-3">
          <div className="w-32 h-1.5 bg-ink-6 rounded-full overflow-hidden">
            <div className="h-full bg-brand rounded-full transition-all duration-500" style={{ width: `${approvalPct}%` }} />
          </div>
          <span className="text-xs text-ink-3 font-medium">{approvedCount}/{totalCount} approved</span>
          {approvedCount < totalCount && approvedCount > 0 && (
            <button onClick={handleApproveRemaining} className="text-xs font-semibold text-brand hover:text-brand-dark transition-colors">
              Approve remaining
            </button>
          )}
          {approvedCount === totalCount && totalCount > 0 && (
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
              <Check className="w-3 h-3" /> All approved
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {/* Approve All */}
          {totalCount > 0 && approvedCount < totalCount && (
            <button
              onClick={handleApproveRemaining}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-brand text-white rounded-lg hover:bg-brand-dark transition-colors"
            >
              <Check className="w-3.5 h-3.5" /> Approve All
            </button>
          )}

          <div className="flex rounded-lg border border-ink-6 overflow-hidden">
            <button onClick={() => setViewMode('month')} className={`p-1.5 transition-colors ${viewMode === 'month' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`} title="Month view">
              <CalendarDays className="w-4 h-4" />
            </button>
            <button onClick={() => setViewMode('list')} className={`p-1.5 transition-colors ${viewMode === 'list' ? 'bg-ink text-white' : 'text-ink-3 hover:bg-bg-2'}`} title="List view">
              <LayoutList className="w-4 h-4" />
            </button>
          </div>

          {/* Smart regenerate dropdown */}
          <div className="relative group">
            <button className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-ink-5 rounded-lg hover:bg-bg-2 transition-colors">
              <RefreshCw className="w-3.5 h-3.5" /> Regenerate <ChevronDown className="w-3 h-3" />
            </button>
            <div className="absolute right-0 top-full mt-1 bg-white rounded-lg border border-ink-6 shadow-lg py-1 min-w-[200px] hidden group-hover:block z-20">
              <button onClick={() => { setRegenMode('unapproved'); setConfirmRegen(true) }} className="w-full text-left px-3 py-2 text-xs text-ink-2 hover:bg-bg-2">
                <strong>Regenerate unapproved</strong>
                <span className="block text-ink-4">Keep approved items, redo the rest</span>
              </button>
              <button onClick={() => { setRegenMode('gaps'); handleGenerate() }} className="w-full text-left px-3 py-2 text-xs text-ink-2 hover:bg-bg-2">
                <strong>Fill gaps</strong>
                <span className="block text-ink-4">Add items to empty days only</span>
              </button>
              <div className="border-t border-ink-6 my-1" />
              <button onClick={() => { setRegenMode('all'); setConfirmRegen(true) }} className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50">
                <strong>Regenerate all</strong>
                <span className="block text-red-400">Replace entire calendar</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Conflict warning */}
      {conflicts.size > 0 && (
        <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <BarChart3 className="w-3.5 h-3.5 flex-shrink-0" />
          {conflicts.size} item{conflicts.size > 1 ? 's have' : ' has'} time conflicts (same time + platform)
        </div>
      )}

      {error && <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</p>}

      {/* Month Grid View */}
      {viewMode === 'month' && (
        <>
          <MonthGrid
            items={items}
            month={month}
            onMonthChange={setMonth}
            selectedDate={selectedDate}
            onSelectDate={(d) => setSelectedDate(selectedDate === d ? null : d)}
            onSelectItem={(item) => { setSelectedDate(item.scheduled_date); setDetailItemId(item.id) }}
            onQuickAdd={(d) => setQuickAddDate(d)}
            conflicts={conflicts}
          />

          {/* Day detail panel */}
          {selectedDate && (
            <DayDetailPanel
              date={selectedDate}
              items={selectedDateItems}
              selectedIds={selectedIds}
              expandedId={expandedId}
              onSelect={handleSelect}
              onExpand={handleExpand}
              onApprove={handleApproveItem}
              onDelete={handleDeleteItem}
              onRefine={(id) => setRefiningId(id)}
              onSave={saveField}
              onQuickAdd={(d) => setQuickAddDate(d)}
              onClose={() => setSelectedDate(null)}
              conflicts={conflicts}
            />
          )}
        </>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="space-y-4">
          {weekGroups.map((group) => (
            <div key={group.label}>
              <h3 className="text-xs font-semibold text-ink-3 uppercase tracking-wider mb-2">
                {group.label} — {group.items.length} item{group.items.length !== 1 ? 's' : ''}
              </h3>
              <div className="bg-white rounded-xl border border-ink-6 divide-y divide-ink-6">
                {group.items.map((item) => (
                  <CalendarItemRow
                    key={item.id}
                    item={item}
                    selected={selectedIds.has(item.id)}
                    onSelect={handleSelect}
                    onApprove={handleApproveItem}
                    onDelete={handleDeleteItem}
                    onRefine={(id) => setRefiningId(id)}
                    onSave={saveField}
                    expanded={expandedId === item.id}
                    onExpand={handleExpand}
                    conflict={conflicts.has(item.id)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quick-add form */}
      {quickAddDate && (
        <QuickAddForm
          date={quickAddDate}
          onAdd={handleQuickAdd}
          onCancel={() => setQuickAddDate(null)}
        />
      )}

      {/* Slide-over detail panel */}
      {detailItemId && (() => {
        const detailItem = items.find((i) => i.id === detailItemId)
        if (!detailItem) return null
        return (
          <ItemDetailPanel
            item={detailItem}
            allItems={items}
            onSave={saveField}
            onApprove={handleApproveItem}
            onDelete={(id) => { handleDeleteItem(id); setDetailItemId(null) }}
            onRefine={async (id, direction) => {
              if (!context) return
              const result = await refineCalendarItem(id, direction, context)
              if (result.success) { await loadItems(); toast('Refined', 'success') }
            }}
            onNavigate={setDetailItemId}
            onClose={() => setDetailItemId(null)}
          />
        )
      })()}

      {/* Bulk action bar */}
      <BulkActionBar
        count={selectedIds.size}
        onMoveToDate={handleBulkMove}
        onChangePlatform={handleBulkPlatform}
        onChangeType={handleBulkType}
        onDelete={handleBulkDelete}
        onApprove={handleBulkApprove}
        onClear={() => setSelectedIds(new Set())}
      />

      {/* Confirm modal */}
      <ConfirmModal
        open={confirmRegen}
        onConfirm={handleGenerate}
        onCancel={() => setConfirmRegen(false)}
        title={regenMode === 'all' ? 'Regenerate entire calendar?' : 'Regenerate unapproved items?'}
        description={regenMode === 'all'
          ? `This will replace all ${totalCount} items. Approved items will be lost.`
          : `${totalCount - approvedCount} unapproved items will be regenerated. ${approvedCount} approved items will be kept.`}
        confirmLabel="Regenerate"
        variant="danger"
      />
    </div>
  )
}
