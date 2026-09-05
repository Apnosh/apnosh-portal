'use client'

/**
 * The owner app's design kit (2026-09-03): the few pieces every screen shares, so
 * the look stays one look. Ground is white everywhere; a card is white with a soft
 * shadow and no border; headings are sentence case; filters are one segmented
 * control; lists are rows with hairlines inside a card. Anything owner-facing
 * that needs one of these reaches for the kit instead of drawing its own.
 */
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'
import { C, DISPLAY } from './tokens'

export const CARD_SHADOW = '0 1px 2px rgba(0,0,0,.04), 0 6px 20px rgba(0,0,0,.05)'
export const HAIRLINE = 'rgba(0,0,0,.07)'

/** A white card with a soft shadow. */
export function Card({ children, style, pad = 16 }: { children: React.ReactNode; style?: React.CSSProperties; pad?: number | string }) {
  return <div style={{ background: '#fff', borderRadius: 18, padding: pad, boxShadow: CARD_SHADOW, ...style }}>{children}</div>
}

/** The page's title: one size everywhere. */
export function PageTitle({ children, sub, action }: { children: React.ReactNode; sub?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 600, color: C.ink, lineHeight: 1.1, letterSpacing: '-.01em', margin: 0 }}>{children}</h1>
        {sub && <div style={{ fontSize: 13, color: C.mute, marginTop: 4 }}>{sub}</div>}
      </div>
      {action}
    </div>
  )
}

/** A section heading: sentence case, with an optional quiet sub and a trailing link. */
export function SectionTitle({ children, sub, action, style }: { children: React.ReactNode; sub?: React.ReactNode; action?: { label: string; href: string }; style?: React.CSSProperties }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10, ...style }}>
      <span style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: '-.01em', color: C.ink }}>{children}</span>
      {sub && <span style={{ fontSize: 12.5, color: C.faint }}>{sub}</span>}
      {action && <Link href={action.href} style={{ marginLeft: 'auto', fontSize: 12.5, fontWeight: 600, color: C.greenDk, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 1 }}>{action.label} <ChevronRight size={14} /></Link>}
    </div>
  )
}

/** One segmented control for every filter and range: a soft track, a white active pill. */
export function Segmented<K extends string>({ items, value, onChange, counts, hot }: { items: [K, string][]; value: K; onChange: (k: K) => void; counts?: Partial<Record<K, number>>; /** keys whose count reads amber (needs attention) */ hot?: K[] }) {
  return (
    <div style={{ display: 'flex', gap: 2, borderRadius: 999, padding: 3, background: 'rgba(240,241,240,0.72)', backdropFilter: 'saturate(180%) blur(16px)', WebkitBackdropFilter: 'saturate(180%) blur(16px)', border: '1px solid rgba(255,255,255,0.75)', boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.08)' }}>
      {items.map(([k, label]) => {
        const on = value === k
        const n = counts?.[k]
        return (
          <button key={k} type="button" onClick={() => onChange(k)} style={{ flex: '1 1 auto', minWidth: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, whiteSpace: 'nowrap', overflow: 'hidden', border: 'none', background: on ? '#fff' : 'transparent', color: on ? C.ink : C.mute, borderRadius: 999, padding: '8px 6px', fontSize: 12.5, fontWeight: on ? 700 : 500, cursor: 'pointer', boxShadow: on ? '0 2px 6px rgba(0,0,0,.12)' : 'none', transition: 'background .15s, color .15s' }}>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
            {n != null && n > 0 && (hot?.includes(k)
              ? <span style={{ minWidth: 18, height: 18, padding: '0 5px', boxSizing: 'border-box', borderRadius: 99, background: '#d99a1e', color: '#fff', fontSize: 10.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span>
              : <span style={{ fontSize: 11, fontWeight: 700, color: on ? C.greenDk : C.faint }}>{n}</span>)}
          </button>
        )
      })}
    </div>
  )
}

/** A list row inside a card: hairline above (except the first), a chevron when it links. */
export function Row({ href, onClick, first, children, right, style }: { href?: string; onClick?: () => void; first?: boolean; children: React.ReactNode; right?: React.ReactNode; style?: React.CSSProperties }) {
  const inner = (
    <div className="mvp-row" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: first ? 'none' : `1px solid ${HAIRLINE}`, ...style }}>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
      {right}
      {(href || onClick) && <ChevronRight size={16} color={C.faint} style={{ flexShrink: 0 }} />}
    </div>
  )
  if (href) return <Link href={href} style={{ textDecoration: 'none', color: 'inherit', display: 'block' }}>{inner}</Link>
  if (onClick) return <button type="button" onClick={onClick} style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit' }}>{inner}</button>
  return inner
}
