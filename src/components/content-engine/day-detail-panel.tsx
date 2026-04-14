'use client'

import { X, Plus } from 'lucide-react'
import CalendarItemRow, { type CalendarItemData } from './calendar-item-row'

interface DayDetailPanelProps {
  date: string
  items: CalendarItemData[]
  selectedIds: Set<string>
  expandedId: string | null
  onSelect: (id: string, selected: boolean) => void
  onExpand: (id: string) => void
  onApprove: (id: string) => void
  onDelete: (id: string) => void
  onRefine: (id: string) => void
  onSave: (id: string, field: string, value: string) => Promise<void>
  onQuickAdd: (date: string) => void
  onClose: () => void
  conflicts: Set<string>
}

export default function DayDetailPanel({
  date, items, selectedIds, expandedId, onSelect, onExpand, onApprove, onDelete,
  onRefine, onSave, onQuickAdd, onClose, conflicts,
}: DayDetailPanelProps) {
  const d = new Date(date + 'T12:00:00')
  const label = d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="bg-white border border-ink-6 rounded-xl mt-3 overflow-hidden animate-in slide-in-from-top-2 duration-200">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-ink-6 bg-bg-2">
        <div>
          <h3 className="text-sm font-bold text-ink">{label}</h3>
          <span className="text-[10px] text-ink-3">{items.length} item{items.length !== 1 ? 's' : ''}</span>
        </div>
        <button onClick={onClose} className="p-1.5 text-ink-4 hover:text-ink hover:bg-ink-6 rounded-lg transition-colors">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Items */}
      <div className="divide-y divide-ink-6">
        {items.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-ink-3">
            No content scheduled for this day.
          </div>
        ) : (
          items
            .sort((a, b) => (a.scheduled_time ?? '').localeCompare(b.scheduled_time ?? ''))
            .map((item) => (
              <CalendarItemRow
                key={item.id}
                item={item}
                selected={selectedIds.has(item.id)}
                onSelect={onSelect}
                onApprove={onApprove}
                onDelete={onDelete}
                onRefine={onRefine}
                onSave={onSave}
                expanded={expandedId === item.id}
                onExpand={onExpand}
                showDate={false}
                conflict={conflicts.has(item.id)}
              />
            ))
        )}
      </div>

      {/* Add button */}
      <div className="px-4 py-2 border-t border-ink-6">
        <button
          onClick={() => onQuickAdd(date)}
          className="flex items-center gap-1.5 text-xs font-medium text-brand hover:text-brand-dark transition-colors"
        >
          <Plus className="w-3 h-3" /> Add to this day
        </button>
      </div>
    </div>
  )
}
