'use client'

import { type ReactNode } from 'react'

/* Shared visual grammar for the setup wizard (Apple-clean pass, 2026-08):
 * ink #1d1d1f, mute #6e6e73, hairline #e6e6ea, mint #4abd98 / deep #0f6e56,
 * wash #f0faf6. Boxes are 14px radius with constant 1.5px borders (no size
 * jump on select), inputs are 52px tall with a soft mint focus ring, and the
 * title is a display-weight line with tight tracking. */

// Question header
export function Question({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <div className="mb-2">
      <h2
        className="text-[23px] font-bold mb-1.5"
        style={{ fontFamily: 'Playfair Display, serif', color: '#1d1d1f', letterSpacing: '-0.02em', lineHeight: 1.15 }}
      >
        {title}
      </h2>
      <p className="text-[13.5px] leading-relaxed" style={{ color: '#6e6e73' }}>
        {subtitle}
      </p>
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
      className="px-4 rounded-[20px] text-[13px] select-none"
      style={{
        border: selected ? '1.5px solid #4abd98' : '1.5px solid #e6e6ea',
        background: selected ? '#f0faf6' : 'white',
        color: selected ? '#0f6e56' : '#48484a',
        fontWeight: selected ? 600 : 400,
        fontFamily: 'DM Sans, sans-serif',
        minHeight: 40,
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
      className={`text-left rounded-[14px] p-3.5 select-none relative
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${!disabled && !selected ? 'hover:translate-y-[-1px] hover:shadow-sm' : ''}
      `}
      style={{
        border: selected ? '1.5px solid #4abd98' : '1.5px solid #e6e6ea',
        background: selected ? '#f0faf6' : 'white',
        minHeight: 44,
        transition: 'all .15s ease',
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
      className="w-full text-[15px] rounded-[12px] px-4 outline-none transition-all"
      style={{
        border: '1.5px solid #e6e6ea',
        color: '#1d1d1f',
        background: '#fff',
        fontFamily: 'DM Sans, sans-serif',
        height: 52,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(74,189,152,0.18)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#e6e6ea'
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
      className="w-full text-[15px] rounded-[12px] px-4 py-3.5 outline-none resize-none transition-all leading-relaxed"
      style={{
        border: '1.5px solid #e6e6ea',
        color: '#1d1d1f',
        background: '#fff',
        fontFamily: 'DM Sans, sans-serif',
        minHeight: 96,
      }}
      onFocus={(e) => {
        e.currentTarget.style.borderColor = '#4abd98'
        e.currentTarget.style.boxShadow = '0 0 0 2px rgba(74,189,152,0.18)'
      }}
      onBlur={(e) => {
        e.currentTarget.style.borderColor = '#e6e6ea'
        e.currentTarget.style.boxShadow = 'none'
      }}
    />
  )
}

// Field label
export function FieldLabel({ children }: { children: ReactNode }) {
  return (
    <label className="block text-[13px] font-medium mb-2" style={{ color: '#6e6e73' }}>
      {children}
    </label>
  )
}

// Hint text
export function Hint({ children }: { children: ReactNode }) {
  return (
    <p className="text-xs leading-relaxed mt-2" style={{ color: '#98989d' }}>
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
        boxShadow: disabled ? 'none' : '0 8px 22px rgba(74,189,152,0.32)',
        transition: 'all .15s ease',
      }}
    >
      {children}
    </button>
  )
}

/* Bring the shared Back/Continue bar into view the moment a step becomes
 * answerable, so an owner never has to hunt for the button. The nav bar in
 * step-renderer.tsx carries data-onboarding-nav. Steps call this right after
 * the answer that completes them; the frame delay lets the render that
 * enabled the button paint first. */
export function scrollNavIntoView() {
  if (typeof document === 'undefined') return
  requestAnimationFrame(() => {
    document
      .querySelector('[data-onboarding-nav]')
      ?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  })
}
