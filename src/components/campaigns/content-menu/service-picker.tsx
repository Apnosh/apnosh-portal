'use client'

/**
 * The service picker — a DoorDash-style popup the owner opens by tapping a creative on a
 * campaign. It offers the type-appropriate ways to make that piece (a reel: a creator or
 * your team; a graphic or email: your team or an AI draft) and the price each one costs,
 * then writes the choice back as the piece's producer. First iteration: serviced by us or
 * a contractor only — no self-service option.
 */
import { useState } from 'react'
import { X, Circle, CheckCircle2, Camera } from 'lucide-react'
import { C, GRAD, money } from '@/components/campaigns/ui'
import { CONTENT_META, AI_DRAFT_CENTS, isOnSitePiece } from '@/lib/campaigns/catalog'
import { PIECE_BY_TYPE, type HandlerOption } from '@/lib/campaigns/content-menu/manifest'
import type { PieceProducer } from '@/lib/campaigns/types'
import { TYPE_ICON } from './add-piece-modal'

const FALLBACK: HandlerOption[] = [
  { value: 'team', label: 'Your team', sub: 'Apnosh makes it for you', cost: 'piece' },
]

function optionPriceLabel(opt: HandlerOption, type: string): string {
  if (opt.cost === 'free') return 'Free'
  if (opt.cost === 'ai') return money(AI_DRAFT_CENTS / 100)
  return money(CONTENT_META[type]?.price ?? 0)
}

export default function ServicePicker({ type, label, producer, creatorName, onPick, onClose }: {
  type: string
  /** The piece's plain label, e.g. "Reel · Birria tacos". */
  label?: string
  producer: PieceProducer
  creatorName?: string
  onPick: (producer: PieceProducer) => void
  onClose: () => void
}) {
  const def = PIECE_BY_TYPE[type]
  const options = def?.handlers ?? FALLBACK
  const [choice, setChoice] = useState<PieceProducer>(producer)
  const Icon = TYPE_ICON[type] ?? Camera
  const onSite = isOnSitePiece(type, def?.captureToggle ? { captureMode: 'on-site' } : null)
  const noun = (def?.label ?? type).replace(/^An? /, '')
  const chosen = options.find((o) => o.value === choice)

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 90, background: 'rgba(0,0,0,0.34)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: '#fff', borderRadius: '20px 20px 0 0', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)', padding: '16px 18px calc(14px + env(safe-area-inset-bottom))' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 2 }}>
          <Icon size={20} color={C.mute} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: C.ink }}>How should this {noun} be made?</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{label || noun}{onSite ? ' · shot on location' : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
          {options.map((o) => {
            const active = choice === o.value
            const sub = o.value === 'creator' && creatorName ? creatorName : o.sub
            const price = optionPriceLabel(o, type)
            return (
              <button key={o.value} onClick={() => setChoice(o.value)} aria-pressed={active} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '11px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                border: `${active ? 2 : 1}px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff',
              }}>
                {active ? <CheckCircle2 size={19} color={C.greenDk} /> : <Circle size={19} color={C.faint} />}
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13.5, color: active ? C.greenDk : C.ink }}>{o.label}</div>
                  <div style={{ fontSize: 11, color: active ? C.greenDk : C.faint, opacity: active ? 0.85 : 1 }}>{sub}</div>
                </div>
                <span style={{ fontSize: 13.5, color: o.cost === 'free' ? C.green : active ? C.greenDk : C.mute }}>{price}</span>
              </button>
            )
          })}
        </div>

        {onSite && choice !== 'diy' && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11, fontSize: 11.5, color: C.mute }}>
            <Camera size={14} color={C.faint} /> Batches with your campaign&rsquo;s other on-site pieces — one visit, no solo-visit fee.
          </div>
        )}

        <button onClick={() => onPick(choice)} style={{ width: '100%', marginTop: 13, padding: 12, fontSize: 14, fontWeight: 700, border: 'none', borderRadius: 12, cursor: 'pointer', background: GRAD, color: '#fff' }}>
          Done · {noun} by {chosen?.label.replace(/^I'll /, '').toLowerCase() ?? 'your team'}
        </button>
      </div>
    </div>
  )
}
