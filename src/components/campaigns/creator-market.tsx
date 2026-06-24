'use client'
import { Star, X } from 'lucide-react'
import { C, DISPLAY } from './ui'
import { rankCreators, type Disc, type Style } from '@/lib/campaigns/creators'

function Strip({ tones }: { tones: string[] }) {
  return (
    <div style={{ display: 'flex', gap: 3, height: 30, width: 60, borderRadius: 7, overflow: 'hidden', flexShrink: 0 }}>
      {tones.map((t, i) => <div key={i} style={{ flex: 1, background: `linear-gradient(150deg, ${t}, rgba(0,0,0,0.22))` }} />)}
    </div>
  )
}

/**
 * Creator marketplace — browse and pick a creator for one discipline, ranked
 * best-first for the campaign's vibe (rating + restaurant experience + style
 * fit). Bottom sheet over the detail page. Seeded pool today; same shape as the
 * live vendors table so this becomes a real query without changing this UI.
 */
export default function CreatorMarket({ discipline, currentId, vibe, onChoose, onClose }: {
  discipline: Disc
  currentId: string
  vibe: Style | null
  onChoose: (id: string) => void
  onClose: () => void
}) {
  const ranked = rankCreators(discipline, vibe)
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(20,24,28,0.45)', display: 'flex', justifyContent: 'center', alignItems: 'flex-end' }} onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, maxHeight: '88dvh', background: '#fff', borderRadius: '20px 20px 0 0', display: 'flex', flexDirection: 'column', boxShadow: '0 -8px 40px rgba(0,0,0,0.18)' }}>
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, padding: '16px 16px 12px', borderBottom: `1px solid ${C.line}` }}>
          <div>
            <div style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18, color: C.ink }}>Choose your {discipline.toLowerCase()} creator</div>
            <div style={{ fontSize: 12, color: C.mute, marginTop: 2 }}>Ranked for your campaign. Same price whoever you pick. You approve every piece.</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: '#f1f3f2', border: 'none', borderRadius: 16, width: 32, height: 32, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}><X size={16} color={C.ink} /></button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px calc(16px + env(safe-area-inset-bottom))', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {ranked.map(({ creator: c, reason, topMatch }) => {
            const sel = c.id === currentId
            const initials = c.name.split(' ').map((x) => x[0]).join('')
            return (
              <div key={c.id} style={{ border: `1.5px solid ${sel ? C.green : C.line}`, background: sel ? C.greenSoft : '#fff', borderRadius: 14, padding: 12, display: 'flex', alignItems: 'center', gap: 11 }}>
                <span style={{ width: 40, height: 40, borderRadius: 20, background: '#fff', border: `1px solid ${C.line}`, color: C.greenDk, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>{initials}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14, color: C.ink }}>{c.name}</span>
                    {topMatch && <span style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '.04em', textTransform: 'uppercase', color: C.greenDk, background: C.greenSoft, borderRadius: 5, padding: '1px 5px' }}>Best match</span>}
                  </div>
                  <div style={{ fontSize: 11.5, color: C.mute, marginTop: 1 }}>{c.specialty} · {reason} · {c.based}</div>
                </div>
                <Strip tones={c.tones} />
                <button onClick={() => onChoose(c.id)} disabled={sel} style={{ flexShrink: 0, border: 'none', borderRadius: 10, padding: '8px 13px', fontWeight: 700, fontSize: 12.5, cursor: sel ? 'default' : 'pointer', background: sel ? 'transparent' : C.green, color: sel ? C.greenDk : '#fff' }}>{sel ? 'Current' : 'Choose'}</button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
