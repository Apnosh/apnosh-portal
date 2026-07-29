'use client'

/**
 * LaneRow — who could do this line, as tappable chips. The router's owner-facing surface.
 *
 * Renders straight off a MoveRoute (builder/routing.ts) and has ZERO legality logic of its own:
 * available lanes are tappable with their honest price ("$0 — you do it", "Same price — a local
 * creator", "$9 — AI draft"); unavailable lanes GHOST, never hide — tapping one reveals whyNot,
 * which is the transparency promise: the owner always sees all four lanes and exactly why one
 * is closed (law 2 at the surface; a hidden lane is a silent drop).
 */
import { useState } from 'react'
import type { Lane, MoveRoute } from '@/lib/campaigns/builder/routing'
import { laneMeta, money } from './ui'

export default function LaneRow({ route, current, onPick, heading = 'WHO DOES IT' }: {
  route: MoveRoute
  current: Lane
  /** Absent = read-only transparency (lanes + reasons render, nothing is tappable). */
  onPick?: (lane: Lane) => void
  heading?: string
}) {
  const [revealed, setRevealed] = useState<Lane | null>(null)

  const priceLine = (lane: Lane, price?: number, priceNote?: string): string => {
    if (priceNote) return priceNote
    if (price === 0) return lane === 'diy' ? '$0 · you do it' : 'Free'
    if (lane === 'creator') return 'Same price'
    return price != null ? money(price) : ''
  }

  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.05em', color: '#aeaeb2', marginBottom: 6 }}>{heading}</div>
      <div style={{ display: 'flex', gap: 6 }}>
        {route.lanes.map((o) => {
          const m = laneMeta(o.lane)
          const on = current === o.lane
          const tappable = o.available && !!onPick && !on
          return (
            <button
              key={o.lane}
              onClick={() => {
                if (o.available) { if (tappable) onPick(o.lane); setRevealed(null) }
                else setRevealed(revealed === o.lane ? null : o.lane)
              }}
              aria-label={o.available ? `${m.label}${on ? ', selected' : ''}` : `${m.label}, not available`}
              style={{
                flex: 1, minWidth: 0, textAlign: 'center', fontFamily: 'inherit',
                cursor: o.available ? (tappable ? 'pointer' : 'default') : 'help',
                border: `1.5px solid ${on ? m.hex : '#e6e6ea'}`,
                background: on ? `${m.hex}14` : '#fff',
                opacity: o.available ? 1 : 0.45,
                borderRadius: 11, padding: '7px 4px',
              }}
            >
              <div style={{ fontSize: 12, fontWeight: 650, color: on ? m.hex : o.available ? '#1d1d1f' : '#aeaeb2', lineHeight: 1.2 }}>
                {m.icon} {m.label}
              </div>
              <div style={{ fontSize: 10, color: '#6e6e73', marginTop: 2, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {o.available ? priceLine(o.lane, o.price, o.priceNote) : 'Not yet'}
              </div>
            </button>
          )
        })}
      </div>
      {(() => {
        const r = route.lanes.find((o) => o.lane === revealed)
        if (!r || r.available) return null
        return <div style={{ fontSize: 11.5, color: '#6e6e73', lineHeight: 1.45, marginTop: 6 }}>{r.whyNot}</div>
      })()}
      {(() => {
        const cur = route.lanes.find((o) => o.lane === current)
        if (!cur?.note) return null
        return <div style={{ fontSize: 11.5, color: '#2e9a78', lineHeight: 1.45, marginTop: 6 }}>{cur.note}</div>
      })()}
    </div>
  )
}
