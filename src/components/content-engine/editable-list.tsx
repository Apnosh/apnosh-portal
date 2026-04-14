'use client'

import { useState } from 'react'
import { X, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

interface EditableListProps {
  items: string[]
  onSave: (items: string[]) => Promise<void> | void
  addLabel?: string
  placeholder?: string
  className?: string
  variant?: 'pills' | 'checkboxes' | 'numbered'
  maxItems?: number
}

export default function EditableList({
  items,
  onSave,
  addLabel = 'Add',
  placeholder = 'New item...',
  className,
  variant = 'pills',
  maxItems = 50,
}: EditableListProps) {
  const [adding, setAdding] = useState(false)
  const [newValue, setNewValue] = useState('')
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [editValue, setEditValue] = useState('')

  const handleRemove = async (idx: number) => {
    const updated = items.filter((_, i) => i !== idx)
    await onSave(updated)
  }

  const handleAdd = async () => {
    if (!newValue.trim()) { setAdding(false); return }
    await onSave([...items, newValue.trim()])
    setNewValue('')
    setAdding(false)
  }

  const handleEditSave = async (idx: number) => {
    if (!editValue.trim()) { setEditingIdx(null); return }
    const updated = [...items]
    updated[idx] = editValue.trim()
    await onSave(updated)
    setEditingIdx(null)
  }

  const handleToggle = async (idx: number) => {
    // For checkboxes variant: prefix with ✓ or remove it
    const item = items[idx]
    const updated = [...items]
    updated[idx] = item.startsWith('✓ ') ? item.slice(2) : `✓ ${item}`
    await onSave(updated)
  }

  if (variant === 'checkboxes') {
    return (
      <div className={cn('space-y-1', className)}>
        {items.map((item, i) => {
          const checked = item.startsWith('✓ ')
          const label = checked ? item.slice(2) : item
          return (
            <label key={i} className="flex items-center gap-2 text-sm cursor-pointer group">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => handleToggle(i)}
                className="rounded border-ink-5 text-brand focus:ring-brand/30"
              />
              <span className={cn(checked && 'line-through text-ink-4', 'flex-1')}>{label}</span>
              <button
                onClick={() => handleRemove(i)}
                className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-4 hover:text-red-500 transition-all"
              >
                <X className="w-3 h-3" />
              </button>
            </label>
          )
        })}
        {adding ? (
          <input
            autoFocus
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            onBlur={handleAdd}
            onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
            placeholder={placeholder}
            className="text-sm border border-ink-5 rounded-md px-2 py-1 w-full focus:outline-none focus:ring-2 focus:ring-brand/30"
          />
        ) : items.length < maxItems ? (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand-dark">
            <Plus className="w-3 h-3" /> {addLabel}
          </button>
        ) : null}
      </div>
    )
  }

  if (variant === 'numbered') {
    return (
      <div className={cn('space-y-1.5', className)}>
        {items.map((item, i) => (
          <div key={i} className="flex items-start gap-2 group">
            <span className="text-xs font-bold text-ink-3 w-5 pt-1 text-right flex-shrink-0">#{i + 1}</span>
            {editingIdx === i ? (
              <input
                autoFocus
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={() => handleEditSave(i)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(i); if (e.key === 'Escape') setEditingIdx(null) }}
                className="text-sm border border-ink-5 rounded-md px-2 py-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
              />
            ) : (
              <span
                onClick={() => { setEditingIdx(i); setEditValue(item) }}
                className="text-sm text-ink-2 flex-1 cursor-text hover:bg-bg-2 rounded px-1 -mx-1"
              >
                {item}
              </span>
            )}
            <button
              onClick={() => handleRemove(i)}
              className="opacity-0 group-hover:opacity-100 p-0.5 text-ink-4 hover:text-red-500 transition-all mt-0.5"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        ))}
        {adding ? (
          <div className="flex items-start gap-2">
            <span className="text-xs font-bold text-ink-3 w-5 pt-1 text-right">#{items.length + 1}</span>
            <input
              autoFocus
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              onBlur={handleAdd}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
              placeholder={placeholder}
              className="text-sm border border-ink-5 rounded-md px-2 py-0.5 flex-1 focus:outline-none focus:ring-2 focus:ring-brand/30"
            />
          </div>
        ) : items.length < maxItems ? (
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 text-xs text-brand font-medium hover:text-brand-dark ml-7">
            <Plus className="w-3 h-3" /> {addLabel}
          </button>
        ) : null}
      </div>
    )
  }

  // Default: pills
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((item, i) => (
        <span key={i} className="inline-flex items-center gap-1 bg-bg-2 text-ink-2 text-xs font-medium px-2.5 py-1 rounded-full border border-ink-6 group">
          {editingIdx === i ? (
            <input
              autoFocus
              value={editValue}
              onChange={(e) => setEditValue(e.target.value)}
              onBlur={() => handleEditSave(i)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleEditSave(i); if (e.key === 'Escape') setEditingIdx(null) }}
              className="bg-transparent outline-none w-20 text-xs"
            />
          ) : (
            <span onClick={() => { setEditingIdx(i); setEditValue(item) }} className="cursor-text">{item}</span>
          )}
          <button onClick={() => handleRemove(i)} className="text-ink-4 hover:text-red-500 transition-colors">
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          onBlur={handleAdd}
          onKeyDown={(e) => { if (e.key === 'Enter') handleAdd(); if (e.key === 'Escape') setAdding(false) }}
          placeholder={placeholder}
          className="text-xs bg-bg-2 border border-ink-6 rounded-full px-2.5 py-1 w-24 focus:outline-none focus:ring-2 focus:ring-brand/30"
        />
      ) : items.length < maxItems ? (
        <button onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 text-xs text-brand font-medium px-2 py-1 hover:bg-brand-tint rounded-full transition-colors">
          <Plus className="w-3 h-3" /> {addLabel}
        </button>
      ) : null}
    </div>
  )
}
