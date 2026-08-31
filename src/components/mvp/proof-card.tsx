'use client'

/**
 * The proof card (spec R-00): one real number, its context, and the action
 * it traces back to. No system name on the card; the label is always the
 * window plus the surface ("This week on Google"). Renders in the Home
 * banner slot, one at a time, dismissible. Every number comes from the
 * ledger; this component never invents or estimates.
 */

import { useState } from 'react'
import { X, ChevronRight, ChevronDown } from 'lucide-react'

export interface ProofCardData {
  /** Stable id for dismissal, e.g. "gbp-2026-08-24". */
  id: string
  /** Window + surface, e.g. "This week on Google". */
  label: string
  /** The number line, e.g. "9 calls · 31 direction taps". */
  big: string
  /** The comparison that gives it meaning. */
  context: string
  /** The owner's action, dated. Optional: omitted when no delivered work anchors the window. */
  attribution?: string
  /** Seven daily values for the quiet bars. Optional. */
  spark?: number[]
}

export default function ProofCard({ card, onDismiss, onSee, defaultOpen = false }: {
  card: ProofCardData
  onDismiss: () => void
  onSee?: () => void
  /** Home renders the slim strip first so the funnel hero keeps its height. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  const max = card.spark && card.spark.length ? Math.max(...card.spark, 1) : 1
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mvp-rise"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          background: '#fff', border: 'none', borderRadius: 14, padding: '9px 12px', marginBottom: 10,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06)', cursor: 'pointer',
        }}
      >
        <span style={{ width: 6, height: 6, borderRadius: 99, background: '#4abd98', flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: '#2e9a78', flexShrink: 0 }}>{card.label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.big}</span>
        <ChevronDown size={14} color="#aeaeb2" style={{ flexShrink: 0 }} />
      </button>
    )
  }
  return (
    <div
      className="mvp-rise"
      style={{
        position: 'relative', background: '#fff', borderRadius: 16, padding: 14, marginBottom: 12,
        boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.07)',
      }}
    >
      <button
        onClick={onDismiss} aria-label="Hide this"
        style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 99, border: 'none', background: '#f1f1f4', color: '#8e8e93', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
      >
        <X size={13} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 800, letterSpacing: '.12em', textTransform: 'uppercase', color: '#2e9a78', marginBottom: 8 }}>
        <span style={{ width: 6, height: 6, borderRadius: 99, background: '#4abd98' }} />
        {card.label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em', color: '#1d1d1f', lineHeight: 1.15, fontVariantNumeric: 'tabular-nums' }}>
        {card.big}
      </div>
      <div style={{ fontSize: 12.5, color: '#48484a', marginTop: 6 }}>{card.context}</div>
      {card.spark && card.spark.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 26, marginTop: 9 }} aria-hidden>
          {card.spark.map((v, i) => (
            <span key={i} style={{ flex: 1, height: `${Math.max(8, Math.round((v / max) * 100))}%`, background: i === card.spark!.length - 1 ? '#4abd98' : '#dff0e9', borderRadius: '2px 2px 0 0' }} />
          ))}
        </div>
      )}
      {card.attribution && (
        <div style={{ fontSize: 11.5, color: '#8e8e93', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f2f2f4' }}>
          {card.attribution}
        </div>
      )}
      {onSee && (
        <button
          onClick={onSee}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12, fontWeight: 700, color: '#0f6e56', marginTop: 9, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
        >
          See the week <ChevronRight size={13} />
        </button>
      )}
    </div>
  )
}
