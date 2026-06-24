'use client'

/**
 * Line card — the atomic unit of the plan. A plain always-visible row (what it
 * is · what it does · when · price) over a drawer that earns trust: the metric
 * it moves, why it matters, the price vs. what agencies charge, and every step
 * with who does it. Two "pay only for what you need" escapes on every line:
 * "I already have this" and "I'll do it myself" ($0). Recommended add-ons
 * render ghosted with a single Add toggle.
 */
import { useState } from 'react'
import { ChevronRight, Plus, Check } from 'lucide-react'
import { lineTotal, type LineItem, type OptOutReason } from '@/lib/campaigns/types'
import { BREAKDOWNS, STEP_WHO } from '@/lib/campaigns/data/service-breakdowns'
import { C, money, stageHex, handlerMeta, cadenceLabel, cadenceSub } from './ui'

const OPT_LABEL: Record<OptOutReason, string> = { 'have-it': 'I have this', diy: 'I’ll do it myself' }

export default function LineCard({
  item, onToggleOptOut, onToggleInclude, onRemove, onSetQty, startOpen,
}: {
  item: LineItem
  onToggleOptOut?: (reason: OptOutReason) => void
  onToggleInclude?: () => void
  onRemove?: () => void
  onSetQty?: (qty: number) => void
  startOpen?: boolean
}) {
  const [open, setOpen] = useState(!!startOpen)
  const off = !!item.optOut
  const recommended = !item.included
  const hex = stageHex(item.stage)
  const breakdown = BREAKDOWNS[item.serviceId]
  const h = handlerMeta(item.handler, item.optOut === 'diy')
  const dim = off || recommended

  return (
    <div style={{
      borderRadius: 14, background: '#fff', transition: 'all .15s',
      border: `1px ${dim ? 'dashed' : 'solid'} ${off ? C.greenLine : C.line}`,
      opacity: recommended ? 0.92 : 1,
    }}>
      {/* plain row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px' }}>
        <span style={{ flex: 'none', width: 9, height: 9, borderRadius: 99, background: dim ? C.faint : hex }} aria-hidden />
        <button type="button" onClick={() => setOpen((o) => !o)} style={{ flex: 1, minWidth: 0, textAlign: 'left', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 13.5, fontWeight: 600, lineHeight: 1.2, color: off ? C.faint : C.ink, textDecoration: off ? 'line-through' : 'none' }}>{item.plain}</span>
            <span title={h.label} style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: h.hex, background: `${h.hex}18`, borderRadius: 5, padding: '1px 5px' }}>{h.label}</span>
          </div>
          <div style={{ fontSize: 11, color: C.faint, lineHeight: 1.35, marginTop: 1 }}>
            {item.does}{item.when ? ` · ${item.when}` : ''}
          </div>
        </button>
        <div style={{ flex: 'none', textAlign: 'right' }}>
          <div style={{ fontSize: 13, fontWeight: 700, fontVariantNumeric: 'tabular-nums', color: off ? C.faint : C.ink }}>{off ? '$0' : cadenceLabel(item)}</div>
          <div style={{ fontSize: 9.5, color: C.faint }}>{off ? OPT_LABEL[item.optOut!] : cadenceSub(item)}</div>
        </div>
        <ChevronRight aria-hidden size={16} color={C.faint} style={{ flex: 'none', transition: 'transform .15s', transform: open ? 'rotate(90deg)' : 'none' }} />
      </div>

      {/* drawer */}
      {open && (
        <div style={{ padding: '10px 12px 12px 27px', borderTop: `1px solid ${C.line}`, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {item.metric && (
            <p style={{ margin: 0, fontSize: 11.5, color: C.greenDk, lineHeight: 1.4 }}><b>We measure:</b> {item.metric.label} — {item.metric.expect}</p>
          )}
          {item.why && (
            <p style={{ margin: 0, fontSize: 11.5, color: C.ink2, lineHeight: 1.4 }}><b>Why this:</b> {item.why}</p>
          )}
          {item.market && (
            <p style={{ margin: 0, fontSize: 11.5, color: C.mute, lineHeight: 1.4 }}><b>Vs. market:</b> agencies charge {money(item.market.low)}–{money(item.market.high)} for {item.market.label ?? 'the same scope'}. Yours is {cadenceLabel(item)}.</p>
          )}
          {item.draft && (
            <div style={{ background: '#f4f0ff', border: '1px solid #e6dcff', borderRadius: 10, padding: '8px 10px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase', color: '#6b46c1', marginBottom: 4 }}>AI draft</div>
              {item.draft.title && <div style={{ fontSize: 12.5, fontWeight: 700, color: C.ink, marginBottom: 3 }}>{item.draft.title}</div>}
              <div style={{ fontSize: 12, color: C.ink2, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{item.draft.body}</div>
            </div>
          )}
          {breakdown && breakdown.length > 0 && (
            <div>
              <p style={{ margin: '0 0 5px', fontSize: 11.5, fontWeight: 600, color: C.ink2 }}>What’s included <span style={{ fontWeight: 400, color: C.faint }}>· every step, and who does it</span></p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {breakdown.map((s, i) => {
                  const w = STEP_WHO[s.who]
                  return (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span title={w.label} style={{ flex: 'none', fontSize: 9.5, fontWeight: 700, color: w.hex, background: `${w.hex}18`, borderRadius: 4, padding: '1px 5px', marginTop: 1 }}>{w.label}</span>
                      <span style={{ fontSize: 11, lineHeight: 1.35, color: C.ink2 }}><b>{s.step}</b> — {s.detail}</span>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* qty dial — per-occurrence, active lines */}
          {item.cadence.kind === 'per-occurrence' && onSetQty && !off && !recommended && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11.5, color: C.mute }}>How many {item.cadence.unit}s?</span>
              <div style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${C.line}`, borderRadius: 9, overflow: 'hidden' }}>
                <button type="button" onClick={() => onSetQty(Math.max(1, (item.qty ?? 1) - 1))} style={qtyBtn}>−</button>
                <span style={{ padding: '0 8px', fontSize: 12, fontWeight: 700, fontVariantNumeric: 'tabular-nums', minWidth: 30, textAlign: 'center' }}>{item.qty ?? 1}</span>
                <button type="button" onClick={() => onSetQty((item.qty ?? 1) + 1)} style={{ ...qtyBtn, color: C.greenDk }}>+</button>
              </div>
              <span style={{ fontSize: 11, color: C.faint }}>= {money(lineTotal(item))}</span>
            </div>
          )}

          {/* actions */}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, paddingTop: 2 }}>
            {recommended ? (
              <button type="button" onClick={onToggleInclude} style={{ ...pill, background: C.greenSoft, color: C.greenDk, borderColor: C.greenLine, fontWeight: 700 }}><Plus size={12} strokeWidth={2.6} /> Add to plan · {cadenceLabel(item)}</button>
            ) : (
              <>
                {(['have-it', 'diy'] as OptOutReason[]).map((r) => {
                  const on = item.optOut === r
                  return (
                    <button key={r} type="button" onClick={() => onToggleOptOut?.(r)} style={{
                      ...pill,
                      background: on ? C.ink : '#fff', color: on ? '#fff' : C.mute,
                      borderColor: on ? C.ink : C.line,
                    }}>{on && <Check size={11} strokeWidth={3} style={{ marginRight: 3 }} />}{OPT_LABEL[r]}{!on ? ` · save ${cadenceLabel(item)}` : ''}</button>
                  )
                })}
                {onRemove && <button type="button" onClick={onRemove} style={{ ...pill, marginLeft: 'auto', color: C.red, border: 'none', background: 'none' }}>Remove</button>}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

const qtyBtn: React.CSSProperties = { width: 28, height: 28, display: 'grid', placeItems: 'center', fontSize: 15, fontWeight: 700, color: C.mute, background: 'none', border: 'none', cursor: 'pointer' }
const pill: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', gap: 4, borderRadius: 8, padding: '0 9px', height: 28, fontSize: 11, fontWeight: 600, border: `1px solid ${C.line}`, cursor: 'pointer' }
