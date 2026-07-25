'use client'

/**
 * PROTOTYPE KIT — tokens, primitives and the goods artwork.
 *
 * The artwork is the load-bearing part. A shop shows goods, so a poster has to look like a
 * poster and six posts have to look like six squares. The moment these become generic icons
 * the whole screen collapses back into a list of service names, which is the thing we are
 * trying to get away from.
 *
 * Self-contained on purpose: no portal imports, so this can be deleted or promoted whole.
 */

import React from 'react'
import type { ArtKind } from './data'

/* ─────────────────────────────────────────────────────────────────────────── */

export interface Tokens {
  ink: string; ink2: string; ink3: string; faint: string
  paper: string; card: string; line: string; line2: string
  green: string; greenDk: string; greenWash: string
  gold: string; goldWash: string
  rust: string; rustWash: string
  sky: string
  shadow: string; shadowS: string
}

const light: Tokens = {
  ink: '#17201c', ink2: '#43514a', ink3: '#718077', faint: '#a2b0a7',
  paper: '#f6f8f6', card: '#ffffff', line: '#e3e9e5', line2: '#eff3f0',
  green: '#2e9a78', greenDk: '#227559', greenWash: '#e9f6f1',
  gold: '#9c6c1c', goldWash: '#fdf5e6',
  rust: '#a8503a', rustWash: '#fbefeb',
  sky: '#3f6f9a',
  shadow: '0 2px 4px rgba(23,32,28,.04), 0 12px 30px rgba(23,32,28,.09)',
  shadowS: '0 1px 2px rgba(23,32,28,.06)',
}

const dark: Tokens = {
  ink: '#eef3f0', ink2: '#c3cec8', ink3: '#8e9c95', faint: '#66746c',
  paper: '#0f1512', card: '#18211d', line: '#293430', line2: '#212b27',
  green: '#54c79f', greenDk: '#6fd5b3', greenWash: '#16302a',
  gold: '#d8a755', goldWash: '#2b2214',
  rust: '#e0917a', rustWash: '#2d1a15',
  sky: '#7aa8cf',
  shadow: '0 2px 4px rgba(0,0,0,.3), 0 12px 30px rgba(0,0,0,.42)',
  shadowS: '0 1px 2px rgba(0,0,0,.4)',
}

export const TOKENS = { light, dark }
export type Mode = 'light' | 'dark'

/* ─────────────────────────────────────────────────────────────────────────── */

export const FONT = "ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"

export function money(n: number): string {
  return '$' + n.toLocaleString()
}

/** Initials that read right: "Sam Rivera" → SR, "Our team" → OT, "Apnosh AI" → AI. */
export function initials(name: string): string {
  const w = name.replace('Apnosh ', '').split(/\s+/).filter(Boolean)
  return (w.length > 1 ? w[0][0] + w[1][0] : (w[0] ?? '?').slice(0, 2)).toUpperCase()
}

/* ── primitives ──────────────────────────────────────────────────────────── */

export function Btn({
  children, onClick, tone = 'solid', size = 'md', disabled, C, full,
}: {
  children: React.ReactNode; onClick?: () => void
  tone?: 'solid' | 'quiet' | 'ghost'; size?: 'sm' | 'md'
  disabled?: boolean; C: Tokens; full?: boolean
}) {
  const pad = size === 'sm' ? '8px 13px' : '13px 20px'
  const fs = size === 'sm' ? 12.5 : 14.5
  const base: React.CSSProperties = {
    padding: pad, fontSize: fs, fontWeight: 720, fontFamily: 'inherit',
    borderRadius: 12, cursor: disabled ? 'not-allowed' : 'pointer',
    width: full ? '100%' : undefined, textAlign: 'center',
    transition: 'opacity .15s, background .15s', lineHeight: 1.25,
  }
  const skin: React.CSSProperties =
    disabled ? { background: C.line, color: C.faint, border: 'none' }
    : tone === 'solid' ? { background: C.green, color: '#fff', border: 'none' }
    : tone === 'quiet' ? { background: C.card, color: C.ink, border: `1px solid ${C.line}` }
    : { background: 'transparent', color: C.ink3, border: 'none' }
  return (
    <button type="button" onClick={disabled ? undefined : onClick} disabled={disabled}
      style={{ ...base, ...skin }}>{children}</button>
  )
}

export function Label({ children, C }: { children: React.ReactNode; C: Tokens }) {
  return (
    <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.11em', textTransform: 'uppercase',
      color: C.faint }}>{children}</div>
  )
}

/**
 * A clickable card cannot be a <button>: some of these wrap a range input, and a button may
 * not contain interactive descendants. So it stays a div and picks up the button role,
 * focusability and Enter/Space handling by hand — otherwise the whole shelf is unreachable
 * from a keyboard, which is exactly what the first browser pass found.
 */
export function Card({ children, C, style, onClick, live, label }: {
  children: React.ReactNode; C: Tokens; style?: React.CSSProperties
  onClick?: () => void; live?: boolean; label?: string
}) {
  const act = onClick
    ? {
        role: 'button', tabIndex: 0, 'aria-label': label, 'aria-pressed': live,
        onClick,
        onKeyDown: (e: React.KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() }
        },
      }
    : {}
  return (
    <div {...act} style={{
      background: C.card, border: `1px solid ${live ? C.green : C.line}`, borderRadius: 16,
      cursor: onClick ? 'pointer' : undefined, ...style,
    }}>{children}</div>
  )
}

/** A person or lane chip. `you` and `ai` get their own colour so the eye sorts them fast. */
export function Avatar({ name, kind, C, size = 22 }: {
  name: string; kind: 'person' | 'ai' | 'you' | 'team'; C: Tokens; size?: number
}) {
  const skin =
    kind === 'you' ? { bg: C.greenWash, fg: C.greenDk }
    : kind === 'ai' ? { bg: C.goldWash, fg: C.gold }
    : kind === 'team' ? { bg: C.line2, fg: C.ink2 }
    : { bg: C.greenWash, fg: C.greenDk }
  return (
    <span style={{
      width: size, height: size, borderRadius: 99, flexShrink: 0, background: skin.bg, color: skin.fg,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: size * 0.38, fontWeight: 820, letterSpacing: '.02em',
    }}>{kind === 'you' ? 'YOU' : initials(name)}</span>
  )
}

/* ── the goods, drawn ─────────────────────────────────────────────────────── */

/**
 * Each good rendered as the thing it is. Two hues come in per creator so the same poster
 * looks different depending on who is making it — the bench is visible in the artwork,
 * not just in a name underneath.
 */
export function Art({ kind, C, hue }: { kind: ArtKind; C: Tokens; hue?: [string, string] }) {
  const a = hue?.[0] ?? C.green
  const b = hue?.[1] ?? C.greenDk
  const bg = C.line2
  const wire = C.line

  const S = (w: number, h: number, kids: React.ReactNode) => (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block' }}>{kids}</svg>
  )

  switch (kind) {
    case 'photos': return S(134, 84, <>
      <rect x="1" y="1" width="42" height="40" rx="4" fill={b} opacity=".9" />
      <rect x="46" y="1" width="42" height="40" rx="4" fill={a} opacity=".8" />
      <rect x="91" y="1" width="42" height="40" rx="4" fill={b} opacity=".45" />
      <rect x="1" y="44" width="42" height="39" rx="4" fill={a} opacity=".55" />
      <rect x="46" y="44" width="42" height="39" rx="4" fill={b} opacity=".7" />
      <rect x="91" y="44" width="42" height="39" rx="4" fill={a} opacity=".35" />
      <circle cx="105" cy="14" r="5" fill="#fff" opacity=".55" />
    </>)
    case 'poster': return S(60, 84, <>
      <rect x="1" y="1" width="58" height="82" rx="5" fill={a} />
      <rect x="9" y="9" width="42" height="27" rx="3" fill={b} opacity=".85" />
      <rect x="9" y="44" width="42" height="7" rx="3.5" fill="#fff" opacity=".93" />
      <rect x="9" y="56" width="29" height="5" rx="2.5" fill="#fff" opacity=".55" />
      <rect x="9" y="69" width="21" height="7" rx="3.5" fill={b} />
    </>)
    case 'event': return S(130, 84, <>
      <rect x="1" y="1" width="128" height="82" rx="6" fill={C.card} stroke={wire} />
      <rect x="1" y="1" width="128" height="33" rx="6" fill={a} />
      <rect x="10" y="42" width="62" height="6" rx="3" fill={C.ink} opacity=".7" />
      <rect x="10" y="53" width="40" height="5" rx="2.5" fill={C.ink} opacity=".28" />
      <rect x="10" y="65" width="38" height="12" rx="6" fill={b} />
      <rect x="54" y="65" width="30" height="12" rx="6" fill={wire} />
    </>)
    case 'posts': return S(134, 84, <>
      <rect x="2" y="10" width="39" height="39" rx="5" fill={a} opacity=".85" />
      <rect x="2" y="53" width="24" height="4" rx="2" fill={wire} />
      <rect x="2" y="61" width="16" height="4" rx="2" fill={wire} />
      <rect x="48" y="10" width="39" height="39" rx="5" fill={b} opacity=".7" />
      <rect x="48" y="53" width="30" height="4" rx="2" fill={wire} />
      <rect x="48" y="61" width="20" height="4" rx="2" fill={wire} />
      <rect x="94" y="10" width="39" height="39" rx="5" fill={a} opacity=".45" />
      <rect x="94" y="53" width="22" height="4" rx="2" fill={wire} />
      <rect x="94" y="61" width="28" height="4" rx="2" fill={wire} />
    </>)
    case 'google': return S(132, 84, <>
      <rect x="1" y="1" width="130" height="82" rx="6" fill={C.card} stroke={wire} />
      <circle cx="17" cy="18" r="7.5" fill={b} />
      <rect x="31" y="12" width="52" height="5" rx="2.5" fill={C.ink} opacity=".65" />
      <rect x="31" y="21" width="34" height="4" rx="2" fill={wire} />
      <rect x="10" y="37" width="112" height="4" rx="2" fill={wire} />
      <rect x="10" y="46" width="92" height="4" rx="2" fill={wire} />
      <rect x="10" y="60" width="48" height="13" rx="6.5" fill={a} />
    </>)
    case 'reel': return S(54, 84, <>
      <rect x="1" y="1" width="52" height="82" rx="8" fill={a} />
      <path d="M22 32 l15 10 -15 10 z" fill="#fff" opacity=".95" />
      <rect x="8" y="70" width="38" height="3" rx="1.5" fill="#fff" opacity=".28" />
      <rect x="8" y="70" width="15" height="3" rx="1.5" fill="#fff" opacity=".9" />
    </>)
    case 'text': return S(128, 84, <>
      <rect x="4" y="9" width="80" height="27" rx="13" fill={wire} />
      <rect x="14" y="18" width="46" height="4" rx="2" fill={C.ink} opacity=".35" />
      <rect x="14" y="26" width="30" height="4" rx="2" fill={C.ink} opacity=".2" />
      <rect x="44" y="45" width="80" height="30" rx="13" fill={a} />
      <rect x="54" y="54" width="52" height="4" rx="2" fill="#fff" opacity=".92" />
      <rect x="54" y="63" width="36" height="4" rx="2" fill="#fff" opacity=".55" />
    </>)
    case 'email': return S(120, 84, <>
      <rect x="6" y="14" width="108" height="60" rx="7" fill={C.card} stroke={wire} strokeWidth="1.5" />
      <path d="M6 22 L60 52 L114 22" stroke={a} strokeWidth="2.5" fill="none" strokeLinejoin="round" />
      <rect x="18" y="60" width="44" height="4" rx="2" fill={wire} />
    </>)
    case 'clock': return S(112, 84, <>
      <circle cx="56" cy="42" r="30" fill={C.card} stroke={wire} strokeWidth="2" />
      <circle cx="56" cy="42" r="30" fill="none" stroke={a} strokeWidth="3"
        strokeDasharray="47 141" strokeLinecap="round" transform="rotate(-90 56 42)" />
      <path d="M56 26 v17 l11 7" stroke={C.ink} strokeWidth="3" fill="none" strokeLinecap="round" />
      <circle cx="82" cy="18" r="8" fill={b} />
    </>)
    case 'listing': return S(132, 84, <>
      {[0, 1, 2].map((i) => (
        <g key={i}>
          <rect x="1" y={1 + i * 28} width="130" height="26" rx="5" fill={C.card} stroke={wire} />
          <circle cx="16" cy={14 + i * 28} r="6" fill={i === 0 ? a : b} opacity={1 - i * 0.28} />
          <rect x="28" y={10 + i * 28} width="52" height="4" rx="2" fill={C.ink} opacity=".5" />
          <rect x="28" y={18 + i * 28} width="34" height="3.5" rx="1.75" fill={wire} />
          <path d={`M118 ${11 + i * 28} l3.4 3.4 l6 -6.4`} stroke={a} strokeWidth="2.4"
            fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      ))}
    </>)
    case 'stars': return S(126, 84, <>
      <rect x="1" y="1" width="124" height="82" rx="6" fill={C.card} stroke={wire} />
      {[0, 1, 2, 3, 4].map((i) => (
        <path key={i} d={`M${16 + i * 20} 18 l3 6.4 7 1 -5 4.9 1.2 7-6.2-3.3-6.2 3.3 1.2-7-5-4.9 7-1z`}
          fill={i < 4 ? b : wire} />
      ))}
      <rect x="12" y="43" width="100" height="4" rx="2" fill={wire} />
      <rect x="12" y="52" width="76" height="4" rx="2" fill={wire} />
      <rect x="12" y="65" width="58" height="11" rx="5.5" fill={a} opacity=".9" />
    </>)
    case 'menu': return S(64, 84, <>
      <rect x="1" y="1" width="62" height="82" rx="5" fill={C.card} stroke={wire} strokeWidth="1.5" />
      <rect x="9" y="9" width="46" height="16" rx="3" fill={a} opacity=".85" />
      {[0, 1, 2, 3].map((i) => (
        <g key={i}>
          <rect x="9" y={32 + i * 12} width="30" height="4" rx="2" fill={C.ink} opacity=".42" />
          <rect x="45" y={32 + i * 12} width="10" height="4" rx="2" fill={b} opacity=".8" />
        </g>
      ))}
    </>)
    default: return S(100, 84, <rect x="1" y="1" width="98" height="82" rx="6" fill={bg} />)
  }
}
