'use client'

import { type ReactNode } from 'react'

/* Colour per answer (the Create page's goal hues), so the same thing keeps the same
 * colour from setup to the shelf: a role, a business type and a goal each carry one. */
export const HUES: Record<string, [string, string]> = {
  mint: ['#4abd98', '#2e9a78'], announce: ['#f6a23a', '#ee4c2c'], event: ['#34b6ae', '#2e73b6'],
  deal: ['#c6d24f', '#5fae3e'], nights: ['#5ba8e8', '#3b6fd4'], newfaces: ['#9a5bf0', '#6a39de'],
  regulars: ['#f7c948', '#f0922f'], reviews: ['#8089ff', '#5b53d6'], online: ['#6fd06a', '#34a76a'],
  catering: ['#c85b7c', '#9c3a6a'], brand: ['#23c0b6', '#0f97a8'],
}
export const hueOf = (k?: string): [string, string] => HUES[k || 'mint'] || HUES.mint
export const gradOf = (k?: string) => { const [a, b] = hueOf(k); return `linear-gradient(135deg, ${a}, ${b})` }
/* The dashboard's display face, so setup reads like the app it opens into. */
export const DISPLAY = "'Cal Sans', 'Inter', -apple-system, system-ui, sans-serif"
export const CARD_SHADOW = '0 1px 2px rgba(0,0,0,0.04), 0 6px 20px rgba(0,0,0,0.05)'

/* A gradient icon tile in the answer's colour, white glyph on top. */
export function IconTile({ hue, size = 44, radius = 14, children }: { hue?: string; size?: number; radius?: number; children: ReactNode }) {
  const [, deep] = hueOf(hue)
  return (
    <div aria-hidden className="flex items-center justify-center flex-shrink-0" style={{ width: size, height: size, borderRadius: radius, background: gradOf(hue), color: '#fff', boxShadow: `0 6px 14px ${deep}55` }}>
      {children}
    </div>
  )
}

/* The round check that marks a picked card. */
export function CheckDot({ on, hue }: { on: boolean; hue?: string }) {
  const [, deep] = hueOf(hue)
  return (
    <span aria-hidden className="flex items-center justify-center flex-shrink-0" style={{ width: 24, height: 24, borderRadius: 12, border: on ? 'none' : '1.5px solid #e3e6e4', background: on ? deep : 'transparent', transition: 'all .15s ease' }}>
      {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 13l4 4L19 7" /></svg>}
    </span>
  )
}

/* Shared visual grammar for the setup wizard (Apple-clean pass, 2026-08):
 * ink #1d1d1f, mute #6e6e73, hairline #e6e6ea, mint #4abd98 / deep #0f6e56,
 * wash #f0faf6. Boxes are 14px radius with constant 1.5px borders (no size
 * jump on select), inputs are 52px tall with a soft mint focus ring, and the
 * title is a display-weight line with tight tracking. */

// Question header. The default is a hero: centered, with an optional soft-mint
// glyph tile above the title. Only the FIRST question on a screen gets the
// hero + icon; follow-up questions further down a grouped screen pass `small`
// and render as a quiet left-aligned line, so each screen keeps one hero.
export function Question({ title, subtitle, icon, small, hue }: {
  title: string
  subtitle?: string
  icon?: ReactNode
  small?: boolean
  /** The screen's colour: the glyph tile takes its gradient. Mint when unset. */
  hue?: string
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
            width: 64, height: 64, borderRadius: 20, marginBottom: 14,
            background: gradOf(hue),
            boxShadow: `0 12px 30px ${hueOf(hue)[1]}59`,
            color: '#fff',
          }}
        >
          {icon}
        </div>
      )}
      <h2
        className="text-[27px] font-semibold"
        style={{ fontFamily: DISPLAY, color: '#1d1d1f', letterSpacing: '-0.01em', lineHeight: 1.12, textWrap: 'balance' }}
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
  hue,
}: {
  label: string
  selected: boolean
  onClick: () => void
  /** Optional colour: a dot in the chip, and the chip tints to it when picked. */
  hue?: string
}) {
  const [light, deep] = hueOf(hue)
  const tinted = !!hue
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-4 rounded-[22px] text-[0.95rem] select-none inline-flex items-center gap-2"
      style={{
        border: selected ? `1.5px solid ${tinted ? light : '#4abd98'}` : '1.5px solid #e6e6ea',
        background: selected ? (tinted ? `${light}26` : '#f0faf6') : 'white',
        color: selected ? (tinted ? deep : '#0f6e56') : '#48484a',
        fontWeight: selected ? 600 : 400,
        fontFamily: 'DM Sans, sans-serif',
        minHeight: 44,
        transition: 'all .15s ease',
      }}
    >
      {tinted && <span aria-hidden style={{ width: 8, height: 8, borderRadius: 4, background: gradOf(hue), flexShrink: 0 }} />}
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
  hue,
}: {
  selected: boolean
  onClick: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
  /** Optional colour: the picked ring takes it instead of mint. */
  hue?: string
}) {
  const ring = hue ? hueOf(hue)[1] : '#4abd98'
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
        background: selected && !hue ? '#f0faf6' : 'white',
        boxShadow: selected
          ? `inset 0 0 0 2px ${ring}, 0 12px 30px ${ring}38`
          : CARD_SHADOW,
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
        fontFamily: DISPLAY,
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
