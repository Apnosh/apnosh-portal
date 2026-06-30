'use client'

/**
 * The add-piece modal — a bottom sheet that collects everything the maker needs for ONE
 * piece, so it can never enter the cart half-specified. Order: the one required field,
 * (for a story) the film-it-here toggle, an optional details drawer, then who-makes-it as
 * the last decision. A live read-back + price button confirm before adding.
 */
import { useMemo, useState } from 'react'
import { X, ChevronDown, Check, Circle, CheckCircle2, Video, Image as ImageIcon, LayoutGrid, Mail, MessageSquare, Aperture, MapPin } from 'lucide-react'
import { C, GRAD, money } from '@/components/campaigns/ui'
import { pieceNeedsVisit, type PieceTypeDef, type BriefField, type HandlerOption } from '@/lib/campaigns/content-menu/manifest'
import type { CartLine } from './cart'
import type { PieceBrief } from '@/lib/campaigns/types'

export const TYPE_ICON: Record<string, typeof Video> = {
  reel: Video, photo: ImageIcon, story: Aperture, post: LayoutGrid, email: Mail, sms: MessageSquare,
}

export default function AddPieceModal({ def, menuItems, creatorName, editing, onSubmit, onClose }: {
  def: PieceTypeDef
  menuItems: string[]
  creatorName?: string
  editing?: CartLine
  onSubmit: (line: CartLine) => void
  onClose: () => void
}) {
  const [brief, setBrief] = useState<PieceBrief>(editing?.brief ?? {})
  const [producer, setProducer] = useState<HandlerOption['value']>(editing?.producer ?? def.handlers[0].value)
  const [captureMode, setCaptureMode] = useState<'on-site' | 'remote'>(editing?.brief.captureMode ?? 'remote')
  const [detailsOpen, setDetailsOpen] = useState(false)
  const Icon = TYPE_ICON[def.type] ?? LayoutGrid

  const set = (k: BriefField['key'], v: string) => setBrief((b) => ({ ...b, [k]: v }))
  const complete = def.required.every((f) => (brief[f.key] ?? '').trim().length > 0)
  const price = producer === 'diy' ? 0 : def.price
  const onSite = pieceNeedsVisit(def.type, def.captureToggle ? { captureMode } : null)

  const readback = useMemo(() => buildReadback(def, brief, producer, creatorName), [def, brief, producer, creatorName])

  function submit() {
    if (!complete) return
    const finalBrief: PieceBrief = { ...brief }
    if (def.captureToggle) finalBrief.captureMode = captureMode
    onSubmit({ id: editing?.id ?? crypto.randomUUID(), type: def.type, qty: editing?.qty ?? 1, producer, brief: finalBrief })
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(0,0,0,0.34)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '92dvh', background: '#fff', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}>
        {/* header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 11, padding: '16px 18px 12px' }}>
          <Icon size={22} color={C.mute} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 600, color: C.ink }}>{editing ? 'Edit' : ''} {def.label}</div>
            <div style={{ fontSize: 11.5, color: C.faint }}>{def.does}{onSite ? ' · shot on location' : ''}</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.faint, padding: 4 }}><X size={20} /></button>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '4px 18px 12px' }}>
          {/* required fields */}
          {def.required.map((f) => (
            <Field key={f.key} field={f} value={brief[f.key] ?? ''} onChange={(v) => set(f.key, v)} menuItems={menuItems} required />
          ))}

          {/* story: film it here / send a clip */}
          {def.captureToggle && (
            <div style={{ marginTop: 16 }}>
              <Label>How are you capturing it?</Label>
              <div style={{ display: 'flex', gap: 8 }}>
                <Seg active={captureMode === 'remote'} onClick={() => setCaptureMode('remote')}>I&rsquo;ll send a clip</Seg>
                <Seg active={captureMode === 'on-site'} onClick={() => setCaptureMode('on-site')}>Film it here</Seg>
              </div>
            </div>
          )}

          {/* optional details drawer */}
          {def.optional.length > 0 && (
            <div style={{ marginTop: 16, borderTop: `1px solid ${C.line}`, borderBottom: detailsOpen ? 'none' : `1px solid ${C.line}` }}>
              <button onClick={() => setDetailsOpen((o) => !o)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: C.mute }}>
                <span>Add details — the offer, must-says, notes</span>
                <ChevronDown size={18} style={{ transform: detailsOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
              </button>
              {detailsOpen && (
                <div style={{ paddingBottom: 6 }}>
                  {def.optional.map((f) => (
                    <Field key={f.key} field={f} value={brief[f.key] ?? ''} onChange={(v) => set(f.key, v)} menuItems={menuItems} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* who makes it */}
          <div style={{ marginTop: 18 }}>
            <Label>Who makes it?</Label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {def.handlers.map((h) => {
                const active = producer === h.value
                const sub = h.value === 'creator' && creatorName ? creatorName : h.sub
                return (
                  <button key={h.value} onClick={() => setProducer(h.value)} aria-pressed={active} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: `${active ? 2 : 1}px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff',
                  }}>
                    {active ? <CheckCircle2 size={18} color={C.greenDk} /> : <Circle size={18} color={C.faint} />}
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13.5, color: active ? C.greenDk : C.ink }}>{h.label}</div>
                      <div style={{ fontSize: 11, color: active ? C.greenDk : C.faint, opacity: active ? 0.85 : 1 }}>{sub}</div>
                    </div>
                    <span style={{ fontSize: 13, color: h.cost === 'free' ? C.green : active ? C.greenDk : C.mute }}>{h.cost === 'free' ? 'Free' : money(def.price)}</span>
                  </button>
                )
              })}
            </div>
          </div>

          {/* visit hint for on-site pieces */}
          {onSite && producer !== 'diy' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 12, fontSize: 11.5, color: C.mute }}>
              <MapPin size={14} color={C.faint} /> Shares your shoot — batch on-site pieces into one visit to save.
            </div>
          )}

          {/* read-back */}
          <div style={{ marginTop: 14, fontSize: 12, color: C.mute, background: C.bg, borderRadius: 12, padding: '9px 11px', lineHeight: 1.5 }}>{readback}</div>
        </div>

        {/* sticky add */}
        <div style={{ flexShrink: 0, padding: '10px 18px calc(12px + env(safe-area-inset-bottom))', borderTop: `1px solid ${C.line}` }}>
          <button onClick={submit} disabled={!complete} style={{
            width: '100%', padding: 13, fontSize: 14.5, fontWeight: 700, border: 'none', borderRadius: 12, cursor: complete ? 'pointer' : 'not-allowed',
            background: complete ? GRAD : C.line, color: complete ? '#fff' : C.faint,
          }}>
            {editing ? 'Save' : 'Add to campaign'} · {price === 0 ? 'Free' : money(price)}
          </button>
          <div style={{ fontSize: 11, color: C.faint, textAlign: 'center', marginTop: 7 }}>
            {complete ? "You're not charged until it ships." : `Add ${def.required.map((f) => f.label.toLowerCase().replace(/\?$/, '')).join(' + ')} to continue`}
          </div>
        </div>
      </div>
    </div>
  )
}

function Field({ field, value, onChange, menuItems, required }: { field: BriefField; value: string; onChange: (v: string) => void; menuItems: string[]; required?: boolean }) {
  const [freeText, setFreeText] = useState(field.kind === 'dish' && value !== '' && !menuItems.includes(value))
  return (
    <div style={{ marginTop: 16 }}>
      <Label>{field.label}{required && <span style={{ color: C.faint, fontWeight: 400 }}> · required</span>}</Label>
      {field.kind === 'dish' ? (
        <div>
          {menuItems.length > 0 && !freeText && (
            <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 8 }}>
              {menuItems.slice(0, 12).map((m) => {
                const active = value === m
                return (
                  <button key={m} onClick={() => onChange(m)} style={{ fontSize: 13, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', border: `${active ? 0 : 1}px solid ${C.line}`, background: active ? C.greenSoft : '#fff', color: active ? C.greenDk : C.mute, display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    {active && <Check size={14} />} {m}
                  </button>
                )
              })}
              <button onClick={() => { setFreeText(true); onChange('') }} style={{ fontSize: 13, padding: '7px 12px', borderRadius: 99, cursor: 'pointer', border: `1px solid ${C.line}`, background: '#fff', color: C.mute }}>+ other</button>
            </div>
          )}
          {(freeText || menuItems.length === 0) && (
            <input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder={menuItems.length === 0 ? 'Type the dish' : field.placeholder} style={inputStyle} />
          )}
        </div>
      ) : field.kind === 'multiline' ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={field.placeholder} style={inputStyle} />
      )}
    </div>
  )
}

const inputStyle: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', fontSize: 14, border: `1px solid ${C.line}`, borderRadius: 10, color: C.ink, fontFamily: 'inherit', background: '#fff', outline: 'none' }

function Label({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 7 }}>{children}</div>
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} aria-pressed={active} style={{ flex: 1, padding: '10px 8px', fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 10, border: `${active ? 2 : 1}px solid ${active ? C.green : C.line}`, background: active ? C.greenSoft : '#fff', color: active ? C.greenDk : C.mute }}>{children}</button>
  )
}

function buildReadback(def: PieceTypeDef, brief: PieceBrief, producer: HandlerOption['value'], creatorName?: string): string {
  const who = producer === 'diy' ? 'you' : producer === 'creator' ? (creatorName ? creatorName.split('·')[0].trim() : 'a creator') : 'your team'
  const noun = def.label.replace(/^An? /, '')
  if (def.required.some((f) => f.key === 'featuring')) {
    const dish = brief.featuring?.trim()
    return `A ${noun} of your ${dish || '…'}, made by ${who}.`
  }
  const offer = brief.offer?.trim()
  return offer ? `${def.label} — ${offer} — sent by ${who}.` : `${def.label}, made by ${who}.`
}
