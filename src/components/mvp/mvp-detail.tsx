'use client'

/**
 * Shared apnosh-mvp detail-page kit. A small set of presentational components
 * every "Your business" (and future) detail page composes, so the whole hub
 * feels like one product. Pure inline styles + the C token map (matches
 * mvp-more.tsx / mvp-home.tsx); the `.mvp-row` press style lives in MvpShell.
 *
 * - MvpDetailHeader: back chevron + title, sits in MvpShell's header slot.
 * - MvpGroup + MvpRow: the iOS-Settings grouped card and its rows.
 *
 * Icons are passed as already-rendered nodes (e.g. icon={<Clock size={18} />})
 * so this works from server components too — lucide icons inherit the green
 * tile color via currentColor.
 */

import React from 'react'
import Link from 'next/link'
import { ArrowLeft, ChevronRight, Loader2 } from 'lucide-react'

export const C = {
  green: '#4abd98', greenDk: '#2e9a78', greenSoft: '#eaf7f3',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2',
  line: '#e6e6ea', coral: '#c0564f', coralSoft: '#fdeeee', bg: '#f5f5f7',
}
export const DISPLAY = "'Cal Sans','Inter',sans-serif"

// Amber accent for "warning"/"due"/"pending" states (kept out of C so the core
// token map stays the brand greens + coral). Soft bg + dark text for pills.
export const AMBER = '#bd7e16'
export const AMBER_DK = '#8a5a0c'
export const AMBER_SOFT = '#fbf0da'

export function MvpDetailHeader({ title, subtitle, backHref = '/dashboard/more', backLabel = 'More' }: { title: string; subtitle?: string; backHref?: string; backLabel?: string }) {
  return (
    <div style={{ flexShrink: 0, background: '#fff', borderBottom: `0.5px solid ${C.line}`, padding: '10px 14px 13px' }}>
      <Link href={backHref} className="mvp-row" style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: C.greenDk, textDecoration: 'none', fontSize: 14.5, fontWeight: 600, marginBottom: 6, marginLeft: -4, padding: '2px 4px', borderRadius: 8 }}>
        <ArrowLeft size={18} /> {backLabel}
      </Link>
      <div style={{ fontSize: 24, fontWeight: 600, color: C.ink, fontFamily: DISPLAY, lineHeight: 1.15 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 12.5, color: C.mute, marginTop: 3 }}>{subtitle}</div>}
    </div>
  )
}

export function MvpGroup({ title, children }: { title?: string; children: React.ReactNode }) {
  const items = React.Children.toArray(children)
  return (
    <div style={{ marginBottom: 22 }}>
      {title && <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '.06em', textTransform: 'uppercase', color: C.faint, padding: '0 6px 7px' }}>{title}</div>}
      <div style={{ background: '#fff', border: `0.5px solid ${C.line}`, borderRadius: 16, overflow: 'hidden' }}>
        {items.map((child, i) => (
          <React.Fragment key={i}>
            {i > 0 && <div style={{ height: '0.5px', background: C.line, marginLeft: 61 }} />}
            {child}
          </React.Fragment>
        ))}
      </div>
    </div>
  )
}

export function MvpRow({ icon, label, sub, href, onClick, right, danger }: { icon?: React.ReactNode; label: string; sub?: string; href?: string; onClick?: () => void; right?: React.ReactNode; danger?: boolean }) {
  const inner = (
    <>
      {icon && <span style={{ width: 34, height: 34, borderRadius: 9, background: danger ? C.coralSoft : C.greenSoft, color: danger ? C.coral : C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</span>}
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: danger ? C.coral : C.ink, lineHeight: 1.25 }}>{label}</span>
        {sub && <span style={{ display: 'block', fontSize: 12.5, color: C.mute, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{sub}</span>}
      </span>
      {right}
      {(href || onClick) && <ChevronRight size={18} color={C.faint} style={{ flexShrink: 0 }} />}
    </>
  )
  const base: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', textDecoration: 'none', color: 'inherit', width: '100%' }
  if (href) return <Link href={href} className="mvp-row" style={base}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} className="mvp-row" style={{ ...base, background: 'none', border: 'none', textAlign: 'left', font: 'inherit', cursor: 'pointer' }}>{inner}</button>
  return <div style={base}>{inner}</div>
}

// Sticky bottom save bar — pins above the bottom nav inside the shell's scroll
// frame. `hint` shows a small line above the button (e.g. "Saved", or a nudge).
export function MvpSaveBar({ onClick, label = 'Save', disabled, saving, hint }: { onClick: () => void; label?: string; disabled?: boolean; saving?: boolean; hint?: string }) {
  const off = disabled || saving
  return (
    <div style={{ position: 'sticky', bottom: 0, background: '#fff', borderTop: `0.5px solid ${C.line}`, padding: '10px 14px calc(12px + env(safe-area-inset-bottom))' }}>
      {hint && <div style={{ fontSize: 12, color: C.mute, textAlign: 'center', marginBottom: 8 }}>{hint}</div>}
      <button type="button" onClick={onClick} disabled={off} style={{ width: '100%', height: 48, borderRadius: 14, border: 'none', background: off ? '#bfe7da' : C.green, color: '#fff', fontSize: 16, fontWeight: 700, fontFamily: 'inherit', cursor: off ? 'default' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
        {saving && <Loader2 size={18} className="mvp-spin" />}{label}
      </button>
    </div>
  )
}

// iOS-style toggle, green when on. The canonical kit copy — editor-shell.tsx
// re-exports this so business-info editors and the new account screens share it.
export function MvpToggle({ on, onClick, label }: { on: boolean; onClick: () => void; label?: string }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} style={{ position: 'relative', width: 46, height: 28, borderRadius: 99, border: 'none', background: on ? C.green : '#d6d6db', flexShrink: 0, cursor: 'pointer', transition: 'background .15s', padding: 0 }}>
      <span style={{ position: 'absolute', top: 2, left: 2, width: 24, height: 24, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)', transition: 'transform .15s', transform: on ? 'translateX(18px)' : 'translateX(0)' }} />
    </button>
  )
}

// Small status chip (billing/agreement/subscription statuses). One pill across
// every account surface instead of per-page statusConfig maps.
export type PillTone = 'good' | 'warn' | 'bad' | 'neutral'
export function MvpPill({ tone = 'neutral', label, dot }: { tone?: PillTone; label: string; dot?: boolean }) {
  const map: Record<PillTone, { bg: string; fg: string }> = {
    good: { bg: C.greenSoft, fg: C.greenDk },
    warn: { bg: AMBER_SOFT, fg: AMBER_DK },
    bad: { bg: C.coralSoft, fg: C.coral },
    neutral: { bg: '#eef0ef', fg: C.mute },
  }
  const t = map[tone]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: t.bg, color: t.fg, borderRadius: 99, padding: '2px 8px', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap' }}>
      {dot && <span style={{ width: 6, height: 6, borderRadius: 99, background: t.fg, display: 'inline-block' }} />}
      {label}
    </span>
  )
}
