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
