'use client'

export type Period = '1' | '3' | '6' | 'all'

interface PeriodSelectorProps {
  value: Period
  onChange: (p: Period) => void
}

const OPTIONS: { value: Period; label: string }[] = [
  { value: '1', label: '1 mo' },
  { value: '3', label: '3 mo' },
  { value: '6', label: '6 mo' },
  { value: 'all', label: 'All' },
]

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <div className="flex gap-1 bg-bg-2 rounded-lg p-0.5">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
            value === opt.value
              ? 'bg-white text-ink shadow-sm'
              : 'text-ink-3 hover:text-ink'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
