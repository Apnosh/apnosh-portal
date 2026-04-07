'use client'

import { useState } from 'react'
import { ChevronDown, Pencil, Save, Loader2, Sparkles, RefreshCw, CheckCircle2, Circle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

interface GuidelineSectionProps {
  title: string
  icon: LucideIcon
  isComplete: boolean
  isAiGenerated: boolean
  editing: boolean
  onEdit: () => void
  onSave: () => void
  onRegenerate?: () => void
  saving: boolean
  children: React.ReactNode
  defaultOpen?: boolean
}

export default function GuidelineSection({
  title, icon: Icon, isComplete, isAiGenerated,
  editing, onEdit, onSave, onRegenerate, saving,
  children, defaultOpen = false,
}: GuidelineSectionProps) {
  const [open, setOpen] = useState(defaultOpen)

  return (
    <div className="bg-white rounded-xl border border-ink-6 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2.5 px-5 py-3.5 border-b border-ink-6 bg-bg-2 hover:bg-ink-6/50 transition-colors"
      >
        <Icon className="w-4 h-4 text-ink-3 flex-shrink-0" />
        <h2 className="text-sm font-semibold text-ink flex-1 text-left">{title}</h2>

        <div className="flex items-center gap-2">
          {isAiGenerated && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium text-brand-dark bg-brand-tint rounded-full">
              <Sparkles className="w-3 h-3" />
              AI
            </span>
          )}
          {isComplete ? (
            <CheckCircle2 className="w-4 h-4 text-green-500" />
          ) : (
            <Circle className="w-4 h-4 text-ink-5" />
          )}
          <ChevronDown className={`w-4 h-4 text-ink-4 transition-transform ${open ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {open && (
        <div className="p-5">
          <div className="flex items-center justify-end gap-2 mb-4">
            {isAiGenerated && onRegenerate && !editing && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onRegenerate() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors"
              >
                <RefreshCw className="w-3 h-3" />
                Regenerate
              </button>
            )}
            {editing ? (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onSave() }}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-brand-dark rounded-lg hover:bg-brand-dark/90 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
            ) : (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onEdit() }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-ink-3 hover:text-ink border border-ink-6 rounded-lg hover:bg-bg-2 transition-colors"
              >
                <Pencil className="w-3 h-3" />
                Edit
              </button>
            )}
          </div>
          {children}
        </div>
      )}
    </div>
  )
}
