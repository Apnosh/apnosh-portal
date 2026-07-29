'use client'

/**
 * THE STRATEGIST'S DESK — the shared kit for the campaign builder's visual language.
 *
 * One idea carries every screen: the flow is a plan being drawn up in front of the owner, then
 * sealed. Restaurants run on tickets, receipts, and stamps, so that is the language — answers
 * ink onto a growing plan sheet, the thinking screen prints real signals like a kitchen ticket,
 * the order is a true receipt, approval is a seal. Mint is the ONLY accent; amber exists solely
 * for the one honest moment we say no.
 *
 * Owner-approved pitch, 2026-07-28. Pure presentation: no logic, no fetches, no money math —
 * every component renders exactly what it is handed.
 */
import { useRef, useState, type CSSProperties, type ReactNode } from 'react'

/* ── the palette ─────────────────────────────────────────────────────────────────────────── */
export const DESK = {
  paper: '#F7F5F0',
  card: '#FFFFFF',
  ink: '#16211C',
  ink2: '#4A554F',
  mute: '#8A948D',
  mint: '#4ABD98',
  mintDeep: '#2E9A78',
  mintWash: '#EAF6F1',
  mintLine: 'rgba(74,189,152,0.35)',
  amber: '#B7791F',
  amberWash: '#FBF3E4',
  amberLine: 'rgba(183,121,31,0.25)',
  line: '#E4E0D6',
  grad: 'linear-gradient(135deg,#4ABD98,#2E9A78)',
  disp: "'Cal Sans','Inter',system-ui,sans-serif",
  body: "'Inter',system-ui,sans-serif",
  mono: "'SF Mono',ui-monospace,Menlo,monospace",
} as const

/** The desk ground: warm paper with the faint dot grid. Spread onto a screen's root style. */
export const paperGround: CSSProperties = {
  background: DESK.paper,
  backgroundImage: 'radial-gradient(rgba(22,33,28,0.028) 1px, transparent 1px)',
  backgroundSize: '22px 22px',
}

/** Keyframes the kit needs. Render ONCE per screen that uses stamps or ink-in lines. */
export function DeskKeyframes() {
  return (
    <style>{`
      @media (prefers-reduced-motion: no-preference) {
        .dk-stamp { animation: dkThunk .5s cubic-bezier(.2,1.6,.4,1) both }
        @keyframes dkThunk { from { transform: rotate(-7deg) scale(1.6); opacity: 0 } to { transform: rotate(-7deg) scale(1); opacity: .92 } }
        .dk-ink { animation: dkInk .45s ease-out both }
        @keyframes dkInk { from { opacity: 0; transform: translateY(4px) } to { opacity: 1; transform: none } }
        .dk-seal:active { transform: scale(.94) }
      }
    `}</style>
  )
}

/* ── the ticket: a service or a choice, with a perforated stub edge ──────────────────────── */
export function Ticket({ name, sub, price, on, onClick, right, style }: {
  name: ReactNode
  sub?: ReactNode
  /** The stub price label ("Free", "$249", "In Pro"). */
  price?: ReactNode
  on?: boolean
  onClick?: () => void
  /** Replaces the price stub entirely (e.g. a chevron). */
  right?: ReactNode
  style?: CSSProperties
}) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick() } } : undefined}
      style={{
        position: 'relative', background: on ? DESK.mintWash : DESK.card,
        border: `1.5px solid ${on ? DESK.mint : DESK.line}`, borderRadius: 14,
        padding: '13px 78px 13px 22px', overflow: 'hidden',
        cursor: onClick ? 'pointer' : undefined,
        boxShadow: on ? `0 0 0 1px ${DESK.mintLine}` : '0 1px 3px rgba(22,33,28,0.04)',
        ...style,
      }}
    >
      <span aria-hidden style={{ position: 'absolute', left: 9, top: 6, bottom: 6, borderLeft: `2px dashed ${on ? DESK.mintLine : DESK.line}` }} />
      <div style={{ fontFamily: DESK.disp, fontWeight: 700, fontSize: 14, color: on ? DESK.mintDeep : DESK.ink, letterSpacing: '-0.01em', lineHeight: 1.25 }}>{name}</div>
      {sub && <div style={{ fontSize: 11.5, color: DESK.mute, marginTop: 2, lineHeight: 1.4 }}>{sub}</div>}
      {(right ?? price) != null && (
        <span style={{ position: 'absolute', right: 13, top: '50%', transform: 'translateY(-50%)', fontVariantNumeric: 'tabular-nums', fontWeight: 750, color: DESK.mintDeep, fontSize: 13, textAlign: 'right', maxWidth: 60, lineHeight: 1.2 }}>
          {right ?? price}
        </span>
      )}
    </div>
  )
}

/* ── the stamp: honesty as a designed moment ─────────────────────────────────────────────── */
export function Stamp({ children, mint }: { children: ReactNode; mint?: boolean }) {
  const c = mint ? DESK.mintDeep : DESK.amber
  return (
    <span className="dk-stamp" style={{
      display: 'inline-block', border: `2.5px solid ${c}`, color: c,
      background: mint ? DESK.mintWash : DESK.amberWash, borderRadius: 8,
      fontFamily: DESK.disp, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
      padding: '5px 12px', fontSize: 15, transform: 'rotate(-7deg)', opacity: 0.92,
    }}>{children}</span>
  )
}

/* ── the receipt frame: perforated top edge, dashed rules, mono money ────────────────────── */
export function ReceiptFrame({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ position: 'relative', paddingTop: 7, ...style }}>
      <div aria-hidden style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 8,
        backgroundImage: `linear-gradient(135deg, ${DESK.card} 4px, transparent 0), linear-gradient(225deg, ${DESK.card} 4px, transparent 0)`,
        backgroundSize: '8px 8px', backgroundRepeat: 'repeat-x',
      }} />
      <div style={{
        background: DESK.card, border: `1px solid ${DESK.line}`, borderTop: 'none',
        borderRadius: '0 0 14px 14px', padding: '14px 16px', fontVariantNumeric: 'tabular-nums',
        boxShadow: '0 10px 24px rgba(22,33,28,0.07)',
      }}>{children}</div>
    </div>
  )
}

export function ReceiptRow({ label, amount, you, muted }: { label: ReactNode; amount: ReactNode; you?: boolean; muted?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, color: muted ? DESK.mute : DESK.ink2, padding: '4.5px 0' }}>
      <span style={{ minWidth: 0 }}>{label}</span>
      <span style={{ fontFamily: DESK.mono, fontSize: 12, color: you ? DESK.mintDeep : muted ? DESK.mute : DESK.ink, fontWeight: you ? 700 : 500, whiteSpace: 'nowrap' }}>{amount}</span>
    </div>
  )
}

export const ReceiptRule = () => <div style={{ borderTop: `1.5px dashed ${DESK.line}`, margin: '8px 0' }} />

export function ReceiptTotal({ label, big, small }: { label: string; big: string; small?: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 2 }}>
      <span style={{ fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', color: DESK.mute, fontWeight: 700 }}>{label}</span>
      <span style={{ fontFamily: DESK.disp, fontSize: 26, fontWeight: 650, letterSpacing: '-0.02em', color: DESK.ink }}>
        {big}{small && <small style={{ fontSize: 13, color: DESK.mute, fontWeight: 500, letterSpacing: 0 }}> {small}</small>}
      </span>
    </div>
  )
}

/* ── the kitchen-ticket line: a real signal, printed ─────────────────────────────────────── */
export function TickerLine({ label, value, live, delayMs = 0 }: { label: ReactNode; value: ReactNode; live?: boolean; delayMs?: number }) {
  return (
    <div className="dk-ink" style={{
      fontFamily: DESK.mono, fontSize: 12, color: live ? DESK.mintDeep : DESK.ink2,
      padding: '7px 0', borderBottom: live ? 'none' : `1px dashed ${DESK.line}`,
      display: 'flex', justifyContent: 'space-between', gap: 8, animationDelay: `${delayMs}ms`,
    }}>
      <span style={{ fontWeight: live ? 700 : 400 }}>{label}</span>
      <span style={{ color: live ? DESK.mintDeep : DESK.ink, fontWeight: live ? 700 : 600 }}>{value}</span>
    </div>
  )
}

/* ── the plan sheet: the plan growing at the bottom of every intake screen ───────────────── */
export interface PlanSheetLine { text: ReactNode; ghost?: boolean; strong?: boolean }
export function PlanSheet({ title, lines }: { title: string; lines: PlanSheetLine[] }) {
  return (
    <div style={{
      marginTop: 'auto', background: DESK.card, border: `1px solid ${DESK.line}`, borderBottom: 'none',
      borderRadius: '16px 16px 0 0', padding: '12px 16px 6px', boxShadow: '0 -8px 24px rgba(22,33,28,0.06)',
    }}>
      <div style={{ fontSize: 9.5, letterSpacing: '0.13em', textTransform: 'uppercase', color: DESK.mute, fontWeight: 750, marginBottom: 6 }}>{title}</div>
      {lines.map((l, i) => (
        <div key={i} className="dk-ink" style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12, color: l.ghost ? DESK.mute : DESK.ink2, padding: '3.5px 0' }}>
          <span style={{
            width: 7, height: 7, borderRadius: '50%', flex: 'none',
            background: l.ghost ? 'transparent' : DESK.mint,
            border: l.ghost ? `1.5px dashed ${DESK.mute}` : 'none',
          }} />
          <span style={l.strong ? { fontWeight: 650, color: DESK.ink } : undefined}>{l.text}</span>
        </div>
      ))}
    </div>
  )
}

/* ── the stage plate: a numbered ink plate with its real weeks ───────────────────────────── */
export function StagePlate({ n, title, when }: { n: number | string; title: ReactNode; when?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 8px' }}>
      <span style={{
        width: 26, height: 26, borderRadius: 8, background: DESK.ink, color: DESK.paper,
        fontFamily: DESK.disp, fontWeight: 700, fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none',
      }}>{n}</span>
      <span style={{ fontFamily: DESK.disp, fontSize: 17, fontWeight: 650, letterSpacing: '-0.01em', color: DESK.ink }}>{title}</span>
      {when && <span style={{ fontSize: 10, color: DESK.mute, marginLeft: 'auto', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700 }}>{when}</span>}
    </div>
  )
}

/* ── the YOU slip: an owner move, part of the plan, visibly different on purpose ─────────── */
export function YouSlip({ minutes, children, onClick }: { minutes?: number; children: ReactNode; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      style={{
        display: 'flex', gap: 8, alignItems: 'center', background: DESK.mintWash,
        border: `1px dashed ${DESK.mintLine}`, borderRadius: 12, padding: '9px 12px',
        fontSize: 12, color: DESK.ink2, cursor: onClick ? 'pointer' : undefined,
      }}
    >
      <span style={{ fontWeight: 700, color: DESK.mintDeep, fontSize: 11, whiteSpace: 'nowrap' }}>
        YOU{minutes != null ? ` · ${minutes} MIN` : ''}
      </span>
      <span style={{ minWidth: 0 }}>{children}</span>
    </div>
  )
}

/* ── the seal: approval as a physical act ────────────────────────────────────────────────── */
export function SealButton({ label = 'Press\nto approve', holdMs = 550, disabled, onSealed }: {
  label?: string
  holdMs?: number
  disabled?: boolean
  onSealed: () => void
}) {
  const [pressing, setPressing] = useState(false)
  const [sealed, setSealed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const start = () => {
    if (disabled || sealed) return
    setPressing(true)
    timer.current = setTimeout(() => { setSealed(true); setPressing(false); onSealed() }, holdMs)
  }
  const cancel = () => {
    setPressing(false)
    if (timer.current) { clearTimeout(timer.current); timer.current = null }
  }

  return (
    <button
      type="button"
      className="dk-seal"
      onPointerDown={start}
      onPointerUp={cancel}
      onPointerLeave={cancel}
      onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && !sealed && !disabled) { e.preventDefault(); setSealed(true); onSealed() } }}
      aria-label={sealed ? 'Approved' : 'Press and hold to approve'}
      disabled={disabled}
      style={{
        width: 118, height: 118, borderRadius: '50%', margin: '16px auto 6px', display: 'flex',
        alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: 'none',
        cursor: disabled ? 'default' : 'pointer', position: 'relative', color: '#fff',
        fontFamily: DESK.disp, fontWeight: 700, fontSize: 15, lineHeight: 1.15, letterSpacing: '0.02em',
        background: sealed ? DESK.mintDeep : 'radial-gradient(circle at 32% 28%, #4ABD98, #2E9A78 68%)',
        boxShadow: pressing
          ? '0 6px 16px rgba(46,154,120,0.35), inset 0 4px 10px rgba(0,0,0,0.25)'
          : '0 14px 34px rgba(46,154,120,0.4), inset 0 2px 6px rgba(255,255,255,0.35), inset 0 -6px 12px rgba(0,0,0,0.18)',
        transform: pressing ? 'scale(0.94)' : undefined,
        transition: 'transform .15s ease, box-shadow .15s ease',
        opacity: disabled ? 0.5 : 1,
        whiteSpace: 'pre-line',
      }}
    >
      <span aria-hidden style={{ position: 'absolute', inset: 9, borderRadius: '50%', border: '1.5px dashed rgba(255,255,255,0.55)' }} />
      {sealed ? 'Approved' : label}
    </button>
  )
}
