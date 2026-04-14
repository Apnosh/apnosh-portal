'use client'

import { Loader2, Check, Sparkles } from 'lucide-react'

interface CalendarProgressProps {
  total: number
  completed: number
}

export function CalendarGenerationProgress({ total, completed }: CalendarProgressProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Sparkles className="w-4 h-4 text-brand animate-pulse" />
        <span>Creating your content calendar... {completed > 0 ? `${completed} of ${total} items` : 'Starting...'}</span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {Array.from({ length: total }, (_, i) => (
          <div
            key={i}
            className={`rounded-xl border p-4 transition-all duration-300 ${
              i < completed
                ? 'border-brand/30 bg-brand-tint'
                : 'border-ink-6 bg-bg-2 animate-pulse'
            }`}
          >
            {i < completed ? (
              <div className="flex items-center gap-2">
                <Check className="w-3.5 h-3.5 text-brand flex-shrink-0" />
                <span className="text-xs text-brand-dark font-medium">Item {i + 1} ready</span>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="h-3 bg-ink-6 rounded w-3/4" />
                <div className="h-2 bg-ink-6 rounded w-1/2" />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

interface BriefProgressProps {
  total: number
  current: number
  currentTitle?: string
}

export function BriefGenerationProgress({ total, current, currentTitle }: BriefProgressProps) {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm text-ink-3">
        <Sparkles className="w-4 h-4 text-brand animate-pulse" />
        <span>Generating brief {current + 1} of {total}...</span>
      </div>

      {/* Progress bar */}
      <div className="bg-ink-6 rounded-full h-2 overflow-hidden">
        <div
          className="bg-brand h-full rounded-full transition-all duration-500 ease-out"
          style={{ width: `${pct}%` }}
        />
      </div>

      {currentTitle && (
        <p className="text-xs text-ink-4 truncate">Working on: {currentTitle}</p>
      )}

      {/* Completed items */}
      <div className="space-y-1 max-h-32 overflow-y-auto">
        {Array.from({ length: current }, (_, i) => (
          <div key={i} className="flex items-center gap-1.5 text-xs text-ink-3">
            <Check className="w-3 h-3 text-brand flex-shrink-0" />
            <span>Brief {i + 1} complete</span>
          </div>
        ))}
        {current < total && (
          <div className="flex items-center gap-1.5 text-xs text-brand">
            <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
            <span>Brief {current + 1}{currentTitle ? `: ${currentTitle}` : ''}</span>
          </div>
        )}
      </div>
    </div>
  )
}
