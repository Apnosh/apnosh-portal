'use client'

import { type ReactNode } from 'react'

// Question header
export function Question({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-1">
      <h2
        className="text-2xl font-semibold leading-tight mb-1.5 max-sm:text-[21px]"
        style={{ fontFamily: 'Playfair Display, serif', color: '#111', letterSpacing: '-0.3px' }}
      >
        {title}
      </h2>
      <p className="text-sm font-light leading-relaxed" style={{ color: '#999' }}>
        {subtitle}
      </p>
      <div className="h-px mt-4" style={{ background: '#f0f0f0' }} />
    </div>
  )
}

// Chip (pill toggle)
export function Chip({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 py-2 rounded-[20px] text-[13px] transition-all select-none"
      style={{
        border: selected ? '2px solid #4abd98' : '1.5px solid #e0e0e0',
        background: selected ? '#f0faf6' : 'white',
        color: selected ? '#0f6e56' : '#555',
        fontWeight: selected ? 500 : 400,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      {label}
    </button>
  )
}

// Chip group
export function ChipGroup({
  options,
  selected,
  onToggle,
  max,
}: {
  options: readonly string[]
  selected: string[]
  onToggle: (val: string) => void
  max?: number
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {options.map((opt) => {
        const isSel = selected.includes(opt)
        return (
          <Chip
            key={opt}
            label={opt}
            selected={isSel}
            onClick={() => {
              if (isSel) {
                onToggle(opt)
              } else if (!max || selected.length < max) {
                onToggle(opt)
              }
            }}
          />
        )
      })}
    </div>
  )
}

// Single-select chip group
export function SingleChipGroup({
  options,
  selected,
  onSelect,
}: {
  options: readonly string[]
  selected: string
  onSelect: (val: string) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 mb-2">
      {options.map((opt) => (
        <Chip key={opt} label={opt} selected={selected === opt} onClick={() => onSelect(opt)} />
      ))}
    </div>
  )
}

// Option card (for role, business type)
export function OptionCard({
  selected,
  onClick,
  disabled,
  children,
}: {
  selected: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`text-left rounded-[10px] p-3.5 transition-all select-none relative
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${!disabled && !selected ? 'hover:translate-y-[-1px] hover:shadow-sm' : ''}
      `}
      style={{
        border: selected ? '2px solid #4abd98' : '1.5px solid #e0e0e0',
        background: selected ? '#f0faf6' : 'white',
      }}
    >
      {children}
    </button>
  )
}

// Text input
export function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoFocus,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  type?: string
  autoFocus?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      className="w-full text-[15px] rounded-[10px] px-3.5 py-3 outline-none transition-all"
      style={{
        border: '1.5px solid #e0e0e0',
        color: '#111',
        fontFamily: 'DM Sans, sans-serif',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.1)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#e0e0e0'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}

// Textarea
export function TextArea({
  value,
  onChange,
  placeholder,
  rows,
}: {
  value: string
  onChange: (val: string) => void
  placeholder?: string
  rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full text-[15px] rounded-[10px] px-3.5 py-3 outline-none resize-none transition-all leading-relaxed"
      style={{
        border: '1.5px solid #e0e0e0',
        color: '#111',
        fontFamily: 'DM Sans, sans-serif',
        minHeight: '90px',
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.1)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#e0e0e0'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}

// Field label
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[13px] font-medium mb-1.5" style={{ color: '#555' }}>
      {children}
    </label>
  )
}

// Hint text
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed mt-1.5" style={{ color: '#999' }}>
      {children}
    </p>
  )
}

// Badge
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-2 right-2 text-[10px] font-semibold rounded-[20px] px-2 py-0.5" style={{ background: '#eee', color: '#999' }}>
      {children}
    </span>
  )
}
