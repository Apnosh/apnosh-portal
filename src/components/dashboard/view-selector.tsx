'use client'

import type { ViewType } from '@/types/dashboard'

interface ViewSelectorProps {
  current: ViewType
  onChange: (view: ViewType) => void
}

const tabs: Array<{
  id: ViewType | 'revenue' | 'loyalty'
  emoji: string
  label: string
  disabled?: boolean
}> = [
  { id: 'visibility', emoji: '\uD83D\uDC41', label: 'Visibility' },
  { id: 'foot_traffic', emoji: '\uD83D\uDEB6', label: 'Foot traffic' },
  { id: 'revenue', emoji: '\uD83D\uDCB0', label: 'Revenue', disabled: true },
  { id: 'loyalty', emoji: '\uD83D\uDD04', label: 'Loyalty', disabled: true },
]

export default function ViewSelector({ current, onChange }: ViewSelectorProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 mb-6" style={{ scrollbarWidth: 'none' }}>
      {tabs.map((tab) => {
        const isActive = tab.id === current
        const isDisabled = tab.disabled

        return (
          <button
            key={tab.id}
            disabled={isDisabled}
            onClick={() => !isDisabled && onChange(tab.id as ViewType)}
            className="flex items-center gap-1.5 whitespace-nowrap flex-shrink-0 text-[13px] font-medium rounded-full transition-colors"
            style={{
              padding: '9px 16px',
              border: isDisabled ? '1.5px dashed var(--db-border)' : '1.5px solid ' + (isActive ? 'var(--db-black)' : 'var(--db-border)'),
              background: isActive ? 'var(--db-black)' : 'var(--db-bg)',
              color: isActive ? '#fff' : isDisabled ? 'var(--db-ink-3)' : 'var(--db-ink-2)',
              opacity: isDisabled ? 0.35 : 1,
              cursor: isDisabled ? 'default' : 'pointer',
            }}
          >
            <span>{tab.emoji}</span>
            {tab.label}
            {isDisabled && (
              <span
                className="text-[9px] font-bold uppercase tracking-[0.04em] ml-1 rounded-full"
                style={{
                  padding: '2px 6px',
                  background: 'var(--db-bg-3)',
                  color: 'var(--db-ink-3)',
                }}
              >
                Soon
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}
