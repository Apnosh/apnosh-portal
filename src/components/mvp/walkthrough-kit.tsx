'use client'

/**
 * THE WALKTHROUGH KIT — one look for every owner-run setup lane.
 *
 * Three cards now put the owner through the same shape: read what is true, decide one thing
 * per screen, preview the change, apply it, prove it took. Google profile, order buttons,
 * review replies. Before this file the order-buttons screen carried its own private copies of
 * the panel, rail, headings, chips and buttons, so the second card would have started by
 * duplicating four hundred lines and the third would have made three versions of "the look"
 * that drift apart the first time anyone adjusts a radius.
 *
 * What belongs here: anything that would look wrong if two lanes disagreed about it.
 * What does NOT: the lane's actual content and logic. A shared kit that starts deciding what
 * a screen SAYS becomes a framework nobody can change, which is worse than duplication.
 */

import React from 'react'
import { ArrowLeft, Check, Loader2, Sparkles } from 'lucide-react'

/** The palette. Lifted verbatim from order-buttons so nothing shifts visually. */
export const C = {
  green: '#4abd98', greenDk: '#2f8f70', greenSoft: '#eef8f4',
  ink: '#1d1d1f', mute: '#6e6e73', faint: '#aeaeb2',
  line: '#e6e6ea', bg: '#f5f5f7',
  red: '#c0564f', redSoft: '#fdeeee', amber: '#e0a13a', amberSoft: '#fdf6e9',
}

export function Panel({ children }: { children: React.ReactNode }) {
  return <div style={{ padding: '4px 16px 40px', maxWidth: 620, margin: '0 auto', fontFamily: 'Inter, sans-serif' }}>{children}</div>
}

/** Where you are, and how much is left. The wall version had no sense of progress at all. */
export function Progress({ steps, step }: { steps: readonly string[]; step: number }) {
  return (
    <div style={{ display: 'flex', gap: 5, margin: '4px 0 16px' }}>
      {steps.map((s, i) => (
        <div key={s} style={{ flex: 1 }}>
          <div style={{ height: 3, borderRadius: 2, background: i <= step ? C.green : C.line }} />
          <div style={{ fontSize: 10.5, fontWeight: 600, color: i === step ? C.greenDk : C.faint, marginTop: 4 }}>{s}</div>
        </div>
      ))}
    </div>
  )
}

export function H({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 17.5, fontWeight: 650, color: C.ink, lineHeight: 1.35, marginBottom: 10 }}>{children}</div>
}

export function Fine({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.5, marginBottom: 8, ...style }}>{children}</div>
}

/** `generic` when the words came from our own deterministic read rather than the model.
 *  Claiming AI wrote something it did not is the one lie this surface must never tell. */
export function SaysLabel({ generic }: { generic?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.greenDk, marginBottom: 7 }}>
      <Sparkles size={12} /> {generic ? 'Your options' : 'Apnosh AI says'}
    </div>
  )
}

export function Says({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ background: C.greenSoft, borderRadius: 13, padding: '11px 13px', marginBottom: 14 }}>
      <SaysLabel />
      <div style={{ fontSize: 13.5, color: C.ink, lineHeight: 1.5 }}>{children}</div>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: C.faint, marginBottom: 7 }}>{title}</div>
      {children}
    </div>
  )
}

export function Row({ label, value, tone, hint }: { label: string; value: string; tone: 'ok' | 'warn' | 'empty'; hint?: string }) {
  const dot = tone === 'warn' ? C.amber : tone === 'empty' ? C.faint : C.green
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderBottom: `1px solid ${C.line}` }}>
      <span style={{ width: 7, height: 7, borderRadius: 99, background: dot, flexShrink: 0 }} />
      <span style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, minWidth: 92 }}>{label}</span>
      <span style={{ fontSize: 13, color: tone === 'empty' ? C.faint : C.mute, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}{hint ? ` · ${hint}` : ''}
      </span>
    </div>
  )
}

export function Field({ label, help, value, onChange, found }: { label: string; help?: string; value: string; onChange: (v: string) => void; found: string | null }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 650, color: C.ink, marginBottom: help ? 3 : 6 }}>{label}</label>
      {help && <div style={{ fontSize: 12.5, color: C.mute, lineHeight: 1.45, marginBottom: 6 }}>{help}</div>}
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder="https://"
        style={{ width: '100%', boxSizing: 'border-box', borderRadius: 11, border: `1px solid ${C.line}`, padding: '11px 12px', fontSize: 14, color: C.ink, font: 'inherit' }} />
      {found && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: C.greenDk, marginTop: 5 }}>
          <Check size={11} /> {found}
        </div>
      )}
    </div>
  )
}

export function Chip({ children, tone }: { children: React.ReactNode; tone?: 'ink' }) {
  return (
    <span style={{ display: 'inline-block', borderRadius: 8, padding: '3px 8px', fontSize: 11.5, lineHeight: 1.4, fontWeight: 600,
      background: tone === 'ink' ? '#f2f2f4' : C.greenSoft, color: tone === 'ink' ? C.ink : C.greenDk }}>{children}</span>
  )
}

export function Note({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.amberSoft, borderRadius: 12, padding: '11px 13px', fontSize: 13, color: C.ink, lineHeight: 1.5, marginBottom: 14 }}>{children}</div>
}

export function Bad({ children }: { children: React.ReactNode }) {
  return <div style={{ background: C.redSoft, borderRadius: 12, padding: '11px 13px', fontSize: 13, color: C.red, lineHeight: 1.5, margin: '12px 0' }}>{children}</div>
}

export function Loading({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: C.mute, fontSize: 13.5, margin: '12px 0' }}><Loader2 size={14} className="mvp-spin" /> {children}</div>
}

export function Next({ children, onClick, disabled }: { children: React.ReactNode; onClick: () => void; disabled?: boolean }) {
  const on = !disabled
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, border: 'none', borderRadius: 12,
      padding: '13px 16px', fontSize: 14.5, fontWeight: 650, font: 'inherit', marginTop: 4,
      background: on ? C.green : C.line, color: on ? '#fff' : C.faint, cursor: on ? 'pointer' : 'default',
    }}>{children}</button>
  )
}

export function Nav({ onBack, children }: { onBack: () => void; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
      <button type="button" onClick={onBack} style={{ display: 'flex', alignItems: 'center', gap: 5, border: `1px solid ${C.line}`, background: '#fff', borderRadius: 12, padding: '13px 15px', fontSize: 13.5, color: C.mute, cursor: 'pointer', font: 'inherit', marginTop: 4 }}>
        <ArrowLeft size={14} /> Back
      </button>
      {children}
    </div>
  )
}

/**
 * An action the owner can take, with the move as the headline and the reasoning behind a tap.
 *
 * This shape came out of the order-buttons rebuild: the first version led with a label and
 * three sentences of context and buried the actual move in a chip at the bottom. An owner
 * reading mid-service takes the first line and acts. The explanation still matters to the one
 * in ten who wants it, so it stays, one tap away.
 */
export function ActionCard({ action, cost, why }: { action: string; cost: string; why?: string }) {
  const [open, setOpen] = React.useState(false)
  return (
    <div style={{ background: '#fff', borderRadius: 11, padding: '11px 12px', marginBottom: 7 }}>
      <div style={{ fontSize: 14, fontWeight: 650, color: C.ink, lineHeight: 1.4 }}>{action}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 7 }}>
        <Chip>{cost}</Chip>
        {why && (
          <button type="button" onClick={() => setOpen(!open)}
            style={{ background: 'none', border: 0, padding: 0, fontSize: 12.5, color: C.mute, fontWeight: 600, cursor: 'pointer' }}>
            {open ? 'Hide why' : 'Why'}
          </button>
        )}
      </div>
      {open && why && <div style={{ fontSize: 13, color: C.mute, lineHeight: 1.5, marginTop: 8 }}>{why}</div>}
    </div>
  )
}

/** A link as a person reads one: the site, not the tracking soup. */
export function pretty(uri: string | null): string {
  if (!uri) return 'nothing set'
  try {
    const u = new URL(uri)
    const path = u.pathname === '/' ? '' : u.pathname
    return u.hostname.replace(/^www\./, '') + (path.length > 20 ? path.slice(0, 20) + '…' : path)
  } catch { return uri }
}
