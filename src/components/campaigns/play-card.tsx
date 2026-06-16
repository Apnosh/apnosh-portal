'use client'

/**
 * Play card — the owner's altitude. One outcome (Get discovered, Get their
 * RSVPs, Fill the room), its expected result, and the deliverables that make
 * it happen, each a transparent LineCard. Reads as a goal, opens to the work.
 */
import { useState } from 'react'
import { lineTotal, type LineItem, type OptOutReason } from '@/lib/campaigns/types'
import type { Play } from '@/lib/campaigns/plays'
import LineCard from './line-card'
import { C, DISPLAY, money, stageHex } from './ui'

export default function PlayCard({
  play, onToggleOptOut, onToggleInclude, onRemove, onSetQty, defaultOpen,
}: {
  play: Play
  onToggleOptOut: (id: string, reason: OptOutReason) => void
  onToggleInclude: (id: string) => void
  onRemove: (id: string) => void
  onSetQty: (id: string, qty: number) => void
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen ?? true)
  const hex = stageHex(play.key)
  const active = play.items.filter((i) => !i.optOut)
  const owned = play.items.filter((i) => i.optOut === 'have-it').length
  const diy = play.items.filter((i) => i.optOut === 'diy').length
  const oneTime = active.filter((i) => i.cadence.kind !== 'recurring').reduce((a, i) => a + lineTotal(i), 0)
  const monthly = active.filter((i) => i.cadence.kind === 'recurring').reduce((a, i) => a + i.price, 0)

  return (
    <div style={{ borderRadius: 18, background: '#fff', border: `1px solid ${C.line}`, boxShadow: `inset 3px 0 0 ${hex}`, overflow: 'hidden' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer' }}>
        <span aria-hidden style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, display: 'grid', placeItems: 'center', fontSize: 19, background: `${hex}1f` }}>{play.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, lineHeight: 1.15, color: C.ink }}>{play.title}</div>
          <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.35 }}>{play.result}{owned ? ` · ✓ you have ${owned}` : ''}{diy ? ` · 🙋 ${diy} DIY` : ''}</div>
          {play.why && <div style={{ fontSize: 10.5, lineHeight: 1.35, marginTop: 2, color: hex }}>💡 {play.why}</div>}
        </div>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 14, fontWeight: 600, color: C.ink }}>{oneTime > 0 ? money(oneTime) : monthly > 0 ? `${money(monthly)}/mo` : 'Free'}</div>
          <div style={{ fontSize: 10, color: C.faint }}>{oneTime > 0 && monthly > 0 ? `+ ${money(monthly)}/mo` : `${active.length} included`}</div>
        </div>
        <span aria-hidden style={{ flex: 'none', fontSize: 16, color: C.faint, transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }}>›</span>
      </button>

      {open && (
        <div style={{ padding: '4px 12px 12px', borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {play.items.map((it) => (
            <LineCard key={it.id} item={it}
              onToggleOptOut={(r) => onToggleOptOut(it.id, r)}
              onToggleInclude={() => onToggleInclude(it.id)}
              onRemove={() => onRemove(it.id)}
              onSetQty={(n) => onSetQty(it.id, n)} />
          ))}
        </div>
      )}
    </div>
  )
}
