'use client'

/**
 * The proof card (spec R-00): one real number, its context, and the action
 * it traces back to. No system name on the card; the label is always the
 * window plus the surface ("This week on Google"). Renders in the Home
 * banner slot, one at a time, dismissible. Every number comes from the
 * ledger; this component never invents or estimates.
 *
 * A WIN — mint, with a real number in it (src/lib/love/win.ts) — can also carry a `share` link,
 * drawn in the same CTA style as the move a heads-up card carries. It goes to the page where the
 * card becomes a square the owner can send somebody. Nothing else about the card changes.
 */

import { useRef, useState } from 'react'
import { X, ChevronRight, ChevronDown, AlertTriangle, TrendingUp } from 'lucide-react'

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
  /** From proof_cards.fired_at once migrated; drives newest-wins on Home. */
  firedAt?: string
  /** 'win' (mint, default) or 'heads_up' (gray) — the down-week material. */
  tone?: 'win' | 'heads_up'
  /** proof_cards.card_type, kept so a caller can ask whether this card is a WIN (lib/love/win.ts). */
  cardType?: string
  /** proof_cards.is_sample — a seeded demo card is never a win, and never gets a public page. */
  isSample?: boolean
  /** proof_cards.metadata.metricKey — a rating's line is a pair, so the reader needs to know. */
  metricKey?: string
  /** The move a heads-up card carries. Renders as the card's one action. */
  cta?: { label: string; href: string }
  /** A WIN's second door: the page where it becomes something to send somebody. Same CTA style. */
  share?: { label: string; href: string }
}

export default function ProofCard({ card, onDismiss, onSee, onOpen, defaultOpen = false }: {
  card: ProofCardData
  onDismiss: () => void
  onSee?: () => void
  /** Fired once when the owner opens the win: the strip expands, they tap the card, or its link. */
  onOpen?: () => void
  /** Home renders the slim strip first so the funnel hero keeps its height. */
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  /* One "they opened it" per card. The deck renders the front card already expanded, so without
     a tap on the card itself the only way to open a WIN was a link most wins do not have — and
     the mark that says a win landed was never written. Once, so a link tap does not double it. */
  const opened = useRef(false)
  const markOpen = () => { if (!opened.current) { opened.current = true; onOpen?.() } }
  const headsUp = card.tone === 'heads_up'
  /* COLOUR ON THE EDGE, not the ground (owner 2026-09-11: "missing colours, don't just change
     the background"). A win wears a mint outline and a rising arrow; a heads-up wears an amber
     outline and a warning triangle, so the two kinds read apart from across the room while
     the card itself stays white. */
  const edge = headsUp ? '#e0a13a' : '#4abd98'
  const dotColor = headsUp ? '#e0a13a' : '#4abd98'
  const labelColor = headsUp ? '#9a6b17' : '#2e9a78'
  const Glyph = headsUp ? AlertTriangle : TrendingUp
  const max = card.spark && card.spark.length ? Math.max(...card.spark, 1) : 1
  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); markOpen() }}
        className="mvp-rise"
        style={{
          display: 'flex', alignItems: 'center', gap: 8, width: '100%', textAlign: 'left',
          background: '#fff', border: `1.5px solid ${edge}`, borderRadius: 14, padding: '9px 12px', marginBottom: 10,
          boxShadow: '0 1px 2px rgba(0,0,0,0.04), 0 6px 18px rgba(0,0,0,0.06)', cursor: 'pointer',
        }}
      >
        <Glyph size={13} color={dotColor} strokeWidth={2.4} style={{ flexShrink: 0 }} />
        <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.1em', textTransform: 'uppercase', color: labelColor, flexShrink: 0 }}>{card.label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1d1d1f', fontVariantNumeric: 'tabular-nums', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.big}</span>
        <ChevronDown size={14} color="#aeaeb2" style={{ flexShrink: 0 }} />
      </button>
    )
  }
  return (
    <div
      className="mvp-rise"
      /* a tap anywhere on the card counts as opening the win (the X and the link handle their
         own clicks); nothing about how the card looks changes */
      onClick={markOpen}
      style={{
        position: 'relative', borderRadius: 18, padding: '18px 18px 17px', marginBottom: 12, minHeight: 176, boxSizing: 'border-box',
        background: '#fff', border: `1.5px solid ${edge}`,
        boxShadow: '0 1px 2px rgba(0,0,0,.04), 0 8px 24px rgba(0,0,0,.06)',
      }}
    >
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss() }} aria-label="Hide this"
        style={{ position: 'absolute', top: 8, right: 8, width: 24, height: 24, borderRadius: 99, border: 'none', background: '#f1f1f4', color: '#8e8e93', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0 }}
      >
        <X size={13} />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: '.12em', textTransform: 'uppercase', color: labelColor, marginBottom: 8 }}>
        <Glyph size={13} color={dotColor} strokeWidth={2.4} />
        {card.label.replace(/^Example · /i, '')}
        {/^example/i.test(card.id) && (
          <span style={{ marginLeft: 4, fontSize: 9, letterSpacing: '.08em', border: '1px solid #d8d8dc', color: '#8e8e93', borderRadius: 5, padding: '1px 6px', fontWeight: 700 }}>Example</span>
        )}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.04em', color: headsUp ? '#1d1d1f' : '#0f6e56', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
        {card.big}
      </div>
      <div style={{ fontSize: 13, color: '#6e6e73', marginTop: 5, lineHeight: 1.45 }}>{card.context}</div>
      {card.spark && card.spark.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 22, marginTop: 10 }} aria-hidden>
          {card.spark.map((v, i) => (
            <span key={i} style={{
              flex: 1, height: `${Math.max(8, Math.round((v / max) * 100))}%`, borderRadius: '2px 2px 0 0',
              background: i === card.spark!.length - 1 ? '#4abd98' : '#e6f4ee',
            }} />
          ))}
        </div>
      )}
      {card.attribution && (
        <div style={{ fontSize: 11.5, color: '#8e8e93', marginTop: 9 }}>
          {card.attribution}
        </div>
      )}
      {/* one row, so a win with both a move and a share link does not grow a second stack */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        {card.cta ? (
          <a
            href={card.cta.href}
            onClick={markOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, textDecoration: 'none' }}
          >
            {card.cta.label} <ChevronRight size={13} />
          </a>
        ) : onSee && (
          <button
            onClick={(e) => { e.stopPropagation(); markOpen(); onSee() }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}
          >
            See the week <ChevronRight size={13} />
          </button>
        )}
        {card.share && (
          <a
            href={card.share.href}
            onClick={markOpen}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontSize: 12.5, fontWeight: 700, color: '#0f6e56', marginTop: 10, textDecoration: 'none' }}
          >
            {card.share.label} <ChevronRight size={13} />
          </a>
        )}
      </div>
    </div>
  )
}
