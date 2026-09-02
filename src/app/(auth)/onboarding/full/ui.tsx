'use client'

import { type ReactNode } from 'react'

/* Shared visual grammar for the setup wizard (Apple-clean pass, 2026-08):
 * ink #1d1d1f, mute #6e6e73, hairline #e6e6ea, mint #4abd98 / deep #0f6e56,
 * wash #f0faf6. Boxes are 14px radius with constant 1.5px borders (no size
 * jump on select), inputs are 52px tall with a soft mint focus ring, and the
 * title is a display-weight line with tight tracking. */

// Question header. The default is a hero: centered, with an optional soft-mint
// glyph tile above the title. Only the FIRST question on a screen gets the
// hero + icon; follow-up questions further down a grouped screen pass `small`
// and render as a quiet left-aligned line, so each screen keeps one hero.
export function Question({ title, subtitle, icon, small }: {
  title: string
  subtitle?: string
  icon?: ReactNode
  small?: boolean
}) {
  if (small) {
    return (
      <div className="mb-2">
        <h2
          className="text-[1.05rem] font-semibold"
          style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif", color: '#1d1d1f', letterSpacing: '-0.02em', lineHeight: 1.2 }}
        >
          {title}
        </h2>
        {subtitle && (
          <p className="text-[0.95rem] leading-relaxed mt-1" style={{ color: '#48484a' }}>
            {subtitle}
          </p>
        )}
      </div>
    )
  }
  /* Hero rhythm (app-frame pass): glyph to title 14, title to sub 6, and 24
   * below the header block before the first control. */
  return (
    <div className="text-center" style={{ marginBottom: 24 }}>
      {icon && (
        <div
          aria-hidden
          className="mx-auto flex items-center justify-center"
          style={{
            width: 64, height: 64, borderRadius: 19, marginBottom: 14,
            background: 'linear-gradient(150deg, rgba(74,189,152,0.18), rgba(74,189,152,0.06))',
            boxShadow: '0 10px 30px rgba(74,189,152,0.22), inset 0 1px 0 rgba(255,255,255,0.9)',
            color: '#2e9a78',
          }}
        >
          {icon}
        </div>
      )}
      <h2
        className="text-[1.875rem] font-bold"
        style={{ fontFamily: "'Inter', -apple-system, system-ui, sans-serif", color: '#1d1d1f', letterSpacing: '-0.04em', lineHeight: 1.1 }}
      >
        {title}
      </h2>
      {subtitle && (
        <p className="text-[0.95rem] leading-relaxed" style={{ color: '#48484a', marginTop: 6 }}>
          {subtitle}
        </p>
      )}
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
      className="px-4 rounded-[22px] text-[0.95rem] select-none"
      style={{
        border: selected ? '1.5px solid #4abd98' : '1.5px solid #e6e6ea',
        background: selected ? '#f0faf6' : 'white',
        color: selected ? '#0f6e56' : '#48484a',
        fontWeight: selected ? 600 : 400,
        fontFamily: 'DM Sans, sans-serif',
        minHeight: 44,
        transition: 'all .15s ease',
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
  className = '',
}: {
  selected: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      className={`ob-card text-left rounded-[18px] p-3.5 select-none relative
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${!disabled && !selected ? 'hover:translate-y-[-1px]' : ''}
        ${className}
      `}
      style={{
        border: 'none',
        background: selected ? '#f0faf6' : 'white',
        boxShadow: selected
          ? 'inset 0 0 0 1.5px #4abd98, 0 2px 4px rgba(46,154,120,0.10), 0 12px 30px rgba(74,189,152,0.22)'
          : '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.06)',
        minHeight: 44,
        transition: 'all .18s ease',
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
      className="w-full text-[1rem] rounded-[12px] px-4 outline-none transition-all"
      style={{
        border: '1.5px solid transparent',
        color: '#1d1d1f',
        background: '#f1f1f4',
        fontFamily: 'DM Sans, sans-serif',
        height: 52,
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.15), 0 8px 20px rgba(0,0,0,0.05)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = '#f1f1f4'
        e.currentTarget.style.borderColor = 'transparent'
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
      className="w-full text-[1rem] rounded-[12px] px-4 py-3.5 outline-none resize-none transition-all leading-relaxed"
      style={{
        border: '1.5px solid transparent',
        color: '#1d1d1f',
        background: '#f1f1f4',
        fontFamily: 'DM Sans, sans-serif',
        minHeight: 96,
      }}
      onFocus={(e) => {
        e.currentTarget.style.background = '#fff'
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(74,189,152,0.15), 0 8px 20px rgba(0,0,0,0.05)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.background = '#f1f1f4'
        e.currentTarget.style.borderColor = 'transparent'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}

// Field label
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[0.9375rem] font-semibold mb-2" style={{ color: '#3a3a3c' }}>
      {children}
    </label>
  )
}

// Hint text
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-[0.875rem] leading-relaxed mt-2" style={{ color: '#6e6e73' }}>
      {children}
    </p>
  )
}

// Badge
export function Badge({ children }: { children: ReactNode }) {
  return (
    <span className="absolute top-2 right-2 text-[10px] font-semibold rounded-[20px] px-2 py-0.5" style={{ background: '#f5f5f7', color: '#98989d' }}>
      {children}
    </span>
  )
}

/* The 52px mint-gradient pill used for every primary action in setup
 * (Continue, Complete setup, Go to my dashboard). Disabled goes flat gray
 * with no shadow so a not-ready button reads as quiet, not broken. */
export function PrimaryPill({
  onClick,
  disabled,
  children,
  grow,
}: {
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  grow?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="text-[16px] font-semibold text-white select-none"
      style={{
        height: 52,
        borderRadius: 26,
        padding: '0 30px',
        width: grow ? '100%' : undefined,
        flex: grow ? 1 : undefined,
        border: 'none',
        fontFamily: 'DM Sans, sans-serif',
        letterSpacing: '-0.01em',
        cursor: disabled ? 'not-allowed' : 'pointer',
        background: disabled ? '#e5e5ea' : 'linear-gradient(135deg, #4abd98, #2e9a78)',
        color: disabled ? '#aeaeb2' : '#fff',
        boxShadow: disabled ? 'none' : '0 10px 30px rgba(74,189,152,0.38)',
        transition: 'all .15s ease',
      }}
    >
      {children}
    </button>
  )
}
