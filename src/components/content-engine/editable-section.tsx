'use client'

import { useState } from 'react'
import { Pencil, Check, X, Loader2, ChevronDown, ChevronUp } from 'lucide-react'

interface EditableSectionProps {
  title: string
  icon: React.ReactNode
  children: React.ReactNode
  editContent: React.ReactNode
  onSave: () => Promise<void>
  onCancel?: () => void
  collapsible?: boolean
  defaultOpen?: boolean
  className?: string
}

export default function EditableSection({
  title,
  icon,
  children,
  editContent,
  onSave,
  onCancel,
  collapsible = true,
  defaultOpen = true,
  className,
}: EditableSectionProps) {
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [open, setOpen] = useState(defaultOpen)

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave()
      setEditing(false)
    } catch {
      // Error handled by parent
    }
    setSaving(false)
  }

  const handleCancel = () => {
    onCancel?.()
    setEditing(false)
  }

  return (
    <div className={`bg-white rounded-xl border border-ink-6 ${className ?? ''}`}>
      {/* Header */}
      <div className="flex items-center gap-2 p-4">
        {collapsible ? (
          <button onClick={() => setOpen(!open)} className="flex items-center gap-2 flex-1 text-left">
            {icon}
            <span className="text-sm font-semibold text-ink flex-1">{title}</span>
            {open ? <ChevronUp className="w-4 h-4 text-ink-4" /> : <ChevronDown className="w-4 h-4 text-ink-4" />}
          </button>
        ) : (
          <div className="flex items-center gap-2 flex-1">
            {icon}
            <span className="text-sm font-semibold text-ink">{title}</span>
          </div>
        )}

        {/* Edit / Save / Cancel buttons — only show if editContent is provided */}
        {!editing && open && editContent && (
          <button
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink bg-bg-2 hover:bg-ink-6 rounded-lg transition-colors"
          >
            <Pencil className="w-3 h-3" />
            Edit
          </button>
        )}
        {editing && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={handleCancel}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink rounded-lg transition-colors"
            >
              <X className="w-3 h-3" />
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-dark rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Check className="w-3 h-3" />
              )}
              Save
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      {open && (
        <div className="px-4 pb-4">
          {editing ? editContent : children}
        </div>
      )}
    </div>
  )
}
